import assert from "node:assert/strict";
import test from "node:test";

import {
  CloudBookError,
  createCloudBooksService,
  type CloudBookRecord,
  type CloudBooksRepository,
  MAX_CHAPTERS,
  MAX_CHAPTER_EDIT_BYTES,
  validateChapterEditPayloadBytes,
} from "../src/lib/cloud/books-core.ts";

const userId = "11111111-1111-4111-8111-111111111111";
const otherUserId = "99999999-9999-4999-8999-999999999999";
const bookId = "22222222-2222-4222-8222-222222222222";
const objectPath = `${userId}/${bookId}/original.txt`;
const chapterEdits = [
  { sourceIndex: 1, title: "第一章 新标题", isSkipped: false },
  { sourceIndex: 2, title: "第二章 黑桥", isSkipped: true },
];

function record(overrides: Partial<CloudBookRecord> = {}): CloudBookRecord {
  return {
    id: bookId, userId, title: "雾中书", author: "林", sourceLanguage: "CHINESE",
    format: "TXT", fileSizeBytes: 30, storagePath: objectPath, chapterCount: 2,
    uploadedAt: new Date("2026-07-11T00:00:00Z"), chapters: [], ...overrides,
  };
}

function harness(options: { failUpload?: boolean; failCreate?: boolean; failRemove?: boolean; failIntent?: boolean; failResolve?: boolean; commitThenThrow?: boolean; dropIntentAfterFailure?: boolean; staleIntentAfterCommit?: boolean } = {}) {
  const rows = new Map<string, CloudBookRecord>();
  const events: string[] = [];
  const cleanup: string[] = [];
  const repository: CloudBooksRepository = {
    async list(owner) { return [...rows.values()].filter((row) => row.userId === owner); },
    async find(owner, id) { const row = rows.get(id); return row?.userId === owner ? row : null; },
    async update(owner, id, data) { const row = rows.get(id); if (!row || row.userId !== owner) return null; const next = { ...row, ...data }; rows.set(id, next); return next; },
    async transaction(work) { const rowSnapshot = new Map(rows); const cleanupSnapshot = [...cleanup]; try { const result = await work({
      async create(input) { events.push("db:create"); if (options.failCreate) throw new Error("db secret"); const row = record({ ...input }); rows.set(row.id, row); return row; },
      async find(owner, id) { const row = rows.get(id); return row?.userId === owner ? row : null; },
      async delete(owner, id) { const row = rows.get(id); if (!row || row.userId !== owner) return null; rows.delete(id); return row; },
      async upsertCleanupIntent(input) { events.push(`tx:intent:${input.reason}`); if (options.failIntent) throw new Error("intent failed"); cleanup.push(`${input.reason}:${input.objectPath}`); },
      async findCleanupIntent(_bucket, key) { events.push(`tx:find-intent:${key}`); return cleanup.some((item) => item.endsWith(`:${key}`)); },
      async resolveCleanupIntent(_bucket, path) { events.push(`tx:resolve:${path}`); if (options.failResolve) throw new Error("resolve failed"); const index = cleanup.findIndex((item) => item.endsWith(`:${path}`)); if (index >= 0) cleanup.splice(index, 1); },
    }); events.push("transaction-commit"); return result; } catch (error) { rows.clear(); for (const [key, value] of rowSnapshot) rows.set(key, value); cleanup.splice(0, cleanup.length, ...cleanupSnapshot); throw error; } },
    async withObjectLock(_bucket, _path, work) {
      try {
        const result = await this.transaction(work);
        if (options.commitThenThrow) {
          options.commitThenThrow = false;
          if (options.staleIntentAfterCommit) { cleanup.push(`PENDING_BOOK_CREATE:${objectPath}`); options.failResolve = true; }
          throw new Error("ambiguous commit acknowledgement");
        }
        return result;
      } catch (error) {
        if (options.dropIntentAfterFailure) { options.dropIntentAfterFailure = false; cleanup.splice(0); }
        throw error;
      }
    },
    async upsertCleanupIntent(input) { events.push(`intent:${input.reason}`); if (options.failIntent) throw new Error("intent failed"); cleanup.push(`${input.reason}:${input.objectPath}`); },
    async resolveCleanupIntent(_bucket, path) { events.push(`resolve:${path}`); if (options.failResolve) throw new Error("resolve failed"); const index = cleanup.findIndex((item) => item.endsWith(`:${path}`)); if (index >= 0) cleanup.splice(index, 1); },
  };
  const storage = {
    bucket: "original-books",
    async upload(path: string) { events.push(`upload:${path}`); if (options.failUpload) throw new Error("storage secret"); },
    async remove(path: string) { events.push(`remove:${path}`); if (options.failRemove) throw new Error("delete secret"); },
    async signedUrl(path: string) { events.push(`sign:${path}`); return "https://storage.test/private-token"; },
  };
  return { rows, events, cleanup, service: createCloudBooksService({ repository, storage, uuid: (() => {
    const ids = [bookId];
    return () => ids.shift()!;
  })() }) };
}

