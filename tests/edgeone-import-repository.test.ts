import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createAuthoritativeBlobStore } from "../src/lib/edgeone/blob-store-core.ts";
import { canonicalImportItem } from "../src/lib/cloud/import-core.ts";

let subject: typeof import("../src/lib/cloud/edgeone-import-repository.ts") | undefined;
try { subject = await import("../src/lib/cloud/edgeone-import-repository.ts"); } catch { /* red */ }
function api() { if (!subject) assert.fail("EdgeOne import repository must be implemented"); return subject; }

const USER = "11111111-1111-4111-8111-111111111111";
const BATCH = "22222222-2222-4222-8222-222222222222";
const OTHER = "44444444-4444-4444-8444-444444444444";

function harness() {
  const data = new Map<string, unknown>();
  const blob = createAuthoritativeBlobStore({
    async set(key, value, options) { if (options?.onlyIfNew && data.has(key)) throw Object.assign(new Error("exists"), { code: "PreconditionFailed" }); data.set(key, value); },
    async setJSON(key, value, options) { if (options?.onlyIfNew && data.has(key)) throw Object.assign(new Error("exists"), { code: "PreconditionFailed" }); data.set(key, structuredClone(value)); },
    async get(key) { return data.has(key) ? structuredClone(data.get(key)) : null; }, async getWithHeaders() { return null; }, async delete(key) { data.delete(key); },
    async list(options) { return { blobs: [...data.keys()].filter((key) => key.startsWith(options.prefix ?? "")).map((key) => ({ key, etag: key })) }; },
  });
  let id = 1;
  const targets = new Set<string>();
  return api().createEdgeOneImportRepository({ blob, uuid: () => `60000000-0000-4000-8000-${String(id++).padStart(12, "0")}`,
    now: () => new Date("2026-07-21T12:00:00.000Z"),
    async targetExists(_userId, _kind, targetId) { return targets.has(targetId); },
    async prepareTarget(input) {
      const targetId = `70000000-0000-4000-8000-${input.sourceVersion.toString().padStart(12, "0")}`;
      return { ok: true as const, targetId, ensure: async () => { const created = !targets.has(targetId); targets.add(targetId); return { ok: true as const, targetId, created }; } };
    } });
}

function resilientHarness(options: { failFirstReceiptWrite?: boolean; synchronizeTargets?: boolean } = {}) {
  const data = new Map<string, unknown>();
  let failReceipt = options.failFirstReceiptWrite ?? false;
  const blob = createAuthoritativeBlobStore({
    async set(key, value, settings) { if (settings?.onlyIfNew && data.has(key)) throw Object.assign(new Error("exists"), { code: "PreconditionFailed" }); data.set(key, value); },
    async setJSON(key, value, settings) {
      if (settings?.onlyIfNew && data.has(key)) throw Object.assign(new Error("exists"), { code: "PreconditionFailed" });
      if (failReceipt && key.includes("/receipts/")) { failReceipt = false; throw new Error("connection failed before commit"); }
      data.set(key, structuredClone(value));
    },
    async get(key) { return data.has(key) ? structuredClone(data.get(key)) : null; }, async getWithHeaders() { return null; }, async delete(key) { data.delete(key); },
    async list(settings) { return { blobs: [...data.keys()].filter((key) => key.startsWith(settings.prefix ?? "")).map((key) => ({ key, etag: key })) }; },
  });
  const targets = new Set<string>();
  let targetWrites = 0;
  let arrivals = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const repository = api().createEdgeOneImportRepository({
    blob,
    uuid: () => "60000000-0000-4000-8000-000000000001",
    now: () => new Date("2026-07-21T12:00:00.000Z"),
    async targetExists(_userId, _kind, targetId) { return targets.has(targetId); },
    async prepareTarget(_input, target) {
      const targetId = "70000000-0000-4000-8000-000000000001";
      return { ok: true as const, targetId, ensure: async () => {
        assert.equal(target.createdAt.toISOString(), "2026-07-21T12:00:00.000Z");
        if (options.synchronizeTargets) {
          arrivals += 1;
          if (arrivals === 2) release();
          if (arrivals < 2) await gate;
        }
        if (!targets.has(targetId)) { targets.add(targetId); targetWrites += 1; return { ok: true as const, targetId, created: true }; }
        return { ok: true as const, targetId, created: false };
      } };
    },
  });
  return { data, repository, targetWrites: () => targetWrites };
}

