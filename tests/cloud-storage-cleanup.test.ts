import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createStorageCleanupService, type CleanupIntent, type StorageCleanupRepository } from "../src/lib/cloud/cleanup-core.ts";

const userId = "11111111-1111-4111-8111-111111111111";
const bookId = "22222222-2222-4222-8222-222222222222";
const path = `${userId}/${bookId}/original.txt`;

function harness(options: { bookExists?: boolean; removeFails?: boolean } = {}) {
  const intents = new Map<string, CleanupIntent>([[path, { id: "task-1", userId, bucket: "original-books", objectPath: path, reason: "PENDING_BOOK_CREATE", attempts: 0, nextAttemptAt: new Date(0) }]]);
  let bookExists = options.bookExists ?? false;
  let removes = 0;
  const locks = new Map<string, Promise<void>>();
  const repository: StorageCleanupRepository = {
    async listDue() { return [...intents.values()]; },
    async withObjectLock(_bucket, objectPath, work) {
      const previous = locks.get(objectPath) ?? Promise.resolve();
      let release!: () => void;
      const current = new Promise<void>((resolve) => { release = resolve; });
      locks.set(objectPath, previous.then(() => current));
      await previous;
      try { return await work({
        async findCleanupIntent(_bucket, key) { return intents.get(key) ?? null; },
        async originalBookExists(owner, id, key) { return bookExists && owner === userId && id === bookId && key === path; },
        async resolveCleanupIntent(_bucket, key) { intents.delete(key); },
        async markCleanupFailure(_id, attempts, nextAttemptAt) { const intent = intents.get(path); if (intent) intents.set(path, { ...intent, attempts, nextAttemptAt }); },
      }); } finally { release(); if (locks.get(objectPath) === current) locks.delete(objectPath); }
    },
  };
  const storage = { bucket: "original-books", async remove() { removes += 1; if (options.removeFails) throw new Error("provider secret"); } };
  return { intents, repository, storage, get removes() { return removes; }, setBookExists(value: boolean) { bookExists = value; } };
}

test("an active object lock prevents cleanup from racing a create", async () => {
  const h = harness();
  let release!: () => void;
  const active = h.repository.withObjectLock("original-books", path, async () => { await new Promise<void>((resolve) => { release = resolve; }); h.setBookExists(true); });
  await Promise.resolve();
  const cleanup = createStorageCleanupService({ repository: h.repository, storage: h.storage, now: () => new Date("2026-07-11T00:00:00Z") }).runBatch(1);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(h.removes, 0);
  release(); await active; await cleanup;
  assert.equal(h.removes, 0);
  assert.equal(h.intents.size, 0);
});

test("a book-backed stale intent resolves without deleting its live object", async () => {
  const h = harness({ bookExists: true });
  assert.deepEqual(await createStorageCleanupService({ repository: h.repository, storage: h.storage }).runBatch(1), { claimed: 1, removed: 0, resolved: 1, failed: 0 });
  assert.equal(h.removes, 0); assert.equal(h.intents.size, 0);
});

test("an orphan object is removed and its intent resolved", async () => {
  const h = harness();
  assert.deepEqual(await createStorageCleanupService({ repository: h.repository, storage: h.storage }).runBatch(1), { claimed: 1, removed: 1, resolved: 1, failed: 0 });
  assert.equal(h.intents.size, 0);
});

test("remove failure increments attempts with bounded exponential backoff", async () => {
  const h = harness({ removeFails: true }); const now = new Date("2026-07-11T00:00:00Z");
  assert.deepEqual(await createStorageCleanupService({ repository: h.repository, storage: h.storage, now: () => now }).runBatch(1), { claimed: 1, removed: 0, resolved: 0, failed: 1 });
  const intent = h.intents.get(path)!; assert.equal(intent.attempts, 1); assert.ok(intent.nextAttemptAt! > now);
});

test("concurrent consumers serialize and remove an orphan once", async () => {
  const h = harness(); const service = createStorageCleanupService({ repository: h.repository, storage: h.storage });
  await Promise.all([service.runBatch(1), service.runBatch(1)]);
  assert.equal(h.removes, 1); assert.equal(h.intents.size, 0);
});

test("create and cleanup adapters use the same parameterized advisory transaction lock", () => {
  for (const sourcePath of ["src/lib/cloud/books.ts", "src/lib/cloud/cleanup.ts"]) {
    const source = readFileSync(sourcePath, "utf8");
    assert.match(source, /pg_advisory_xact_lock\(hashtextextended\(\$\{key\}, 0\)\)/);
    assert.match(source, /maxWait:\s*5_000[\s\S]*?timeout:\s*150_000/);
  }
});
