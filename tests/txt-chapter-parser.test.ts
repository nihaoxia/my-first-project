import test from "node:test";
import assert from "node:assert/strict";

import {
  detectTxtChapterHeading,
  parseTxtChapters,
  txtChapterParsePolicy,
} from "../src/lib/upload/txt-chapter-parser.ts";
import { MAX_CHAPTERS } from "../src/lib/cloud/books-core.ts";

test("detects common Chinese chapter headings", () => {
  assert.equal(detectTxtChapterHeading("第一章 雾起"), "第一章 雾起");
  assert.equal(detectTxtChapterHeading("第十二回 黑桥"), "第十二回 黑桥");
});

test("keeps full chapter content alongside the short preview", () => {
  const result = parseTxtChapters(
    [
      "Chapter 1",
      "The first full paragraph should be preserved.",
      "The second full paragraph should also stay available after import.",
    ].join("\n"),
    { shortChapterCharacters: 8 },
  );

  assert.equal(
    result.chapters[0].content,
    "The first full paragraph should be preserved.\nThe second full paragraph should also stay available after import.",
  );
  assert.equal(result.chapters[0].contentPreview.includes("\n"), false);
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

test("does not split repeated table-of-contents entries into empty chapters", () => {
  const result = parseTxtChapters(
    [
      "目录",
      "第一章 起点",
      "第二章 迷雾",
      "",
      "第一章 起点",
      "这是正文内容。",
    ].join("\n"),
    { shortChapterCharacters: 1 },
  );

  assert.deepEqual(
    result.chapters.map((chapter) => [chapter.title, chapter.content]),
    [["第一章 起点", "这是正文内容。"]],
  );
});

test("normalizes dotted, tabbed, ellipsis, and English table-of-contents page numbers", () => {
  const cases = [
    ["第一章 起点 ........ 1", "第二章 迷雾 ........ 8", "第一章 起点", "第二章 迷雾"],
    ["第一章 起点\t1", "第二章 迷雾\t8", "第一章 起点", "第二章 迷雾"],
    ["第一章 起点…………1", "第二章 迷雾…………8", "第一章 起点", "第二章 迷雾"],
    ["Chapter 1 ..... 3", "Chapter 2 ..... 9", "Chapter 1", "Chapter 2"],
  ];

  for (const [tocOne, tocTwo, bodyOne, bodyTwo] of cases) {
    const result = parseTxtChapters(
      [
        "目录",
        tocOne,
        tocTwo,
        "",
        bodyOne,
        "这是第一章正文。",
        bodyTwo,
        "这是第二章正文。",
      ].join("\n"),
      { shortChapterCharacters: 1 },
    );

    assert.deepEqual(
      result.chapters.map((chapter) => chapter.title),
      [bodyOne, bodyTwo],
    );
  }
});

test("does not remove normal chapter documents without a leading directory", () => {
  const result = parseTxtChapters(
    ["第一章 起点", "正文一。", "第二章 迷雾", "正文二。"].join("\n"),
    { shortChapterCharacters: 1 },
  );

  assert.deepEqual(result.chapters.map((chapter) => chapter.title), ["第一章 起点", "第二章 迷雾"]);
});

test("marks very short chapters for review", () => {
  const result = parseTxtChapters(["第一章 雾起", "短。"].join("\n"), {
    shortChapterCharacters: 10,
  });

  assert.equal(result.chapters[0].warnings.includes("short-chapter"), true);
});

test("rejects parser output beyond the authoritative chapter count", () => {
  const content = Array.from({ length: MAX_CHAPTERS + 1 }, (_, index) => `Chapter ${index + 1}\nbody`).join("\n");
  assert.throws(() => parseTxtChapters(content), /TOO_MANY_CHAPTERS/);
});
