import assert from "node:assert/strict";
import test from "node:test";

import {
  getLocalUploadDraftStorageUpdate,
  isStoredLocalUploadDraft,
  localUploadBookId,
  localUploadDraftStorageKey,
} from "../src/lib/upload/local-upload-storage.ts";

test("defines a stable local upload route id and storage key", () => {
  assert.equal(localUploadBookId, "local-upload");
  assert.equal(localUploadDraftStorageKey, "stray-pages.local-upload-draft");
});

test("accepts only parsed successful local upload drafts for storage", () => {
  assert.equal(
    isStoredLocalUploadDraft({
      ok: true,
      format: "TXT",
      metadata: { title: "Demo", author: "", format: "TXT", originalFileName: "demo.txt" },
      parseStatus: "parsed",
      chapters: [{ index: 1, title: "Chapter 1", content: "Text", contentPreview: "Text", characterCount: 4, suggestedSkip: false, warnings: [] }],
      warnings: [],
    }),
    true,
  );
  assert.equal(
    isStoredLocalUploadDraft({
      ok: true,
      format: "EPUB",
      metadata: { title: "Demo", author: "", format: "EPUB", originalFileName: "demo.epub" },
      parseStatus: "needs-epub-parser",
      chapters: [],
      warnings: [],
    }),
    false,
  );
  assert.equal(isStoredLocalUploadDraft(null), false);
  assert.equal(
    isStoredLocalUploadDraft({
      ok: true,
      format: "TXT",
      metadata: { title: "Demo", author: null, format: "TXT", originalFileName: "demo.txt" },
      parseStatus: "parsed",
      chapters: [null],
      warnings: [],
    }),
    false,
  );
  assert.equal(
    isStoredLocalUploadDraft({
      ok: true,
      format: "TXT",
      metadata: { title: "Demo", author: null, format: "TXT", originalFileName: "demo.txt" },
      parseStatus: "parsed",
      chapters: [{ index: 1, title: "Bad", content: "Text", contentPreview: "Text", characterCount: "4", suggestedSkip: false, warnings: [] }],
      warnings: [],
    }),
    false,
  );
});

test("clears stale local upload previews when the latest file cannot be previewed", () => {
  assert.deepEqual(
    getLocalUploadDraftStorageUpdate({
      ok: true,
      format: "EPUB",
      metadata: { title: "Demo", author: "", format: "EPUB", originalFileName: "demo.epub" },
      parseStatus: "needs-epub-parser",
      chapters: [],
      warnings: [],
    }),
    { action: "clear" },
  );
  assert.deepEqual(
    getLocalUploadDraftStorageUpdate({
      ok: false,
      reason: "unsupported-format",
    }),
    { action: "clear" },
  );
});
