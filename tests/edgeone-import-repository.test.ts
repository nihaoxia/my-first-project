import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createAuthoritativeBlobStore } from "../src/lib/edgeone/blob-store-core.ts";

let subject: typeof import("../src/lib/cloud/edgeone-import-repository.ts") | undefined;
try { subject = await import("../src/lib/cloud/edgeone-import-repository.ts"); } catch { /* red */ }
function api() { if (!subject) assert.fail("EdgeOne import repository must be implemented"); return subject; }

const USER = "11111111-1111-4111-8111-111111111111";
const BATCH = "22222222-2222-4222-8222-222222222222";

function harness() {
  const data = new Map<string, unknown>();
  const blob = createAuthoritativeBlobStore({
    async set(key, value, options) { if (options?.onlyIfNew && data.has(key)) throw Object.assign(new Error("exists"), { code: "PreconditionFailed" }); data.set(key, value); },
    async setJSON(key, value, options) { if (options?.onlyIfNew && data.has(key)) throw Object.assign(new Error("exists"), { code: "PreconditionFailed" }); data.set(key, structuredClone(value)); },
    async get(key) { return data.has(key) ? structuredClone(data.get(key)) : null; }, async getWithHeaders() { return null; }, async delete(key) { data.delete(key); },
    async list(options) { return { blobs: [...data.keys()].filter((key) => key.startsWith(options.prefix ?? "")).map((key) => ({ key, etag: key })) }; },
  });
  let id = 1;
  return api().createEdgeOneImportRepository({ blob, uuid: () => `60000000-0000-4000-8000-${String(id++).padStart(12, "0")}`,
    async createTarget(input) { return { ok: true as const, targetId: `70000000-0000-4000-8000-${input.sourceVersion.toString().padStart(12, "0")}` }; } });
}

const item = { userId: USER, kind: "note" as const, sourceId: "local-note-1", sourceVersion: 1,
  payloadHash: "a".repeat(64), source: null, payload: { title: "Note", content: "Text" } };

test("same source id and payload hash skips while a different hash conflicts", async () => {
  const repo = harness();
  assert.equal((await repo.importOne(item)).outcome, "created");
  assert.equal((await repo.importOne(item)).outcome, "skipped");
  assert.equal((await repo.importOne({ ...item, payloadHash: "b".repeat(64) })).outcome, "conflict");
  assert.equal((await repo.findReceipt(USER, "note", item.sourceId))?.payloadHash, item.payloadHash);
});

test("batch summaries are immutable, owner-scoped and restore Date values", async () => {
  const repo = harness();
  const summary = { id: BATCH, userId: USER, manifestId: "33333333-3333-4333-8333-333333333333", manifestVersion: 1,
    status: "COMPLETED" as const, itemCount: 1, createdCount: 1, skippedCount: 0, conflictCount: 0, errorCount: 0,
    startedAt: new Date("2026-07-12T00:00:00.000Z"), completedAt: new Date("2026-07-12T00:01:00.000Z") };
  await repo.saveBatch(summary);
  assert.equal((await repo.findBatch(USER, BATCH))?.startedAt instanceof Date, true);
  assert.equal(await repo.findBatch("44444444-4444-4444-8444-444444444444", BATCH), null);
  await assert.rejects(() => repo.saveBatch({ ...summary, errorCount: 1 }), { code: "IMPORT_BATCH_CONFLICT" });
});

test("production import factory selects EdgeOne before Prisma", async () => {
  const source = await readFile(new URL("../src/lib/cloud/import.ts", import.meta.url), "utf8");
  assert.ok(source.indexOf('CLOUD_DATA_PROVIDER === "edgeone"') < source.indexOf("createPrismaCloudImportRepository()"));
  assert.match(source, /createEdgeOneImportRepository/);
});
