import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createAuthoritativeBlobStore } from "../src/lib/edgeone/blob-store-core.ts";
import {
  CloudBookError,
  createCloudBooksService,
  type CloudBookRecord,
} from "../src/lib/cloud/books-core.ts";

let subject: typeof import("../src/lib/cloud/edgeone-books-repository.ts") | undefined;
try { subject = await import("../src/lib/cloud/edgeone-books-repository.ts"); } catch { /* red */ }
function api() { if (!subject) assert.fail("EdgeOne books repository must be implemented"); return subject; }

const USER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_USER = "33333333-3333-4333-8333-333333333333";
const BOOK_ID = "22222222-2222-4222-8222-222222222222";

function record(overrides: Partial<CloudBookRecord> = {}): CloudBookRecord {
  return {
    id: BOOK_ID, userId: USER_ID, title: "Root", author: null,
    sourceLanguage: "CHINESE", format: "TXT", fileSizeBytes: 5,
    storagePath: `${USER_ID}/${BOOK_ID}/original.txt`, chapterCount: 1,
    uploadedAt: new Date("2026-07-12T00:00:00.000Z"),
    chapters: [{ index: 1, title: "第一章", content: "正文", wordCount: 2, status: "ACTIVE", isSkipped: false }],
    ...overrides,
  };
}

function harness() {
  const data = new Map<string, unknown>();
  let blockRevisionLists = false;
  let waiting = 0;
  let release!: () => void;
  const barrier = new Promise<void>((resolve) => { release = resolve; });
  const sdk = {
    async set(key: string, value: unknown, options?: { onlyIfNew?: boolean }) {
      if (options?.onlyIfNew && data.has(key)) throw Object.assign(new Error("exists"), { code: "PreconditionFailed" });
      data.set(key, value);
    },
    async setJSON(key: string, value: unknown, options?: { onlyIfNew?: boolean }) {
      if (options?.onlyIfNew && data.has(key)) throw Object.assign(new Error("exists"), { code: "PreconditionFailed" });
      data.set(key, structuredClone(value));
    },
    async get(key: string) { return data.has(key) ? structuredClone(data.get(key)) : null; },
    async getWithHeaders() { return null; },
    async delete(key: string) { data.delete(key); },
    async list(options: { prefix?: string }) {
      if (blockRevisionLists && options.prefix?.includes(`books/${USER_ID}/${BOOK_ID}/revisions/`)) {
        waiting += 1;
        if (waiting === 2) release();
        await barrier;
      }
      return {
        blobs: [...data.keys()].filter((key) => key.startsWith(options.prefix ?? ""))
          .sort().map((key) => ({ key, etag: key })),
      };
    },
  };
  let id = 1;
  const repository = api().createEdgeOneBooksRepository({
    blob: createAuthoritativeBlobStore(sdk),
    now: () => new Date("2026-07-12T00:00:00.000Z"),
    uuid: () => `40000000-0000-4000-8000-${String(id++).padStart(12, "0")}`,
  });
  return { repository, data, blockConcurrentReads() { blockRevisionLists = true; } };
}

test("creates, lists and reads owner-scoped book revisions", async () => {
  const { repository } = harness();
  await repository.transaction((tx) => tx.create({ ...record(), chapters: record().chapters! }));
  assert.deepEqual((await repository.list(USER_ID)).map((book) => book.title), ["Root"]);
  assert.equal((await repository.find(USER_ID, BOOK_ID))?.uploadedAt instanceof Date, true);
  assert.equal(await repository.find(OTHER_USER, BOOK_ID), null);
});

test("metadata updates create child revisions and deletion creates a tombstone", async () => {
  const { repository } = harness();
  await repository.transaction((tx) => tx.create({ ...record(), chapters: record().chapters! }));
  assert.equal((await repository.update(USER_ID, BOOK_ID, { title: "Updated" }))?.title, "Updated");
  const deleted = await repository.transaction((tx) => tx.delete(USER_ID, BOOK_ID));
  assert.equal(deleted?.title, "Updated");
  assert.equal(await repository.find(USER_ID, BOOK_ID), null);
  assert.deepEqual(await repository.list(USER_ID), []);
});

test("parallel metadata revisions preserve both branches and surface conflict", async () => {
  const { repository, blockConcurrentReads } = harness();
  await repository.transaction((tx) => tx.create({ ...record(), chapters: record().chapters! }));
  blockConcurrentReads();
  await Promise.all([
    repository.update(USER_ID, BOOK_ID, { title: "A" }),
    repository.update(USER_ID, BOOK_ID, { title: "B" }),
  ]);
  await assert.rejects(() => repository.find(USER_ID, BOOK_ID), { code: "BOOK_CONFLICT" });
  await assert.rejects(() => repository.list(USER_ID), { code: "BOOK_CONFLICT" });
  const service = createCloudBooksService({
    repository,
    storage: {
      bucket: "edgeone-books", async upload() {}, async remove() {},
      async signedUrl() { return "/download"; },
    },
  });
  await assert.rejects(() => service.get(USER_ID, BOOK_ID),
    (error: unknown) => error instanceof CloudBookError && error.code === "BOOK_CONFLICT");
});

test("cleanup intents remain durable across explicit transaction contexts", async () => {
  const { repository } = harness();
  const input = { userId: USER_ID, bucket: "edgeone-books", objectPath: `${USER_ID}/${BOOK_ID}/original.txt`, reason: "PENDING_BOOK_CREATE" };
  await repository.upsertCleanupIntent(input);
  assert.equal(await repository.withObjectLock(input.bucket, input.objectPath, (tx) => tx.findCleanupIntent(input.bucket, input.objectPath)), true);
  await repository.resolveCleanupIntent(input.bucket, input.objectPath);
  assert.equal(await repository.transaction((tx) => tx.findCleanupIntent(input.bucket, input.objectPath)), false);
});

test("production books factory chooses the EdgeOne repository before Prisma", async () => {
  const source = await readFile(new URL("../src/lib/cloud/books.ts", import.meta.url), "utf8");
  const edgeOne = source.indexOf('CLOUD_DATA_PROVIDER === "edgeone"');
  const prisma = source.indexOf("createPrismaCloudBooksRepository()");
  assert.ok(edgeOne >= 0 && prisma > edgeOne);
  assert.match(source, /createEdgeOneBooksRepository/);
});
