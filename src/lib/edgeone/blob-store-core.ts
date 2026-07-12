import type { BlobListItem, BlobSdkStore } from "./blob-types.ts";

export type EdgeOneBlobErrorCode =
  | "INVALID_BLOB_KEY"
  | "BLOB_ALREADY_EXISTS"
  | "BLOB_READ_FAILED"
  | "BLOB_WRITE_FAILED"
  | "BLOB_DELETE_FAILED"
  | "BLOB_LIST_FAILED";

export class EdgeOneBlobError extends Error {
  readonly code: EdgeOneBlobErrorCode;

  constructor(code: EdgeOneBlobErrorCode) {
    super(code);
    this.code = code;
    this.name = "EdgeOneBlobError";
  }
}

const MAX_KEY_BYTES = 512;
const MAX_JSON_BYTES = 1024 * 1024;

function assertKey(key: string): void {
  if (
    !key ||
    key.startsWith("/") ||
    key.endsWith("/") ||
    new TextEncoder().encode(key).byteLength > MAX_KEY_BYTES ||
    !/^[A-Za-z0-9][A-Za-z0-9/_.-]*$/.test(key) ||
    key.split("/").some((part) => !part || part === "." || part === "..")
  ) {
    throw new EdgeOneBlobError("INVALID_BLOB_KEY");
  }
}

function assertPrefix(prefix: string): void {
  if (!prefix || !prefix.endsWith("/")) {
    throw new EdgeOneBlobError("INVALID_BLOB_KEY");
  }
  assertKey(`${prefix}item`);
}

function isAlreadyExists(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const value = error as Record<string, unknown>;
  const marker = [value.code, value.name, value.status, value.statusCode]
    .filter((part) => part !== undefined)
    .join(" ")
    .toLowerCase();
  return /precondition|already|exist|conflict|\b409\b|\b412\b/.test(marker);
}

function assertJsonSize(value: unknown): void {
  let encoded: Uint8Array;
  try {
    const json = JSON.stringify(value);
    if (json === undefined) throw new Error("not serializable");
    encoded = new TextEncoder().encode(json);
  } catch {
    throw new EdgeOneBlobError("BLOB_WRITE_FAILED");
  }
  if (encoded.byteLength > MAX_JSON_BYTES) {
    throw new EdgeOneBlobError("BLOB_WRITE_FAILED");
  }
}

export function createAuthoritativeBlobStore(sdk: BlobSdkStore) {
  return {
    async getJSON<T = unknown>(key: string): Promise<T | null> {
      assertKey(key);
      try {
        return (await sdk.get(key, {
          type: "json",
          consistency: "strong",
        })) as T | null;
      } catch {
        throw new EdgeOneBlobError("BLOB_READ_FAILED");
      }
    },
    async getText(key: string): Promise<string | null> {
      assertKey(key);
      try {
        return (await sdk.get(key, {
          type: "text",
          consistency: "strong",
        })) as string | null;
      } catch {
        throw new EdgeOneBlobError("BLOB_READ_FAILED");
      }
    },
    async getBytes(key: string): Promise<ArrayBuffer | null> {
      assertKey(key);
      try {
        return (await sdk.get(key, {
          type: "arrayBuffer",
          consistency: "strong",
        })) as ArrayBuffer | null;
      } catch {
        throw new EdgeOneBlobError("BLOB_READ_FAILED");
      }
    },
    async createJSON(key: string, value: unknown): Promise<void> {
      assertKey(key);
      assertJsonSize(value);
      try {
        await sdk.setJSON(key, value, { onlyIfNew: true });
      } catch (error) {
        throw new EdgeOneBlobError(
          isAlreadyExists(error) ? "BLOB_ALREADY_EXISTS" : "BLOB_WRITE_FAILED",
        );
      }
    },
    async createBytes(key: string, value: Uint8Array): Promise<void> {
      assertKey(key);
      try {
        await sdk.set(key, value, { onlyIfNew: true });
      } catch (error) {
        throw new EdgeOneBlobError(
          isAlreadyExists(error) ? "BLOB_ALREADY_EXISTS" : "BLOB_WRITE_FAILED",
        );
      }
    },
    async remove(key: string): Promise<void> {
      assertKey(key);
      try {
        await sdk.delete(key);
      } catch {
        throw new EdgeOneBlobError("BLOB_DELETE_FAILED");
      }
    },
    async listAll(prefix: string): Promise<BlobListItem[]> {
      assertPrefix(prefix);
      const output: BlobListItem[] = [];
      const cursors = new Set<string>();
      let cursor: string | undefined;
      try {
        do {
          const page = await sdk.list({
            prefix,
            ...(cursor ? { cursor } : {}),
            paginate: false,
            consistency: "strong",
          });
          output.push(...page.blobs);
          cursor = page.cursor || undefined;
          if (cursor && cursors.has(cursor)) {
            throw new EdgeOneBlobError("BLOB_LIST_FAILED");
          }
          if (cursor) cursors.add(cursor);
        } while (cursor);
        return output;
      } catch (error) {
        if (error instanceof EdgeOneBlobError) throw error;
        throw new EdgeOneBlobError("BLOB_LIST_FAILED");
      }
    },
  };
}

export type AuthoritativeBlobStore = ReturnType<
  typeof createAuthoritativeBlobStore
>;
