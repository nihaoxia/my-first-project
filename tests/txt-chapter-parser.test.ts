import test from "node:test";
import assert from "node:assert/strict";

import {
  detectTxtChapterHeading,
  parseTxtChapters,
  txtChapterParsePolicy,
} from "../src/lib/upload/txt-chapter-parser.ts";

test("detects common Chinese chapter headings", () => {
  assert.equal(detectTxtChapterHeading("第一章 雾起"), "第一章 雾起");
  assert.equal(detectTxtChapterHeading("第十二回 黑桥"), "第十二回 黑桥");
});

test("detects common English chapter headings", () => {
  assert.equal(detectTxtChapterHeading("Chapter 1 The Gate"), "Chapter 1 The Gate");
  assert.equal(detectTxtChapterHeading("CHAPTER 12: The Archive"), "CHAPTER 12: The Archive");
});

test("splits TXT content into chapter previews by heading lines", () => {
  const result = parseTxtChapters(
    [
      "第一章 雾起",
      "雾从桥下升起，覆盖了边境。",
      "",
      "第二章 黑桥",
      "桥面没有脚印，灯光却在远处晃动。",
    ].join("\n"),
    { shortChapterCharacters: 8 },
  );

  assert.equal(result.chapters.length, 2);
  assert.deepEqual(
    result.chapters.map((chapter) => chapter.title),
    ["第一章 雾起", "第二章 黑桥"],
  );
  assert.equal(result.chapters[0].contentPreview, "雾从桥下升起，覆盖了边境。");
  assert.deepEqual(result.warnings, []);
});

test("keeps leading content before the first heading as an opening chapter", () => {
  const result = parseTxtChapters(["献词", "给所有迷路的人。", "", "第一章 雾起", "正文开始。"].join("\n"));

  assert.equal(result.chapters[0].title, txtChapterParsePolicy.leadingContentTitle);
  assert.equal(result.chapters[0].warnings.includes("leading-content"), true);
});

test("returns one chapter and warning when no heading is found", () => {
  const result = parseTxtChapters("整本书没有明显章节标题。\n只有连续正文。");

  assert.equal(result.chapters.length, 1);
  assert.equal(result.chapters[0].title, txtChapterParsePolicy.singleChapterTitle);
  assert.deepEqual(result.warnings, ["single-chapter"]);
});

test("marks likely table of contents chapters as suggested skip", () => {
  const result = parseTxtChapters(["目录", "第一章 雾起", "第二章 黑桥"].join("\n"), {
    shortChapterCharacters: 100,
  });

  assert.equal(result.chapters[0].suggestedSkip, true);
  assert.equal(result.chapters[0].warnings.includes("likely-toc"), true);
});

test("marks very short chapters for review", () => {
  const result = parseTxtChapters(["第一章 雾起", "短。"].join("\n"), {
    shortChapterCharacters: 10,
  });

  assert.equal(result.chapters[0].warnings.includes("short-chapter"), true);
});
