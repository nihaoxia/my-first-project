import assert from "node:assert/strict";
import test from "node:test";

let moduleUnderTest: typeof import("../src/lib/edgeone/blob-store-core.ts") | undefined;
try {
  moduleUnderTest = await import("../src/lib/edgeone/blob-store-core.ts");
} catch {
  // Expected during the first TDD run.
}

function api() {
  if (!moduleUnderTest) assert.fail("blob-store-core must be implemented");
  return moduleUnderTest;
}

function sdk(overrides: Record<string, unknown> = {}) {
  return {
    async set() {},
    async setJSON() {},
    async get() { return null; },
    async getWithHeaders() { return null; },
    async delete() {},
    async list() { return { blobs: [] }; },
    ...overrides,
  };
}

test("authoritative JSON reads always request strong consistency", async () => {
  const calls: unknown[] = [];
  const store = api().createAuthoritativeBlobStore(sdk({
    async get(key: string, options: unknown) {
      calls.push([key, options]);
      return { id: "1" };
    },
  }));

  assert.deepEqual(await store.getJSON("auth/accounts/a/claim.json"), { id: "1" });
  assert.deepEqual(calls, [[
    "auth/accounts/a/claim.json",
    { type: "json", consistency: "strong" },
  ]]);
});

test("authoritative creates use onlyIfNew and redact provider errors", async () => {
  const secret = "provider-secret";
  const calls: unknown[] = [];
  const store = api().createAuthoritativeBlobStore(sdk({
    async setJSON(key: string, value: unknown, options: unknown) {
      calls.push([key, value, options]);
      throw Object.assign(new Error(secret), { code: "PreconditionFailed" });
    },
  }));

  await assert.rejects(
    () => store.createJSON("auth/accounts/a/claim.json", { id: "1" }),
    (error: unknown) => {
      assert.equal((error as { code?: string }).code, "BLOB_ALREADY_EXISTS");
      assert.doesNotMatch(String(error), new RegExp(secret));
      return true;
    },
  );
  assert.deepEqual(calls[0], [
    "auth/accounts/a/claim.json",
    { id: "1" },
    { onlyIfNew: true },
  ]);
});

test("strong listing follows every cursor page without dropping keys", async () => {
  const calls: unknown[] = [];
  const store = api().createAuthoritativeBlobStore(sdk({
    async list(options: { cursor?: string }) {
      calls.push(options);
      return options.cursor
        ? { blobs: [{ key: "data/b.json", etag: "b" }] }
        : { blobs: [{ key: "data/a.json", etag: "a" }], cursor: "next" };
    },
  }));

  assert.deepEqual(await store.listAll("data/"), [
    { key: "data/a.json", etag: "a" },
    { key: "data/b.json", etag: "b" },
  ]);
  assert.deepEqual(calls, [
    { prefix: "data/", paginate: false, consistency: "strong" },
    { prefix: "data/", cursor: "next", paginate: false, consistency: "strong" },
  ]);
});

test("invalid or oversized keys fail before reaching the SDK", async () => {
  let calls = 0;
  const store = api().createAuthoritativeBlobStore(sdk({
    async get() { calls += 1; return null; },
  }));
  for (const key of ["../secret", "/absolute", "bad key", "a".repeat(513)]) {
    await assert.rejects(() => store.getJSON(key), { code: "INVALID_BLOB_KEY" });
  }
  assert.equal(calls, 0);
});
