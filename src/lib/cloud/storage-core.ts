export const ORIGINAL_BOOK_MAX_BYTES = 2 * 1024 * 1024;

export type CloudStorageErrorCode =
  | "INVALID_OBJECT_PATH"
  | "EMPTY_FILE"
  | "FILE_TOO_LARGE"
  | "UNSUPPORTED_MEDIA_TYPE"
  | "INVALID_TEXT_FILE"
  | "STORAGE_UPLOAD_FAILED"
  | "STORAGE_DELETE_FAILED"
  | "STORAGE_SIGN_FAILED";

export class CloudStorageError extends Error {
  readonly code: CloudStorageErrorCode;

  constructor(code: CloudStorageErrorCode) {
    super(code);
    this.code = code;
    this.name = "CloudStorageError";
  }
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const objectPathPattern = new RegExp(`^(${uuidPattern.source.slice(1, -1)})/(${uuidPattern.source.slice(1, -1)})/original\\.txt$`, "i");

export function isUuid(value: string): boolean {
  return uuidPattern.test(value);
}

export function buildOriginalBookObjectPath(userId: string, bookId: string): string {
  if (![userId, bookId].every(isUuid)) throw new CloudStorageError("INVALID_OBJECT_PATH");
  return `${userId}/${bookId}/original.txt`;
}

export function assertOriginalBookObjectPath(path: string): void {
  if (!objectPathPattern.test(path)) throw new CloudStorageError("INVALID_OBJECT_PATH");
}

export function parseOriginalBookObjectPath(path: string): { userId: string; bookId: string } | null {
  const match = objectPathPattern.exec(path);
  return match ? { userId: match[1], bookId: match[2] } : null;
}

export function assertOriginalBookObjectPathForOwner(path: string, userId: string, bookId: string): void {
  if (!isUuid(userId) || !isUuid(bookId) || path !== buildOriginalBookObjectPath(userId, bookId)) {
    throw new CloudStorageError("INVALID_OBJECT_PATH");
  }
}

export function isSupabaseStorageNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const record = error as Record<string, unknown>;
  const status = Number(record.status ?? record.statusCode);
  if (status !== 404) return false;
  const marker = [record.code, record.error, record.name].filter((value): value is string => typeof value === "string").join(" ").toLowerCase();
  return /not[_ -]?found|no[_ -]?such[_ -]?key|object[_ -]?not[_ -]?found/.test(marker);
}

export function validateTxtUpload(input: {
  bytes: Uint8Array;
  mimeType?: string;
  fileName?: string;
}): { bytes: Uint8Array; text: string; size: number } {
  const { bytes } = input;
  if (bytes.byteLength === 0) throw new CloudStorageError("EMPTY_FILE");
  if (bytes.byteLength > ORIGINAL_BOOK_MAX_BYTES) throw new CloudStorageError("FILE_TOO_LARGE");

  const mimeType = input.mimeType?.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  if (mimeType && mimeType !== "text/plain") throw new CloudStorageError("UNSUPPORTED_MEDIA_TYPE");
  if (input.fileName && !input.fileName.trim().toLowerCase().endsWith(".txt")) {
    throw new CloudStorageError("UNSUPPORTED_MEDIA_TYPE");
  }

  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new CloudStorageError("INVALID_TEXT_FILE");
  }
  if (!text.trim()) throw new CloudStorageError("EMPTY_FILE");
  if (text.includes("\0") || likelyBinary(text)) throw new CloudStorageError("INVALID_TEXT_FILE");
  return { bytes, text, size: bytes.byteLength };
}

function likelyBinary(text: string): boolean {
  let controls = 0;
  for (const character of text) {
    const code = character.codePointAt(0)!;
    if ((code < 32 && code !== 9 && code !== 10 && code !== 13) || code === 127) controls += 1;
  }
  return controls > 0 && controls / Math.max(text.length, 1) > 0.01;
}

export interface CloudStorageProvider {
  upload(path: string, bytes: Uint8Array): Promise<void>;
  remove(path: string): Promise<void>;
  createSignedUrl(path: string, expiresInSeconds: number): Promise<string>;
}

export interface CloudStorageService {
  readonly bucket: string;
  upload(path: string, bytes: Uint8Array): Promise<void>;
  remove(path: string): Promise<void>;
  signedUrl(path: string, expiresInSeconds?: number): Promise<string>;
}

export function createCloudStorageService(input: {
  bucket: string;
  provider: CloudStorageProvider;
}): CloudStorageService {
  return {
    bucket: input.bucket,
    async upload(path, bytes) {
      assertOriginalBookObjectPath(path);
      try { await input.provider.upload(path, bytes); }
      catch { throw new CloudStorageError("STORAGE_UPLOAD_FAILED"); }
    },
    async remove(path) {
      assertOriginalBookObjectPath(path);
      try { await input.provider.remove(path); }
      catch { throw new CloudStorageError("STORAGE_DELETE_FAILED"); }
    },
    async signedUrl(path, expiresInSeconds = 60) {
      assertOriginalBookObjectPath(path);
      if (!Number.isInteger(expiresInSeconds) || expiresInSeconds < 1 || expiresInSeconds > 300) {
        throw new CloudStorageError("STORAGE_SIGN_FAILED");
      }
      try {
        const url = await input.provider.createSignedUrl(path, expiresInSeconds);
        if (!url) throw new Error("missing URL");
        return url;
      } catch { throw new CloudStorageError("STORAGE_SIGN_FAILED"); }
    },
  };
}
