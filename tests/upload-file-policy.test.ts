import test from "node:test";
import assert from "node:assert/strict";

import {
  detectUploadFileFormat,
  formatBytes,
  uploadFilePolicy,
  validateUploadFileCandidate,
} from "../src/lib/upload/file-policy.ts";

test("detects supported TXT and EPUB files case-insensitively", () => {
  assert.equal(detectUploadFileFormat("Novel.TXT"), "TXT");
  assert.equal(detectUploadFileFormat("book.epub"), "EPUB");
});

test("rejects unsupported upload formats", () => {
  assert.deepEqual(validateUploadFileCandidate({ name: "notes.pdf", size: 1024 }), {
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
      name: "large.epub",
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
});

test("formats byte sizes for UI display", () => {
  assert.equal(formatBytes(1024), "1 KB");
  assert.equal(formatBytes(20 * 1024 * 1024), "20 MB");
});
