import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";
import type { AuthoritativeBlobStore } from "../edgeone/blob-store-core.ts";
import type {
  CloudImportRepository, ImportBatchSummary, ImportKind, ImportOneResult,
  ImportReceipt, PreparedImportItem,
} from "./import-core.ts";
import { canonicalImportItem, MAX_IMPORT_ITEMS, parseImportItem } from "./import-core.ts";

type StoredBatch = Omit<ImportBatchSummary, "startedAt" | "completedAt"> & { startedAt: string; completedAt: string };
type ImportClaim = ImportReceipt & {
  version: 1;
  createdAt: string;
  source: PreparedImportItem["source"];
  payload: PreparedImportItem["payload"];
};
type TargetFailure = { ok: false; code: "SOURCE_NOT_FOUND" | "INVALID_TARGET" | "WRITE_FAILED" };
type PreparedTarget = {
  ok: true;
  targetId: string;
  ensure(): Promise<{ ok: true; targetId: string; created: boolean } | TargetFailure>;
};
type FinalizedImportResult = Exclude<ImportOneResult, { outcome: "error" }>;

export class EdgeOneImportRepositoryError extends Error {
  readonly code: "IMPORT_RECEIPT_INVALID" | "IMPORT_BATCH_CONFLICT";
  constructor(code: "IMPORT_RECEIPT_INVALID" | "IMPORT_BATCH_CONFLICT") { super(code); this.code = code; this.name = "EdgeOneImportRepositoryError"; }
}

