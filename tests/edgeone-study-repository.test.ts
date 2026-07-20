import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createAuthoritativeBlobStore } from "../src/lib/edgeone/blob-store-core.ts";
import type { CloudStudyRecord } from "../src/lib/cloud/study-core.ts";

let subject: typeof import("../src/lib/cloud/edgeone-study-repository.ts") | undefined;
try { subject = await import("../src/lib/cloud/edgeone-study-repository.ts"); } catch { /* red */ }
function api() { if (!subject) assert.fail("EdgeOne study repository must be implemented"); return subject; }

const USER = "11111111-1111-4111-8111-111111111111";
const OTHER = "33333333-3333-4333-8333-333333333333";
const BOOK = "22222222-2222-4222-8222-222222222222";
const ITEM = "44444444-4444-4444-8444-444444444444";

function memoryBlob() {
  const data = new Map<string, unknown>();
  return createAuthoritativeBlobStore({
    async set(key, value, options) { if (options?.onlyIfNew && data.has(key)) throw Object.assign(new Error("exists"), { code: "PreconditionFailed" }); data.set(key, value); },
    async setJSON(key, value, options) { if (options?.onlyIfNew && data.has(key)) throw Object.assign(new Error("exists"), { code: "PreconditionFailed" }); data.set(key, structuredClone(value)); },
    async get(key) { return data.has(key) ? structuredClone(data.get(key)) : null; },
    async getWithHeaders() { return null; }, async delete(key) { data.delete(key); },
    async list(options) { return { blobs: [...data.keys()].filter((key) => key.startsWith(options.prefix ?? "")).sort().map((key) => ({ key, etag: key })) }; },
  });
}

function harness() {
  let id = 1;
  const repository = api().createEdgeOneStudyRepository({
    blob: memoryBlob(), now: () => new Date("2026-07-12T00:00:00.000Z"),
    uuid: () => `50000000-0000-4000-8000-${String(id++).padStart(12, "0")}`,
    async resolveOriginalSource(userId: string, bookId: string, chapterId: string | null) {
      return userId === USER && bookId === BOOK ? { originalBookId: BOOK, bookTitle: "Book", chapterId, chapterTitle: chapterId ? "Chapter" : null } : null;
    },
    async resolveTranslatedSource() { return null; },
  });
  return repository;
}

function vocabulary(overrides: Partial<CloudStudyRecord> = {}): CloudStudyRecord {
  return { id: ITEM, userId: USER, kind: "vocabulary", originalBookId: BOOK, chapterId: null,
    term: "mist", explanation: "雾", bookTitle: "Book", chapterTitle: null,
    createdAt: new Date("2026-07-12T00:00:00.000Z"), updatedAt: new Date("2026-07-12T00:00:00.000Z"), ...overrides };
}

test("study revisions support owner-scoped create, pagination, update and delete", async () => {
  const repo = harness();
  await repo.create(vocabulary());
  assert.equal((await repo.list(USER, "vocabulary", undefined, { limit: 10 })).items[0].term, "mist");
  assert.deepEqual(await repo.list(OTHER, "vocabulary", undefined, { limit: 10 }), { items: [], nextCursor: null });
  assert.equal((await repo.update(USER, ITEM, { kind: "vocabulary", note: "remember" }))?.note, "remember");
  assert.equal(await repo.delete(OTHER, ITEM, "vocabulary"), false);
  assert.equal(await repo.delete(USER, ITEM, "vocabulary"), true);
  assert.deepEqual((await repo.list(USER, "vocabulary", undefined, { limit: 10 })).items, []);
});

test("reading upsert uses a stable resource and optimistic version", async () => {
  const repo = harness();
  const base = { id: ITEM, userId: USER, kind: "reading" as const, originalBookId: BOOK,
    translatedBookId: null, chapterId: null, paragraphIndex: 2, settings: null,
    bookTitle: "Book", chapterTitle: null, updatedAt: new Date("2026-07-12T00:00:00.000Z") };
  const first = await repo.upsertReading({ ...base, expectedVersion: 0 });
  assert.equal(first?.version, 0);
  assert.equal(await repo.upsertReading({ ...base, paragraphIndex: 3, expectedVersion: 9 }), null);
  const second = await repo.upsertReading({ ...base, paragraphIndex: 4, expectedVersion: 0 });
  assert.equal(second?.version, 1);
  assert.equal(second?.id, first?.id);
});

test("source resolution is delegated to authoritative owner-scoped repositories", async () => {
  const repo = harness();
  assert.equal((await repo.resolveOriginalSource(USER, BOOK, null))?.bookTitle, "Book");
  assert.equal(await repo.resolveOriginalSource(OTHER, BOOK, null), null);
});

test("production study factory selects EdgeOne before Prisma", async () => {
  const source = await readFile(new URL("../src/lib/cloud/study.ts", import.meta.url), "utf8");
  assert.ok(source.indexOf('CLOUD_DATA_PROVIDER === "edgeone"') < source.indexOf("createPrismaCloudStudyRepository()"));
  assert.match(source, /createEdgeOneStudyRepository/);
});