async function importHash(value: Parameters<typeof canonicalImportItem>[0]) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalImportItem(value)));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

const itemPayload = { title: "Note", content: "Text" };
const item = { userId: USER, kind: "note" as const, sourceId: "local-note-1", sourceVersion: 1,
  payloadHash: await importHash({ kind: "note", sourceVersion: 1, source: null, payload: itemPayload }),
  source: null, payload: itemPayload };

test("same source id and payload hash skips while a different hash conflicts", async () => {
  const repo = harness();
  assert.equal((await repo.importOne(item)).outcome, "created");
  assert.equal((await repo.importOne(item)).outcome, "skipped");
  const payload = { title: "Changed", content: "New" };
  const changed = { ...item, payload, payloadHash: await importHash({ ...item, payload }) };
  assert.equal((await repo.importOne(changed)).outcome, "conflict");
  assert.equal((await repo.findReceipt(USER, "note", item.sourceId))?.payloadHash, item.payloadHash);
});

test("immutable claims and stable target ids prevent duplicate targets under concurrent imports", async () => {
  const h = resilientHarness({ synchronizeTargets: true });
  const [left, right] = await Promise.all([h.repository.importOne(item), h.repository.importOne(item)]);
  assert.deepEqual([left.outcome, right.outcome].sort(), ["created", "skipped"]);
  assert.equal(h.targetWrites(), 1);
  assert.match((await h.repository.findReceipt(USER, item.kind, item.sourceId))?.targetId ?? "", /^[0-9a-f-]{36}$/u);
});

test("different payloads racing in the same millisecond rebuild only from the winning claim", async () => {
  const data = new Map<string, unknown>();
  let preparedArrivals = 0;
  let releasePrepared!: () => void;
  const preparedGate = new Promise<void>((resolve) => { releasePrepared = resolve; });
  let targetHash: string | null = null;
  const blob = createAuthoritativeBlobStore({
    async set(key, value, options) { if (options?.onlyIfNew && data.has(key)) throw Object.assign(new Error("exists"), { code: "PreconditionFailed" }); data.set(key, value); },
    async setJSON(key, value, options) { if (options?.onlyIfNew && data.has(key)) throw Object.assign(new Error("exists"), { code: "PreconditionFailed" }); data.set(key, structuredClone(value)); },
    async get(key) { return data.has(key) ? structuredClone(data.get(key)) : null; }, async getWithHeaders() { return null; }, async delete(key) { data.delete(key); },
    async list(options) { return { blobs: [...data.keys()].filter((key) => key.startsWith(options.prefix ?? "")).map((key) => ({ key, etag: key })) }; },
  });
  const repository = api().createEdgeOneImportRepository({
    blob, uuid: () => "60000000-0000-4000-8000-000000000001", now: () => new Date("2026-07-21T12:00:00.000Z"),
    async targetExists(_userId, _kind, targetId) { return targetId === "70000000-0000-4000-8000-000000000001" && targetHash !== null; },
    async prepareTarget(prepared) {
      if (preparedArrivals < 2) {
        preparedArrivals += 1;
        if (preparedArrivals === 2) releasePrepared();
        else await preparedGate;
      }
      return { ok: true as const, targetId: "70000000-0000-4000-8000-000000000001", ensure: async () => {
        if (targetHash === null) {
          targetHash = prepared.payloadHash;
          return { ok: true as const, targetId: "70000000-0000-4000-8000-000000000001", created: true };
        }
        if (targetHash !== prepared.payloadHash) throw new Error("STUDY_CONFLICT");
        return { ok: true as const, targetId: "70000000-0000-4000-8000-000000000001", created: false };
      } };
    },
  });
  const payload = { title: "Changed", content: "New" };
  const changed = { ...item, payload, payloadHash: await importHash({ ...item, payload }) };

  const outcomes = await Promise.allSettled([repository.importOne(item), repository.importOne(changed)]);
  assert.equal(outcomes.every((outcome) => outcome.status === "fulfilled"), true);
  const receipt = await repository.findReceipt(USER, item.kind, item.sourceId);
  assert.equal(receipt?.payloadHash, targetHash);
  assert.equal(outcomes.some((outcome) => outcome.status === "fulfilled" && outcome.value.outcome === "conflict"), true);
});

