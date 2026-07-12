import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createAuthoritativeBlobStore } from "../src/lib/edgeone/blob-store-core.ts";

let core: typeof import("../src/lib/auth/edgeone-account-core.ts") | undefined;
let serviceModule: typeof import("../src/lib/auth/edgeone-account-service-core.ts") | undefined;
try {
  core = await import("../src/lib/auth/edgeone-account-core.ts");
  serviceModule = await import("../src/lib/auth/edgeone-account-service-core.ts");
} catch { /* red */ }
function coreApi() { if (!core) assert.fail("edgeone-account-core must be implemented"); return core; }
function serviceApi() { if (!serviceModule) assert.fail("edgeone account service must be implemented"); return serviceModule; }

const root: import("../src/lib/auth/edgeone-account-core.ts").AccountRevision = {
  id: "10000000-0000-4000-8000-000000000001", parentIds: [],
  operationId: "20000000-0000-4000-8000-000000000001", createdAt: "2026-07-12T00:00:00.000Z", deleted: false,
  value: { userId: "30000000-0000-4000-8000-000000000001", accountLabel: "reader_01", passwordHash: { algorithm: "scrypt", n: 32768, r: 8, p: 1, dkLen: 32, salt: "01", digest: "02" }, recoveryHash: "a".repeat(64), generation: 1, role: "USER" },
};

test("parallel account revisions disable login", () => {
  const left = { ...root, id: "10000000-0000-4000-8000-000000000002", parentIds: [root.id], operationId: "20000000-0000-4000-8000-000000000002" };
  const right = { ...root, id: "10000000-0000-4000-8000-000000000003", parentIds: [root.id], operationId: "20000000-0000-4000-8000-000000000003" };
  const state = coreApi().resolveAccountRevisions([root, left, right]);
  assert.equal(state.kind, "conflict");
  assert.throws(() => coreApi().requireLoginableAccount(state), { code: "ACCOUNT_CONFLICT" });
});

test("missing, deleted and banned accounts fail closed", () => {
  assert.throws(
    () => coreApi().requireLoginableAccount({ kind: "missing" }),
    { code: "ACCOUNT_UNAVAILABLE" },
  );
  assert.throws(
    () => coreApi().requireLoginableAccount({
      kind: "current",
      revision: { ...root, deleted: true },
    }),
    { code: "ACCOUNT_UNAVAILABLE" },
  );
  assert.throws(
    () => coreApi().requireLoginableAccount({
      kind: "current",
      revision: { ...root, value: { ...root.value, role: "BANNED" } },
    }),
    { code: "ACCOUNT_UNAVAILABLE" },
  );
});

function memoryBlob() {
  const data = new Map<string, unknown>();
  const sdk = {
    async set(key: string, value: unknown, options?: { onlyIfNew?: boolean }) { if (options?.onlyIfNew && data.has(key)) throw Object.assign(new Error("exists"), { code: "PreconditionFailed" }); data.set(key, value); },
    async setJSON(key: string, value: unknown, options?: { onlyIfNew?: boolean }) { if (options?.onlyIfNew && data.has(key)) throw Object.assign(new Error("exists"), { code: "PreconditionFailed" }); data.set(key, structuredClone(value)); },
    async get(key: string) { return data.has(key) ? structuredClone(data.get(key)) : null; },
    async getWithHeaders() { return null; },
    async delete(key: string) { data.delete(key); },
    async list(options: { prefix?: string }) { return { blobs: [...data.keys()].filter((key) => key.startsWith(options.prefix ?? "")).sort().map((key) => ({ key, etag: key })) }; },
  };
  return createAuthoritativeBlobStore(sdk);
}

test("register, login, recovery and session generation are strongly enforced", async () => {
  let uuidCounter = 1;
  let randomCounter = 1;
  const service = serviceApi().createEdgeOneAccountService({
    blob: memoryBlob(), usernamePepper: "p".repeat(32),
    now: () => new Date("2026-07-12T00:00:00.000Z"),
    uuid: () => `40000000-0000-4000-8000-${String(uuidCounter++).padStart(12, "0")}`,
    randomBytes: (length: number) => new Uint8Array(length).fill(randomCounter++),
  });
  const registered = await service.register("Reader_01", "correct horse battery staple");
  assert.equal(registered.accountLabel, "reader_01");
  assert.match(registered.recoveryCode, /^[A-Za-z0-9_-]{43}$/);
  assert.deepEqual(await service.validateSession(registered.sessionToken), {
    userId: registered.userId, accountLabel: "reader_01", role: "USER",
  });
  await assert.rejects(() => service.login("reader_01", "wrong password value"), { code: "INVALID_CREDENTIALS" });
  const loggedIn = await service.login("reader_01", "correct horse battery staple");
  const recovered = await service.recover("reader_01", registered.recoveryCode, "a different secure password");
  assert.equal(await service.validateSession(loggedIn.sessionToken), null);
  assert.notEqual(recovered.recoveryCode, registered.recoveryCode);
  assert.deepEqual((await service.validateSession(recovered.sessionToken))?.userId, registered.userId);
  await service.logout(recovered.sessionToken);
  assert.equal(await service.validateSession(recovered.sessionToken), null);
});

test("duplicate usernames are indistinguishable from unavailable names", async () => {
  let counter = 1;
  const service = serviceApi().createEdgeOneAccountService({
    blob: memoryBlob(), usernamePepper: "p".repeat(32), now: () => new Date("2026-07-12T00:00:00.000Z"),
    uuid: () => `50000000-0000-4000-8000-${String(counter++).padStart(12, "0")}`,
    randomBytes: (length: number) => new Uint8Array(length).fill(counter++),
  });
  await service.register("reader_01", "correct horse battery staple");
  await assert.rejects(() => service.register("reader_01", "another secure password"), { code: "USERNAME_UNAVAILABLE" });
  assert.equal(
    (await service.login("reader_01", "correct horse battery staple")).accountLabel,
    "reader_01",
  );
});

test("idle and absolute session deadlines are enforced", async () => {
  let currentTime = new Date("2026-07-12T00:00:00.000Z");
  let counter = 1;
  const service = serviceApi().createEdgeOneAccountService({
    blob: memoryBlob(), usernamePepper: "p".repeat(32), now: () => currentTime,
    uuid: () => `60000000-0000-4000-8000-${String(counter++).padStart(12, "0")}`,
    randomBytes: (length: number) => new Uint8Array(length).fill(counter++),
  });
  const registered = await service.register("reader_01", "correct horse battery staple");
  currentTime = new Date("2026-07-19T00:00:00.000Z");
  assert.equal(await service.validateSession(registered.sessionToken), null);
});

test("production account wrapper is server-only and does not import KV", async () => {
  const source = await readFile(
    new URL("../src/lib/auth/edgeone-account.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /^import "server-only";/);
  assert.match(source, /getAuthoritativeBlobStore/);
  assert.match(source, /createEdgeOneAccountService/);
  assert.doesNotMatch(source, /kv-cache|supabase|prisma|cos|sms/iu);
});
