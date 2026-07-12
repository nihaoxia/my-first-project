import assert from "node:assert/strict";
import test from "node:test";
import { handleCloudBookDownload, handleCloudBooksCollection, handleCloudBookResource, MULTIPART_BODY_LIMIT, readRequestBytesWithLimit } from "../src/lib/cloud/books-route-core.ts";
import { MAX_CHAPTER_EDIT_BYTES } from "../src/lib/cloud/books-core.ts";
import { ORIGINAL_BOOK_MAX_BYTES } from "../src/lib/cloud/storage-core.ts";

const session = { userId: "11111111-1111-4111-8111-111111111111", role: "USER" as const };
const service = {
  async list() { return []; }, async create() { return { id: "book" }; }, async get() { return {}; },
  async updateMetadata() { return {}; }, async delete() { return { deleted: true as const, cleanupPending: false }; },
  async getDownloadUrl() { return { url: "https://example.test", expiresInSeconds: 60 }; },
};

test("cloud books collection requires a usable session", async () => {
  const response = await handleCloudBooksCollection(new Request("https://app.test/api/cloud/books"), { getSession: async () => null, service });
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: { code: "AUTH_REQUIRED", message: "Authentication is required." } });
});

test("cloud configuration failures are not mislabeled as guest sessions", async () => {
  const response = await handleCloudBooksCollection(new Request("https://app.test/api/cloud/books"), {
    getSession: async () => { throw Object.assign(new Error("secret connection detail"), { code: "CLOUD_NOT_CONFIGURED" }); },
    service,
  });
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: { code: "CLOUD_NOT_CONFIGURED", message: "Cloud service is not configured." } });
});

test("upload rejects client ownership and persistence fields", async () => {
  for (const forbidden of ["userId", "storagePath", "chapters"]) {
    const body = new FormData(); body.set("title", "Book"); body.set("file", new File(["valid"], "x.txt", { type: "text/plain" })); body.set(forbidden, "forged");
    const response = await handleCloudBooksCollection(new Request("https://app.test/api/cloud/books", { method: "POST", body }), { getSession: async () => session, service });
    assert.equal(response.status, 400);
  }
});

test("upload maps file size and MIME errors to stable statuses without raw details", async () => {
  const body = new FormData(); body.set("title", "Book"); body.set("file", new File(["valid"], "x.txt", { type: "application/json" })); body.set("chapterEdits", "[]");
  const response = await handleCloudBooksCollection(new Request("https://app.test/api/cloud/books", { method: "POST", body }), { getSession: async () => session, service: { ...service, async create() { throw Object.assign(new Error("raw secret"), { code: "UNSUPPORTED_MEDIA_TYPE" }); } } });
  assert.equal(response.status, 415);
  assert.equal(JSON.stringify(await response.json()).includes("raw secret"), false);
});

test("signed downloads redirect without allowing intermediary caching", async () => {
  const response = await handleCloudBookDownload(new Request("https://app.test/api/cloud/books/id/download"), "22222222-2222-4222-8222-222222222222", { getSession: async () => session, service });
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), "https://example.test");
  assert.equal(response.headers.get("cache-control"), "private, no-store");
});

function streamingRequest(chunks: Uint8Array[], headers: HeadersInit = {}) {
  const body = new ReadableStream<Uint8Array>({ start(controller) { for (const chunk of chunks) controller.enqueue(chunk); controller.close(); } });
  return new Request("https://app.test/upload", { method: "POST", headers, body, duplex: "half" } as RequestInit & { duplex: "half" });
}

test("bounded reader cancels chunked and forged-content-length oversized bodies", async () => {
  for (const request of [streamingRequest([new Uint8Array(5), new Uint8Array(6)]), streamingRequest([new Uint8Array(11)], { "content-length": "1" })]) {
    await assert.rejects(readRequestBytesWithLimit(request, 10), (error: unknown) => (error as { code?: string }).code === "REQUEST_BODY_TOO_LARGE");
  }
});

test("bounded reader maps stream failures without leaking raw details", async () => {
  const body = new ReadableStream<Uint8Array>({ pull() { throw new Error("secret stream detail"); } });
  const request = new Request("https://app.test/upload", { method: "POST", body, duplex: "half" } as RequestInit & { duplex: "half" });
  await assert.rejects(readRequestBytesWithLimit(request, 10), (error: unknown) => (error as { code?: string }).code === "INVALID_REQUEST_BODY" && !(error as Error).message.includes("secret"));
});

test("PATCH rejects oversized and malformed JSON with stable errors", async () => {
  const huge = new Request("https://app.test/api/cloud/books/id", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: "x".repeat(17 * 1024) }) });
  assert.equal((await handleCloudBookResource(huge, "22222222-2222-4222-8222-222222222222", { getSession: async () => session, service })).status, 413);
  const malformed = new Request("https://app.test/api/cloud/books/id", { method: "PATCH", headers: { "content-type": "application/json" }, body: "{" });
  assert.equal((await handleCloudBookResource(malformed, "22222222-2222-4222-8222-222222222222", { getSession: async () => session, service })).status, 400);
});

test("malformed multipart is a stable 400 rather than an internal parser leak", async () => {
  const request = new Request("https://app.test/api/cloud/books", { method: "POST", headers: { "content-type": "multipart/form-data; boundary=missing" }, body: "not-a-valid-multipart-body" });
  const response = await handleCloudBooksCollection(request, { getSession: async () => session, service });
  assert.equal(response.status, 400);
  assert.equal(JSON.stringify(await response.json()).includes("not-a-valid"), false);
});

test("multipart budget includes the full file, chapter edits, and fixed framing allowance", () => {
  assert.equal(MULTIPART_BODY_LIMIT, ORIGINAL_BOOK_MAX_BYTES + MAX_CHAPTER_EDIT_BYTES + 128 * 1024);
});

test("near-limit file and edit payload enters service while oversized edits return 413", async () => {
  let createCalls = 0;
  const boundedService = { ...service, async create() { createCalls += 1; return { id: "book" }; } };
  const allowed = new FormData();
  allowed.set("title", "Book");
  allowed.set("file", new File([new Uint8Array(ORIGINAL_BOOK_MAX_BYTES - 256)], "x.txt", { type: "text/plain" }));
  allowed.set("chapterEdits", `${" ".repeat(MAX_CHAPTER_EDIT_BYTES - 2)}[]`);
  assert.equal((await handleCloudBooksCollection(new Request("https://app.test/api/cloud/books", { method: "POST", body: allowed }), { getSession: async () => session, service: boundedService })).status, 201);
  assert.equal(createCalls, 1);

  const oversized = new FormData();
  oversized.set("title", "Book"); oversized.set("file", new File(["x"], "x.txt", { type: "text/plain" })); oversized.set("chapterEdits", `${" ".repeat(MAX_CHAPTER_EDIT_BYTES)}[]`);
  assert.equal((await handleCloudBooksCollection(new Request("https://app.test/api/cloud/books", { method: "POST", body: oversized }), { getSession: async () => session, service: boundedService })).status, 413);
  assert.equal(createCalls, 1);
});
