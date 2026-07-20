import { validateBoundedJson } from "./bounded-json.ts";

export type CloudStudyKind = "vocabulary" | "sentence" | "note" | "reading";
export type CloudNoteTargetType = "FREEFORM" | "ORIGINAL_BOOK" | "CHAPTER" | "TRANSLATED_BOOK";

type CommonRecord = { id: string; userId: string; kind: CloudStudyKind; createdAt?: Date; updatedAt: Date };
export type CloudStudyRecord = CommonRecord & Record<string, unknown> & {
  originalBookId?: string | null; translatedBookId?: string | null; chapterId?: string | null;
};
export type OriginalSource = { originalBookId: string; bookTitle: string; chapterId: string | null; chapterTitle: string | null };
export type TranslatedSource = { translatedBookId: string; title: string; originalBookId: string; chapterId: string | null; chapterTitle: string | null };

export type CloudStudyRepository = {
  resolveOriginalSource(userId: string, originalBookId: string, chapterId: string | null): Promise<OriginalSource | null>;
  resolveTranslatedSource(userId: string, translatedBookId: string, chapterId: string | null): Promise<TranslatedSource | null>;
  list(userId: string, kind: CloudStudyKind, bookId: string | undefined, page: { limit: number; cursor?: string }): Promise<{ items: CloudStudyRecord[]; nextCursor: string | null }>;
  create(record: CloudStudyRecord): Promise<CloudStudyRecord>;
  update(userId: string, id: string, data: Record<string, unknown>): Promise<CloudStudyRecord | null>;
  delete(userId: string, id: string, kind: CloudStudyKind): Promise<boolean>;
  upsertReading(record: CloudStudyRecord): Promise<CloudStudyRecord | null>;
};

