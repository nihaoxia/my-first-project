import assert from "node:assert/strict";
import test from "node:test";

import {
  localNotesStorageKey,
  localSentencesStorageKey,
  localVocabularyStorageKey,
  mergeReaderSelectionsIntoSentenceItems,
  mergeReaderSelectionsIntoVocabularyItems,
  parseStoredSentenceItems,
  parseStoredSentenceItemsResult,
  parseStoredStudyNotes,
  parseStoredStudyNotesResult,
  parseStoredVocabularyItems,
  parseStoredVocabularyItemsResult,
} from "../src/lib/study/local-study-storage.ts";
import { createSentenceDraft, createVocabularyDraft } from "../src/lib/reader/study-collections.ts";
import type { StudyNote } from "../src/lib/study/study-notes-local.ts";

const vocabularyItem = createVocabularyDraft({
  term: "threshold",
  explanation: "门槛",
  contextualMean: "边界",
  sourceSentence: "He paused at the threshold.",
  bookId: "demo-book",
  bookTitle: "迷雾边境",
  chapterId: "chapter-2",
  chapterTitle: "第二章",
});

test("distinguishes missing study data from malformed arrays", () => {
  assert.deepEqual(parseStoredVocabularyItemsResult(null), {
    ok: true,
    status: "missing",
    records: [],
  });
  assert.equal(parseStoredVocabularyItemsResult("not-json").ok, false);
  assert.equal(parseStoredSentenceItemsResult(JSON.stringify([{ id: "bad" }])).ok, false);
  assert.equal(parseStoredStudyNotesResult(JSON.stringify([{ ...note, content: 42 }])).ok, false);
});
const sentenceItem = createSentenceDraft({
  originalText: "He did not answer.",
  translatedText: "他没有回答。",
  bookId: "demo-book",
  bookTitle: "迷雾边境",
  chapterId: "chapter-2",
  chapterTitle: "第二章",
});
const note: StudyNote = {
  id: "note-1",
  title: "阅读笔记",
  source: "个人笔记",
  updatedAt: "刚刚",
  content: "内容",
};

test("defines separate scoped base keys for all study notebooks", () => {
  assert.equal(localVocabularyStorageKey, "stray-pages.study-vocabulary");
  assert.equal(localSentencesStorageKey, "stray-pages.study-sentences");
  assert.equal(localNotesStorageKey, "stray-pages.study-notes");
});

test("deep-validates persisted study items and notes", () => {
  assert.deepEqual(parseStoredVocabularyItems(JSON.stringify([vocabularyItem])), [vocabularyItem]);
  assert.deepEqual(parseStoredSentenceItems(JSON.stringify([sentenceItem])), [sentenceItem]);
  assert.deepEqual(parseStoredStudyNotes(JSON.stringify([note])), [note]);
  assert.deepEqual(
    parseStoredVocabularyItems(JSON.stringify([{ ...vocabularyItem, sourceSentence: 42 }])),
    [],
  );
  assert.deepEqual(parseStoredSentenceItems("not-json"), []);
  assert.deepEqual(parseStoredStudyNotes(JSON.stringify([{ ...note, title: null }])), []);
});

test("projects persisted reader selections into the visible study notebooks", () => {
  const selections = {
    vocabularyTexts: ["threshold", "archive"],
    sentenceTexts: ["He did not answer.", "The bridge was empty."],
  };
  const vocabulary = mergeReaderSelectionsIntoVocabularyItems([vocabularyItem], selections);
  const sentences = mergeReaderSelectionsIntoSentenceItems([sentenceItem], selections);

  assert.deepEqual(vocabulary.map((item) => item.term), ["threshold", "archive"]);
  assert.deepEqual(sentences.map((item) => item.originalText), [
    "He did not answer.",
    "The bridge was empty.",
  ]);
  assert.equal(vocabulary[1].bookId, "reader-selections");
  assert.equal(sentences[1].bookId, "reader-selections");
});
