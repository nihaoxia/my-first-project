import { assertOriginalBookObjectPathForOwner, buildOriginalBookObjectPath, isUuid, validateTxtUpload, type CloudStorageService } from "./storage-core.ts";
import { parseTxtChapters } from "../upload/txt-chapter-parser.ts";
import { MAX_CHAPTERS, validateChapterEditPayloadBytes } from "./upload-limits.ts";

export { MAX_CHAPTERS, MAX_CHAPTER_EDIT_BYTES, validateChapterEditPayloadBytes } from "./upload-limits.ts";

export type CloudBookErrorCode =
  | "INVALID_BOOK_ID" | "INVALID_BOOK_METADATA" | "BOOK_NOT_FOUND"
  | "INVALID_CHAPTER_EDITS" | "CLEANUP_PERSIST_FAILED"
  | "TOO_MANY_CHAPTERS"
  | "CHAPTER_EDITS_TOO_LARGE"
  | "BOOK_STORAGE_FAILED" | "BOOK_CREATE_FAILED" | "BOOK_UPDATE_FAILED" | "BOOK_DELETE_FAILED"
  | "BOOK_CONFLICT";

export class CloudBookError extends Error {
  readonly code: CloudBookErrorCode;
  constructor(code: CloudBookErrorCode) { super(code); this.code = code; this.name = "CloudBookError"; }
}

export type CloudChapterRecord = { id?: string; index: number; title: string; content: string; wordCount: number; status: "ACTIVE" | "SKIPPED" | "TOO_LONG" | "TOO_SHORT" | "SUSPECTED_TOC" | "GARBLED"; isSkipped: boolean };
export type CloudBookRecord = {
  id: string; userId: string; title: string; author: string | null; sourceLanguage: string; format: "TXT";
  fileSizeBytes: number; storagePath: string; chapterCount: number; uploadedAt: Date; lastOpenedAt?: Date | null;
  chapters?: CloudChapterRecord[];
};
export type CloudBookDto = Omit<CloudBookRecord, "userId" | "storagePath" | "chapters"> & { chapters?: CloudChapterRecord[] };

export type CreateBookPersistence = Omit<CloudBookRecord, "uploadedAt"> & { chapters: CloudChapterRecord[] };
export interface CloudBooksTransaction {
  create(input: CreateBookPersistence): Promise<CloudBookRecord>;
  find(userId: string, bookId: string): Promise<CloudBookRecord | null>;
  delete(userId: string, bookId: string): Promise<CloudBookRecord | null>;
  upsertCleanupIntent(input: { userId: string; bucket: string; objectPath: string; reason: string }): Promise<void>;
  findCleanupIntent(bucket: string, objectPath: string): Promise<boolean>;
  resolveCleanupIntent(bucket: string, objectPath: string): Promise<void>;
}
export interface CloudBooksRepository {
  list(userId: string): Promise<CloudBookRecord[]>;
  find(userId: string, bookId: string): Promise<CloudBookRecord | null>;
  update(userId: string, bookId: string, data: { title?: string; author?: string | null }): Promise<CloudBookRecord | null>;
  transaction<T>(work: (transaction: CloudBooksTransaction) => Promise<T>): Promise<T>;
  withObjectLock<T>(bucket: string, objectPath: string, work: (transaction: CloudBooksTransaction) => Promise<T>): Promise<T>;
  upsertCleanupIntent(input: { userId: string; bucket: string; objectPath: string; reason: string }): Promise<void>;
  resolveCleanupIntent(bucket: string, objectPath: string): Promise<void>;
}

