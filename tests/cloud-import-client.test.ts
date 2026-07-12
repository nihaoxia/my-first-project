import assert from "node:assert/strict";
import test from "node:test";
import { buildImportChunks, buildLocalStudyImportManifest, IMPORT_CHUNK_BYTES, runImportChunks, shouldWriteImportMarker } from "../src/lib/cloud/import-client-core.ts";

const manifestId = "11111111-1111-4111-8111-111111111111";
test("builds stable study records without cloud identity or storage data", async () => {
  const result = await buildLocalStudyImportManifest({ sources: [{ origin: "supabase:user-a", vocabulary: [{ id: "v-1", bookTitle: "Book", chapterTitle: "One", term: "threshold", explanation: "boundary", contextualMean: "", sourceSentence: "Here.", note: "", bookId: "local", chapterId: "local", sourceLabel: "x" }], sentences: [], notes: [{ id: "n-1", title: "Note", content: "Body", source: "local", updatedAt: "today" }], readerSelections: { vocabularyTexts: [], sentenceTexts: [] } }] }, manifestId);
  assert.equal(result.manifest.items.length, 2);
  assert.equal(result.unresolved, 0);
  assert.doesNotMatch(JSON.stringify(result.manifest), /userId|storagePath|cloudBookId/);
});

test("does not forge a source mapping for context-free reader selections", async () => {
  const result = await buildLocalStudyImportManifest({ sources: [{ origin: "legacy-unscoped", vocabulary: [], sentences: [], notes: [], readerSelections: { vocabularyTexts: ["orphan"], sentenceTexts: ["No context."] } }] }, manifestId);
  assert.equal(result.manifest.items.length, 0);
  assert.equal(result.unresolved, 2);
});

test("source ids retain collision resistance across long unicode ids and origins", async () => {
  const base = { bookTitle: "Book", chapterTitle: "One", term: "x", explanation: "y", contextualMean: "", sourceSentence: "", note: "", bookId: "local", chapterId: "local", sourceLabel: "x" };
  const result = await buildLocalStudyImportManifest({ sources: [
    { origin: "scope-a", vocabulary: [{ ...base, id: `相同-${"x".repeat(300)}-a` }], sentences: [], notes: [], readerSelections: { vocabularyTexts: [], sentenceTexts: [] } },
    { origin: "scope-b", vocabulary: [{ ...base, id: `相同-${"x".repeat(300)}-b` }], sentences: [], notes: [], readerSelections: { vocabularyTexts: [], sentenceTexts: [] } },
  ] }, manifestId);
  const ids = result.items.map((item) => item.sourceId);
  assert.equal(new Set(ids).size, 2);
  assert.ok(ids.every((id) => /^[A-Za-z0-9._:-]{1,80}-[0-9a-f]{64}$/.test(id)));
});

test("merges current, legacy mock and unscoped sources with current-scope precedence", async () => {
  const note = (content: string) => ({ id: "same-note", title: "N", content, source: "local", updatedAt: "today" });
  const empty = { vocabulary: [], sentences: [], readerSelections: { vocabularyTexts: [], sentenceTexts: [] } };
  const result = await buildLocalStudyImportManifest({ sources: [
    { origin: "current-supabase-scope", ...empty, notes: [note("current")] },
    { origin: "legacy-mock-scope", ...empty, notes: [note("mock")] },
    { origin: "legacy-unscoped", ...empty, notes: [note("unscoped"), { ...note("old"), id: "unscoped-only" }] },
  ] }, manifestId);
  assert.deepEqual(result.items.map((item) => item.payload.content), ["current", "old"]);
  assert.deepEqual(result.sourceCounts.map((item) => item.records), [1, 0, 1]);
});

test("chunks 1001 and 2500 items without starving later records", async () => {
  const notes = Array.from({ length: 2500 }, (_, index) => ({ id: `n-${index}`, title: `N${index}`, content: "x", source: "legacy", updatedAt: "today" }));
  const result = await buildLocalStudyImportManifest({ sources: [{ origin: "legacy", vocabulary: [], sentences: [], notes, readerSelections: { vocabularyTexts: [], sentenceTexts: [] } }] }, manifestId);
  assert.equal(result.items.length, 2500);
  const chunks = buildImportChunks(result.items, () => crypto.randomUUID());
  assert.deepEqual(chunks.map((chunk) => chunk.items.length), [1000, 1000, 500]);
  assert.equal(chunks[2].items[499].payload.title, "N2499");
});