export function createEdgeOneImportRepository(input: {
  blob: AuthoritativeBlobStore;
  uuid: () => string;
  now?: () => Date;
  targetExists(userId: string, kind: ImportKind, targetId: string): Promise<boolean>;
  prepareTarget(item: PreparedImportItem, target: { createdAt: Date }): Promise<PreparedTarget | TargetFailure>;
}): CloudImportRepository {
  const now = input.now ?? (() => new Date());
  const identity = (userId: string, kind: ImportKind, sourceId: string) => stableIdentity(userId, kind, sourceId);
  const claimKey = (item: Pick<PreparedImportItem, "userId" | "kind" | "sourceId">) => `imports/${item.userId}/claims/${identity(item.userId, item.kind, item.sourceId)}.json`;
  const receiptKey = (item: Pick<PreparedImportItem, "userId" | "kind" | "sourceId">) => `imports/${item.userId}/receipts/${identity(item.userId, item.kind, item.sourceId)}.json`;

  async function getClaim(item: Pick<PreparedImportItem, "userId" | "kind" | "sourceId">): Promise<ImportClaim | null> {
    const raw = await input.blob.getJSON<unknown>(claimKey(item));
    return raw === null ? null : parseClaim(raw, item);
  }

  async function getReceipt(item: Pick<PreparedImportItem, "userId" | "kind" | "sourceId">): Promise<ImportReceipt | null> {
    const raw = await input.blob.getJSON<unknown>(receiptKey(item));
    if (raw === null) return null;
    const receipt = parseReceipt(raw, item);
    if (!(await input.targetExists(receipt.userId, receipt.kind, receipt.targetId))) invalid();
    return receipt;
  }

  async function finalize(item: PreparedImportItem, claim: ImportClaim): Promise<FinalizedImportResult> {
    const receipt = receiptFromClaim(claim);
    try {
      await input.blob.createJSON(receiptKey(item), receipt);
      return { outcome: "created", receipt };
    } catch (error) {
      const reconciled = await getReceipt(item).catch((cause) => { throw cause; });
      if (!reconciled) throw error;
      return { outcome: reconciled.payloadHash === item.payloadHash ? "skipped" : "conflict", receipt: reconciled };
    }
  }

  return {
    async importOne(item): Promise<ImportOneResult> {
      const receipt = await getReceipt(item);
      if (receipt) return { outcome: receipt.payloadHash === item.payloadHash ? "skipped" : "conflict", receipt };

      let claimState: { claim: ImportClaim; prepared: PreparedTarget | null };
      const existingClaim = await getClaim(item);
      if (existingClaim) {
        claimState = { claim: existingClaim, prepared: null };
      } else {
        const createdAt = now();
        if (Number.isNaN(createdAt.getTime())) invalid();
        const initialPrepared = await input.prepareTarget(item, { createdAt });
        if (!initialPrepared.ok) return { outcome: "error", code: initialPrepared.code };
        const candidate: ImportClaim = {
          version: 1, userId: item.userId, kind: item.kind, sourceId: item.sourceId,
          sourceVersion: item.sourceVersion, payloadHash: item.payloadHash,
          targetId: initialPrepared.targetId, createdAt: createdAt.toISOString(),
          source: item.source, payload: item.payload,
        };
        try {
          await input.blob.createJSON(claimKey(item), candidate);
          claimState = { claim: candidate, prepared: initialPrepared };
        } catch (error) {
          const raced = await getClaim(item);
          if (!raced) throw error;
          claimState = { claim: raced, prepared: null };
        }
      }

      const claim = claimState.claim;
      const claimedItem = itemFromClaim(claim);
      const requestedDifferentClaim = claim.payloadHash !== item.payloadHash || claim.sourceVersion !== item.sourceVersion;
      let prepared = claimState.prepared;
      if (!prepared) {
        const createdAt = new Date(claim.createdAt);
        const candidate = await input.prepareTarget(claimedItem, { createdAt });
        if (!candidate.ok) return { outcome: "error", code: candidate.code };
        prepared = candidate;
      }
      if (prepared.targetId !== claim.targetId) invalid();
      const target = await prepared.ensure();
      if (!target.ok) return { outcome: "error", code: target.code };
      if (target.targetId !== claim.targetId || !(await input.targetExists(claim.userId, claim.kind, claim.targetId))) invalid();
      const finalized = await finalize(claimedItem, claim);
      return requestedDifferentClaim ? { outcome: "conflict", receipt: finalized.receipt } : finalized;
    },
    findReceipt(userId, kind, sourceId) { return getReceipt({ userId, kind, sourceId }); },
    async saveBatch(summary) {
      const key = `imports/${summary.userId}/batches/${summary.id}.json`;
      const stored: StoredBatch = { ...summary, startedAt: summary.startedAt.toISOString(), completedAt: summary.completedAt.toISOString() };
      parseBatch(stored, summary.userId, summary.id);
      try { await input.blob.createJSON(key, stored); }
      catch (error) {
        if ((error as { code?: string }).code === "BLOB_ALREADY_EXISTS") throw new EdgeOneImportRepositoryError("IMPORT_BATCH_CONFLICT");
        throw error;
      }
      return summary;
    },
    async findBatch(userId, id) {
      const value = await input.blob.getJSON<unknown>(`imports/${userId}/batches/${id}.json`);
      return value === null ? null : parseBatch(value, userId, id);
    },
  };
}

function stableIdentity(userId: string, kind: string, sourceId: string): string {
  return bytesToHex(sha256(utf8ToBytes(`${userId}\u0000${kind}\u0000${sourceId}`)));
}

function parseClaim(raw: unknown, expected: Pick<PreparedImportItem, "userId" | "kind" | "sourceId">): ImportClaim {
  if (!isRecord(raw) || !exact(raw, ["version", "userId", "kind", "sourceId", "sourceVersion", "payloadHash", "targetId", "createdAt", "source", "payload"]) || raw.version !== 1) invalid();
  const receipt = parseReceipt(raw, expected, ["version", "createdAt", "source", "payload"]);
  if (typeof raw.createdAt !== "string" || !isCanonicalDate(raw.createdAt)) invalid();
  let parsed: Omit<PreparedImportItem, "userId" | "payloadHash">;
  try {
    parsed = parseImportItem({
      sourceId: receipt.sourceId,
      sourceVersion: receipt.sourceVersion,
      kind: receipt.kind,
      source: raw.source,
      payload: raw.payload,
    });
  } catch {
    invalid();
  }
  const payloadHash = bytesToHex(sha256(utf8ToBytes(canonicalImportItem(parsed))));
  if (payloadHash !== receipt.payloadHash) invalid();
  return { version: 1, ...receipt, createdAt: raw.createdAt, source: parsed.source, payload: parsed.payload };
}

