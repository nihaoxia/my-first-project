import test from "node:test";
import assert from "node:assert/strict";

import { buildLocalUploadDraftFromFile } from "../src/lib/upload/local-upload-draft.ts";

test("reads TXT file content before building a local upload draft", async () => {
  const draft = await buildLocalUploadDraftFromFile({
    name: "迷雾边境 - 林间客.txt",
    size: 4096,
    text: async () => "第一章 雾起\n雾从边境漫过来。\n\n第二章 黑桥\n桥下没有水，只有风。",
  });

  assert.equal(draft.ok, true);

  if (!draft.ok) {
    return;
  }

  assert.equal(draft.parseStatus, "parsed");
  assert.equal(draft.chapters.length, 2);
});

test("does not read EPUB file content before the EPUB parser exists", async () => {
  let readCount = 0;

  const draft = await buildLocalUploadDraftFromFile({
    name: "迷雾边境 - 林间客.epub",
    size: 2048,
    text: async () => {
      readCount += 1;
      return "epub bytes";
    },
  });

  assert.equal(readCount, 0);
  assert.deepEqual(draft, {
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

test("rejects unsupported files before reading content", async () => {
  let readCount = 0;

  const draft = await buildLocalUploadDraftFromFile({
    name: "scan.docx",
    size: 1024,
    text: async () => {
      readCount += 1;
      return "docx";
    },
  });

  assert.equal(readCount, 0);
  assert.deepEqual(draft, {
    ok: false,
    reason: "unsupported-format",
  });
});

test("returns a local read error when TXT text extraction fails", async () => {
  const draft = await buildLocalUploadDraftFromFile({
    name: "迷雾边境 - 林间客.txt",
    size: 4096,
    text: async () => {
      throw new Error("read failed");
    },
  });

  assert.deepEqual(draft, {
    ok: false,
    reason: "file-read-failed",
  });
});