test("executes every chunk and accumulates statistics before allowing a marker", async () => {
  const notes = Array.from({ length: 2500 }, (_, index) => ({ id: `n-${index}`, title: `N${index}`, content: "x", source: "legacy", updatedAt: "today" }));
  const prepared = await buildLocalStudyImportManifest({ sources: [{ origin: "legacy", vocabulary: [], sentences: [], notes, readerSelections: { vocabularyTexts: [], sentenceTexts: [] } }] }, manifestId);
  const sent: number[] = [];
  const result = await runImportChunks(prepared.items, { uuid: () => crypto.randomUUID(), send: async (chunk) => { sent.push(chunk.items.length); return { complete: true, batchId: crypto.randomUUID(), manifestId: chunk.manifestId, counts: { created: chunk.items.length, skipped: 0, conflicts: 0, errors: 0 } }; } });
  assert.deepEqual(sent, [1000, 1000, 500]);
  assert.equal(result.ok, true); assert.equal(result.totals.created, 2500); assert.equal(result.completedChunks, 3);
});

test("chunks obey both item and serialized UTF-8 budgets without dropping legal notes", async () => {
  const notes = Array.from({ length: 80 }, (_, index) => ({ id: `large-${index}`, title: `N${index}`, content: "界".repeat(20_000), source: "legacy", updatedAt: "today" }));
  const prepared = await buildLocalStudyImportManifest({ sources: [{ origin: "legacy", vocabulary: [], sentences: [], notes, readerSelections: { vocabularyTexts: [], sentenceTexts: [] } }] }, manifestId);
  const chunks = buildImportChunks(prepared.items, () => crypto.randomUUID());
  assert.equal(chunks.flatMap((chunk) => chunk.items).length, 80);
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((chunk) => chunk.items.length <= 1_000 && new TextEncoder().encode(JSON.stringify(chunk)).byteLength <= IMPORT_CHUNK_BYTES));
});

test("client rejects an individually illegal local record without blocking legal chunks", async () => {
  const prepared = await buildLocalStudyImportManifest({ sources: [{ origin: "legacy", vocabulary: [], sentences: [], notes: [
    { id: "bad", title: "Bad", content: "x".repeat(64_001), source: "legacy", updatedAt: "today" },
    { id: "good", title: "Good", content: "ok", source: "legacy", updatedAt: "today" },
  ], readerSelections: { vocabularyTexts: [], sentenceTexts: [] } }] }, manifestId);
  assert.deepEqual(prepared.items.map((item) => item.payload.title), ["Good"]);
  assert.equal(prepared.unresolved, 1);
  assert.equal(prepared.localErrors, 1);
});

test("rejects malformed or mismatched successful import responses", async () => {
  const prepared = await buildLocalStudyImportManifest({ sources: [{ origin: "legacy", vocabulary: [], sentences: [], notes: [{ id: "n", title: "N", content: "x", source: "legacy", updatedAt: "today" }], readerSelections: { vocabularyTexts: [], sentenceTexts: [] } }] }, manifestId);
  const invalidResponses: unknown[] = [
    { complete: true, batchId: "not-a-uuid", manifestId, counts: { created: 1, skipped: 0, conflicts: 0, errors: 0 } },
    { complete: true, batchId: crypto.randomUUID(), manifestId: crypto.randomUUID(), counts: { created: 1, skipped: 0, conflicts: 0, errors: 0 } },
    { complete: true, batchId: crypto.randomUUID(), manifestId, counts: { created: 0, skipped: 0, conflicts: 0, errors: 0 } },
    { complete: true, batchId: crypto.randomUUID(), manifestId, counts: { created: 0, skipped: 0, conflicts: 1, errors: 0 } },
    { complete: false, batchId: crypto.randomUUID(), manifestId, counts: { created: 1, skipped: 0, conflicts: 0, errors: 0 } },
  ];
  for (const invalid of invalidResponses) {
    const result = await runImportChunks(prepared.items, { uuid: () => manifestId, send: async () => invalid });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "INVALID_RESPONSE");
  }
});

test("writes the local completion marker only for a genuinely complete response", () => {
  assert.equal(shouldWriteImportMarker({ complete: true, counts: { created: 1, skipped: 0, conflicts: 0, errors: 0 } }), true);
  assert.equal(shouldWriteImportMarker({ complete: false, counts: { created: 1, skipped: 0, conflicts: 0, errors: 1 } }), false);
  assert.equal(shouldWriteImportMarker({ complete: true, counts: { created: 0, skipped: 0, conflicts: 1, errors: 0 } }), false);
});