const source = new TextEncoder().encode("第一章 雾起\n正文一。\n第二章 黑桥\n正文二。\n");

test("creates an owned book by uploading first and parsing ordered chapters server-side", async () => {
  const h = harness();
  const dto = await h.service.create(userId, { title: " 雾中书 ", author: " 林 ", sourceLanguage: "CHINESE", fileName: "book.txt", mimeType: "text/plain", bytes: source, chapterEdits });
  assert.equal(dto.id, bookId);
  assert.equal(dto.chapterCount, 2);
  assert.equal("storagePath" in dto, false);
  assert.deepEqual(h.events.map((item) => item.split(":")[0]), ["intent", "upload", "db", "tx", "transaction-commit"]);
  const stored = h.rows.get(bookId)!;
  assert.equal(stored.userId, userId);
  assert.deepEqual(stored.chapters!.map((chapter) => chapter.index), [1, 2]);
  assert.equal(stored.chapters![0].title, "第一章 新标题");
  assert.equal(stored.chapters![1].isSkipped, true);
  assert.equal(stored.chapters![1].status, "SKIPPED");
});

test("does not write DB after upload failure", async () => {
  const h = harness({ failUpload: true });
  await assert.rejects(h.service.create(userId, { title: "Book", fileName: "x.txt", mimeType: "text/plain", bytes: source, chapterEdits }), /BOOK_STORAGE_FAILED/);
  assert.equal(h.events.includes("db:create"), false);
  assert.ok(h.events.some((event) => event.startsWith("remove:")));
  assert.deepEqual(h.cleanup, []);
});

test("ambiguous upload failures retain durable intent when recovery removal is uncertain", async () => {
  const h = harness({ failUpload: true, failRemove: true });
  await assert.rejects(h.service.create(userId, { title: "Book", fileName: "x.txt", mimeType: "text/plain", bytes: source, chapterEdits }), /BOOK_STORAGE_FAILED/);
  assert.equal(h.rows.size, 0);
  assert.equal(h.cleanup.length, 1);
  assert.match(h.cleanup[0], /^PENDING_BOOK_CREATE:/);
});

test("an acknowledged-as-error commit returns the live book without deleting its object", async () => {
  const h = harness({ commitThenThrow: true });
  const dto = await h.service.create(userId, { title: "Book", fileName: "x.txt", mimeType: "text/plain", bytes: source, chapterEdits });
  assert.equal(dto.id, bookId);
  assert.equal(h.rows.has(bookId), true);
  assert.equal(h.events.filter((event) => event.startsWith("remove:")).length, 0);
});

test("a live book remains successful when stale-intent resolution fails", async () => {
  const h = harness({ commitThenThrow: true, staleIntentAfterCommit: true });
  const dto = await h.service.create(userId, { title: "Book", fileName: "x.txt", mimeType: "text/plain", bytes: source, chapterEdits });
  assert.equal(dto.id, bookId);
  assert.equal(h.events.some((event) => event.startsWith("remove:")), false);
  assert.equal(h.cleanup.length, 1);
});

test("recovery recreates a missing durable intent before removing an uncommitted object", async () => {
  const h = harness({ failCreate: true, dropIntentAfterFailure: true });
  await assert.rejects(h.service.create(userId, { title: "Book", fileName: "x.txt", mimeType: "text/plain", bytes: source, chapterEdits }), /BOOK_CREATE_FAILED/);
  const recoveryIntent = h.events.findIndex((event) => event === "tx:intent:RECOVER_BOOK_CREATE");
  const durableCommit = h.events.findIndex((event) => event === "transaction-commit");
  const remove = h.events.findIndex((event) => event.startsWith("remove:"));
  assert.ok(recoveryIntent >= 0 && recoveryIntent < durableCommit && durableCommit < remove);
});

test("compensates an uploaded object after DB failure", async () => {
  const h = harness({ failCreate: true });
  await assert.rejects(h.service.create(userId, { title: "Book", fileName: "x.txt", mimeType: "text/plain", bytes: source, chapterEdits }), /BOOK_CREATE_FAILED/);
  assert.ok(h.events.some((event) => event.startsWith("remove:")));
  assert.deepEqual(h.cleanup, []);
});

test("records independent cleanup when DB rollback compensation fails", async () => {
  const h = harness({ failCreate: true, failRemove: true });
  await assert.rejects(h.service.create(userId, { title: "Book", fileName: "x.txt", mimeType: "text/plain", bytes: source, chapterEdits }), /BOOK_CREATE_FAILED/);
  assert.equal(h.cleanup.length, 1);
  assert.match(h.cleanup[0], /^PENDING_BOOK_CREATE:/);
});

test("persists cleanup intent before upload and refuses upload if intent persistence fails", async () => {
  const h = harness({ failIntent: true });
  await assert.rejects(h.service.create(userId, { title: "Book", fileName: "x.txt", mimeType: "text/plain", bytes: source, chapterEdits }), /CLEANUP_PERSIST_FAILED/);
  assert.equal(h.events.some((event) => event.startsWith("upload:")), false);
});

