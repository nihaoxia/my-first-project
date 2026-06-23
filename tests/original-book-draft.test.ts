import test from "node:test";
import assert from "node:assert/strict";

import { buildEditableChapters, skipEditableChapter, renameEditableChapter } from "../src/lib/upload/chapter-editing.ts";
import { buildOriginalBookDraft } from "../src/lib/upload/original-book-draft.ts";
import { buildUploadDraft } from "../src/lib/upload/upload-draft.ts";

const parsedUploadDraft = buildUploadDraft({
  name: "迷雾边境 - 林间客.txt",
  size: 4096,
  textContent: "第一章 雾起\n雾从边境漫过来。\n\n目录\n\n第二章 黑桥\n桥下没有水，只有风。",
});

test("builds an original book draft from a parsed TXT upload and editable chapters", () => {
  assert.equal(parsedUploadDraft.ok, true);

  if (!parsedUploadDraft.ok) {
    return;
  }

  const editableChapters = buildEditableChapters(parsedUploadDraft.chapters);
  const renamed = renameEditableChapter(editableChapters, 1, "第一章 边境起雾");

  assert.equal(renamed.ok, true);

  if (!renamed.ok) {
    return;
  }

  const draft = buildOriginalBookDraft({
    uploadDraft: parsedUploadDraft,
    chapters: renamed.chapters,
  });

  assert.equal(draft.ok, true);

  if (!draft.ok) {
    return;
  }

  assert.deepEqual(draft.book, {
    title: "迷雾边境",
    author: "林间客",
    format: "TXT",
    originalFileName: "迷雾边境 - 林间客.txt",
    includedChapterCount: 2,
    skippedChapterCount: 1,
    totalCharacters: 28,
  });
  assert.deepEqual(
    draft.chapters.map((chapter) => ({
      position: chapter.position,
      sourceIndex: chapter.sourceIndex,
      title: chapter.title,
    })),
    [
      { position: 1, sourceIndex: 1, title: "第一章 边境起雾" },
      { position: 2, sourceIndex: 3, title: "第二章 黑桥" },
    ],
  );
  assert.deepEqual(draft.skippedChapters, [
    {
      sourceIndex: 2,
      title: "目录",
      originalTitle: "目录",
      warnings: ["likely-toc", "short-chapter"],
    },
  ]);
});

test("rejects upload drafts that have not been parsed into chapters", () => {
  const epubDraft = buildUploadDraft({ name: "迷雾边境 - 林间客.epub", size: 2048 });

  assert.equal(epubDraft.ok, true);

  if (!epubDraft.ok) {
    return;
  }

  assert.deepEqual(buildOriginalBookDraft({ uploadDraft: epubDraft, chapters: [] }), {
    ok: false,
    reason: "upload-not-parsed",
  });
});

test("rejects a draft when every chapter is skipped", () => {
  assert.equal(parsedUploadDraft.ok, true);

  if (!parsedUploadDraft.ok) {
    return;
  }

  const editableChapters = buildEditableChapters(parsedUploadDraft.chapters);
  const skippedOne = skipEditableChapter(editableChapters, 1);

  assert.equal(skippedOne.ok, true);

  if (!skippedOne.ok) {
    return;
  }

  const skippedTwo = skipEditableChapter(skippedOne.chapters, 3);

  assert.equal(skippedTwo.ok, true);

  if (!skippedTwo.ok) {
    return;
  }

  assert.deepEqual(buildOriginalBookDraft({ uploadDraft: parsedUploadDraft, chapters: skippedTwo.chapters }), {
    ok: false,
    reason: "no-included-chapters",
  });
});
