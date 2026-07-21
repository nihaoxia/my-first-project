import { validateBoundedJson } from "./bounded-json.ts";

export const MAX_IMPORT_ITEMS = 1_000;
export const MAX_IMPORT_CANONICAL_BYTES = 1024 * 1024;
export type ImportKind = "vocabulary" | "sentence" | "note" | "reading";
export type ImportReceipt = { userId: string; kind: ImportKind; sourceId: string; sourceVersion: number; payloadHash: string; targetId: string };
export type PreparedImportItem = {
  userId: string; kind: ImportKind; sourceId: string; sourceVersion: number; payloadHash: string;
  source: { bookTitle: string; chapterTitle: string | null; translationTitle: string | null } | null;
  payload: Record<string, unknown>;
};
export type ImportOneResult =
  | { outcome: "created" | "skipped" | "conflict"; receipt: ImportReceipt }
  | { outcome: "error"; code: "SOURCE_NOT_FOUND" | "INVALID_TARGET" | "WRITE_FAILED" };
export type ImportBatchSummary = {
  id: string; userId: string; manifestId: string; manifestVersion: number; status: "COMPLETED" | "PARTIAL";
  itemCount: number; createdCount: number; skippedCount: number; conflictCount: number; errorCount: number;
  startedAt: Date; completedAt: Date;
};
export type CloudImportRepository = {
  importOne(input: PreparedImportItem): Promise<ImportOneResult>;
  findReceipt(userId: string, kind: ImportKind, sourceId: string): Promise<ImportReceipt | null>;
  saveBatch(summary: ImportBatchSummary): Promise<ImportBatchSummary>;
  findBatch(userId: string, id: string): Promise<ImportBatchSummary | null>;
};

