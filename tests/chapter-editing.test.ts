import test from "node:test";
import assert from "node:assert/strict";

import {
  buildEditableChapters,
  renameEditableChapter,
  restoreEditableChapter,
  skipEditableChapter,
  summarizeEditableChapters,
} from "../src/lib/upload/chapter-editing.ts";
import type { TxtChapterPreview } from "../src/lib/upload/txt-chapter-parser.ts";

const chapterPreviews: TxtChapterPreview[] = [
  {
    index: 1,
    title: "第一章 雾起",
    characterCount: 3200,
    content: "雾从边境漫过来。",
    contentPreview: "雾从边境漫过来。",
    suggestedSkip: false,
    warnings: [],
  },
  {
    index: 2,
    title: "目录",
    characterCount: 120,
    content: "第一章 雾起\n第二章 黑桥",
    contentPreview: "第一章 雾起 第二章 黑桥",
    suggestedSkip: true,
    warnings: ["likely-toc", "short-chapter"],
  },
];

test("builds editable chapters from parsed chapter previews", () => {
  assert.deepEqual(buildEditableChapters(chapterPreviews), [
    {
      ...chapterPreviews[0],
      originalTitle: "第一章 雾起",
      included: true,
    },
    {
      ...chapterPreviews[1],
      originalTitle: "目录",
      included: false,
    },
  ]);
});

test("renames a chapter and keeps the original title for rollback display", () => {
  const chapters = buildEditableChapters(chapterPreviews);
  const result = renameEditableChapter(chapters, 1, "第一章 边境起雾");

  assert.equal(result.ok, true);

  if (!result.ok) {
    return;
  }

  assert.equal(result.chapters[0]?.title, "第一章 边境起雾");
  assert.equal(result.chapters[0]?.originalTitle, "第一章 雾起");
  assert.equal(chapters[0]?.title, "第一章 雾起");
});

test("rejects empty chapter titles without changing the chapter list", () => {
  const chapters = buildEditableChapters(chapterPreviews);
  const result = renameEditableChapter(chapters, 1, "   ");

  assert.deepEqual(result, {
    ok: false,
    reason: "empty-title",
    chapters,
  });
});

test("skips and restores chapters by chapter index", () => {
  const chapters = buildEditableChapters(chapterPreviews);
  const skipped = skipEditableChapter(chapters, 1);

  assert.equal(skipped.ok, true);

  if (!skipped.ok) {
    return;
  }

  assert.equal(skipped.chapters[0]?.included, false);

  const restored = restoreEditableChapter(skipped.chapters, 1);

  assert.equal(restored.ok, true);

  if (!restored.ok) {
    return;
  }

  assert.equal(restored.chapters[0]?.included, true);
});

test("summarizes editable chapter selection state", () => {
  const chapters = buildEditableChapters(chapterPreviews);

  assert.deepEqual(summarizeEditableChapters(chapters), {
    totalChapters: 2,
    includedChapters: 1,
    skippedChapters: 1,
    warningChapters: 1,
  });
});
