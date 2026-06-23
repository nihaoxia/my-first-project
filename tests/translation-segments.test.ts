import assert from "node:assert/strict";
import test from "node:test";

import { splitChapterIntoTranslationSegments } from "../src/lib/translation/translation-segments.ts";

test("returns no segments for empty chapter text", () => {
  const segments = splitChapterIntoTranslationSegments({
    chapterId: "chapter-empty",
    chapterTitle: "空章",
    text: "   \n\n ",
    maxCharactersPerSegment: 100,
  });

  assert.deepEqual(segments, []);
});

test("groups cleaned paragraphs under the character limit", () => {
  const segments = splitChapterIntoTranslationSegments({
    chapterId: "chapter-1",
    chapterTitle: "第一章 雾起",
    text: "  第一段。\n\n第二段。\n\n第三段。",
    maxCharactersPerSegment: 12,
  });

  assert.equal(segments.length, 2);
  assert.equal(segments[0].id, "chapter-1-segment-1");
  assert.equal(segments[0].text, "第一段。\n\n第二段。");
  assert.equal(segments[1].text, "第三段。");
});

test("hard splits a single paragraph that exceeds the character limit", () => {
  const segments = splitChapterIntoTranslationSegments({
    chapterId: "chapter-long",
    chapterTitle: "长段",
    text: "雾".repeat(11),
    maxCharactersPerSegment: 5,
  });

  assert.deepEqual(
    segments.map((segment) => segment.text),
    ["雾".repeat(5), "雾".repeat(5), "雾"],
  );
});

test("keeps stable segment metadata", () => {
  const segments = splitChapterIntoTranslationSegments({
    chapterId: "chapter-meta",
    chapterTitle: "元数据",
    text: "alpha\n\nbeta",
    maxCharactersPerSegment: 5,
  });

  assert.deepEqual(
    segments.map((segment) => ({
      id: segment.id,
      index: segment.index,
      chapterId: segment.chapterId,
      chapterTitle: segment.chapterTitle,
      characterCount: segment.characterCount,
    })),
    [
      {
        id: "chapter-meta-segment-1",
        index: 0,
        chapterId: "chapter-meta",
        chapterTitle: "元数据",
        characterCount: 5,
      },
      {
        id: "chapter-meta-segment-2",
        index: 1,
        chapterId: "chapter-meta",
        chapterTitle: "元数据",
        characterCount: 4,
      },
    ],
  );
});
