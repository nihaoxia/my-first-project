import assert from "node:assert/strict";
import test from "node:test";

import {
  allLocalBackupRestoreGroups,
  buildLocalBackupMergePlan,
  resolveLocalBackupRestoreSelection,
  type LocalBackupRestoreMode,
} from "../src/lib/backup/local-backup-merge.ts";
import {
  buildLocalBackupPayload,
  localBackupPayloadByteLimit,
} from "../src/lib/backup/local-backup-core.ts";
import { buildBackupRawValues } from "./local-backup-fixture.ts";

const defaultRestoreMode: LocalBackupRestoreMode = "merge";

test("fixes merge as a supported mode and maps groups to authoritative data keys", () => {
  assert.equal(defaultRestoreMode, "merge");
  assert.deepEqual(allLocalBackupRestoreGroups, [
    "library",
    "vocabulary",
    "sentences",
    "notes",
    "readerSelections",
  ]);
  assert.deepEqual(resolveLocalBackupRestoreSelection(["notes", "library"]), {
    ok: true,
    groups: ["library", "notes"],
    dataKeys: ["libraryBooks", "translations", "notes"],
  });
});

test("rejects empty duplicate unknown and non-array selections", () => {
  for (const value of [[], ["notes", "notes"], ["unknown"], "notes", null]) {
    assert.deepEqual(resolveLocalBackupRestoreSelection(value), {
      ok: false,
      code: "INVALID_SELECTION",
    });
  }
});

