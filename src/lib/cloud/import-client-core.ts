import type { ReaderSelectionCollections } from "../reader/reader-selection-save.ts";
import type { SentenceStudyItem, VocabularyStudyItem } from "../reader/study-collections.ts";
import type { StudyNote } from "../study/study-notes-local.ts";

export const cloudImportMarkerStorageKey = "stray-pages.cloud-import-v1";
export const IMPORT_CHUNK_ITEMS = 1_000;
export const IMPORT_CHUNK_BYTES = 900 * 1024;
export type LocalStudyImportSource = { origin: string; vocabulary: VocabularyStudyItem[]; sentences: SentenceStudyItem[]; notes: StudyNote[]; readerSelections: ReaderSelectionCollections };
export type ClientImportItem = { sourceId: string; sourceVersion: 1; kind: "vocabulary" | "sentence" | "note"; source: { bookTitle: string; chapterTitle: string | null; translationTitle: null } | null; payload: Record<string, string> };

export async function buildLocalStudyImportManifest(input: { sources: LocalStudyImportSource[] }, manifestId: string) {
  const items: ClientImportItem[] = [];
  const seen = new Set<string>();
  let unresolved = 0;
  let localErrors = 0;
  const sourceCounts: Array<{ origin: string; records: number }> = [];
  for (const source of input.sources) {
    let count = 0;
    unresolved += source.readerSelections.vocabularyTexts.length + source.readerSelections.sentenceTexts.length;
    for (const item of source.vocabulary) {
      const identity = `vocabulary\0${item.id}`; if (seen.has(identity)) continue; seen.add(identity);
      if (item.deleted || !item.bookTitle.trim() || item.bookId === "reader-selections") { unresolved += 1; continue; }
      const candidate = { sourceId: await sourceId("vocabulary", source.origin, item.id), sourceVersion: 1 as const, kind: "vocabulary" as const, source: { bookTitle: item.bookTitle.trim(), chapterTitle: item.chapterTitle.trim() || null, translationTitle: null }, payload: { term: item.term, explanation: item.explanation, contextualMean: item.contextualMean, sourceSentence: item.sourceSentence, note: item.note } };
      if (!isLegalClientItem(candidate)) { unresolved += 1; localErrors += 1; continue; }
      items.push(candidate); count += 1;
    }
    for (const item of source.sentences) {
      const identity = `sentence\0${item.id}`; if (seen.has(identity)) continue; seen.add(identity);
      if (item.deleted || !item.bookTitle.trim() || item.bookId === "reader-selections") { unresolved += 1; continue; }
      const candidate = { sourceId: await sourceId("sentence", source.origin, item.id), sourceVersion: 1 as const, kind: "sentence" as const, source: { bookTitle: item.bookTitle.trim(), chapterTitle: item.chapterTitle.trim() || null, translationTitle: null }, payload: { originalText: item.originalText, translatedText: item.translatedText, explanation: item.explanation, note: item.note } };
      if (!isLegalClientItem(candidate)) { unresolved += 1; localErrors += 1; continue; }
      items.push(candidate); count += 1;
    }
    for (const note of source.notes) {
      const identity = `note\0${note.id}`; if (seen.has(identity)) continue; seen.add(identity);
      const candidate = { sourceId: await sourceId("note", source.origin, note.id), sourceVersion: 1 as const, kind: "note" as const, source: null, payload: { title: note.title, content: note.content } };
      if (!isLegalClientItem(candidate)) { unresolved += 1; localErrors += 1; continue; }
      items.push(candidate); count += 1;
    }
    sourceCounts.push({ origin: source.origin, records: count });
  }
  return { items, unresolved, localErrors, sourceCounts, manifest: { version: 1 as const, manifestId, items } };
}