test("all reads, updates, signed URLs and deletes are owner scoped", async () => {
  const h = harness();
  h.rows.set(bookId, record());
  await assert.rejects(h.service.get(otherUserId, bookId), (error: unknown) => error instanceof CloudBookError && error.code === "BOOK_NOT_FOUND");
  await assert.rejects(h.service.updateMetadata(otherUserId, bookId, { title: "stolen" }), /BOOK_NOT_FOUND/);
  await assert.rejects(h.service.getDownloadUrl(otherUserId, bookId), /BOOK_NOT_FOUND/);
  await assert.rejects(h.service.delete(otherUserId, bookId), /BOOK_NOT_FOUND/);
  assert.equal(h.events.some((event) => event.startsWith("sign:")), false);
  assert.equal(h.rows.has(bookId), true);
});

test("deletion commits DB then records retryable cleanup when object removal fails", async () => {
  const h = harness({ failRemove: true });
  h.rows.set(bookId, record());
  const result = await h.service.delete(userId, bookId);
  assert.deepEqual(result, { deleted: true, cleanupPending: true });
  assert.equal(h.rows.has(bookId), false);
  assert.equal(h.cleanup.length, 1);
});

test("delete persists intent in the same transaction before deleting and rolls back on intent failure", async () => {
  const h = harness({ failIntent: true }); h.rows.set(bookId, record());
  await assert.rejects(h.service.delete(userId, bookId), /CLEANUP_PERSIST_FAILED/);
  assert.equal(h.rows.has(bookId), true);
  assert.equal(h.events.some((event) => event.startsWith("remove:")), false);
});

test("a failed post-delete intent resolution leaves a durable pending task", async () => {
  const h = harness({ failResolve: true }); h.rows.set(bookId, record());
  assert.deepEqual(await h.service.delete(userId, bookId), { deleted: true, cleanupPending: true });
  assert.equal(h.cleanup.length, 1);
  assert.ok(h.events.findIndex((event) => event.startsWith("tx:intent:")) < h.events.findIndex((event) => event.startsWith("remove:")));
});

test("validates UUIDs and metadata with stable errors", async () => {
  const h = harness();
  await assert.rejects(h.service.get(userId, "../book"), (error: unknown) => error instanceof CloudBookError && error.code === "INVALID_BOOK_ID");
  await assert.rejects(h.service.create(userId, { title: " ", fileName: "x.txt", mimeType: "text/plain", bytes: source, chapterEdits }), /INVALID_BOOK_METADATA/);
});

test("strictly validates complete chapter edit mappings", async () => {
  for (const edits of [
    [{ sourceIndex: 1, title: "one", isSkipped: false }],
    [{ sourceIndex: 1, title: "one", isSkipped: false }, { sourceIndex: 1, title: "duplicate", isSkipped: false }],
    [{ sourceIndex: 1, title: "one", isSkipped: false }, { sourceIndex: 3, title: "extra", isSkipped: false }],
    [{ sourceIndex: 1, title: "one", isSkipped: false, content: "forged" }, { sourceIndex: 2, title: "two", isSkipped: false }],
    [{ sourceIndex: 1, title: "one", isSkipped: true }, { sourceIndex: 2, title: "two", isSkipped: true }],
  ]) {
    const h = harness();
    await assert.rejects(h.service.create(userId, { title: "Book", fileName: "x.txt", mimeType: "text/plain", bytes: source, chapterEdits: edits as never }), /INVALID_CHAPTER_EDITS/);
    assert.equal(h.events.length, 0);
  }
});

test("chapter edit byte and count boundaries are authoritative", () => {
  assert.equal(MAX_CHAPTERS, 1000);
  assert.equal(MAX_CHAPTER_EDIT_BYTES, 1024 * 1024);
  assert.doesNotThrow(() => validateChapterEditPayloadBytes(new Uint8Array(MAX_CHAPTER_EDIT_BYTES)));
  assert.throws(() => validateChapterEditPayloadBytes(new Uint8Array(MAX_CHAPTER_EDIT_BYTES + 1)), /CHAPTER_EDITS_TOO_LARGE/);
});

test("corrupt same-shape paths from another owner or book never reach sign/remove", async () => {
  for (const corruptPath of [`${otherUserId}/${bookId}/original.txt`, `${userId}/88888888-8888-4888-8888-888888888888/original.txt`]) {
    const h = harness(); h.rows.set(bookId, record({ storagePath: corruptPath }));
    await assert.rejects(h.service.getDownloadUrl(userId, bookId), /BOOK_STORAGE_FAILED/);
    await assert.rejects(h.service.delete(userId, bookId), /BOOK_DELETE_FAILED/);
    assert.equal(h.events.some((event) => event.startsWith("sign:") || event.startsWith("remove:")), false);
  }
});
