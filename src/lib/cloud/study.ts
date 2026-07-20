import "server-only";

import { Prisma, type PrismaClient } from "@prisma/client";
import { getDb } from "../db";
import { getCloudServices } from "./service-factory";
import { createCloudStudyService, type CloudStudyKind, type CloudStudyRecord, type CloudStudyRepository } from "./study-core";
import { readingStateLockKey } from "./reading-state-lock";
import { withSerializableRetry } from "./serializable-retry";

function mapNoteRow<T extends { originalBook?: { title: string } | null; chapter?: { title: string } | null; translatedBook?: { title: string } | null }>(row: T) {
  return { ...row, kind: "note" as const, targetLabel: row.chapter ? `${row.originalBook?.title ?? ""} · ${row.chapter.title}` : row.originalBook?.title ?? row.translatedBook?.title ?? "" };
}

export function createPrismaCloudStudyRepository(db: PrismaClient = getDb()): CloudStudyRepository {
  return {
    async resolveOriginalSource(userId, originalBookId, chapterId) {
      const book = await db.originalBook.findFirst({ where: { id: originalBookId, userId }, select: { id: true, title: true, chapters: chapterId ? { where: { id: chapterId }, select: { id: true, title: true }, take: 1 } : false } });
      if (!book || (chapterId && (!book.chapters || book.chapters.length !== 1))) return null;
      const chapter = chapterId && book.chapters ? book.chapters[0] : null;
      return { originalBookId: book.id, bookTitle: book.title, chapterId: chapter?.id ?? null, chapterTitle: chapter?.title ?? null };
    },
    async resolveTranslatedSource(userId, translatedBookId, chapterId) {
      const translation = await db.translatedBook.findFirst({ where: { id: translatedBookId, userId }, select: { id: true, title: true, originalBookId: true, originalBook: { select: { chapters: chapterId ? { where: { id: chapterId }, select: { id: true, title: true }, take: 1 } : false } } } });
      if (!translation || (chapterId && (!translation.originalBook.chapters || translation.originalBook.chapters.length !== 1))) return null;
      const chapter = chapterId && translation.originalBook.chapters ? translation.originalBook.chapters[0] : null;
      return { translatedBookId: translation.id, title: translation.title, originalBookId: translation.originalBookId, chapterId: chapter?.id ?? null, chapterTitle: chapter?.title ?? null };
    },
    async list(userId, kind, bookId, page) {
      const pagination = { take: page.limit + 1, orderBy: { id: "asc" as const }, ...(page.cursor ? { cursor: { id: page.cursor }, skip: 1 } : {}) };
      if (kind === "vocabulary") {
        const rows = await db.vocabularyItem.findMany({ where: { userId, ...(bookId ? { originalBookId: bookId } : {}) }, ...pagination, include: { originalBook: { select: { title: true } }, chapter: { select: { title: true } } } });
        return finishPage(rows, page.limit, (row) => ({ ...row, kind, bookTitle: row.originalBook.title, chapterTitle: row.chapter?.title ?? null }));
      }
      if (kind === "sentence") {
        const rows = await db.sentenceItem.findMany({ where: { userId, ...(bookId ? { originalBookId: bookId } : {}) }, ...pagination, include: { originalBook: { select: { title: true } }, chapter: { select: { title: true } } } });
        return finishPage(rows, page.limit, (row) => ({ ...row, kind, bookTitle: row.originalBook.title, chapterTitle: row.chapter?.title ?? null }));
      }
      if (kind === "note") {
        const rows = await db.studyNote.findMany({ where: { userId, ...(bookId ? { OR: [{ originalBookId: bookId }, { translatedBookId: bookId }] } : {}) }, ...pagination, include: { originalBook: { select: { title: true } }, chapter: { select: { title: true } }, translatedBook: { select: { title: true } } } });
        return finishPage(rows, page.limit, mapNoteRow);
      }
      const rows = await db.readingState.findMany({ where: { userId, ...(bookId ? { OR: [{ originalBookId: bookId }, { translatedBookId: bookId }] } : {}) }, ...pagination, include: { originalBook: { select: { title: true } }, translatedBook: { select: { title: true } }, chapter: { select: { title: true } } } });
      return finishPage(rows, page.limit, (row) => ({ ...row, kind, bookTitle: row.originalBook?.title ?? row.translatedBook?.title ?? "", chapterTitle: row.chapter?.title ?? null }));
    },
    async create(record) {
      if (record.kind === "vocabulary") {
        const row = await db.vocabularyItem.create({ data: { id: record.id, userId: record.userId, originalBookId: record.originalBookId as string, chapterId: record.chapterId as string | null, term: record.term as string, explanation: record.explanation as string, contextualMean: record.contextualMean as string | null, sourceSentence: record.sourceSentence as string | null, note: record.note as string | null }, include: { originalBook: { select: { title: true } }, chapter: { select: { title: true } } } });
        return { ...row, kind: "vocabulary", bookTitle: row.originalBook.title, chapterTitle: row.chapter?.title ?? null };
      }
      if (record.kind === "sentence") {
        const row = await db.sentenceItem.create({ data: { id: record.id, userId: record.userId, originalBookId: record.originalBookId as string, chapterId: record.chapterId as string | null, originalText: record.originalText as string, translatedText: record.translatedText as string | null, explanation: record.explanation as string | null, note: record.note as string | null }, include: { originalBook: { select: { title: true } }, chapter: { select: { title: true } } } });
        return { ...row, kind: "sentence", bookTitle: row.originalBook.title, chapterTitle: row.chapter?.title ?? null };
      }
      const row = await db.studyNote.create({ data: { id: record.id, userId: record.userId, title: record.title as string, content: record.content as string, targetType: record.targetType as never, originalBookId: record.originalBookId as string | null, chapterId: record.chapterId as string | null, translatedBookId: record.translatedBookId as string | null }, include: { originalBook: { select: { title: true } }, chapter: { select: { title: true } }, translatedBook: { select: { title: true } } } });
      return mapNoteRow(row);
    },
    async update(userId, id, data) {
      const kind = data.kind as CloudStudyKind;
      const changes = { ...data };
      delete changes.kind;
      if (kind === "vocabulary") { const result = await db.vocabularyItem.updateMany({ where: { id, userId }, data: changes as Prisma.VocabularyItemUpdateManyMutationInput }); if (result.count !== 1) return null; const row = await db.vocabularyItem.findUnique({ where: { id }, include: { originalBook: { select: { title: true } }, chapter: { select: { title: true } } } }); return row ? { ...row, kind, bookTitle: row.originalBook.title, chapterTitle: row.chapter?.title ?? null } : null; }
      if (kind === "sentence") { const result = await db.sentenceItem.updateMany({ where: { id, userId }, data: changes as Prisma.SentenceItemUpdateManyMutationInput }); if (result.count !== 1) return null; const row = await db.sentenceItem.findUnique({ where: { id }, include: { originalBook: { select: { title: true } }, chapter: { select: { title: true } } } }); return row ? { ...row, kind, bookTitle: row.originalBook.title, chapterTitle: row.chapter?.title ?? null } : null; }
      const result = await db.studyNote.updateMany({ where: { id, userId }, data: changes as Prisma.StudyNoteUpdateManyMutationInput }); if (result.count !== 1) return null; const row = await db.studyNote.findUnique({ where: { id }, include: { originalBook: { select: { title: true } }, chapter: { select: { title: true } }, translatedBook: { select: { title: true } } } }); return row ? mapNoteRow(row) : null;
    },
    async delete(userId, id, kind) {
      if (kind === "vocabulary") return (await db.vocabularyItem.deleteMany({ where: { id, userId } })).count === 1;
      if (kind === "sentence") return (await db.sentenceItem.deleteMany({ where: { id, userId } })).count === 1;
      if (kind === "note") return (await db.studyNote.deleteMany({ where: { id, userId } })).count === 1;
      return (await db.readingState.deleteMany({ where: { id, userId } })).count === 1;
    },
    async upsertReading(record) {
      return withSerializableRetry(() => db.$transaction(async (tx) => {
        const lockKey = readingStateLockKey(record.userId, record.originalBookId ? "original" : "translated", (record.originalBookId ?? record.translatedBookId) as string);
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;
        const where = { userId: record.userId, ...(record.originalBookId ? { originalBookId: record.originalBookId as string } : { translatedBookId: record.translatedBookId as string }) };
        const existing = await tx.readingState.findFirst({ where });
        const expectedVersion = record.expectedVersion as number;
        const data = { chapterId: record.chapterId as string | null, paragraphIndex: record.paragraphIndex as number, settings: record.settings === null ? Prisma.DbNull : record.settings as Prisma.InputJsonValue };
        if (!existing && expectedVersion !== 0) return null;
        let row;
        if (existing) {
          const changed = await tx.readingState.updateMany({ where: { id: existing.id, userId: record.userId, version: expectedVersion }, data: { ...data, version: { increment: 1 } } });
          if (changed.count !== 1) return null;
          row = await tx.readingState.findUniqueOrThrow({ where: { id: existing.id } });
        } else row = await tx.readingState.create({ data: { id: record.id, userId: record.userId, originalBookId: record.originalBookId as string | null, translatedBookId: record.translatedBookId as string | null, version: 0, ...data } });
        return { ...row, kind: "reading", bookTitle: record.bookTitle, chapterTitle: record.chapterTitle } as CloudStudyRecord;
      }, { isolationLevel: "Serializable", maxWait: 5_000, timeout: 15_000 }));
    },
  };
}

function finishPage<T extends { id: string }, R extends CloudStudyRecord>(rows: T[], limit: number, map: (row: T) => R) {
  const hasMore = rows.length > limit;
  const visible = hasMore ? rows.slice(0, limit) : rows;
  return { items: visible.map(map), nextCursor: hasMore ? visible.at(-1)?.id ?? null : null };
}

let singleton: ReturnType<typeof createCloudStudyService> | undefined;
export function getCloudStudyService() {
  if (singleton) return singleton;
  if (process.env.CLOUD_DATA_PROVIDER === "edgeone") {
    return (singleton = getCloudServices().study);
  }
  singleton = createCloudStudyService({ repository: createPrismaCloudStudyRepository() });
  return singleton;
}
export { CloudStudyError } from "./study-core";
