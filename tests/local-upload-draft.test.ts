import test from "node:test";
import assert from "node:assert/strict";

import {
  buildLocalUploadDraftFromFile,
  decodeLocalTxtBytes,
} from "../src/lib/upload/local-upload-draft.ts";
import { makeMinimalEpub3 } from "./epub-fixtures.ts";

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

test("reads EPUB bytes locally and returns a fully parsed upload draft", async () => {
  const bytes = makeMinimalEpub3();
  let textReadCount = 0;
  let binaryReadCount = 0;

  const draft = await buildLocalUploadDraftFromFile({
    name: "迷雾边境 - 林间客.epub",
    size: bytes.byteLength,
    text: async () => {
      textReadCount += 1;
      return "epub bytes";
    },
    arrayBuffer: async () => {
      binaryReadCount += 1;
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    },
  });

  assert.equal(textReadCount, 0);
  assert.equal(binaryReadCount, 1);
  assert.equal(draft.ok, true);
  if (!draft.ok) return;
  assert.equal(draft.format, "EPUB");
  assert.equal(draft.parseStatus, "parsed");
  assert.equal(draft.chapters.length, 2);
});

test("maps unsafe EPUB structures to a stable local error", async () => {
  const bytes = new Uint8Array([1, 2, 3, 4]);
  assert.deepEqual(
    await buildLocalUploadDraftFromFile({
      name: "broken.epub",
      size: bytes.byteLength,
      text: async () => "",
      arrayBuffer: async () => bytes.buffer,
    }),
    { ok: false, reason: "invalid-epub" },
  );
});

test("decodes GB18030 TXT bytes when they are not valid UTF-8", () => {
  const gb18030Bytes = Uint8Array.from([0xd6, 0xd0, 0xce, 0xc4]);

  assert.equal(decodeLocalTxtBytes(gb18030Bytes.buffer), "中文");
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