export type CloudStudyErrorCode = "INVALID_STUDY_INPUT" | "SOURCE_NOT_FOUND" | "STUDY_ITEM_NOT_FOUND" | "STUDY_CONFLICT" | "STUDY_EXPORT_LIMIT";
export class CloudStudyError extends Error {
  readonly code: CloudStudyErrorCode;
  constructor(code: CloudStudyErrorCode) { super(code); this.code = code; this.name = "CloudStudyError"; }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_PARAGRAPH_INDEX = 1_000_000;
const MAX_SETTINGS_BYTES = 16 * 1024;
export const MAX_STUDY_EXPORT_ITEMS = 10_000;

export function createCloudStudyService(input: { repository: CloudStudyRepository; uuid?: () => string; now?: () => Date }) {
  const uuid = input.uuid ?? (() => crypto.randomUUID());
  const now = input.now ?? (() => new Date());
  return {
    async list(userId: string, raw: unknown) {
      const filter = parseList(raw);
      const page = await input.repository.list(userId, filter.kind, filter.bookId, { limit: filter.limit, ...(filter.cursor ? { cursor: filter.cursor } : {}) });
      return { items: page.items.map(toStudyDto), nextCursor: page.nextCursor };
    },
    async create(userId: string, raw: unknown) {
      const parsed = parseCreate(raw);
      if (parsed.kind === "reading") return this.upsertReading(userId, raw);
      const timestamp = now();
      let record: CloudStudyRecord;
      if (parsed.kind === "vocabulary" || parsed.kind === "sentence") {
        const source = await input.repository.resolveOriginalSource(userId, parsed.originalBookId, parsed.chapterId);
        if (!source) throw new CloudStudyError("SOURCE_NOT_FOUND");
        record = { ...parsed, ...source, id: uuid(), userId, createdAt: timestamp, updatedAt: timestamp };
      } else {
        const target = await resolveNoteTarget(input.repository, userId, parsed.target);
        record = { id: uuid(), userId, kind: "note", title: parsed.title, content: parsed.content, ...target, createdAt: timestamp, updatedAt: timestamp };
      }
      try { return toStudyDto(await input.repository.create(record)); }
      catch (error) { if (isUniqueError(error)) throw new CloudStudyError("STUDY_CONFLICT"); throw error; }
    },
    async update(userId: string, id: string, raw: unknown) {
      if (!UUID.test(id)) throw new CloudStudyError("STUDY_ITEM_NOT_FOUND");
      const parsed = parseUpdate(raw);
      const row = await input.repository.update(userId, id, parsed);
      if (!row || row.kind !== parsed.kind) throw new CloudStudyError("STUDY_ITEM_NOT_FOUND");
      return toStudyDto(row);
    },
    async delete(userId: string, id: string, kind: unknown) {
      if (!UUID.test(id) || !isKind(kind)) throw new CloudStudyError("STUDY_ITEM_NOT_FOUND");
      if (!(await input.repository.delete(userId, id, kind))) throw new CloudStudyError("STUDY_ITEM_NOT_FOUND");
      return { deleted: true as const };
    },
    async upsertReading(userId: string, raw: unknown) {
      const parsed = parseReading(raw);
      const timestamp = now();
      let source: OriginalSource | TranslatedSource | null;
      if (parsed.originalBookId) source = await input.repository.resolveOriginalSource(userId, parsed.originalBookId, parsed.chapterId);
      else source = await input.repository.resolveTranslatedSource(userId, parsed.translatedBookId!, parsed.chapterId);
      if (!source) throw new CloudStudyError("SOURCE_NOT_FOUND");
      const record: CloudStudyRecord = {
        id: uuid(), userId, kind: "reading", originalBookId: parsed.originalBookId,
        translatedBookId: parsed.translatedBookId, chapterId: source.chapterId,
        paragraphIndex: parsed.paragraphIndex, settings: parsed.settings, updatedAt: timestamp,
        bookTitle: "bookTitle" in source ? source.bookTitle : source.title,
        chapterTitle: source.chapterTitle,
      };
      let updated: CloudStudyRecord | null;
      try { updated = await input.repository.upsertReading({ ...record, expectedVersion: parsed.expectedVersion }); }
      catch (error) { if (isUniqueError(error)) throw new CloudStudyError("STUDY_CONFLICT"); throw error; }
      if (!updated) throw new CloudStudyError("STUDY_CONFLICT");
      return toStudyDto(updated);
    },
  };
}

export async function listAllStudyItemsForExport(service: { list(userId: string, raw: unknown): Promise<{ items: Array<Record<string, unknown>>; nextCursor: string | null }> }, userId: string, kind: "vocabulary" | "sentence" | "note") {
  const items: Array<Record<string, unknown>> = [];
  let cursor: string | undefined;
  for (;;) {
    const page = await service.list(userId, { kind, limit: 100, ...(cursor ? { cursor } : {}) });
    if (items.length + page.items.length > MAX_STUDY_EXPORT_ITEMS || (items.length + page.items.length === MAX_STUDY_EXPORT_ITEMS && page.nextCursor)) throw new CloudStudyError("STUDY_EXPORT_LIMIT");
    items.push(...page.items);
    if (!page.nextCursor) return items;
    cursor = page.nextCursor;
  }
}

async function resolveNoteTarget(repository: CloudStudyRepository, userId: string, target: NoteTarget) {
  if (target.type === "freeform") return { targetType: "FREEFORM" as const, originalBookId: null, translatedBookId: null, chapterId: null, targetLabel: "" };
  if (target.type === "translatedBook") {
    const source = await repository.resolveTranslatedSource(userId, target.translatedBookId, null);
    if (!source) throw new CloudStudyError("SOURCE_NOT_FOUND");
    return { targetType: "TRANSLATED_BOOK" as const, originalBookId: null, translatedBookId: source.translatedBookId, chapterId: null, targetLabel: source.title };
  }
  const source = await repository.resolveOriginalSource(userId, target.originalBookId, target.type === "chapter" ? target.chapterId : null);
  if (!source) throw new CloudStudyError("SOURCE_NOT_FOUND");
  return target.type === "chapter"
    ? { targetType: "CHAPTER" as const, originalBookId: source.originalBookId, translatedBookId: null, chapterId: source.chapterId, targetLabel: `${source.bookTitle} · ${source.chapterTitle ?? ""}` }
    : { targetType: "ORIGINAL_BOOK" as const, originalBookId: source.originalBookId, translatedBookId: null, chapterId: null, targetLabel: source.bookTitle };
}

type NoteTarget = { type: "freeform" } | { type: "originalBook"; originalBookId: string } | { type: "chapter"; originalBookId: string; chapterId: string } | { type: "translatedBook"; translatedBookId: string };
type ParsedCreate =
  | { kind: "vocabulary"; originalBookId: string; chapterId: string | null; term: string; explanation: string; contextualMean: string | null; sourceSentence: string | null; note: string | null }
  | { kind: "sentence"; originalBookId: string; chapterId: string | null; originalText: string; translatedText: string | null; explanation: string | null; note: string | null }
  | { kind: "note"; title: string; content: string; target: NoteTarget }
  | ReturnType<typeof parseReading>;

function parseCreate(raw: unknown): ParsedCreate {
  if (!isRecord(raw) || !isKind(raw.kind)) invalid();
  if (raw.kind === "vocabulary") {
    exact(raw, ["kind", "originalBookId", "chapterId", "term", "explanation", "contextualMean", "sourceSentence", "note"]);
    return { kind: "vocabulary", originalBookId: requiredUuid(raw.originalBookId), chapterId: optionalUuid(raw.chapterId), term: text(raw.term, 200, true), explanation: text(raw.explanation, 4_000, true), contextualMean: optionalText(raw.contextualMean, 4_000), sourceSentence: optionalText(raw.sourceSentence, 16_000), note: optionalText(raw.note, 4_000) };
  }
  if (raw.kind === "sentence") {
    exact(raw, ["kind", "originalBookId", "chapterId", "originalText", "translatedText", "explanation", "note"]);
    return { kind: "sentence", originalBookId: requiredUuid(raw.originalBookId), chapterId: optionalUuid(raw.chapterId), originalText: text(raw.originalText, 16_000, true), translatedText: optionalText(raw.translatedText, 16_000), explanation: optionalText(raw.explanation, 8_000), note: optionalText(raw.note, 4_000) };
  }
  if (raw.kind === "note") {
    exact(raw, ["kind", "title", "content", "target"]);
    return { kind: "note", title: text(raw.title, 200, true), content: text(raw.content, 64_000, false), target: parseTarget(raw.target) };
  }
  return parseReading(raw);
}

function parseReading(raw: unknown) {
  if (!isRecord(raw) || raw.kind !== "reading") invalid();
  exact(raw, ["kind", "originalBookId", "translatedBookId", "chapterId", "paragraphIndex", "settings", "expectedVersion"]);
  const originalBookId = optionalUuid(raw.originalBookId);
  const translatedBookId = optionalUuid(raw.translatedBookId);
  if ((originalBookId === null) === (translatedBookId === null)) invalid();
  if (!Number.isSafeInteger(raw.paragraphIndex) || (raw.paragraphIndex as number) < 0 || (raw.paragraphIndex as number) > MAX_PARAGRAPH_INDEX) invalid();
  if (!Number.isSafeInteger(raw.expectedVersion) || (raw.expectedVersion as number) < 0) invalid();
  const settings: unknown = raw.settings === undefined ? null : raw.settings;
  if (settings !== null && (!validateBoundedJson(settings) || utf8(JSON.stringify(settings)) > MAX_SETTINGS_BYTES)) invalid();
  return { kind: "reading" as const, originalBookId, translatedBookId, chapterId: optionalUuid(raw.chapterId), paragraphIndex: raw.paragraphIndex as number, settings, expectedVersion: raw.expectedVersion as number };
}

function parseUpdate(raw: unknown) {
  if (!isRecord(raw) || !["vocabulary", "sentence", "note"].includes(String(raw.kind))) invalid();
  if (raw.kind === "vocabulary") { exact(raw, ["kind", "term", "explanation", "contextualMean", "sourceSentence", "note"]); return compact({ kind: "vocabulary", term: maybeText(raw.term, 200, true), explanation: maybeText(raw.explanation, 4_000, true), contextualMean: maybeText(raw.contextualMean, 4_000), sourceSentence: maybeText(raw.sourceSentence, 16_000), note: maybeText(raw.note, 4_000) }); }
  if (raw.kind === "sentence") { exact(raw, ["kind", "originalText", "translatedText", "explanation", "note"]); return compact({ kind: "sentence", originalText: maybeText(raw.originalText, 16_000, true), translatedText: maybeText(raw.translatedText, 16_000), explanation: maybeText(raw.explanation, 8_000), note: maybeText(raw.note, 4_000) }); }
  exact(raw, ["kind", "title", "content"]); return compact({ kind: "note", title: maybeText(raw.title, 200, true), content: maybeText(raw.content, 64_000) });
}

function parseList(raw: unknown) {
  if (!isRecord(raw) || !isKind(raw.kind)) invalid();
  exact(raw, ["kind", "bookId", "limit", "cursor"]);
  const numericLimit = raw.limit === undefined ? 50 : typeof raw.limit === "string" && /^\d+$/.test(raw.limit) ? Number(raw.limit) : raw.limit;
  if (!Number.isSafeInteger(numericLimit) || (numericLimit as number) < 1 || (numericLimit as number) > 100) invalid();
  return { kind: raw.kind, bookId: raw.bookId === undefined ? undefined : requiredUuid(raw.bookId), limit: numericLimit as number, cursor: raw.cursor === undefined ? undefined : requiredUuid(raw.cursor) };
}
function parseTarget(raw: unknown): NoteTarget { if (!isRecord(raw) || typeof raw.type !== "string") invalid(); if (raw.type === "freeform") { exact(raw, ["type"]); return { type: "freeform" }; } if (raw.type === "originalBook") { exact(raw, ["type", "originalBookId"]); return { type: "originalBook", originalBookId: requiredUuid(raw.originalBookId) }; } if (raw.type === "chapter") { exact(raw, ["type", "originalBookId", "chapterId"]); return { type: "chapter", originalBookId: requiredUuid(raw.originalBookId), chapterId: requiredUuid(raw.chapterId) }; } if (raw.type === "translatedBook") { exact(raw, ["type", "translatedBookId"]); return { type: "translatedBook", translatedBookId: requiredUuid(raw.translatedBookId) }; } invalid(); }

export function toStudyDto(row: CloudStudyRecord): Record<string, unknown> { const kind = row.kind; const allowed = kind === "vocabulary" ? ["id", "kind", "originalBookId", "chapterId", "term", "explanation", "contextualMean", "sourceSentence", "note", "bookTitle", "chapterTitle", "createdAt", "updatedAt"] : kind === "sentence" ? ["id", "kind", "originalBookId", "chapterId", "originalText", "translatedText", "explanation", "note", "bookTitle", "chapterTitle", "createdAt", "updatedAt"] : kind === "note" ? ["id", "kind", "title", "content", "targetType", "originalBookId", "translatedBookId", "chapterId", "targetLabel", "createdAt", "updatedAt"] : ["id", "kind", "originalBookId", "translatedBookId", "chapterId", "paragraphIndex", "settings", "version", "bookTitle", "chapterTitle", "updatedAt"]; const source: Record<string, unknown> = { ...row }; delete source.userId; delete source.expectedVersion; return Object.fromEntries(allowed.filter((key) => key in source).map((key) => [key, source[key]])); }
function exact(value: Record<string, unknown>, keys: string[]) { const allowed = new Set(keys); if (Object.keys(value).some((key) => !allowed.has(key))) invalid(); }
function requiredUuid(value: unknown) { if (typeof value !== "string" || !UUID.test(value)) invalid(); return value; }
function optionalUuid(value: unknown) { if (value === undefined || value === null || value === "") return null; return requiredUuid(value); }
function text(value: unknown, max: number, nonempty: boolean) { if (typeof value !== "string") invalid(); const result = value.trim(); if ((nonempty && !result) || utf8(result) > max) invalid(); return result; }
function optionalText(value: unknown, max: number) { return value === undefined || value === null ? null : text(value, max, false); }
function maybeText(value: unknown, max: number, nonempty = false) { return value === undefined ? undefined : text(value, max, nonempty); }
function compact(value: Record<string, unknown>) { const entries = Object.entries(value).filter(([, item]) => item !== undefined); if (entries.length <= 1) invalid(); return Object.fromEntries(entries); }
function isKind(value: unknown): value is CloudStudyKind { return ["vocabulary", "sentence", "note", "reading"].includes(String(value)); }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function utf8(value: string) { return new TextEncoder().encode(value).byteLength; }
function isUniqueError(error: unknown) { return isRecord(error) && error.code === "P2002"; }
function invalid(): never { throw new CloudStudyError("INVALID_STUDY_INPUT"); }