test("keeps current records first and appends backup-only ids in backup order", () => {
  const payload = backupPayload();
  payload.data.vocabulary.push({
    ...payload.data.vocabulary[0],
    id: "vocab-backup-only",
    term: "glow",
  });
  const backupVocabulary = payload.data.vocabulary;
  const currentConflict = { ...backupVocabulary[0], explanation: "当前解释" };
  const currentOnly = { ...backupVocabulary[0], id: "vocab-current-only", term: "current" };

  const result = buildLocalBackupMergePlan({
    currentRawValues: {
      vocabulary: JSON.stringify([currentOnly, currentConflict]),
    },
    payload,
    selectedGroups: ["vocabulary"],
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.changedDataKeys, ["vocabulary"]);
  assert.deepEqual(JSON.parse(result.targetRawValues.vocabulary!), [
    currentOnly,
    currentConflict,
    ...backupVocabulary.slice(1),
  ]);
  assert.deepEqual(result.preview.vocabulary, {
    current: 2,
    backup: backupVocabulary.length,
    added: backupVocabulary.length - 1,
    existing: 0,
    conflictsKeptCurrent: 1,
    rekeyed: 0,
  });
});

test("does not create a target when every selected id is already present", () => {
  const payload = backupPayload();
  const result = buildLocalBackupMergePlan({
    currentRawValues: { sentences: JSON.stringify(payload.data.sentences) },
    payload,
    selectedGroups: ["sentences"],
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.changedDataKeys, []);
  assert.deepEqual(result.targetRawValues, {});
  assert.equal(result.preview.sentences?.existing, payload.data.sentences.length);
});

test("merges books before translations and preserves every final original-book reference", () => {
  const payload = backupPayload();
  const result = buildLocalBackupMergePlan({
    currentRawValues: { libraryBooks: "[]", translations: "[]" },
    payload,
    selectedGroups: ["library"],
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.changedDataKeys.slice(0, 2), ["libraryBooks", "translations"]);
  const books = JSON.parse(result.targetRawValues.libraryBooks!) as Array<{ id: string }>;
  const translations = JSON.parse(result.targetRawValues.translations!) as Array<{
    originalBookId: string;
  }>;
  const bookIds = new Set(books.map((book) => book.id));
  assert.equal(
    translations.every((translation) => bookIds.has(translation.originalBookId)),
    true,
  );
});

test("rejects malformed selected current data duplicate ids and missing books", () => {
  const payload = backupPayload();
  const duplicate = [payload.data.vocabulary[0], payload.data.vocabulary[0]];
  assert.deepEqual(
    buildLocalBackupMergePlan({
      currentRawValues: { vocabulary: JSON.stringify(duplicate) },
      payload,
      selectedGroups: ["vocabulary"],
    }),
    { ok: false, code: "CURRENT_DATA_MALFORMED" },
  );

  assert.deepEqual(
    buildLocalBackupMergePlan({
      currentRawValues: {
        libraryBooks: "[]",
        translations: JSON.stringify(payload.data.translations),
      },
      payload: { ...payload, data: { ...payload.data, libraryBooks: [], translations: [] } },
      selectedGroups: ["library"],
    }),
    { ok: false, code: "MISSING_ORIGINAL_BOOK" },
  );

  const duplicateBackup = structuredClone(payload);
  duplicateBackup.data.vocabulary.push(duplicateBackup.data.vocabulary[0]);
  assert.deepEqual(
    buildLocalBackupMergePlan({
      currentRawValues: { vocabulary: "[]" },
      payload: duplicateBackup,
      selectedGroups: ["vocabulary"],
    }),
    { ok: false, code: "BACKUP_DATA_MALFORMED" },
  );
});

test("rekeys different notes with colliding ids and keeps both records", () => {
  const payload = backupPayload();
  payload.data.notes = [
    {
      id: "note-local-2",
      title: "备份冲突",
      source: "个人笔记",
      updatedAt: "昨天",
      content: "备份正文",
    },
    {
      id: "note-local-9",
      title: "备份独有",
      source: "个人笔记",
      updatedAt: "昨天",
      content: "独有正文",
    },
  ];
  const current = [
    {
      id: "note-local-2",
      title: "当前冲突",
      source: "个人笔记",
      updatedAt: "刚刚",
      content: "当前正文",
    },
    {
      id: "note-local-10",
      title: "当前独有",
      source: "个人笔记",
      updatedAt: "刚刚",
      content: "当前内容",
    },
  ];

  const result = buildLocalBackupMergePlan({
    currentRawValues: { notes: JSON.stringify(current) },
    payload,
    selectedGroups: ["notes"],
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(JSON.parse(result.targetRawValues.notes!), [
    ...current,
    { ...payload.data.notes[0], id: "note-local-11" },
    payload.data.notes[1],
  ]);
  assert.deepEqual(result.preview.notes, {
    current: 2,
    backup: 2,
    added: 1,
    existing: 0,
    conflictsKeptCurrent: 0,
    rekeyed: 1,
  });
});

test("rekeys note conflicts above the safe-integer boundary without losing precision", () => {
  const payload = backupPayload();
  const collidingId = "note-local-9007199254740993";
  payload.data.notes = [{ ...payload.data.notes[0], id: collidingId, content: "备份正文" }];
  const current = [{ ...payload.data.notes[0], id: collidingId, content: "当前正文" }];

  const result = buildLocalBackupMergePlan({
    currentRawValues: { notes: JSON.stringify(current) },
    payload,
    selectedGroups: ["notes"],
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(JSON.parse(result.targetRawValues.notes!)[1].id, "note-local-9007199254740994");
});

test("rekeys note conflicts after an arbitrarily long decimal suffix", () => {
  const payload = backupPayload();
  const suffix = "9".repeat(80);
  const collidingId = `note-local-${suffix}`;
  payload.data.notes = [{ ...payload.data.notes[0], id: collidingId, content: "备份正文" }];
  const current = [{ ...payload.data.notes[0], id: collidingId, content: "当前正文" }];

  const result = buildLocalBackupMergePlan({
    currentRawValues: { notes: JSON.stringify(current) },
    payload,
    selectedGroups: ["notes"],
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(JSON.parse(result.targetRawValues.notes!)[1].id, `note-local-1${"0".repeat(80)}`);
});

test("increments long note suffixes without materializing an unbounded BigInt", () => {
  const originalBigIntDescriptor = Object.getOwnPropertyDescriptor(globalThis, "BigInt");
  assert.ok(originalBigIntDescriptor);
  Object.defineProperty(globalThis, "BigInt", {
    configurable: true,
    value() {
      throw new Error("unbounded BigInt conversion");
    },
  });

  try {
    const payload = backupPayload();
    const collidingId = `note-local-${"8".repeat(80)}`;
    payload.data.notes = [{ ...payload.data.notes[0], id: collidingId, content: "备份正文" }];
    const current = [{ ...payload.data.notes[0], id: collidingId, content: "当前正文" }];
    const result = buildLocalBackupMergePlan({
      currentRawValues: { notes: JSON.stringify(current) },
      payload,
      selectedGroups: ["notes"],
    });

    assert.equal(result.ok, true);
  } finally {
    Object.defineProperty(globalThis, "BigInt", originalBigIntDescriptor);
  }
});

test("rejects amplified rekey ids before storing more than the merge budget", () => {
  const payload = backupPayload();
  const longId = `note-local-${"8".repeat(1_000_000)}`;
  const sharedLongNote = { ...payload.data.notes[0], id: longId, content: "相同正文" };
  const backupConflicts = Array.from({ length: 20 }, (_, index) => ({
    ...payload.data.notes[0],
    id: `note-short-${index}`,
    content: `备份正文 ${index}`,
  }));
  const currentConflicts = backupConflicts.map((note, index) => ({
    ...note,
    content: `当前正文 ${index}`,
  }));
  payload.data.notes = [sharedLongNote, ...backupConflicts];
  const current = [sharedLongNote, ...currentConflicts];
  const originalPushDescriptor = Object.getOwnPropertyDescriptor(Array.prototype, "push");
  assert.ok(originalPushDescriptor);
  const originalPush = Array.prototype.push;
  let storedGeneratedIds = 0;

  Object.defineProperty(Array.prototype, "push", {
    ...originalPushDescriptor,
    value(this: unknown[], ...items: unknown[]) {
      for (const item of items) {
        const id =
          typeof item === "object" && item !== null && "id" in item
            ? (item as { id?: unknown }).id
            : undefined;
        if (typeof id === "string" && id.length > 900_000 && id !== longId) {
          storedGeneratedIds += 1;
          if (storedGeneratedIds > 12) throw new Error("rekey amplification exceeded budget");
        }
      }
      return Reflect.apply(originalPush, this, items);
    },
  });

  try {
    assert.deepEqual(
      buildLocalBackupMergePlan({
        currentRawValues: { notes: JSON.stringify(current) },
        payload,
        selectedGroups: ["notes"],
      }),
      { ok: false, code: "MERGED_DATA_TOO_LARGE" },
    );
    assert.equal(storedGeneratedIds, 12);
  } finally {
    Object.defineProperty(Array.prototype, "push", originalPushDescriptor);
  }
});

test("deduplicates an identical note without writing", () => {
  const payload = backupPayload();
  const note = payload.data.notes[0];
  payload.data.notes = [note];
  const result = buildLocalBackupMergePlan({
    currentRawValues: { notes: JSON.stringify([note]) },
    payload,
    selectedGroups: ["notes"],
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.changedDataKeys, []);
  assert.deepEqual(result.targetRawValues, {});
  assert.equal(result.preview.notes?.existing, 1);
});

test("appends backup-only reader texts without deleting current duplicates", () => {
  const payload = backupPayload();
  payload.data.readerSelections = {
    vocabularyTexts: ["  Alpha  ", "Beta"],
    sentenceTexts: ["Sentence B"],
  };
  const current = {
    vocabularyTexts: ["alpha", "ALPHA", "Current"],
    sentenceTexts: ["Sentence A"],
  };
  const result = buildLocalBackupMergePlan({
    currentRawValues: { readerSelections: JSON.stringify(current) },
    payload,
    selectedGroups: ["readerSelections"],
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(JSON.parse(result.targetRawValues.readerSelections!), {
    vocabularyTexts: ["alpha", "ALPHA", "Current", "Beta"],
    sentenceTexts: ["Sentence A", "Sentence B"],
  });
  assert.deepEqual(result.preview.readerSelections, {
    current: 4,
    backup: 3,
    added: 2,
    existing: 1,
    conflictsKeptCurrent: 0,
    rekeyed: 0,
  });
});

test("rejects blank current or backup reader text", () => {
  const payload = backupPayload();
  assert.deepEqual(
    buildLocalBackupMergePlan({
      currentRawValues: {
        readerSelections: JSON.stringify({ vocabularyTexts: ["   "], sentenceTexts: [] }),
      },
      payload,
      selectedGroups: ["readerSelections"],
    }),
    { ok: false, code: "CURRENT_DATA_MALFORMED" },
  );

  payload.data.readerSelections.vocabularyTexts = ["   "];
  assert.deepEqual(
    buildLocalBackupMergePlan({
      currentRawValues: {
        readerSelections: JSON.stringify({ vocabularyTexts: [], sentenceTexts: [] }),
      },
      payload,
      selectedGroups: ["readerSelections"],
    }),
    { ok: false, code: "BACKUP_DATA_MALFORMED" },
  );
});

test("accepts the exact merge budget and rejects one extra byte", () => {
  const payload = backupPayload();
  const note = {
    id: "note-local-2",
    title: "backup",
    source: "local",
    updatedAt: "now",
    content: "",
  };
  const fixedBytes = new TextEncoder().encode(JSON.stringify([note])).byteLength;
  note.content = "x".repeat(localBackupPayloadByteLimit - fixedBytes);
  payload.data.notes = [note];

  const exact = buildLocalBackupMergePlan({
    currentRawValues: { notes: "[]" },
    payload,
    selectedGroups: ["notes"],
  });
  assert.equal(exact.ok, true);

  note.content += "x";
  assert.deepEqual(
    buildLocalBackupMergePlan({
      currentRawValues: { notes: "[]" },
      payload,
      selectedGroups: ["notes"],
    }),
    { ok: false, code: "MERGED_DATA_TOO_LARGE" },
  );
});

test("does not require raw values for unselected categories", () => {
  const payload = backupPayload();
  const result = buildLocalBackupMergePlan({
    currentRawValues: { notes: "[]" },
    payload,
    selectedGroups: ["notes"],
  });
  assert.equal(result.ok, true);
});

function backupPayload() {
  const built = buildLocalBackupPayload(buildBackupRawValues());
  assert.equal(built.ok, true);
  if (!built.ok) throw new Error("fixture must build");
  return structuredClone(built.payload);
}
