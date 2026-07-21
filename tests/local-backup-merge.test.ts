import assert from "node:assert/strict";
import test from "node:test";

import {
  allLocalBackupRestoreGroups,
  buildLocalBackupMergePlan,
  resolveLocalBackupRestoreSelection,
  type LocalBackupRestoreMode,
} from "../src/lib/backup/local-backup-merge.ts";
import { buildLocalBackupPayload } from "../src/lib/backup/local-backup-core.ts";
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

function backupPayload() {
  const built = buildLocalBackupPayload(buildBackupRawValues());
  assert.equal(built.ok, true);
  if (!built.ok) throw new Error("fixture must build");
  return structuredClone(built.payload);
}
