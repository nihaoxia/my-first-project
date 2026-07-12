import assert from "node:assert/strict";
import test from "node:test";

let moduleUnderTest: typeof import("../src/lib/edgeone/quota-core.ts") | undefined;
let serviceModule: typeof import("../src/lib/edgeone/quota-service-core.ts") | undefined;
try {
  moduleUnderTest = await import("../src/lib/edgeone/quota-core.ts");
  serviceModule = await import("../src/lib/edgeone/quota-service-core.ts");
} catch {
  // Expected during the first TDD run.
}

function serviceApi() {
  if (!serviceModule) assert.fail("quota service must be implemented");
  return serviceModule;
}

function api() {
  if (!moduleUnderTest) assert.fail("quota-core must be implemented");
  return moduleUnderTest;
}

const MIB = 1024 * 1024;
const at = "2026-07-12T00:00:00.000Z";
const userId = "10000000-0000-4000-8000-000000000001";
const reservationId = "20000000-0000-4000-8000-000000000001";

test("each upload reserves the complete two MiB application ceiling", () => {
  const next = api().reserveUpload(
    { state: "ready", committed: 700 * MIB, reserved: 0 },
    { reservationId, maxUploadBytes: 2 * MIB },
  );
  assert.equal(next.reserved, 2 * MIB);
  assert.equal(next.committed, 700 * MIB);
});

test("unknown usage fails closed", () => {
  assert.throws(
    () => api().assertFreeCapacity({ state: "unavailable" }, 1),
    { code: "USAGE_LEDGER_UNAVAILABLE" },
  );
});

test("quota preserves the final 25 MiB platform-object headroom", () => {
  assert.equal(api().SAFE_BLOB_LIMIT_BYTES, 999 * MIB);
  assert.throws(
    () => api().assertFreeCapacity(
      { state: "ready", committed: 998 * MIB, reserved: 0 },
      2 * MIB,
    ),
    { code: "FREE_QUOTA_EXHAUSTED" },
  );
});

test("upload events reserve, commit actual bytes and release the difference", () => {
  const usage = api().foldUsageEvents([
    { type: "UPLOAD_RESERVED", id: reservationId, userId, bytes: 2 * MIB, at },
    { type: "UPLOAD_COMMITTED", id: "30000000-0000-4000-8000-000000000001", reservationId, objectId: "book.txt", actualBytes: 5, at },
  ]);
  assert.deepEqual(usage, {
    state: "ready",
    committed: 5,
    reserved: 0,
    tokensCommitted: 0,
    tokensReserved: 0,
  });
});

test("duplicate, orphan and repeated terminal events fail closed", () => {
  const reserve = { type: "UPLOAD_RESERVED" as const, id: reservationId, userId, bytes: 2 * MIB, at };
  assert.throws(() => api().foldUsageEvents([reserve, reserve]), { code: "USAGE_LEDGER_INVALID" });
  assert.throws(() => api().foldUsageEvents([{ type: "UPLOAD_COMMITTED", id: "30000000-0000-4000-8000-000000000001", reservationId, objectId: "book.txt", actualBytes: 5, at }]), { code: "USAGE_LEDGER_INVALID" });
  assert.throws(() => api().foldUsageEvents([
    reserve,
    { type: "UPLOAD_RELEASED", id: "30000000-0000-4000-8000-000000000002", reservationId, at },
    { type: "UPLOAD_COMMITTED", id: "30000000-0000-4000-8000-000000000003", reservationId, objectId: "book.txt", actualBytes: 5, at },
  ]), { code: "USAGE_LEDGER_INVALID" });
});

test("object deletion releases only a previously committed object once", () => {
  const committed = [
    { type: "UPLOAD_RESERVED" as const, id: reservationId, userId, bytes: 2 * MIB, at },
    { type: "UPLOAD_COMMITTED" as const, id: "30000000-0000-4000-8000-000000000001", reservationId, objectId: "book.txt", actualBytes: 5, at },
  ];
  assert.deepEqual(api().foldUsageEvents([
    ...committed,
    { type: "OBJECT_DELETED", id: "30000000-0000-4000-8000-000000000002", objectId: "book.txt", bytes: 5, at },
  ]).committed, 0);
  assert.throws(() => api().foldUsageEvents([
    ...committed,
    { type: "OBJECT_DELETED", id: "30000000-0000-4000-8000-000000000002", objectId: "book.txt", bytes: 5, at },
    { type: "OBJECT_DELETED", id: "30000000-0000-4000-8000-000000000003", objectId: "book.txt", bytes: 5, at },
  ]), { code: "USAGE_LEDGER_INVALID" });
});

test("monthly model use hard stops at 450000 tokens", () => {
  assert.equal(api().SAFE_MONTHLY_TOKEN_LIMIT, 450_000);
  assert.doesNotThrow(() => api().assertFreeTokenCapacity(
    { state: "ready", committed: 0, reserved: 0, tokensCommitted: 449_000, tokensReserved: 0 },
    1_000,
  ));
  assert.throws(() => api().assertFreeTokenCapacity(
    { state: "ready", committed: 0, reserved: 0, tokensCommitted: 449_001, tokensReserved: 0 },
    1_000,
  ), { code: "FREE_QUOTA_EXHAUSTED" });
});

test("quota service folds strongly listed Blob events and appends immutable events", async () => {
  const created: Array<[string, unknown]> = [];
  const reserve = { type: "UPLOAD_RESERVED" as const, id: reservationId, userId, bytes: 2 * MIB, at };
  const commit = { type: "UPLOAD_COMMITTED" as const, id: "30000000-0000-4000-8000-000000000001", reservationId, objectId: "book.txt", actualBytes: 5, at };
  const byKey = new Map<string, typeof reserve | typeof commit>([
    [`usage/${userId}/2026-07/events/${reserve.id}.json`, reserve],
    [`usage/${userId}/2026-07/events/${commit.id}.json`, commit],
  ]);
  const blob = {
    async getJSON<T>(key: string) { return (byKey.get(key) ?? null) as T | null; },
    async getText() { return null; },
    async getBytes() { return null; },
    async createJSON(key: string, value: unknown) { created.push([key, value]); },
    async createBytes() {},
    async remove() {},
    async listAll() { return [...byKey.keys()].map((key) => ({ key, etag: key })); },
  };
  const service = serviceApi().createEdgeOneQuotaService(blob);
  assert.equal((await service.getUsage(userId, "2026-07")).committed, 5);
  const release = { type: "UPLOAD_RELEASED" as const, id: "30000000-0000-4000-8000-000000000002", reservationId, at };
  await service.appendEvent(userId, "2026-07", release);
  assert.deepEqual(created, [[
    `usage/${userId}/2026-07/events/${release.id}.json`,
    release,
  ]]);
  assert.deepEqual(Object.keys(service).sort(), ["appendEvent", "getUsage"]);
});
