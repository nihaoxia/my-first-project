import assert from "node:assert/strict";
import test from "node:test";

import {
  buildLocalBackupPayload,
  buildLocalBackupPreview,
  localBackupStorageEntries,
} from "../src/lib/backup/local-backup-core.ts";
import { buildBackupRawValues } from "./local-backup-fixture.ts";

test("uses exactly the six approved scoped storage keys in restore order", () => {
  assert.deepEqual(
    localBackupStorageEntries.map(({ dataKey }) => dataKey),
    [
      "libraryBooks",
      "translations",
      "vocabulary",
      "sentences",
      "notes",
      "readerSelections",
    ],
  );
  assert.equal(localBackupStorageEntries.length, 6);
  assert.doesNotMatch(
    localBackupStorageEntries.map(({ baseKey }) => baseKey).join("\n"),
    /local-upload-draft|cloud-import-v1/u,
  );
});

test("normalizes all six categories and builds a content-free preview", () => {
  const result = buildLocalBackupPayload(buildBackupRawValues());

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.deepEqual(buildLocalBackupPreview("2026-07-21T09:00:00.000Z", result.payload), {
    createdAt: "2026-07-21T09:00:00.000Z",
    libraryBooks: 1,
    translations: 1,
    vocabulary: 1,
    sentences: 1,
    notes: 1,
    readerSelectionVocabulary: 1,
    readerSelectionSentences: 1,
    readerSelections: 2,
  });
});

test("normalizes missing approved keys to explicit empty categories", () => {
  const result = buildLocalBackupPayload({
    libraryBooks: null,
    translations: null,
    vocabulary: null,
    sentences: null,
    notes: null,
    readerSelections: null,
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.deepEqual(result.payload, {
    schemaVersion: 1,
    data: {
      libraryBooks: [],
      translations: [],
      vocabulary: [],
      sentences: [],
      notes: [],
      readerSelections: {
        vocabularyTexts: [],
        sentenceTexts: [],
      },
    },
  });
});

test("rejects every malformed category without keeping partial records", () => {
  for (const { dataKey } of localBackupStorageEntries) {
    const raw = buildBackupRawValues();
    raw[dataKey] = "not-json";

    assert.equal(buildLocalBackupPayload(raw).ok, false, dataKey);
  }
});

test("rejects duplicate ids in every id-bearing category", () => {
  for (const dataKey of [
    "libraryBooks",
    "translations",
    "vocabulary",
    "sentences",
    "notes",
  ] as const) {
    const raw = buildBackupRawValues();
    const records = JSON.parse(raw[dataKey]!) as unknown[];
    raw[dataKey] = JSON.stringify([...records, records[0]]);

    assert.deepEqual(buildLocalBackupPayload(raw), {
      ok: false,
      code: "DUPLICATE_ID",
    });
  }
});

test("rejects local translations whose original book is absent", () => {
  const raw = buildBackupRawValues();
  raw.libraryBooks = "[]";

  assert.deepEqual(buildLocalBackupPayload(raw), {
    ok: false,
    code: "MISSING_ORIGINAL_BOOK",
  });
});
