import assert from "node:assert/strict";
import test from "node:test";

import {
  CloudStorageError,
  assertOriginalBookObjectPathForOwner,
  buildOriginalBookObjectPath,
  createCloudStorageService,
  validateTxtUpload,
  isSupabaseStorageNotFoundError,
} from "../src/lib/cloud/storage-core.ts";

const userId = "11111111-1111-4111-8111-111111111111";
const bookId = "22222222-2222-4222-8222-222222222222";

test("builds the fixed owned non-user-controlled TXT object path", () => {
  const path = buildOriginalBookObjectPath(userId, bookId);
  assert.equal(path, `${userId}/${bookId}/original.txt`);
  assert.doesNotThrow(() => assertOriginalBookObjectPathForOwner(path, userId, bookId));
  assert.throws(() => assertOriginalBookObjectPathForOwner(`${userId}/99999999-9999-4999-8999-999999999999/original.txt`, userId, bookId), /INVALID_OBJECT_PATH/);
  assert.throws(() => assertOriginalBookObjectPathForOwner(`${userId}/${bookId}/other.txt`, userId, bookId), /INVALID_OBJECT_PATH/);
  assert.throws(() => buildOriginalBookObjectPath("../other", bookId), /INVALID_OBJECT_PATH/);
  assert.throws(() => buildOriginalBookObjectPath(userId, `${bookId}/..`), /INVALID_OBJECT_PATH/);
});

test("validates non-empty UTF-8 TXT while allowing an empty browser MIME", () => {
  const bytes = new TextEncoder().encode("第一章 雾起\n正文。\n");
  assert.equal(validateTxtUpload({ bytes, mimeType: "", fileName: "story.txt" }).text, "第一章 雾起\n正文。\n");
  assert.throws(
    () => validateTxtUpload({ bytes, mimeType: "application/octet-stream", fileName: "story.txt" }),
    (error: unknown) => error instanceof CloudStorageError && error.code === "UNSUPPORTED_MEDIA_TYPE",
  );
  assert.throws(
    () => validateTxtUpload({ bytes: new Uint8Array(), mimeType: "text/plain", fileName: "story.txt" }),
    (error: unknown) => error instanceof CloudStorageError && error.code === "EMPTY_FILE",
  );
});

test("rejects oversized, invalid UTF-8, NUL and likely-binary payloads", () => {
  assert.throws(
    () => validateTxtUpload({ bytes: new Uint8Array(2 * 1024 * 1024 + 1), mimeType: "text/plain", fileName: "x.txt" }),
    (error: unknown) => error instanceof CloudStorageError && error.code === "FILE_TOO_LARGE",
  );
  for (const bytes of [new Uint8Array([0xff, 0xfe]), new Uint8Array([65, 0, 66]), new Uint8Array([1, 2, 3, 65])]) {
    assert.throws(
      () => validateTxtUpload({ bytes, mimeType: "text/plain", fileName: "x.txt" }),
      (error: unknown) => error instanceof CloudStorageError && error.code === "INVALID_TEXT_FILE",
    );
  }
});

test("storage service maps provider failures without leaking raw errors", async () => {
  const service = createCloudStorageService({
    bucket: "original-books",
    provider: {
      async upload() { throw new Error("secret service key and provider details"); },
      async remove() { throw new Error("raw delete detail"); },
      async createSignedUrl() { throw new Error("raw signing detail"); },
    },
  });
  const bytes = new TextEncoder().encode("valid text");
  await assert.rejects(service.upload(`${userId}/${bookId}/original.txt`, bytes),
    (error: unknown) => error instanceof CloudStorageError && error.code === "STORAGE_UPLOAD_FAILED" && !error.message.includes("secret"));
  await assert.rejects(service.remove(`${userId}/${bookId}/original.txt`),
    (error: unknown) => error instanceof CloudStorageError && error.code === "STORAGE_DELETE_FAILED");
});

test("storage service rejects paths outside its strict ownership shape", async () => {
  let called = false;
  const service = createCloudStorageService({
    bucket: "original-books",
    provider: {
      async upload() { called = true; },
      async remove() { called = true; },
      async createSignedUrl() { called = true; return "https://example.test/signed"; },
    },
  });
  await assert.rejects(service.remove(`${userId}/../other.txt`), /INVALID_OBJECT_PATH/);
  assert.equal(called, false);
});

test("recognizes only explicit Supabase object-not-found deletion errors", () => {
  assert.equal(isSupabaseStorageNotFoundError({ status: 404, error: "not_found" }), true);
  assert.equal(isSupabaseStorageNotFoundError({ statusCode: "404", code: "NoSuchKey" }), true);
  assert.equal(isSupabaseStorageNotFoundError({ status: 500, error: "not_found" }), false);
  assert.equal(isSupabaseStorageNotFoundError(new Error("not found maybe")), false);
});
