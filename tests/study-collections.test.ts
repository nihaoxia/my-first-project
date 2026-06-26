import assert from "node:assert/strict";
import test from "node:test";

import {
  createSentenceDraft,
  createVocabularyDraft,
  deleteSentenceItem,
  deleteVocabularyItem,
  filterSentenceItems,
  filterVocabularyItems,
  mergeVocabularyItem,
  previewStudyItemDeletion,
} from "../src/lib/reader/study-collections.ts";

test("creates vocabulary drafts with source labels and notes", () => {
  const draft = createVocabularyDraft({
    term: "threshold",
    explanation: "门槛；临界点",
    contextualMean: "进入事件前的边界感",
    sourceSentence: "He paused at the threshold of the inn.",
    bookId: "demo-book",
    bookTitle: "迷雾边境",
    chapterId: "chapter-2",
    chapterTitle: "第二章：黑桥",
    note: "这里不是普通门槛。",
  });

  assert.equal(draft.id, "vocab-demo-book-chapter-2-threshold");
  assert.equal(draft.sourceLabel, "迷雾边境 · 第二章：黑桥");
  assert.equal(draft.note, "这里不是普通门槛。");
});

test("merges duplicate vocabulary items for the same book", () => {
  const existing = createVocabularyDraft({
    term: "threshold",
    explanation: "门槛",
    contextualMean: "门口",
    sourceSentence: "A",
    bookId: "demo-book",
    bookTitle: "迷雾边境",
    chapterId: "chapter-1",
    chapterTitle: "第一章：雾起",
    note: "",
  });

  const incoming = createVocabularyDraft({
    term: "Threshold",
    explanation: "临界点",
    contextualMean: "边界",
    sourceSentence: "B",
    bookId: "demo-book",
    bookTitle: "迷雾边境",
    chapterId: "chapter-2",
    chapterTitle: "第二章：黑桥",
    note: "第二次遇到。",
  });

  const merged = mergeVocabularyItem([existing], incoming);

  assert.equal(merged.length, 1);
  assert.equal(merged[0].explanation, "临界点");
  assert.match(merged[0].note, /第二次遇到/);
});

test("filters vocabulary and sentence items by query and book", () => {
  const vocabulary = [
    createVocabularyDraft({
      term: "threshold",
      explanation: "门槛",
      contextualMean: "边界",
      sourceSentence: "He paused at the threshold.",
      bookId: "demo-book",
      bookTitle: "迷雾边境",
      chapterId: "chapter-2",
      chapterTitle: "第二章：黑桥",
      note: "",
    }),
    createVocabularyDraft({
      term: "archive",
      explanation: "档案馆",
      contextualMean: "档案",
      sourceSentence: "Silent Archive",
      bookId: "silent-archive",
      bookTitle: "Silent Archive",
      chapterId: "chapter-1",
      chapterTitle: "Chapter 1",
      note: "",
    }),
  ];

  const sentences = [
    createSentenceDraft({
      originalText: "他没有回答，只把灯举得更高。",
      translatedText: "He did not answer; he simply raised the lamp higher.",
      explanation: "动作衔接紧密。",
      bookId: "demo-book",
      bookTitle: "迷雾边境",
      chapterId: "chapter-2",
      chapterTitle: "第二章：黑桥",
      note: "",
    }),
  ];

  assert.deepEqual(
    filterVocabularyItems(vocabulary, { query: "threshold", bookId: "demo-book" }).map(
      (item) => item.term,
    ),
    ["threshold"],
  );
  assert.deepEqual(
    filterSentenceItems(sentences, { query: "分号", bookId: "demo-book" }).map(
      (item) => item.sourceLabel,
    ),
    ["迷雾边境 · 第二章：黑桥"],
  );
});

test("filters study items by visible source labels", () => {
  const vocabulary = [
    createVocabularyDraft({
      term: "threshold",
      explanation: "doorway",
      contextualMean: "edge",
      sourceSentence: "He paused at the threshold.",
      bookId: "demo-book",
      bookTitle: "The Border of Mist",
      chapterId: "chapter-2",
      chapterTitle: "Black Bridge",
      note: "",
    }),
  ];
  const sentences = [
    createSentenceDraft({
      originalText: "He did not answer.",
      translatedText: "他没有回答。",
      explanation: "",
      bookId: "demo-book",
      bookTitle: "The Border of Mist",
      chapterId: "chapter-2",
      chapterTitle: "Black Bridge",
      note: "",
    }),
  ];

  assert.deepEqual(
    filterVocabularyItems(vocabulary, { query: "black bridge" }).map((item) => item.term),
    ["threshold"],
  );
  assert.deepEqual(
    filterSentenceItems(sentences, { query: "border of mist" }).map((item) => item.originalText),
    ["He did not answer."],
  );
});

test("previews deletion without mutating study items", () => {
  const preview = previewStudyItemDeletion({
    id: "sentence-demo-book-chapter-2-1",
    kind: "sentence",
    label: "他没有回答，只把灯举得更高。",
  });

  assert.equal(preview.id, "sentence-demo-book-chapter-2-1");
  assert.equal(preview.kind, "sentence");
  assert.match(preview.message, /将从句子本移除/);
});

test("deletes vocabulary and sentence items from local lists", () => {
  const vocabulary = [
    createVocabularyDraft({
      term: "threshold",
      explanation: "门槛",
      contextualMean: "边界",
      sourceSentence: "He paused at the threshold.",
      bookId: "demo-book",
      bookTitle: "迷雾边境",
      chapterId: "chapter-2",
      chapterTitle: "第二章：黑桥",
      note: "",
    }),
  ];
  const sentences = [
    createSentenceDraft({
      originalText: "他没有回答，只把灯举得更高。",
      bookId: "demo-book",
      bookTitle: "迷雾边境",
      chapterId: "chapter-2",
      chapterTitle: "第二章：黑桥",
    }),
  ];

  assert.deepEqual(deleteVocabularyItem(vocabulary, vocabulary[0].id), []);
  assert.deepEqual(deleteSentenceItem(sentences, sentences[0].id), []);
});