export class CloudImportError extends Error {
  readonly code: "INVALID_IMPORT" | "IMPORT_FAILED";
  constructor(code: "INVALID_IMPORT" | "IMPORT_FAILED") { super(code); this.code = code; this.name = "CloudImportError"; }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createCloudImportService(input: { repository: CloudImportRepository; uuid?: () => string; now?: () => Date }) {
  const now = input.now ?? (() => new Date());
  const uuid = input.uuid ?? (() => crypto.randomUUID());
  return {
    async import(userId: string, raw: unknown) {
      const manifest = await parseManifest(userId, raw);
      const startedAt = now();
      const details: Array<{ sourceId: string; kind: ImportKind; outcome: "created" | "skipped" | "conflict" | "error"; code?: string }> = [];
      for (const item of manifest.items) {
        try {
          const result = await input.repository.importOne(item);
          details.push(result.outcome === "error" ? { sourceId: item.sourceId, kind: item.kind, outcome: "error", code: result.code } : { sourceId: item.sourceId, kind: item.kind, outcome: result.outcome });
        } catch {
          // A connection can fail after COMMIT. A durable, hash-matching receipt is authoritative.
          const receipt = await input.repository.findReceipt(userId, item.kind, item.sourceId).catch(() => null);
          details.push(receipt?.payloadHash === item.payloadHash
            ? { sourceId: item.sourceId, kind: item.kind, outcome: "created" }
            : { sourceId: item.sourceId, kind: item.kind, outcome: "error", code: "WRITE_FAILED" });
        }
      }
      const counts = {
        created: details.filter((item) => item.outcome === "created").length,
        skipped: details.filter((item) => item.outcome === "skipped").length,
        conflicts: details.filter((item) => item.outcome === "conflict").length,
        errors: details.filter((item) => item.outcome === "error").length,
      };
      const complete = counts.conflicts === 0 && counts.errors === 0;
      const summary: ImportBatchSummary = { id: uuid(), userId, manifestId: manifest.manifestId, manifestVersion: 1, status: complete ? "COMPLETED" : "PARTIAL", itemCount: details.length, createdCount: counts.created, skippedCount: counts.skipped, conflictCount: counts.conflicts, errorCount: counts.errors, startedAt, completedAt: now() };
      let batch: ImportBatchSummary;
      try {
        batch = await input.repository.saveBatch(summary);
      } catch {
        const reconciled = await input.repository.findBatch(userId, summary.id).catch(() => null);
        if (!reconciled) throw new CloudImportError("IMPORT_FAILED");
        batch = reconciled;
      }
      return { batchId: batch.id, manifestId: manifest.manifestId, version: 1 as const, complete, counts, items: details };
    },
  };
}

async function parseManifest(userId: string, raw: unknown) {
  if (!isRecord(raw)) invalid();
  exact(raw, ["version", "manifestId", "items"]);
  if (raw.version !== 1 || typeof raw.manifestId !== "string" || !UUID.test(raw.manifestId) || !Array.isArray(raw.items) || raw.items.length === 0 || raw.items.length > MAX_IMPORT_ITEMS) invalid();
  const seen = new Set<string>();
  const items: PreparedImportItem[] = [];
  let totalBytes = 0;
  for (const rawItem of raw.items) {
    const parsed = parseImportItem(rawItem);
    const identity = `${parsed.kind}\u0000${parsed.sourceId}`;
    if (seen.has(identity)) invalid();
    seen.add(identity);
    const canonical = canonicalImportItem(parsed);
    totalBytes += utf8(canonical);
    if (totalBytes > MAX_IMPORT_CANONICAL_BYTES) invalid();
    items.push({ userId, ...parsed, payloadHash: await sha256(canonical) });
  }
  return { manifestId: raw.manifestId, items };
}

export function parseImportItem(raw: unknown): Omit<PreparedImportItem, "userId" | "payloadHash"> {
  if (!isRecord(raw)) invalid();
  exact(raw, ["sourceId", "sourceVersion", "kind", "source", "payload"]);
  if (typeof raw.sourceId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(raw.sourceId) || !Number.isSafeInteger(raw.sourceVersion) || (raw.sourceVersion as number) < 1 || (raw.sourceVersion as number) > 1_000_000 || !isKind(raw.kind)) invalid();
  const source = parseSource(raw.source, raw.kind);
  const payload = parsePayload(raw.kind, raw.payload);
  return { sourceId: raw.sourceId, sourceVersion: raw.sourceVersion as number, kind: raw.kind, source, payload };
}

export function canonicalImportItem(
  item: Pick<PreparedImportItem, "kind" | "sourceVersion" | "source" | "payload">,
): string {
  return stableJson({
    kind: item.kind,
    sourceVersion: item.sourceVersion,
    source: item.source,
    payload: item.payload,
  });
}

function parseSource(raw: unknown, kind: ImportKind) {
  if (kind === "note" && (raw === undefined || raw === null)) return null;
  if (!isRecord(raw)) invalid();
  exact(raw, ["bookTitle", "chapterTitle", "translationTitle"]);
  const bookTitle = requiredText(raw.bookTitle, 200);
  const chapterTitle = optionalText(raw.chapterTitle, 500);
  const translationTitle = optionalText(raw.translationTitle, 200);
  if (kind !== "reading" && translationTitle) invalid();
  return { bookTitle, chapterTitle, translationTitle };
}

function parsePayload(kind: ImportKind, raw: unknown): Record<string, unknown> {
  if (!isRecord(raw)) invalid();
  if (kind === "vocabulary") { exact(raw, ["term", "explanation", "contextualMean", "sourceSentence", "note"]); return { term: requiredText(raw.term, 200), explanation: requiredText(raw.explanation, 4_000), contextualMean: optionalText(raw.contextualMean, 4_000), sourceSentence: optionalText(raw.sourceSentence, 16_000), note: optionalText(raw.note, 4_000) }; }
  if (kind === "sentence") { exact(raw, ["originalText", "translatedText", "explanation", "note"]); return { originalText: requiredText(raw.originalText, 16_000), translatedText: optionalText(raw.translatedText, 16_000), explanation: optionalText(raw.explanation, 8_000), note: optionalText(raw.note, 4_000) }; }
  if (kind === "note") { exact(raw, ["title", "content"]); return { title: requiredText(raw.title, 200), content: optionalText(raw.content, 64_000) ?? "" }; }
  exact(raw, ["paragraphIndex", "settings"]);
  if (!Number.isSafeInteger(raw.paragraphIndex) || (raw.paragraphIndex as number) < 0 || (raw.paragraphIndex as number) > 1_000_000) invalid();
  const settings = raw.settings === undefined ? null : raw.settings;
  if (settings !== null && (!validateBoundedJson(settings) || utf8(JSON.stringify(settings)) > 16 * 1024)) invalid();
  return { paragraphIndex: raw.paragraphIndex as number, settings };
}

function stableJson(value: unknown): string { if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`; if (isRecord(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`; return JSON.stringify(value); }
async function sha256(value: string) { const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)); return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join(""); }
function exact(value: Record<string, unknown>, allowedKeys: string[]) { const allowed = new Set(allowedKeys); if (Object.keys(value).some((key) => !allowed.has(key))) invalid(); }
function requiredText(value: unknown, max: number) { if (typeof value !== "string" || !value.trim() || utf8(value.trim()) > max) invalid(); return value.trim(); }
function optionalText(value: unknown, max: number) { if (value === undefined || value === null || value === "") return null; if (typeof value !== "string" || utf8(value.trim()) > max) invalid(); return value.trim(); }
function isKind(value: unknown): value is ImportKind { return ["vocabulary", "sentence", "note", "reading"].includes(String(value)); }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function utf8(value: string) { return new TextEncoder().encode(value).byteLength; }
function invalid(): never { throw new CloudImportError("INVALID_IMPORT"); }