export function createCloudBooksService(dependencies: { repository: CloudBooksRepository; storage: CloudStorageService; uuid?: () => string }) {
  const uuid = dependencies.uuid ?? (() => crypto.randomUUID());
  return {
    async create(userId: string, input: { title: string; author?: string | null; sourceLanguage?: string; fileName: string; mimeType?: string; bytes: Uint8Array; chapterEdits: unknown }): Promise<CloudBookDto> {
      assertUserId(userId);
      const metadata = normalizeMetadata(input);
      const validated = validateTxtUpload(input);
      const bookId = uuid();
      const objectPath = buildOriginalBookObjectPath(userId, bookId);
      assertOriginalBookObjectPathForOwner(objectPath, userId, bookId);
      let parsed;
      try { parsed = parseTxtChapters(validated.text); }
      catch (error) { if (error instanceof Error && error.message === "TOO_MANY_CHAPTERS") throw new CloudBookError("TOO_MANY_CHAPTERS"); throw error; }
      try {
        const serializedEdits = JSON.stringify(input.chapterEdits);
        if (typeof serializedEdits !== "string") throw new Error("invalid edits");
        validateChapterEditPayloadBytes(new TextEncoder().encode(serializedEdits));
      } catch (error) {
        if (error instanceof Error && error.message === "CHAPTER_EDITS_TOO_LARGE") throw new CloudBookError("CHAPTER_EDITS_TOO_LARGE");
        throw new CloudBookError("INVALID_CHAPTER_EDITS");
      }
      const edits = validateChapterEdits(input.chapterEdits, parsed.chapters.length);
      const chapters: CloudChapterRecord[] = parsed.chapters.map((chapter, offset) => ({
        index: offset + 1,
        title: edits[offset].title,
        content: chapter.content,
        wordCount: chapter.characterCount,
        status: edits[offset].isSkipped ? "SKIPPED" : chapter.warnings.includes("likely-toc") ? "SUSPECTED_TOC" : chapter.warnings.includes("short-chapter") ? "TOO_SHORT" : "ACTIVE",
        isSkipped: edits[offset].isSkipped,
      }));
      const intent = { userId, bucket: dependencies.storage.bucket, objectPath, reason: "PENDING_BOOK_CREATE" };
      try { await dependencies.repository.upsertCleanupIntent(intent); }
      catch { throw new CloudBookError("CLEANUP_PERSIST_FAILED"); }
      let operationStarted = false;
      try {
        const created = await dependencies.repository.withObjectLock(intent.bucket, intent.objectPath, async (transaction) => {
          operationStarted = true;
          try { await dependencies.storage.upload(objectPath, validated.bytes); }
          catch { throw new CloudBookError("BOOK_STORAGE_FAILED"); }
          const row = await transaction.create({
            id: bookId, userId, ...metadata, format: "TXT", fileSizeBytes: validated.size,
            storagePath: objectPath, chapterCount: chapters.length, chapters,
          });
          assertOriginalBookObjectPathForOwner(intent.objectPath, userId, bookId);
          await transaction.resolveCleanupIntent(intent.bucket, intent.objectPath);
          return row;
        });
        return toDto(created, true);
      } catch (error) {
        if (operationStarted) {
          try {
            const coordinateRecovery = async (transaction: CloudBooksTransaction) => {
              const live = await transaction.find(userId, bookId);
              if (live) {
                assertOriginalBookObjectPathForOwner(live.storagePath, userId, bookId);
                try { await transaction.resolveCleanupIntent(intent.bucket, intent.objectPath); } catch { /* a stale intent is safer than touching a live object */ }
                return { kind: "live" as const, book: live };
              }
              if (!(await transaction.findCleanupIntent(intent.bucket, intent.objectPath))) {
                try { await transaction.upsertCleanupIntent({ ...intent, reason: "RECOVER_BOOK_CREATE" }); }
                catch { throw new CloudBookError("CLEANUP_PERSIST_FAILED"); }
                return { kind: "intent-created" as const };
              }
              assertOriginalBookObjectPathForOwner(objectPath, userId, bookId);
              try { await dependencies.storage.remove(objectPath); }
              catch { return { kind: "uncertain" as const }; }
              try { await transaction.resolveCleanupIntent(intent.bucket, intent.objectPath); } catch { /* removed object with stale intent is safe */ }
              return { kind: "cleaned" as const };
            };
            let recovery = await dependencies.repository.withObjectLock(intent.bucket, intent.objectPath, coordinateRecovery);
            if (recovery.kind === "intent-created") {
              recovery = await dependencies.repository.withObjectLock(intent.bucket, intent.objectPath, coordinateRecovery);
            }
            if (recovery.kind === "live") return toDto(recovery.book, true);
          } catch (recoveryError) {
            const live = await dependencies.repository.find(userId, bookId).catch(() => null);
            if (live) {
              assertOriginalBookObjectPathForOwner(live.storagePath, userId, bookId);
              return toDto(live, true);
            }
            if (recoveryError instanceof CloudBookError && recoveryError.code === "CLEANUP_PERSIST_FAILED") throw recoveryError;
          }
        }
        if (error instanceof CloudBookError && error.code === "BOOK_STORAGE_FAILED") throw error;
        throw new CloudBookError("BOOK_CREATE_FAILED");
      }
    },
    async list(userId: string): Promise<CloudBookDto[]> {
      assertUserId(userId);
      try { return (await dependencies.repository.list(userId)).map((row) => toDto(row)); }
      catch (error) { throw mapRepositoryReadError(error); }
    },
    async get(userId: string, bookId: string): Promise<CloudBookDto> { const row = await owned(dependencies.repository, userId, bookId); return toDto(row, true); },
    async updateMetadata(userId: string, bookId: string, input: { title?: string; author?: string | null }): Promise<CloudBookDto> {
      assertIds(userId, bookId);
      const data: { title?: string; author?: string | null } = {};
      if (input.title !== undefined) { const title = input.title.trim(); if (!title || title.length > 200) throw new CloudBookError("INVALID_BOOK_METADATA"); data.title = title; }
      if (input.author !== undefined) { const author = input.author?.trim() || null; if (author && author.length > 200) throw new CloudBookError("INVALID_BOOK_METADATA"); data.author = author; }
      if (!Object.keys(data).length) throw new CloudBookError("INVALID_BOOK_METADATA");
      let row: CloudBookRecord | null;
      try { row = await dependencies.repository.update(userId, bookId, data); } catch { throw new CloudBookError("BOOK_UPDATE_FAILED"); }
      if (!row) throw new CloudBookError("BOOK_NOT_FOUND");
      return toDto(row);
    },
    async getDownloadUrl(userId: string, bookId: string): Promise<{ url: string; expiresInSeconds: number }> {
      const row = await owned(dependencies.repository, userId, bookId);
      try {
        assertOriginalBookObjectPathForOwner(row.storagePath, userId, bookId);
        return { url: await dependencies.storage.signedUrl(row.storagePath, 60), expiresInSeconds: 60 };
      }
      catch { throw new CloudBookError("BOOK_STORAGE_FAILED"); }
    },
    async delete(userId: string, bookId: string): Promise<{ deleted: true; cleanupPending: boolean }> {
      assertIds(userId, bookId);
      const initial = await owned(dependencies.repository, userId, bookId);
      try { assertOriginalBookObjectPathForOwner(initial.storagePath, userId, bookId); }
      catch { throw new CloudBookError("BOOK_DELETE_FAILED"); }
      let deleted: CloudBookRecord | null;
      try {
        deleted = await dependencies.repository.withObjectLock(dependencies.storage.bucket, initial.storagePath, async (transaction) => {
          const found = await transaction.find(userId, bookId);
          if (!found) return null;
          assertOriginalBookObjectPathForOwner(found.storagePath, userId, bookId);
          try { await transaction.upsertCleanupIntent({ userId, bucket: dependencies.storage.bucket, objectPath: found.storagePath, reason: "PENDING_BOOK_DELETE" }); }
          catch { throw new CloudBookError("CLEANUP_PERSIST_FAILED"); }
          return transaction.delete(userId, bookId);
        });
      } catch (error) {
        if (error instanceof CloudBookError) throw error;
        throw new CloudBookError("BOOK_DELETE_FAILED");
      }
      if (!deleted) throw new CloudBookError("BOOK_NOT_FOUND");
      try {
        await dependencies.repository.withObjectLock(dependencies.storage.bucket, deleted.storagePath, async (transaction) => {
          assertOriginalBookObjectPathForOwner(deleted!.storagePath, userId, bookId);
          await dependencies.storage.remove(deleted!.storagePath);
          await transaction.resolveCleanupIntent(dependencies.storage.bucket, deleted!.storagePath);
        });
        return { deleted: true, cleanupPending: false };
      } catch { return { deleted: true, cleanupPending: true }; }
    },
  };
}

