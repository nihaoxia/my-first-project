import test from "node:test";
import assert from "node:assert/strict";

import {
  buildMockReaderChapter,
  buildMockTranslatedChapter,
} from "../src/lib/translation/mock-translator.ts";

test("builds a deterministic translated chapter from source paragraphs", () => {
  const chapter = buildMockTranslatedChapter({
    chapterId: "chapter-2",
    title: "第二章：黑桥",
    targetLanguage: "英文",
    sourceParagraphs: [
      "雾像一层沉睡的灰布，缓慢盖过边境。",
      "",
      "他没有回答，只把灯举得更高。",
    ],
  });

  assert.equal(chapter.chapterId, "chapter-2");
  assert.equal(chapter.title, "第二章：黑桥");
  assert.equal(chapter.targetLanguage, "英文");
  assert.deepEqual(chapter.paragraphs, [
    "The mist moved like a sleeping gray cloth, slowly covering the border.",
    "He did not answer; he only raised the lamp higher.",
  ]);
});

test("falls back to a neutral mock translation for unmatched paragraphs", () => {
  const chapter = buildMockTranslatedChapter({
    chapterId: "chapter-5",
    title: "Chapter 5",
    targetLanguage: "英文",
    sourceParagraphs: ["A quiet sentence with no known motif."],
  });

  assert.deepEqual(chapter.paragraphs, ["A clear literary translation is ready for this paragraph."]);
});

test("returns the requested reader chapter from translated chapters", () => {
  const chapters = [
    buildMockTranslatedChapter({
      chapterId: "chapter-1",
      title: "第一章",
      targetLanguage: "英文",
      sourceParagraphs: ["雾升起。"],
    }),
    buildMockTranslatedChapter({
      chapterId: "chapter-2",
      title: "第二章",
      targetLanguage: "英文",
      sourceParagraphs: ["黑桥在远处。"],
    }),
  ];

  assert.deepEqual(buildMockReaderChapter(chapters, "chapter-2"), chapters[1]);
  assert.deepEqual(buildMockReaderChapter(chapters, "missing"), chapters[0]);
});
