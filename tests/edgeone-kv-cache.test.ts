import assert from "node:assert/strict";
import test from "node:test";

let moduleUnderTest: typeof import("../src/lib/edgeone/kv-cache-core.ts") | undefined;
try {
  moduleUnderTest = await import("../src/lib/edgeone/kv-cache-core.ts");
} catch {
  // Expected during the first TDD run.
}

function api() {
  if (!moduleUnderTest) assert.fail("kv-cache-core must be implemented");
  return moduleUnderTest;
}

function memoryKv(initial: unknown = null) {
  let value = initial;
  return {
    async get() { return value; },
    async put(_key: string, next: unknown) { value = next; },
    async delete() { value = null; },
  };
}

test("matching fresh list projections can be reused", async () => {
  const kv = memoryKv();
  const cache = api().createEdgeOneListCache(kv, () => new Date("2026-07-12T00:00:30.000Z"));
  await cache.putList("books", "hash-a", [{ id: "book-a" }]);
  assert.deepEqual(await cache.getList("books", "hash-a"), [{ id: "book-a" }]);
});

test("old hashes, stale values and malformed cache entries are misses", async () => {
  const fresh = JSON.stringify({ sourceRevisionSetHash: "hash-a", generatedAt: "2026-07-12T00:00:00.000Z", items: [{ id: "book-a" }] });
  assert.equal(await api().createEdgeOneListCache(memoryKv(fresh), () => new Date("2026-07-12T00:00:30.000Z")).getList("books", "hash-b"), null);
  assert.equal(await api().createEdgeOneListCache(memoryKv(fresh), () => new Date("2026-07-12T00:01:01.000Z")).getList("books", "hash-a"), null);
  assert.equal(await api().createEdgeOneListCache(memoryKv("not-json"), () => new Date("2026-07-12T00:00:30.000Z")).getList("books", "hash-a"), null);
});

test("the public cache surface has no auth, quota or current-version methods", () => {
  const cache = api().createEdgeOneListCache(memoryKv(), () => new Date());
  assert.deepEqual(Object.keys(cache).sort(), ["getList", "putList", "remove"]);
});
