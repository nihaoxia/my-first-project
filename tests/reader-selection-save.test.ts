import assert from "node:assert/strict";
import test from "node:test";

import {
  addReaderSelectionToLocalCollection,
  createEmptyReaderSelectionCollections,
} from "../src/lib/reader/reader-selection-save.ts";

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
