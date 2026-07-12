import assert from "node:assert/strict";
import test from "node:test";

import {
  CloudStudyError,
  createCloudStudyService,
  listAllStudyItemsForExport,
  type CloudStudyRecord,
  type CloudStudyRepository,
} from "../src/lib/cloud/study-core.ts";

const userId = "11111111-1111-4111-8111-111111111111";
const otherUserId = "99999999-9999-4999-8999-999999999999";
const bookId = "22222222-2222-4222-8222-222222222222";
const chapterId = "33333333-3333-4333-8333-333333333333";
const translatedBookId = "44444444-4444-4444-8444-444444444444";
const itemId = "55555555-5555-4555-8555-555555555555";

function harness() {
  const rows = new Map<string, CloudStudyRecord>();
  const sources = new Map([
    [`${userId}:${bookId}:${chapterId}`, { originalBookId: bookId, bookTitle: "Cloud Book", chapterId, chapterTitle: "Chapter 1" }],
    [`${userId}:${bookId}:`, { originalBookId: bookId, bookTitle: "Cloud Book", chapterId: null, chapterTitle: null }],
  ]);
  const repository: CloudStudyRepository = {
    async resolveOriginalSource(owner, originalBookId, sourceChapterId) {
      return sources.get(`${owner}:${originalBookId}:${sourceChapterId ?? ""}`) ?? null;
    },
    async resolveTranslatedSource(owner, id, sourceChapterId) {
      return owner === userId && id === translatedBookId && (!sourceChapterId || sourceChapterId === chapterId)
        ? { translatedBookId, title: "Cloud Translation", originalBookId: bookId, chapterId: sourceChapterId ?? null, chapterTitle: sourceChapterId ? "Chapter 1" : null }
        : null;
    },
    async list(owner, kind, bookId, page) {
      const filtered = [...rows.values()].filter((row) => row.userId === owner && row.kind === kind && (!bookId || row.originalBookId === bookId || row.translatedBookId === bookId)).sort((a, b) => a.id.localeCompare(b.id));
      const start = page.cursor ? filtered.findIndex((row) => row.id === page.cursor) + 1 : 0;
      const items = filtered.slice(start, start + page.limit);
      return { items, nextCursor: filtered.length > start + page.limit ? items.at(-1)?.id ?? null : null };
    },
    async create(record) { rows.set(record.id, record); return record; },
    async update(owner, id, data) { const row = rows.get(id); if (!row || row.userId !== owner) return null; const next = { ...row, ...data, updatedAt: new Date("2026-07-12T01:00:00Z") } as CloudStudyRecord; rows.set(id, next); return next; },
    async delete(owner, id, kind) { const row = rows.get(id); if (!row || row.userId !== owner || row.kind !== kind) return false; rows.delete(id); return true; },
    async upsertReading(record) {
      const existing = [...rows.values()].find((row) => row.kind === "reading" && row.userId === record.userId && row.originalBookId === record.originalBookId && row.translatedBookId === record.translatedBookId);
      if (existing && existing.version !== record.expectedVersion) return null;
      if (!existing && record.expectedVersion !== 0) return null;
      const next = { ...(existing ?? record), ...record, id: existing?.id ?? record.id, version: Number(existing?.version ?? 0) + (existing ? 1 : 0) } as CloudStudyRecord;
      rows.set(next.id, next); return next;
    },
  };
  return { rows, service: createCloudStudyService({ repository, uuid: () => itemId, now: () => new Date("2026-07-12T00:00:00Z") }) };
}

test("creates owner-scoped vocabulary and emits a DTO without userId", async () => {
  const h = harness();
  const dto = await h.service.create(userId, {
    kind: "vocabulary", originalBookId: bookId, chapterId, term: " threshold ", explanation: "boundary", contextualMean: "entry boundary", sourceSentence: "At the threshold.", note: "review",
  });
  assert.equal(dto.term, "threshold");
  assert.equal(dto.bookTitle, "Cloud Book");
  assert.equal("userId" in dto, false);
  assert.equal(h.rows.get(itemId)?.userId, userId);
});

test("rejects cross-book chapters and caller-supplied identity", async () => {
  const h = harness();
  await assert.rejects(h.service.create(userId, { kind: "sentence", originalBookId: bookId, chapterId: "66666666-6666-4666-8666-666666666666", originalText: "No." }), (error: unknown) => error instanceof CloudStudyError && error.code === "SOURCE_NOT_FOUND");
  await assert.rejects(h.service.create(userId, { kind: "sentence", originalBookId: bookId, chapterId, originalText: "No.", userId: otherUserId }), /INVALID_STUDY_INPUT/);
  await assert.rejects(h.service.create(userId, { kind: "note", title: "x", content: "y", userId }), /INVALID_STUDY_INPUT/);
});

test("all mutations are owner scoped and use indistinguishable not-found errors", async () => {
  const h = harness();
  await h.service.create(userId, { kind: "note", title: "Private", content: "Body", target: { type: "freeform" } });
  await assert.rejects(h.service.update(otherUserId, itemId, { kind: "note", title: "stolen" }), (error: unknown) => error instanceof CloudStudyError && error.code === "STUDY_ITEM_NOT_FOUND");
  await assert.rejects(h.service.delete(otherUserId, itemId, "note"), /STUDY_ITEM_NOT_FOUND/);
  assert.equal(h.rows.get(itemId)?.userId, userId);
});