test("a failed final receipt write retries against the same already-created target", async () => {
  const h = resilientHarness({ failFirstReceiptWrite: true });
  await assert.rejects(() => h.repository.importOne(item), /BLOB_WRITE_FAILED/);
  const retried = await h.repository.importOne(item);
  assert.equal(retried.outcome, "created");
  assert.equal(h.targetWrites(), 1);
});

test("claim recovery re-runs target completion before writing a final receipt", async () => {
  const data = new Map<string, unknown>();
  let ensureCalls = 0;
  let partialTarget = false;
  const blob = createAuthoritativeBlobStore({
    async set(key, value, options) { if (options?.onlyIfNew && data.has(key)) throw Object.assign(new Error("exists"), { code: "PreconditionFailed" }); data.set(key, value); },
    async setJSON(key, value, options) { if (options?.onlyIfNew && data.has(key)) throw Object.assign(new Error("exists"), { code: "PreconditionFailed" }); data.set(key, structuredClone(value)); },
    async get(key) { return data.has(key) ? structuredClone(data.get(key)) : null; }, async getWithHeaders() { return null; }, async delete(key) { data.delete(key); },
    async list(options) { return { blobs: [...data.keys()].filter((key) => key.startsWith(options.prefix ?? "")).map((key) => ({ key, etag: key })) }; },
  });
  const repository = api().createEdgeOneImportRepository({
    blob, uuid: () => "60000000-0000-4000-8000-000000000001", now: () => new Date("2026-07-21T12:00:00.000Z"),
    async targetExists() { return partialTarget; },
    async prepareTarget() {
      return { ok: true as const, targetId: "70000000-0000-4000-8000-000000000001", ensure: async () => {
        ensureCalls += 1;
        partialTarget = true;
        if (ensureCalls === 1) return { ok: false as const, code: "WRITE_FAILED" as const };
        return { ok: true as const, targetId: "70000000-0000-4000-8000-000000000001", created: false };
      } };
    },
  });

  assert.deepEqual(await repository.importOne(item), { outcome: "error", code: "WRITE_FAILED" });
  assert.equal((await repository.importOne(item)).outcome, "created");
  assert.equal(ensureCalls, 2);
});

test("a changed local item can finish the original incomplete claim before returning a real conflict", async () => {
  const data = new Map<string, unknown>();
  let ensureCalls = 0;
  let targetComplete = false;
  const preparedPayloads: unknown[] = [];
  const blob = createAuthoritativeBlobStore({
    async set(key, value, options) { if (options?.onlyIfNew && data.has(key)) throw Object.assign(new Error("exists"), { code: "PreconditionFailed" }); data.set(key, value); },
    async setJSON(key, value, options) { if (options?.onlyIfNew && data.has(key)) throw Object.assign(new Error("exists"), { code: "PreconditionFailed" }); data.set(key, structuredClone(value)); },
    async get(key) { return data.has(key) ? structuredClone(data.get(key)) : null; }, async getWithHeaders() { return null; }, async delete(key) { data.delete(key); },
    async list(options) { return { blobs: [...data.keys()].filter((key) => key.startsWith(options.prefix ?? "")).map((key) => ({ key, etag: key })) }; },
  });
  const repository = api().createEdgeOneImportRepository({
    blob, uuid: () => "60000000-0000-4000-8000-000000000001", now: () => new Date("2026-07-21T12:00:00.000Z"),
    async targetExists() { return targetComplete; },
    async prepareTarget(prepared) {
      preparedPayloads.push(structuredClone(prepared.payload));
      return { ok: true as const, targetId: "70000000-0000-4000-8000-000000000001", ensure: async () => {
        ensureCalls += 1;
        if (ensureCalls === 1) return { ok: false as const, code: "WRITE_FAILED" as const };
        targetComplete = true;
        return { ok: true as const, targetId: "70000000-0000-4000-8000-000000000001", created: true };
      } };
    },
  });
  const payload = { title: "Changed", content: "New" };
  const changed = { ...item, payload, payloadHash: await importHash({ ...item, payload }) };

  assert.deepEqual(await repository.importOne(item), { outcome: "error", code: "WRITE_FAILED" });
  const conflict = await repository.importOne(changed);
  assert.equal(conflict.outcome, "conflict");
  assert.deepEqual(preparedPayloads, [item.payload, item.payload]);
  assert.equal((await repository.findReceipt(USER, item.kind, item.sourceId))?.payloadHash, item.payloadHash);
  assert.equal(targetComplete, true);
});

