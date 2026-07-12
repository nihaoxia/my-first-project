import assert from "node:assert/strict";
import test from "node:test";

import {
  CloudImportError,
  createCloudImportService,
  type CloudImportRepository,
  type ImportReceipt,
  MAX_IMPORT_ITEMS,
} from "../src/lib/cloud/import-core.ts";

const userId = "11111111-1111-4111-8111-111111111111";
const batchId = "77777777-7777-4777-8777-777777777777";

function harness(options: { commitThenThrow?: boolean } = {}) {
  const receipts = new Map<string, ImportReceipt>();
  const created: string[] = [];
  const repository: CloudImportRepository = {
    async importOne(input) {
      const key = `${input.userId}:${input.kind}:${input.sourceId}`;
      const existing = receipts.get(key);
      if (existing) return existing.payloadHash === input.payloadHash ? { outcome: "skipped", receipt: existing } : { outcome: "conflict", receipt: existing };
      if (input.source?.bookTitle === "Missing") return { outcome: "error", code: "SOURCE_NOT_FOUND" };
      const receipt = { userId: input.userId, kind: input.kind, sourceId: input.sourceId, sourceVersion: input.sourceVersion, payloadHash: input.payloadHash, targetId: `target-${input.sourceId}` } satisfies ImportReceipt;
      receipts.set(key, receipt); created.push(input.sourceId);
      if (options.commitThenThrow) { options.commitThenThrow = false; throw new Error("connection lost after commit"); }
      return { outcome: "created", receipt };
    },
    async findReceipt(owner, kind, sourceId) { return receipts.get(`${owner}:${kind}:${sourceId}`) ?? null; },
    async saveBatch(summary) { return summary; },
    async findBatch() { return null; },
  };
  return { receipts, created, service: createCloudImportService({ repository, uuid: () => batchId, now: () => new Date("2026-07-12T00:00:00Z") }) };
}

const item = { sourceId: "local-vocab-1", sourceVersion: 1, kind: "vocabulary", source: { bookTitle: "Cloud Book", chapterTitle: "Chapter 1" }, payload: { term: "threshold", explanation: "boundary", contextualMean: "entry", sourceSentence: "At the threshold.", note: "" } } as const;

test("imports an owner-bound versioned manifest and returns real statistics", async () => {
  const h = harness();
  const result = await h.service.import(userId, { version: 1, manifestId: batchId, items: [item] });
  assert.deepEqual(result.counts, { created: 1, skipped: 0, conflicts: 0, errors: 0 });
  assert.equal(result.manifestId, batchId);
  assert.deepEqual(h.created, [item.sourceId]);
  assert.equal("userId" in result, false);
});

test("repeating or concurrently racing the same item is idempotent", async () => {
  const h = harness();
  const manifest = { version: 1, manifestId: batchId, items: [item] };
  const [a, b] = await Promise.all([h.service.import(userId, manifest), h.service.import(userId, manifest)]);
  assert.equal(a.counts.created + b.counts.created, 1);
  assert.equal(a.counts.skipped + b.counts.skipped, 1);
  assert.deepEqual(h.created, [item.sourceId]);
});

test("same source identity with changed canonical payload is a conflict", async () => {
  const h = harness();
  await h.service.import(userId, { version: 1, manifestId: batchId, items: [item] });
  const result = await h.service.import(userId, { version: 1, manifestId: "88888888-8888-4888-8888-888888888888", items: [{ ...item, payload: { ...item.payload, term: "changed" } }] });
  assert.deepEqual(result.counts, { created: 0, skipped: 0, conflicts: 1, errors: 0 });
});

test("reconciles an ambiguous commit from the durable item receipt", async () => {
  const h = harness({ commitThenThrow: true });
  const result = await h.service.import(userId, { version: 1, manifestId: batchId, items: [item] });
  assert.deepEqual(result.counts, { created: 1, skipped: 0, conflicts: 0, errors: 0 });
  assert.deepEqual(h.created, [item.sourceId]);
});

test("records partial errors without marking them created and permits retry", async () => {
  const h = harness();
  const missing = { ...item, sourceId: "missing", source: { bookTitle: "Missing", chapterTitle: "Chapter 1" } };
  const result = await h.service.import(userId, { version: 1, manifestId: batchId, items: [item, missing] });
  assert.deepEqual(result.counts, { created: 1, skipped: 0, conflicts: 0, errors: 1 });
  assert.equal(result.complete, false);
});

test("rejects identity injection, duplicate source keys, unknown fields and bounded manifests", async () => {
  const h = harness();
  for (const invalid of [
    { version: 1, manifestId: batchId, userId, items: [item] },
    { version: 1, manifestId: batchId, items: [item, item] },
    { version: 1, manifestId: batchId, items: [{ ...item, cloudBookId: batchId }] },
    { version: 1, manifestId: batchId, items: [{ ...item, payload: { ...item.payload, storagePath: "other/file" } }] },
    { version: 2, manifestId: batchId, items: [item] },
    { version: 1, manifestId: batchId, items: Array.from({ length: MAX_IMPORT_ITEMS + 1 }, (_, index) => ({ ...item, sourceId: `x-${index}` })) },
  ]) await assert.rejects(h.service.import(userId, invalid), (error: unknown) => error instanceof CloudImportError && error.code === "INVALID_IMPORT");
});

test("server canonicalization ignores a claimed client hash", async () => {
  const h = harness();
  await assert.rejects(h.service.import(userId, { version: 1, manifestId: batchId, items: [{ ...item, payloadHash: "forged" }] }), /INVALID_IMPORT/);
});

test("deep import settings are rejected without recursive overflow", async () => {
  const h = harness(); let settings: unknown = "x"; for (let index = 0; index < 12_000; index += 1) settings = [settings];
  await assert.rejects(h.service.import(userId, { version: 1, manifestId: batchId, items: [{ sourceId: "reading-deep", sourceVersion: 1, kind: "reading", source: { bookTitle: "Cloud Book", chapterTitle: null, translationTitle: null }, payload: { paragraphIndex: 0, settings } }] }), (error: unknown) => error instanceof CloudImportError && error.code === "INVALID_IMPORT");
});