test("upserts one reading state per book and validates XOR, chapter ownership and paragraph bounds", async () => {
  const h = harness();
  const first = await h.service.upsertReading(userId, { kind: "reading", originalBookId: bookId, chapterId, paragraphIndex: 3, settings: { fontSize: 18 }, expectedVersion: 0 });
  const second = await h.service.upsertReading(userId, { kind: "reading", originalBookId: bookId, chapterId, paragraphIndex: 4, settings: { fontSize: 20 }, expectedVersion: 0 });
  assert.equal(first.id, second.id);
  assert.equal(second.paragraphIndex, 4);
  assert.equal([...h.rows.values()].filter((row) => row.kind === "reading").length, 1);
  for (const invalid of [
    { kind: "reading", paragraphIndex: 0, expectedVersion: 0 },
    { kind: "reading", originalBookId: bookId, translatedBookId, paragraphIndex: 0, expectedVersion: 0 },
    { kind: "reading", originalBookId: bookId, chapterId, paragraphIndex: -1, expectedVersion: 0 },
    { kind: "reading", originalBookId: bookId, chapterId, paragraphIndex: 1_000_001, expectedVersion: 0 },
  ]) await assert.rejects(h.service.upsertReading(userId, invalid), /INVALID_STUDY_INPUT/);
});

test("strictly validates kinds, UUIDs, extra fields and bounded text/settings", async () => {
  const h = harness();
  for (const invalid of [
    { kind: "vocabulary", originalBookId: "../book", term: "x", explanation: "y" },
    { kind: "vocabulary", originalBookId: bookId, term: "", explanation: "y" },
    { kind: "sentence", originalBookId: bookId, originalText: "x", unexpected: true },
    { kind: "note", title: "x".repeat(201), content: "y", target: { type: "freeform" } },
    { kind: "reading", originalBookId: bookId, paragraphIndex: 0, settings: { blob: "x".repeat(20_000) }, expectedVersion: 0 },
  ]) await assert.rejects(h.service.create(userId, invalid), /INVALID_STUDY_INPUT/);
});

test("lists persisted reading state so a refreshed reader can restore it", async () => {
  const h = harness();
  await h.service.upsertReading(userId, { kind: "reading", translatedBookId, chapterId, paragraphIndex: 7, settings: { theme: "dark" }, expectedVersion: 0 });
  const page = await h.service.list(userId, { kind: "reading", bookId: translatedBookId });
  assert.equal(page.items[0].paragraphIndex, 7);
  assert.deepEqual(page.items[0].settings, { theme: "dark" });
});

test("lists stable bounded pages and rejects invalid pagination", async () => {
  const h = harness();
  for (let index = 0; index < 3; index += 1) {
    const id = `55555555-5555-4555-8555-55555555555${index}`;
    h.rows.set(id, { id, userId, kind: "note", title: `N${index}`, content: "", updatedAt: new Date() });
  }
  const first = await h.service.list(userId, { kind: "note", limit: 2 });
  assert.equal(first.items.length, 2); assert.equal(first.nextCursor, first.items[1].id);
  const second = await h.service.list(userId, { kind: "note", limit: 2, cursor: first.nextCursor });
  assert.equal(second.items.length, 1); assert.equal(second.nextCursor, null);
  for (const invalid of [{ kind: "note", limit: 0 }, { kind: "note", limit: 101 }, { kind: "note", cursor: "bad" }, { kind: "note", unknown: true }]) await assert.rejects(h.service.list(userId, invalid), /INVALID_STUDY_INPUT/);
});

test("bounded cloud export follows every cursor page and rejects data beyond 10000 items", async () => {
  const pages = new Map<string | undefined, { items: Array<Record<string, unknown>>; nextCursor: string | null }>([
    [undefined, { items: [{ id: "a" }], nextCursor: itemId }],
    [itemId, { items: [{ id: "b" }], nextCursor: null }],
  ]);
  const all = await listAllStudyItemsForExport({ list: async (_owner, raw) => pages.get((raw as { cursor?: string }).cursor)! }, userId, "vocabulary");
  assert.deepEqual(all.map((row) => row.id), ["a", "b"]);

  let page = 0;
  await assert.rejects(listAllStudyItemsForExport({ list: async () => {
    page += 1;
    return { items: Array.from({ length: 100 }, (_, index) => ({ id: `${page}-${index}` })), nextCursor: itemId };
  } }, userId, "sentence"), (error: unknown) => error instanceof CloudStudyError && error.code === "STUDY_EXPORT_LIMIT");
  assert.equal(page, 100);
});

test("reading updates use optimistic versions and reject stale writes", async () => {
  const h = harness();
  const created = await h.service.upsertReading(userId, { kind: "reading", originalBookId: bookId, chapterId, paragraphIndex: 1, expectedVersion: 0 });
  assert.equal(created.version, 0);
  const updated = await h.service.upsertReading(userId, { kind: "reading", originalBookId: bookId, chapterId, paragraphIndex: 2, expectedVersion: 0 });
  assert.equal(updated.version, 1);
  await assert.rejects(h.service.upsertReading(userId, { kind: "reading", originalBookId: bookId, chapterId, paragraphIndex: 3, expectedVersion: 0 }), (error: unknown) => error instanceof CloudStudyError && error.code === "STUDY_CONFLICT");
});

test("extreme settings depth is a stable validation error rather than a RangeError", async () => {
  const h = harness(); let settings: unknown = "x"; for (let index = 0; index < 12_000; index += 1) settings = [settings];
  await assert.rejects(h.service.upsertReading(userId, { kind: "reading", originalBookId: bookId, paragraphIndex: 0, expectedVersion: 0, settings }), (error: unknown) => error instanceof CloudStudyError && error.code === "INVALID_STUDY_INPUT");
});
