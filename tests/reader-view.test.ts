import assert from "node:assert/strict";
import test from "node:test";

import {
  buildReaderView,
  normalizeReaderSettings,
} from "../src/lib/reader/reader-view.ts";

const readerChapters = [
  {
    id: "chapter-1",
    title: "第一章：雾起",
    wordCount: 3180,
    sourceParagraphs: ["雾慢慢升起。"],
    translatedParagraphs: ["The mist rose slowly."],
  },
  {
    id: "chapter-2",
    title: "第二章：黑桥",
    wordCount: 2760,
    sourceParagraphs: ["他没有回答。", "只把灯举得更高。"],
    translatedParagraphs: ["He did not answer."],
    secondaryTranslationParagraphs: ["他没有回答。", "只把灯举得更高。"],
  },
  {
    id: "chapter-3",
    title: "第三章：无名旅店",
    wordCount: 6120,
    sourceParagraphs: ["旅店门开着。"],
    translatedParagraphs: ["The inn door was open."],
  },
];

test("builds reader navigation and parallel paragraph rows", () => {
  const view = buildReaderView({
    chapters: readerChapters,
    currentChapterId: "chapter-2",
    mode: "parallel",
    settings: { fontSize: 19, lineHeight: 1.75, contentWidth: 940, theme: "light" },
  });

  assert.equal(view.currentChapter.id, "chapter-2");
  assert.equal(view.previousChapter?.id, "chapter-1");
  assert.equal(view.nextChapter?.id, "chapter-3");
  assert.equal(view.modeLabel, "对照");
  assert.deepEqual(
    view.paragraphRows.map((row) => [row.sourceText, row.translatedText]),
    [
      ["他没有回答。", "He did not answer."],
      ["只把灯举得更高。", ""],
    ],
  );
});

test("falls back to the first chapter when requested chapter is missing", () => {
  const view = buildReaderView({
    chapters: readerChapters,
    currentChapterId: "missing",
    mode: "translation",
  });

  assert.equal(view.currentChapter.id, "chapter-1");
  assert.equal(view.previousChapter, undefined);
  assert.equal(view.nextChapter?.id, "chapter-2");
  assert.deepEqual(
    view.paragraphRows.map((row) => row.displayText),
    ["The mist rose slowly."],
  );
});

test("keeps learning text primary and optional translation separate", () => {
  const view = buildReaderView({
    chapters: readerChapters,
    currentChapterId: "chapter-2",
    mode: "translation",
  });

  assert.deepEqual(
    view.paragraphRows.map((row) => [row.learningText, row.secondaryTranslationText]),
    [
      ["He did not answer.", "他没有回答。"],
      ["只把灯举得更高。", "只把灯举得更高。"],
    ],
  );
  assert.deepEqual(
    view.paragraphRows.map((row) => row.displayText),
    ["He did not answer.", "只把灯举得更高。"],
  );
});

test("removes local mock markers from learning text", () => {
  const view = buildReaderView({
    chapters: [
      {
        id: "chapter-mock",
        title: "Mock chapter",
        wordCount: 1200,
        sourceParagraphs: ["他没有回答，只把灯举得更高。"],
        translatedParagraphs: [
          "[Mock English] The lamp-lit response is rendered from: 他没有回答，只把灯举得更高。",
        ],
        secondaryTranslationParagraphs: ["他没有回答，只把灯举得更高。"],
      },
    ],
  });

  assert.equal(view.paragraphRows[0].learningText, "The lamp-lit response.");
  assert.equal(view.paragraphRows[0].secondaryTranslationText, "他没有回答，只把灯举得更高。");
});

test("normalizes reader settings into safe display ranges", () => {
  assert.deepEqual(
    normalizeReaderSettings({
      fontSize: 8,
      lineHeight: 4,
      contentWidth: 2000,
      theme: "unknown",
    }),
    {
      fontSize: 16,
      lineHeight: 2.2,
      contentWidth: 1480,
      theme: "light",
    },
  );
});