async function owned(repository: CloudBooksRepository, userId: string, bookId: string) {
  assertIds(userId, bookId);
  let row: CloudBookRecord | null;
  try { row = await repository.find(userId, bookId); }
  catch (error) { throw mapRepositoryReadError(error); }
  if (!row) throw new CloudBookError("BOOK_NOT_FOUND");
  return row;
}
function mapRepositoryReadError(error: unknown): CloudBookError {
  return error && typeof error === "object" && (error as { code?: unknown }).code === "BOOK_CONFLICT"
    ? new CloudBookError("BOOK_CONFLICT")
    : new CloudBookError("BOOK_NOT_FOUND");
}
function assertUserId(userId: string) { if (!isUuid(userId)) throw new CloudBookError("INVALID_BOOK_ID"); }
function assertIds(userId: string, bookId: string) { assertUserId(userId); if (!isUuid(bookId)) throw new CloudBookError("INVALID_BOOK_ID"); }
function normalizeMetadata(input: { title: string; author?: string | null; sourceLanguage?: string }) {
  const title = input.title.trim(); const author = input.author?.trim() || null; const sourceLanguage = input.sourceLanguage?.trim().toUpperCase() || "UNKNOWN";
  const languages = new Set(["CHINESE", "ENGLISH", "JAPANESE", "KOREAN", "RUSSIAN", "GERMAN", "SPANISH", "FRENCH", "UNKNOWN"]);
  if (!title || title.length > 200 || (author && author.length > 200) || !languages.has(sourceLanguage)) throw new CloudBookError("INVALID_BOOK_METADATA");
  return { title, author, sourceLanguage };
}
function toDto(row: CloudBookRecord, includeChapters = false): CloudBookDto {
  return { id: row.id, title: row.title, author: row.author, sourceLanguage: row.sourceLanguage, format: row.format, fileSizeBytes: row.fileSizeBytes, chapterCount: row.chapterCount, uploadedAt: row.uploadedAt, lastOpenedAt: row.lastOpenedAt, ...(includeChapters ? { chapters: row.chapters ?? [] } : {}) };
}
type ChapterEdit = { sourceIndex: number; title: string; isSkipped: boolean };
function validateChapterEdits(value: unknown, chapterCount: number): ChapterEdit[] {
  if (chapterCount < 1 || chapterCount > MAX_CHAPTERS) throw new CloudBookError("TOO_MANY_CHAPTERS");
  if (!Array.isArray(value) || value.length !== chapterCount) throw new CloudBookError("INVALID_CHAPTER_EDITS");
  const edits: ChapterEdit[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new CloudBookError("INVALID_CHAPTER_EDITS");
    const record = item as Record<string, unknown>;
    if (Object.keys(record).some((key) => !["sourceIndex", "title", "isSkipped"].includes(key))) throw new CloudBookError("INVALID_CHAPTER_EDITS");
    if (!Number.isInteger(record.sourceIndex) || typeof record.title !== "string" || typeof record.isSkipped !== "boolean") throw new CloudBookError("INVALID_CHAPTER_EDITS");
    const title = record.title.trim();
    if (!title || title.length > 500 || (record.sourceIndex as number) < 1 || (record.sourceIndex as number) > chapterCount) throw new CloudBookError("INVALID_CHAPTER_EDITS");
    edits.push({ sourceIndex: record.sourceIndex as number, title, isSkipped: record.isSkipped });
  }
  edits.sort((a, b) => a.sourceIndex - b.sourceIndex);
  if (edits.some((edit, index) => edit.sourceIndex !== index + 1)) throw new CloudBookError("INVALID_CHAPTER_EDITS");
  if (edits.every((edit) => edit.isSkipped)) throw new CloudBookError("INVALID_CHAPTER_EDITS");
  return edits;
}
