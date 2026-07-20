import { sha256 } from "@noble/hashes/sha2.js";

import type { AuthoritativeBlobStore } from "../edgeone/blob-store-core.ts";
import {
  APPLICATION_UPLOAD_LIMIT_BYTES,
  assertFreeCapacity,
  type ReadyUsage,
  type UsageEvent,
} from "../edgeone/quota-core.ts";
import { createEdgeOneDownloadToken } from "./edgeone-download-token-core.ts";
import {
  CloudStorageError,
  assertOriginalBookObjectPathForOwner,
  parseOriginalBookObjectPath,
  type CloudStorageProvider,
} from "./storage-core.ts";

type QuotaService = {
  getUsage(userId: string, month: string): Promise<ReadyUsage>;
  appendEvent(userId: string, month: string, event: UsageEvent): Promise<void>;
};

export const EDGEONE_BLOB_QUOTA_LEDGER_ID = "blob-storage-global";

type ProviderErrorCode =
  | "EDGEONE_STORAGE_UPLOAD_FAILED"
  | "EDGEONE_OBJECT_CONFLICT"
  | "EDGEONE_STORAGE_DELETE_FAILED"
  | "EDGEONE_STORAGE_SIGN_FAILED";

export class EdgeOneStorageProviderError extends Error {
  readonly code: ProviderErrorCode;

  constructor(code: ProviderErrorCode) {
    super(code);
    this.code = code;
    this.name = "EdgeOneStorageProviderError";
  }
}

function nonceFromBytes(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  const a = sha256(left);
  const b = sha256(right);
  let difference = left.length ^ right.length;
  for (let index = 0; index < a.length; index += 1) difference |= a[index] ^ b[index];
  return difference === 0;
}

export function createEdgeOneStorageProvider(input: {
  blob: AuthoritativeBlobStore;
  quota: QuotaService;
  userId: string;
  now: () => Date;
  uuid: () => string;
  randomBytes: (length: number) => Uint8Array;
  downloadSecret: string;
}): CloudStorageProvider {
  const ledgerSegment = "blob";
  const objectKey = (path: string) => `objects/${path}`;

  function assertOwned(path: string): void {
    const parsed = parseOriginalBookObjectPath(path);
    if (!parsed) throw new CloudStorageError("INVALID_OBJECT_PATH");
    assertOriginalBookObjectPathForOwner(path, input.userId, parsed.bookId);
  }

  function timestamp() {
    const value = input.now();
    if (Number.isNaN(value.getTime())) throw new EdgeOneStorageProviderError("EDGEONE_STORAGE_UPLOAD_FAILED");
    return { value, iso: value.toISOString() };
  }

  return {
    async upload(path, bytes) {
      assertOwned(path);
      if (!(bytes instanceof Uint8Array) || bytes.byteLength > APPLICATION_UPLOAD_LIMIT_BYTES) {
        throw new EdgeOneStorageProviderError("EDGEONE_STORAGE_UPLOAD_FAILED");
      }
      const time = timestamp();
      const usage = await input.quota.getUsage(EDGEONE_BLOB_QUOTA_LEDGER_ID, ledgerSegment);
      assertFreeCapacity(usage, APPLICATION_UPLOAD_LIMIT_BYTES);
      const reservationId = input.uuid();
      await input.quota.appendEvent(EDGEONE_BLOB_QUOTA_LEDGER_ID, ledgerSegment, {
        type: "UPLOAD_RESERVED", id: reservationId, userId: input.userId,
        bytes: APPLICATION_UPLOAD_LIMIT_BYTES, at: time.iso,
      });

      const key = objectKey(path);
      try {
        await input.blob.createBytes(key, bytes);
      } catch (error) {
        if ((error as { code?: string }).code === "BLOB_ALREADY_EXISTS") {
          const existing = await input.blob.getBytes(key);
          await input.quota.appendEvent(EDGEONE_BLOB_QUOTA_LEDGER_ID, ledgerSegment, {
            type: "UPLOAD_RELEASED", id: input.uuid(), reservationId, at: time.iso,
          });
          if (existing && equalBytes(new Uint8Array(existing), bytes)) return;
          throw new EdgeOneStorageProviderError("EDGEONE_OBJECT_CONFLICT");
        }
        await input.quota.appendEvent(EDGEONE_BLOB_QUOTA_LEDGER_ID, ledgerSegment, {
          type: "UPLOAD_RELEASED", id: input.uuid(), reservationId, at: time.iso,
        });
        throw new EdgeOneStorageProviderError("EDGEONE_STORAGE_UPLOAD_FAILED");
      }

      try {
        await input.quota.appendEvent(EDGEONE_BLOB_QUOTA_LEDGER_ID, ledgerSegment, {
          type: "UPLOAD_COMMITTED", id: input.uuid(), reservationId,
          objectId: key, actualBytes: bytes.byteLength, at: time.iso,
        });
      } catch {
        throw new EdgeOneStorageProviderError("EDGEONE_STORAGE_UPLOAD_FAILED");
      }
    },

    async remove(path) {
      assertOwned(path);
      const key = objectKey(path);
      let existing: ArrayBuffer | null;
      try { existing = await input.blob.getBytes(key); }
      catch { throw new EdgeOneStorageProviderError("EDGEONE_STORAGE_DELETE_FAILED"); }
      if (!existing) return;
      const time = timestamp();
      try {
        await input.blob.remove(key);
        await input.quota.appendEvent(EDGEONE_BLOB_QUOTA_LEDGER_ID, ledgerSegment, {
          type: "OBJECT_DELETED", id: input.uuid(), objectId: key,
          bytes: existing.byteLength, at: time.iso,
        });
      } catch {
        throw new EdgeOneStorageProviderError("EDGEONE_STORAGE_DELETE_FAILED");
      }
    },

    async createSignedUrl(path, expiresInSeconds) {
      assertOwned(path);
      if (!Number.isInteger(expiresInSeconds) || expiresInSeconds < 1 || expiresInSeconds > 60) {
        throw new EdgeOneStorageProviderError("EDGEONE_STORAGE_SIGN_FAILED");
      }
      const bytes = input.randomBytes(16);
      if (!(bytes instanceof Uint8Array) || bytes.length !== 16) {
        throw new EdgeOneStorageProviderError("EDGEONE_STORAGE_SIGN_FAILED");
      }
      const now = input.now();
      const token = createEdgeOneDownloadToken({
        objectPath: path,
        expiresAt: Math.floor(now.getTime() / 1000) + expiresInSeconds,
        nonce: nonceFromBytes(bytes),
        secret: input.downloadSecret,
      });
      const query = new URLSearchParams(token);
      return `/api/cloud/blob-download?${query.toString()}`;
    },
  };
}