function parseReceipt(raw: unknown, expected: Pick<PreparedImportItem, "userId" | "kind" | "sourceId">, ignoredKeys: string[] = []): ImportReceipt {
  if (!isRecord(raw)) invalid();
  const keys = ["userId", "kind", "sourceId", "sourceVersion", "payloadHash", "targetId", ...ignoredKeys];
  if (!exact(raw, keys) || !isUuid(raw.userId) || !isKind(raw.kind) || typeof raw.sourceId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/u.test(raw.sourceId) || !Number.isSafeInteger(raw.sourceVersion) || (raw.sourceVersion as number) < 1 || (raw.sourceVersion as number) > 1_000_000 || typeof raw.payloadHash !== "string" || !/^[0-9a-f]{64}$/u.test(raw.payloadHash) || !isUuid(raw.targetId)) invalid();
  if (raw.userId !== expected.userId || raw.kind !== expected.kind || raw.sourceId !== expected.sourceId) invalid();
  return { userId: raw.userId, kind: raw.kind, sourceId: raw.sourceId, sourceVersion: raw.sourceVersion as number, payloadHash: raw.payloadHash, targetId: raw.targetId };
}

function parseBatch(raw: unknown, expectedUserId: string, expectedId: string): ImportBatchSummary {
  const keys = ["id", "userId", "manifestId", "manifestVersion", "status", "itemCount", "createdCount", "skippedCount", "conflictCount", "errorCount", "startedAt", "completedAt"];
  if (!isRecord(raw) || !exact(raw, keys) || !isUuid(raw.id) || !isUuid(raw.userId) || !isUuid(raw.manifestId) || raw.id !== expectedId || raw.userId !== expectedUserId || raw.manifestVersion !== 1 || (raw.status !== "COMPLETED" && raw.status !== "PARTIAL")) invalid();
  const counts = [raw.itemCount, raw.createdCount, raw.skippedCount, raw.conflictCount, raw.errorCount];
  if (counts.some((value) => !Number.isSafeInteger(value) || (value as number) < 0)) invalid();
  if ((raw.itemCount as number) < 1 || (raw.itemCount as number) > MAX_IMPORT_ITEMS) invalid();
  if ((raw.createdCount as number) + (raw.skippedCount as number) + (raw.conflictCount as number) + (raw.errorCount as number) !== raw.itemCount) invalid();
  const complete = raw.conflictCount === 0 && raw.errorCount === 0;
  if ((raw.status === "COMPLETED") !== complete || typeof raw.startedAt !== "string" || typeof raw.completedAt !== "string" || !isCanonicalDate(raw.startedAt) || !isCanonicalDate(raw.completedAt)) invalid();
  const startedAt = new Date(raw.startedAt); const completedAt = new Date(raw.completedAt);
  if (completedAt < startedAt) invalid();
  return { id: raw.id, userId: raw.userId, manifestId: raw.manifestId, manifestVersion: 1, status: raw.status, itemCount: raw.itemCount as number, createdCount: raw.createdCount as number, skippedCount: raw.skippedCount as number, conflictCount: raw.conflictCount as number, errorCount: raw.errorCount as number, startedAt, completedAt };
}

function receiptFromClaim(claim: ImportClaim): ImportReceipt {
  const { userId, kind, sourceId, sourceVersion, payloadHash, targetId } = claim;
  return { userId, kind, sourceId, sourceVersion, payloadHash, targetId };
}
function itemFromClaim(claim: ImportClaim): PreparedImportItem {
  const { userId, kind, sourceId, sourceVersion, payloadHash, source, payload } = claim;
  return { userId, kind, sourceId, sourceVersion, payloadHash, source, payload };
}
function exact(value: Record<string, unknown>, keys: string[]) { return Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key)); }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function isKind(value: unknown): value is ImportKind { return value === "vocabulary" || value === "sentence" || value === "note" || value === "reading"; }
function isUuid(value: unknown): value is string { return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value); }
function isCanonicalDate(value: string) { const date = new Date(value); return !Number.isNaN(date.getTime()) && date.toISOString() === value; }
function invalid(): never { throw new EdgeOneImportRepositoryError("IMPORT_RECEIPT_INVALID"); }
