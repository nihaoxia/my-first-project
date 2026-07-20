import "server-only";

import { Prisma, type PrismaClient } from "@prisma/client";
import { getDb } from "../db";
import { getAuthoritativeBlobStore } from "../edgeone/blob-store";
import { getEdgeOneRuntimeConfig } from "../edgeone/runtime-config";
import { createEdgeOneBooksRepository } from "./edgeone-books-repository";
import { createEdgeOneImportRepository } from "./edgeone-import-repository";
import { createEdgeOneStudyRepository } from "./edgeone-study-repository";
import { createCloudImportService, type CloudImportRepository, type ImportKind, type PreparedImportItem } from "./import-core";
import { findUniqueOriginalMatchByPages, findUniqueTranslationMatchByPages, LOOKUP_PAGE_SIZE } from "./import-lookup";
import { readingStateLockKey } from "./reading-state-lock";
import { withSerializableRetry } from "./serializable-retry";

const kindToDb = { vocabulary: "VOCABULARY", sentence: "SENTENCE", note: "NOTE", reading: "READING" } as const;
const kindFromDb = { VOCABULARY: "vocabulary", SENTENCE: "sentence", NOTE: "note", READING: "reading" } as const;

export function createPrismaCloudImportRepository(db: PrismaClient = getDb()): CloudImportRepository {
  return {
    async importOne(input) {
      return withSerializableRetry(() => db.$transaction(async (tx) => {
        const identity = `${input.userId}\u0000${input.kind}\u0000${input.sourceId}`;
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${identity}, 0))`;
        const existing = await tx.importItem.findUnique({ where: { userId_kind_sourceId: { userId: input.userId, kind: kindToDb[input.kind], sourceId: input.sourceId } } });
        if (existing) return { outcome: existing.payloadHash === input.payloadHash ? "skipped" as const : "conflict" as const, receipt: mapReceipt(existing) };
        const source = await resolveSource(tx, input);
        if (input.kind !== "note" && !source) return { outcome: "error" as const, code: "SOURCE_NOT_FOUND" as const };
        const targetId = crypto.randomUUID();
        if (input.kind === "vocabulary") await tx.vocabularyItem.create({ data: { id: targetId, userId: input.userId, originalBookId: source!.originalBookId, chapterId: source!.chapterId, term: input.payload.term as string, explanation: input.payload.explanation as string, contextualMean: input.payload.contextualMean as string | null, sourceSentence: input.payload.sourceSentence as string | null, note: input.payload.note as string | null } });
        else if (input.kind === "sentence") await tx.sentenceItem.create({ data: { id: targetId, userId: input.userId, originalBookId: source!.originalBookId, chapterId: source!.chapterId, originalText: input.payload.originalText as string, translatedText: input.payload.translatedText as string | null, explanation: input.payload.explanation as string | null, note: input.payload.note as string | null } });
        else if (input.kind === "note") await tx.studyNote.create({ data: { id: targetId, userId: input.userId, title: input.payload.title as string, content: input.payload.content as string, targetType: "FREEFORM" } });
        else {
          const bookIdentity = readingStateLockKey(input.userId, source!.translatedBookId ? "translated" : "original", source!.translatedBookId ?? source!.originalBookId);
          await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${bookIdentity}, 0))`;
          const where = source!.translatedBookId ? { userId: input.userId, translatedBookId: source!.translatedBookId } : { userId: input.userId, originalBookId: source!.originalBookId };
          const current = await tx.readingState.findFirst({ where });
          if (current) return { outcome: "error" as const, code: "INVALID_TARGET" as const };
          const reading = await tx.readingState.create({ data: { id: targetId, userId: input.userId, originalBookId: source!.translatedBookId ? null : source!.originalBookId, translatedBookId: source!.translatedBookId, chapterId: source!.chapterId, paragraphIndex: input.payload.paragraphIndex as number, version: 0, settings: input.payload.settings === null ? Prisma.DbNull : input.payload.settings as Prisma.InputJsonValue } });
          // Reading imports target the single per-book upsert row, not the provisional UUID.
          await tx.importItem.create({ data: { userId: input.userId, kind: "READING", sourceId: input.sourceId, sourceVersion: input.sourceVersion, payloadHash: input.payloadHash, targetId: reading.id } });
          return { outcome: "created" as const, receipt: { userId: input.userId, kind: input.kind, sourceId: input.sourceId, sourceVersion: input.sourceVersion, payloadHash: input.payloadHash, targetId: reading.id } };
        }
        const receipt = await tx.importItem.create({ data: { userId: input.userId, kind: kindToDb[input.kind], sourceId: input.sourceId, sourceVersion: input.sourceVersion, payloadHash: input.payloadHash, targetId } });
        return { outcome: "created" as const, receipt: mapReceipt(receipt) };
      }, { isolationLevel: "Serializable", maxWait: 5_000, timeout: 20_000 }));
    },
    async findReceipt(userId, kind, sourceId) {
      const row = await db.importItem.findUnique({ where: { userId_kind_sourceId: { userId, kind: kindToDb[kind], sourceId } } });
      return row ? mapReceipt(row) : null;
    },
    async saveBatch(summary) {
      return db.importBatch.create({ data: summary });
    },
    async findBatch(userId, id) {
      return db.importBatch.findFirst({ where: { id, userId } });
    },
  };
}

