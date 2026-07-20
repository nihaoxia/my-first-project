import test from "node:test";
import assert from "node:assert/strict";

import { buildUploadDraft, canContinueToChapterPreview } from "../src/lib/upload/upload-draft.ts";

test("rejects unsupported upload files before building a draft", () => {
  assert.deepEqual(buildUploadDraft({ name: "scan.docx", size: 1024 }), {
    ok: false,
    reason: "unsupported-format",
  });
});

test("marks TXT drafts as waiting for content when no text is provided", () => {
  assert.deepEqual(buildUploadDraft({ name: "Silent Archive by M. Vale.txt", size: 1024 }), {
    ok: true,
    format: "TXT",
    metadata: {
      title: "Silent Archive",
      author: "M. Vale",
      format: "TXT",
      originalFileName: "Silent Archive by M. Vale.txt",
    },
    parseStatus: "needs-text-content",
    chapters: [],
    warnings: [],
  });
});

test("builds parsed TXT upload drafts with inferred metadata and chapter previews", () => {
  const draft = buildUploadDraft({
    name: "迷雾边境 - 林间客.txt",
    size: 4096,
    textContent: "第一章 雾起\n雾从边境漫过来。\n\n第二章 黑桥\n桥下没有水，只有风。",
  });

  assert.equal(draft.ok, true);

  if (!draft.ok) {
    return;
  }

  assert.equal(draft.parseStatus, "parsed");
  assert.deepEqual(draft.metadata, {
    title: "迷雾边境",
    author: "林间客",
    format: "TXT",
    originalFileName: "迷雾边境 - 林间客.txt",
  });
  assert.equal(draft.chapters.length, 2);
  assert.equal(draft.chapters[0]?.title, "第一章 雾起");
});

test("marks EPUB drafts as waiting for the local binary parser", () => {
  assert.deepEqual(buildUploadDraft({ name: "迷雾边境 - 林间客.epub", size: 2048 }), {
    ok: true,
    format: "EPUB",
    metadata: {
      title: "迷雾边境",
      author: "林间客",
      format: "EPUB",
      originalFileName: "迷雾边境 - 林间客.epub",
    },
    parseStatus: "needs-epub-parser",
    chapters: [],
    warnings: [],
  });
});

test("rejects MOBI and PDF drafts until complete processing exists", () => {
  assert.deepEqual(buildUploadDraft({ name: "迷雾边境 - 林间客.mobi", size: 2048 }), {
    ok: false,
    reason: "unsupported-format",
  });

  assert.deepEqual(buildUploadDraft({ name: "资料合集.pdf", size: 2048 }), {
    ok: false,
    reason: "unsupported-format",
  });
});

test("only parsed TXT drafts can continue to chapter preview", () => {
  const parsedTxtDraft = buildUploadDraft({
    name: "迷雾边境 - 林间客.txt",
    size: 4096,
    textContent: "第一章 雾起\n雾从边境漫过来。",
  });
  const pendingPdfDraft = buildUploadDraft({ name: "资料合集.pdf", size: 2048 });
  const pendingEpubDraft = buildUploadDraft({ name: "迷雾边境 - 林间客.epub", size: 2048 });

  assert.equal(canContinueToChapterPreview(parsedTxtDraft), true);
  assert.equal(canContinueToChapterPreview(pendingPdfDraft), false);
  assert.equal(canContinueToChapterPreview(pendingEpubDraft), false);
  assert.equal(canContinueToChapterPreview({ ok: false, reason: "unsupported-format" }), false);
  assert.equal(canContinueToChapterPreview({ ok: false, reason: "file-read-failed" }), false);
});
