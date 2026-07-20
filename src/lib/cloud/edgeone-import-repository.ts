import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";
import type { AuthoritativeBlobStore } from "../edgeone/blob-store-core.ts";
import type {
  CloudImportRepository, ImportBatchSummary, ImportOneResult,
  ImportReceipt, PreparedImportItem,
} from "./import-core.ts";

type StoredBatch = Omit<ImportBatchSummary, "startedAt" | "completedAt"> & { startedAt: string; completedAt: string };

export class EdgeOneImportRepositoryError extends Error {
  readonly code: "IMPORT_RECEIPT_INVALID" | "IMPORT_BATCH_CONFLICT";
  constructor(code: "IMPORT_RECEIPT_INVALID" | "IMPORT_BATCH_CONFLICT") { super(code); this.code = code; this.name = "EdgeOneImportRepositoryError"; }
}

function identity(userId: string, kind: string, sourceId: string) {
  return bytesToHex(sha256(utf8ToBytes(`${userId}\u0000${kind}\u0000${sourceId}`)));
}

export function createEdgeOneImportRepository(input: {
  blob: AuthoritativeBlobStore;
  uuid: () => string;
  createTarget(item: PreparedImportItem): Promise<{ ok: true; targetId: string } | { ok: false; code: "SOURCE_NOT_FOUND" | "INVALID_TARGET" | "WRITE_FAILED" }>;
}): CloudImportRepository {
  const receiptKey = (item: Pick<PreparedImportItem, "userId" | "kind" | "sourceId">) => `imports/${item.userId}/receipts/${identity(item.userId, item.kind, item.sourceId)}.json`;
  async function getReceipt(item: Pick<PreparedImportItem, "userId" | "kind" | "sourceId">) { return input.blob.getJSON<ImportReceipt>(receiptKey(item)); }
  return {
    async importOne(item): Promise<ImportOneResult> {
      const existing = await getReceipt(item);
      if (existing) return { outcome: existing.payloadHash === item.payloadHash ? "skipped" : "conflict", receipt: existing };
      const target = await input.createTarget(item);
      if (!target.ok) return { outcome: "error", code: target.code };
      const receipt: ImportReceipt = { userId: item.userId, kind: item.kind, sourceId: item.sourceId, sourceVersion: item.sourceVersion, payloadHash: item.payloadHash, targetId: target.targetId };
      try { await input.blob.createJSON(receiptKey(item), receipt); }
      catch (error) {
        if ((error as { code?: string }).code !== "BLOB_ALREADY_EXISTS") throw error;
        const raced = await getReceipt(item);
        if (!raced) throw new EdgeOneImportRepositoryError("IMPORT_RECEIPT_INVALID");
        return { outcome: raced.payloadHash === item.payloadHash ? "skipped" : "conflict", receipt: raced };
      }
      return { outcome: "created", receipt };
    },
    findReceipt(userId, kind, sourceId) { return getReceipt({ userId, kind, sourceId }); },
    async saveBatch(summary) {
      const key = `imports/${summary.userId}/batches/${summary.id}.json`;
      const stored: StoredBatch = { ...summary, startedAt: summary.startedAt.toISOString(), completedAt: summary.completedAt.toISOString() };
      try { await input.blob.createJSON(key, stored); }
      catch (error) {
        if ((error as { code?: string }).code === "BLOB_ALREADY_EXISTS") throw new EdgeOneImportRepositoryError("IMPORT_BATCH_CONFLICT");
        throw error;
      }
      return summary;
    },
    async findBatch(userId, id) {
      const value = await input.blob.getJSON<StoredBatch>(`imports/${userId}/batches/${id}.json`);
      return value ? { ...value, startedAt: new Date(value.startedAt), completedAt: new Date(value.completedAt) } : null;
    },
  };
}
