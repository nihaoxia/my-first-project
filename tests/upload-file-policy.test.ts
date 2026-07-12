import test from "node:test";
import assert from "node:assert/strict";

import {
  detectUploadFileFormat,
  formatBytes,
  uploadFilePolicy,
  validateUploadFileCandidate,
} from "../src/lib/upload/file-policy.ts";

test("detects supported upload files case-insensitively", () => {
  assert.equal(detectUploadFileFormat("Novel.TXT"), "TXT");
  assert.equal(detectUploadFileFormat("book.epub"), "EPUB");
  assert.equal(detectUploadFileFormat("archive.MOBI"), "MOBI");
  assert.equal(detectUploadFileFormat("scan.PDF"), "PDF");
});

test("rejects unsupported upload formats", () => {
  assert.deepEqual(validateUploadFileCandidate({ name: "notes.docx", size: 1024 }), {
    ok: false,
    reason: "unsupported-format",
  });
});

test("rejects empty upload files", () => {
  assert.deepEqual(validateUploadFileCandidate({ name: "empty.txt", size: 0 }), {
    ok: false,
    reason: "empty-file",
  });
});

test("rejects files over the development upload limit", () => {
  assert.deepEqual(
    validateUploadFileCandidate({
      name: "large.txt",
      size: uploadFilePolicy.maxSizeBytes + 1,
    }),
    {
      ok: false,
      reason: "file-too-large",
    },
  );
});

test("accepts supported files inside the development upload limit", () => {
  assert.deepEqual(validateUploadFileCandidate({ name: "story.txt", size: 4096 }), {
    ok: true,
    format: "TXT",
  });
  assert.deepEqual(validateUploadFileCandidate({ name: "story.mobi", size: 4096 }), {
    ok: false,
    reason: "unsupported-format",
  });
  assert.deepEqual(validateUploadFileCandidate({ name: "story.pdf", size: 4096 }), {
    ok: false,
    reason: "unsupported-format",
  });
});

test("formats byte sizes for UI display", () => {
  assert.equal(formatBytes(1024), "1 KB");
  assert.equal(formatBytes(2 * 1024 * 1024), "2 MB");
});
