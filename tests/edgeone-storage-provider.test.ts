import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createAuthoritativeBlobStore } from "../src/lib/edgeone/blob-store-core.ts";
import { APPLICATION_UPLOAD_LIMIT_BYTES, type UsageEvent } from "../src/lib/edgeone/quota-core.ts";

let providerModule: typeof import("../src/lib/cloud/edgeone-storage-provider.ts") | undefined;
let tokenModule: typeof import("../src/lib/cloud/edgeone-download-token-core.ts") | undefined;
try {
  providerModule = await import("../src/lib/cloud/edgeone-storage-provider.ts");
  tokenModule = await import("../src/lib/cloud/edgeone-download-token-core.ts");
} catch { /* red */ }
function providerApi() { if (!providerModule) assert.fail("EdgeOne storage provider must be implemented"); return providerModule; }
function tokenApi() { if (!tokenModule) assert.fail("EdgeOne download tokens must be implemented"); return tokenModule; }

const USER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_USER = "33333333-3333-4333-8333-333333333333";
const BOOK_ID = "22222222-2222-4222-8222-222222222222";
const PATH = `${USER_ID}/${BOOK_ID}/original.txt`;
const SECRET = "s".repeat(64);

function harness(options: { createFails?: boolean } = {}) {
  const data = new Map<string, unknown>();
  const calls: string[] = [];
  const ledgerSegments: string[] = [];
  const ledgerIds: string[] = [];
  const sdk = {
    async set(key: string, value: Uint8Array, config?: { onlyIfNew?: boolean }) {
      calls.push("create");
      if (options.createFails) throw new Error("provider secret");
      if (config?.onlyIfNew && data.has(key)) throw Object.assign(new Error("exists"), { code: "PreconditionFailed" });
      data.set(key, value.slice());
    },
    async setJSON() {},
    async get(key: string, config: { type: string }) {
      const value = data.get(key);
      if (value instanceof Uint8Array && config.type === "arrayBuffer") return value.slice().buffer;
      return value ?? null;
    },
    async getWithHeaders() { return null; },
    async delete(key: string) { calls.push("delete"); data.delete(key); },
    async list() { return { blobs: [] }; },
  };
  const quota = {
    async getUsage(userId: string) {
      ledgerIds.push(userId);
      return { state: "ready" as const, committed: 0, reserved: 0, tokensCommitted: 0, tokensReserved: 0 };
    },
    async appendEvent(userId: string, month: string, event: UsageEvent) {
      ledgerIds.push(userId);
      ledgerSegments.push(month);
      if (event.type === "UPLOAD_RESERVED") calls.push(`reserve:${event.bytes}`);
      if (event.type === "UPLOAD_COMMITTED") calls.push(`commit:${event.actualBytes}`);
      if (event.type === "UPLOAD_RELEASED") calls.push("release");
      if (event.type === "OBJECT_DELETED") calls.push(`deleted:${event.bytes}`);
    },
  };
  let id = 1;
  const provider = providerApi().createEdgeOneStorageProvider({
    blob: createAuthoritativeBlobStore(sdk), quota, userId: USER_ID,
    now: () => new Date("2026-07-12T00:00:00.000Z"),
    uuid: () => `40000000-0000-4000-8000-${String(id++).padStart(12, "0")}`,
    randomBytes: (length: number) => new Uint8Array(length).fill(7),
    downloadSecret: SECRET,
  });
  return { provider, calls, data, ledgerSegments, ledgerIds };
}

test("EdgeOne upload reserves full capacity, creates once, then commits actual bytes", async () => {
  const { provider, calls, ledgerSegments, ledgerIds } = harness();
  await provider.upload(PATH, new TextEncoder().encode("hello"));
  assert.deepEqual(calls, [
    `reserve:${APPLICATION_UPLOAD_LIMIT_BYTES}`,
    "create",
    "commit:5",
  ]);
  assert.deepEqual(ledgerSegments, ["blob", "blob"]);
  assert.equal(providerApi().EDGEONE_BLOB_QUOTA_LEDGER_ID, "blob-storage-global");
  assert.deepEqual(ledgerIds, ["blob-storage-global", "blob-storage-global", "blob-storage-global"]);
});

