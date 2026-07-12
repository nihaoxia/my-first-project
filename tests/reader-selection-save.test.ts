import assert from "node:assert/strict";
import test from "node:test";

import {
  addReaderSelectionToLocalCollection,
  createEmptyReaderSelectionCollections,
  localReaderSelectionsStorageKey,
  parseReaderSelectionCollectionsResult,
  prepareReaderSelectionSave,
  removeReaderSelectionFromLocalCollection,
} from "../src/lib/reader/reader-selection-save.ts";

test("defines and validates persisted reader selection collections", () => {
  assert.equal(localReaderSelectionsStorageKey, "stray-pages.reader-selections");
  assert.deepEqual(
    parseReaderSelectionCollectionsResult(
      JSON.stringify({ vocabularyTexts: ["threshold"], sentenceTexts: ["A full sentence."] }),
    ),
    {
      ok: true,
      status: "ready",
      collections: {
        vocabularyTexts: ["threshold"],
        sentenceTexts: ["A full sentence."],
      },
    },
  );
  assert.deepEqual(
    parseReaderSelectionCollectionsResult(
      JSON.stringify({ vocabularyTexts: ["valid", 42], sentenceTexts: [] }),
    ),
    {
      ok: false,
      reason: "malformed",
      collections: createEmptyReaderSelectionCollections(),
    },
  );
  assert.deepEqual(parseReaderSelectionCollectionsResult("not-json"), {
    ok: false,
    reason: "malformed",
    collections: createEmptyReaderSelectionCollections(),
  });
  assert.deepEqual(parseReaderSelectionCollectionsResult(null), {
    ok: true,
    status: "missing",
    collections: createEmptyReaderSelectionCollections(),
  });
});

test("does not create a write candidate from malformed persisted selections", () => {
  assert.deepEqual(prepareReaderSelectionSave("{corrupt", "vocabulary", "threshold"), {
    ok: false,
    reason: "malformed",
  });

  const result = prepareReaderSelectionSave(null, "vocabulary", "threshold");
  assert.equal(result.ok, true);
  assert.equal(result.ok && result.addResult.status, "added");
  assert.equal(
    result.ok && result.serializedValue,
    JSON.stringify({ vocabularyTexts: ["threshold"], sentenceTexts: [] }),
  );
});

test("removes study-page deletions from persisted reader selections", () => {
  const collections = {
    vocabularyTexts: ["threshold", "archive"],
    sentenceTexts: ["A full sentence."],
  };

  assert.deepEqual(
    removeReaderSelectionFromLocalCollection(collections, "vocabulary", "Threshold"),
    { vocabularyTexts: ["archive"], sentenceTexts: ["A full sentence."] },
  );
});

test("adds selected text to the local vocabulary collection", () => {
  const result = addReaderSelectionToLocalCollection(
    createEmptyReaderSelectionCollections(),
    "vocabulary",
    " threshold ",
  );

  assert.equal(result.status, "added");
  assert.deepEqual(result.collections.vocabularyTexts, ["threshold"]);
  assert.equal(result.message, "已加入词汇本");
});

test("adds selected text to the local sentence collection", () => {
  const result = addReaderSelectionToLocalCollection(
    createEmptyReaderSelectionCollections(),
    "sentence",
    "He did not answer.",
  );

  assert.equal(result.status, "added");
  assert.deepEqual(result.collections.sentenceTexts, ["He did not answer."]);
  assert.equal(result.message, "已加入句子本");
});

test("does not duplicate saved reader selections", () => {
  const first = addReaderSelectionToLocalCollection(
    createEmptyReaderSelectionCollections(),
    "vocabulary",
    "threshold",
  );
  const second = addReaderSelectionToLocalCollection(first.collections, "vocabulary", "Threshold");

  assert.equal(second.status, "exists");
  assert.deepEqual(second.collections.vocabularyTexts, ["threshold"]);
  assert.equal(second.message, "已在词汇本");
});