test("stored receipts are parsed strictly and remain bound to the requested identity", async () => {
  const h = resilientHarness();
  await h.repository.importOne(item);
  const key = [...h.data.keys()].find((candidate) => candidate.includes("/receipts/"));
  assert.ok(key);
  h.data.set(key, { ...(h.data.get(key) as Record<string, unknown>), userId: OTHER });
  await assert.rejects(() => h.repository.findReceipt(USER, item.kind, item.sourceId), { code: "IMPORT_RECEIPT_INVALID" });
});

test("batch summaries are immutable, owner-scoped and restore Date values", async () => {
  const repo = harness();
  const summary = { id: BATCH, userId: USER, manifestId: "33333333-3333-4333-8333-333333333333", manifestVersion: 1,
    status: "COMPLETED" as const, itemCount: 1, createdCount: 1, skippedCount: 0, conflictCount: 0, errorCount: 0,
    startedAt: new Date("2026-07-12T00:00:00.000Z"), completedAt: new Date("2026-07-12T00:01:00.000Z") };
  await repo.saveBatch(summary);
  assert.equal((await repo.findBatch(USER, BATCH))?.startedAt instanceof Date, true);
  assert.equal(await repo.findBatch("44444444-4444-4444-8444-444444444444", BATCH), null);
  await assert.rejects(() => repo.saveBatch({ ...summary, status: "PARTIAL", createdCount: 0, errorCount: 1 }), { code: "IMPORT_BATCH_CONFLICT" });
});

test("stored batch summaries reject malformed identity, counts, status, dates, and unknown fields", async () => {
  const h = resilientHarness();
  const summary = { id: BATCH, userId: USER, manifestId: "33333333-3333-4333-8333-333333333333", manifestVersion: 1,
    status: "COMPLETED" as const, itemCount: 1, createdCount: 1, skippedCount: 0, conflictCount: 0, errorCount: 0,
    startedAt: new Date("2026-07-12T00:00:00.000Z"), completedAt: new Date("2026-07-12T00:01:00.000Z") };
  await h.repository.saveBatch(summary);
  const key = [...h.data.keys()].find((candidate) => candidate.includes("/batches/"));
  assert.ok(key);
  const valid = h.data.get(key) as Record<string, unknown>;
  for (const corrupted of [
    { ...valid, userId: OTHER },
    { ...valid, itemCount: 2 },
    { ...valid, itemCount: 0, createdCount: 0 },
    { ...valid, itemCount: 1_001, createdCount: 1_001 },
    { ...valid, status: "PARTIAL" },
    { ...valid, completedAt: "not-a-date" },
    { ...valid, unknown: true },
  ]) {
    h.data.set(key, corrupted);
    await assert.rejects(() => h.repository.findBatch(USER, BATCH), { code: "IMPORT_RECEIPT_INVALID" });
  }
});

test("production import factory selects EdgeOne before Prisma", async () => {
  const source = await readFile(new URL("../src/lib/cloud/import.ts", import.meta.url), "utf8");
  const factory = await readFile(new URL("../src/lib/cloud/service-factory.ts", import.meta.url), "utf8");
  assert.ok(source.indexOf('CLOUD_DATA_PROVIDER === "edgeone"') < source.indexOf("createPrismaCloudImportRepository()"));
  assert.match(source, /getCloudServices\(\)\.imports/);
  assert.match(factory, /createEdgeOneImportRepository/);
});