test("a failed upload releases its full reservation without leaking provider details", async () => {
  const { provider, calls } = harness({ createFails: true });
  await assert.rejects(() => provider.upload(PATH, new TextEncoder().encode("hello")), {
    code: "EDGEONE_STORAGE_UPLOAD_FAILED",
  });
  assert.deepEqual(calls, [`reserve:${APPLICATION_UPLOAD_LIMIT_BYTES}`, "create", "release"]);
});

test("identical create retries are idempotent while different content conflicts", async () => {
  const { provider, calls } = harness();
  await provider.upload(PATH, new TextEncoder().encode("hello"));
  await provider.upload(PATH, new TextEncoder().encode("hello"));
  assert.equal(calls.at(-1), "release");
  await assert.rejects(() => provider.upload(PATH, new TextEncoder().encode("other")), {
    code: "EDGEONE_OBJECT_CONFLICT",
  });
  assert.equal(calls.at(-1), "release");
});

test("download URLs and deletion never accept another owner's object", async () => {
  const { provider } = harness();
  const other = `${OTHER_USER}/${BOOK_ID}/original.txt`;
  await assert.rejects(() => provider.createSignedUrl(other, 60), { code: "INVALID_OBJECT_PATH" });
  await assert.rejects(() => provider.remove(other), { code: "INVALID_OBJECT_PATH" });
  const url = await provider.createSignedUrl(PATH, 60);
  assert.match(url, /^\/api\/cloud\/blob-download\?/);
  assert.doesNotMatch(url, /11111111-1111-4111-8111-111111111111/);
});

test("download tokens bind path, expiry and nonce and reject tampering", () => {
  const token = tokenApi().createEdgeOneDownloadToken({
    objectPath: PATH,
    expiresAt: 1_752_278_460,
    nonce: "nonce_1234567890",
    secret: SECRET,
  });
  assert.deepEqual(tokenApi().verifyEdgeOneDownloadToken(token, {
    now: new Date(1_752_278_400_000), secret: SECRET, expectedUserId: USER_ID,
  }), { objectPath: PATH });
  assert.throws(() => tokenApi().verifyEdgeOneDownloadToken({ ...token, signature: "0".repeat(64) }, {
    now: new Date(1_752_278_400_000), secret: SECRET, expectedUserId: USER_ID,
  }), { code: "INVALID_DOWNLOAD_TOKEN" });
  assert.throws(() => tokenApi().verifyEdgeOneDownloadToken(token, {
    now: new Date(1_752_278_460_000), secret: SECRET, expectedUserId: USER_ID,
  }), { code: "DOWNLOAD_TOKEN_EXPIRED" });
  assert.throws(() => tokenApi().verifyEdgeOneDownloadToken(token, {
    now: new Date(1_752_278_461_000), secret: SECRET, expectedUserId: USER_ID,
  }), { code: "DOWNLOAD_TOKEN_EXPIRED" });
});

test("production storage selects EdgeOne before legacy providers", async () => {
  const source = await readFile(new URL("../src/lib/cloud/storage.ts", import.meta.url), "utf8");
  const factory = await readFile(new URL("../src/lib/cloud/service-factory.ts", import.meta.url), "utf8");
  const edgeOne = source.indexOf('CLOUD_STORAGE_PROVIDER === "edgeone"');
  const legacy = source.indexOf("getCloudServerConfig()");
  assert.ok(edgeOne >= 0 && legacy > edgeOne);
  assert.match(source, /getCloudServices\(\)\.storage/);
  assert.match(factory, /createEdgeOneStorageProvider/);
});

test("download route revalidates session and reads only strong private Blob bytes", async () => {
  const source = await readFile(new URL("../src/app/api/cloud/blob-download/route.ts", import.meta.url), "utf8");
  assert.match(source, /getAppSession/);
  assert.match(source, /verifyEdgeOneDownloadToken/);
  assert.match(source, /session\.user\.id/);
  assert.match(source, /getBytes/);
  assert.match(source, /Cache-Control.*private, no-store/s);
  assert.doesNotMatch(source, /createSignedUrl|publicUrl|supabase|cos/iu);
});