async function resolveSource(tx: Prisma.TransactionClient, input: PreparedImportItem) {
  if (!input.source) return null;
  if (input.kind === "reading" && input.source.translationTitle) {
    const translation = await findUniqueTranslationMatchByPages((cursor) => tx.translatedBook.findMany({ where: { userId: input.userId }, select: { id: true, title: true, originalBookId: true, originalBook: { select: { title: true } } }, take: LOOKUP_PAGE_SIZE, orderBy: { id: "asc" }, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) }), input.source.bookTitle, input.source.translationTitle);
    if (!translation) return null;
    const chapterId = await resolveChapter(tx, translation.originalBookId, input.source.chapterTitle);
    if (input.source.chapterTitle && !chapterId) return null;
    return { originalBookId: translation.originalBookId, translatedBookId: translation.id, chapterId };
  }
  const book = await findUniqueOriginalMatchByPages((cursor) => tx.originalBook.findMany({ where: { userId: input.userId }, select: { id: true, title: true }, take: LOOKUP_PAGE_SIZE, orderBy: { id: "asc" }, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) }), input.source.bookTitle);
  if (!book) return null;
  const chapterId = await resolveChapter(tx, book.id, input.source.chapterTitle);
  if (input.source.chapterTitle && !chapterId) return null;
  return { originalBookId: book.id, translatedBookId: null, chapterId };
}

async function resolveChapter(tx: Prisma.TransactionClient, originalBookId: string, title: string | null) {
  if (!title) return null;
  const chapter = await findUniqueOriginalMatchByPages((cursor) => tx.chapter.findMany({ where: { originalBookId }, select: { id: true, title: true }, take: LOOKUP_PAGE_SIZE, orderBy: { id: "asc" }, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) }), title);
  return chapter?.id ?? null;
}
function mapReceipt(row: { userId: string; kind: keyof typeof kindFromDb; sourceId: string; sourceVersion: number; payloadHash: string; targetId: string }) { return { userId: row.userId, kind: kindFromDb[row.kind] as ImportKind, sourceId: row.sourceId, sourceVersion: row.sourceVersion, payloadHash: row.payloadHash, targetId: row.targetId }; }

let singleton: ReturnType<typeof createCloudImportService> | undefined;
export function getCloudImportService() {
  if (singleton) return singleton;
  if (process.env.CLOUD_DATA_PROVIDER === "edgeone") {
    const config = getEdgeOneRuntimeConfig();
    const blob = getAuthoritativeBlobStore(config.blobStore);
    const uuid = () => crypto.randomUUID();
    const now = () => new Date();
    const books = createEdgeOneBooksRepository({ blob, now, uuid });
    const resolveOriginalSource = async (userId: string, originalBookId: string, chapterId: string | null) => {
      const book = await books.find(userId, originalBookId);
      const chapter = chapterId ? book?.chapters?.find((value) => value.id === chapterId) : null;
      if (!book || (chapterId && !chapter)) return null;
      return { originalBookId: book.id, bookTitle: book.title, chapterId: chapter?.id ?? null, chapterTitle: chapter?.title ?? null };
    };
    const study = createEdgeOneStudyRepository({
      blob, now, uuid, resolveOriginalSource,
      async resolveTranslatedSource() { return null; },
    });
    const normalize = (value: string) => value.normalize("NFKC").trim().toLowerCase();
    const repository = createEdgeOneImportRepository({
      blob, uuid,
      async createTarget(item) {
        const timestamp = now();
        if (item.kind === "note") {
          const row = await study.create({ id: uuid(), userId: item.userId, kind: "note", title: item.payload.title,
            content: item.payload.content, targetType: "FREEFORM", originalBookId: null, translatedBookId: null,
            chapterId: null, targetLabel: "", createdAt: timestamp, updatedAt: timestamp });
          return { ok: true, targetId: row.id };
        }
        if (!item.source || item.source.translationTitle) return { ok: false, code: "SOURCE_NOT_FOUND" };
        const candidates = (await books.list(item.userId)).filter((book) => normalize(book.title) === normalize(item.source!.bookTitle));
        if (candidates.length !== 1) return { ok: false, code: "SOURCE_NOT_FOUND" };
        const book = candidates[0];
        const chapters = item.source.chapterTitle
          ? book.chapters?.filter((chapter) => normalize(chapter.title) === normalize(item.source!.chapterTitle!)) ?? []
          : [];
        if (item.source.chapterTitle && chapters.length !== 1) return { ok: false, code: "SOURCE_NOT_FOUND" };
        const chapter = chapters[0] ?? null;
        if (item.kind === "reading") {
          if ((await study.list(item.userId, "reading", book.id, { limit: 1 })).items.length) return { ok: false, code: "INVALID_TARGET" };
          const row = await study.upsertReading({ id: uuid(), userId: item.userId, kind: "reading", originalBookId: book.id,
            translatedBookId: null, chapterId: chapter?.id ?? null, paragraphIndex: item.payload.paragraphIndex,
            settings: item.payload.settings, expectedVersion: 0, bookTitle: book.title,
            chapterTitle: chapter?.title ?? null, updatedAt: timestamp });
          return row ? { ok: true, targetId: row.id } : { ok: false, code: "INVALID_TARGET" };
        }
        const row = await study.create({ id: uuid(), userId: item.userId, kind: item.kind, originalBookId: book.id,
          chapterId: chapter?.id ?? null, bookTitle: book.title, chapterTitle: chapter?.title ?? null,
          ...item.payload, createdAt: timestamp, updatedAt: timestamp });
        return { ok: true, targetId: row.id };
      },
    });
    singleton = createCloudImportService({ repository });
    return singleton;
  }
  singleton = createCloudImportService({ repository: createPrismaCloudImportRepository() });
  return singleton;
}
export { CloudImportError } from "./import-core";