export function buildImportChunks(items: ClientImportItem[], uuid: () => string) {
  const chunks: Array<{ version: 1; manifestId: string; items: ClientImportItem[] }> = [];
  let current: { version: 1; manifestId: string; items: ClientImportItem[] } | null = null;
  for (const item of items) {
    if (!current) current = { version: 1, manifestId: uuid(), items: [] };
    const candidate: { version: 1; manifestId: string; items: ClientImportItem[] } = { ...current, items: [...current.items, item] };
    if (current.items.length >= IMPORT_CHUNK_ITEMS || utf8(JSON.stringify(candidate)) > IMPORT_CHUNK_BYTES) {
      if (current.items.length) chunks.push(current);
      current = { version: 1, manifestId: uuid(), items: [item] };
      if (utf8(JSON.stringify(current)) > IMPORT_CHUNK_BYTES) throw new Error("IMPORT_ITEM_TOO_LARGE");
    } else current = candidate;
  }
  if (current?.items.length) chunks.push(current);
  return chunks;
}
export async function runImportChunks(items: ClientImportItem[], input: { uuid: () => string; send(chunk: ReturnType<typeof buildImportChunks>[number], index: number): Promise<unknown> }) {
  const chunks = buildImportChunks(items, input.uuid); const totals = { created: 0, skipped: 0, conflicts: 0, errors: 0 }; let lastBatchId = "";
  for (let index = 0; index < chunks.length; index += 1) {
    let raw; try { raw = await input.send(chunks[index], index); } catch (error) { return { ok: false as const, failedChunk: index, completedChunks: index, totals, lastBatchId, reason: error instanceof Error ? error.message : "IMPORT_FAILED" }; }
    const result = parseImportChunkResponse(raw, chunks[index]);
    if (!result) return { ok: false as const, failedChunk: index, completedChunks: index, totals, lastBatchId, reason: "INVALID_RESPONSE" };
    for (const key of Object.keys(totals) as Array<keyof typeof totals>) totals[key] += result.counts[key];
    lastBatchId = result.batchId;
    if (!result.complete) return { ok: false as const, failedChunk: index, completedChunks: index, totals, lastBatchId, reason: "PARTIAL" };
  }
  return { ok: true as const, completedChunks: chunks.length, totals, lastBatchId };
}
export function shouldWriteImportMarker(result: { complete: boolean; counts: { created: number; skipped: number; conflicts: number; errors: number } }) { return result.complete && result.counts.conflicts === 0 && result.counts.errors === 0; }

async function sourceId(kind: string, origin: string, rawId: string) {
  const raw = `${kind}\0${origin}\0${rawId}`;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  const hash = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  const prefix = `${kind}-${rawId.normalize("NFKC")}`.replace(/[^A-Za-z0-9._:-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || kind;
  return `${prefix}-${hash}`;
}

function parseImportChunkResponse(raw: unknown, chunk: { manifestId: string; items: ClientImportItem[] }) {
  if (!isRecord(raw) || typeof raw.complete !== "boolean" || typeof raw.batchId !== "string" || !UUID.test(raw.batchId) || raw.manifestId !== chunk.manifestId) return null;
  const rawCounts = raw.counts;
  if (!isRecord(rawCounts)) return null;
  const keys = ["created", "skipped", "conflicts", "errors"] as const;
  if (Object.keys(rawCounts).length !== keys.length || keys.some((key) => !Number.isSafeInteger(rawCounts[key]) || (rawCounts[key] as number) < 0)) return null;
  const counts = Object.fromEntries(keys.map((key) => [key, rawCounts[key] as number])) as Record<typeof keys[number], number>;
  if (keys.reduce((sum, key) => sum + counts[key], 0) !== chunk.items.length) return null;
  if (raw.complete !== (counts.conflicts === 0 && counts.errors === 0)) return null;
  return { complete: raw.complete, batchId: raw.batchId, manifestId: raw.manifestId, counts };
}

function isLegalClientItem(item: ClientImportItem) {
  const required = (value: string, max: number) => Boolean(value.trim()) && utf8(value.trim()) <= max;
  const optional = (value: string, max: number) => utf8(value.trim()) <= max;
  if (item.source && (!required(item.source.bookTitle, 200) || (item.source.chapterTitle !== null && !optional(item.source.chapterTitle, 500)))) return false;
  if (item.kind === "vocabulary") return required(item.payload.term, 200) && required(item.payload.explanation, 4_000) && optional(item.payload.contextualMean, 4_000) && optional(item.payload.sourceSentence, 16_000) && optional(item.payload.note, 4_000);
  if (item.kind === "sentence") return required(item.payload.originalText, 16_000) && optional(item.payload.translatedText, 16_000) && optional(item.payload.explanation, 8_000) && optional(item.payload.note, 4_000);
  return required(item.payload.title, 200) && optional(item.payload.content, 64_000);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function utf8(value: string) { return new TextEncoder().encode(value).byteLength; }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
