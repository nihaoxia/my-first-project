import "server-only";

import type { Prisma, PrismaClient } from "@prisma/client";
import { getDb } from "../db";
import { createCloudBooksService, type CloudBookRecord, type CloudBooksRepository, type CloudBooksTransaction, type CreateBookPersistence } from "./books-core";
import { getCloudServices } from "./service-factory";
import { getOriginalBookStorage } from "./storage";

export { CloudBookError } from "./books-core";
export type { CloudBookDto } from "./books-core";

type DbClient = PrismaClient | Prisma.TransactionClient;
type BookRow = Prisma.OriginalBookGetPayload<{ include: { chapters: true } }>;
const OBJECT_LOCK_TRANSACTION_OPTIONS = { maxWait: 5_000, timeout: 150_000 } as const;

function mapBook(row: BookRow): CloudBookRecord {
  return {
    ...row,
    format: "TXT",
    chapters: row.chapters.map((chapter) => ({ ...chapter, status: chapter.status })),
  };
}

function findBook(db: DbClient, userId: string, bookId: string) {
  return db.originalBook.findFirst({
    where: { id: bookId, userId },
    include: { chapters: { orderBy: { index: "asc" } } },
  });
}

async function selectBook(db: DbClient, userId: string, bookId: string) {
  const row = await findBook(db, userId, bookId);
  if (!row) throw new Error("NOT_FOUND");
  return row;
}

function transactionAdapter(db: Prisma.TransactionClient): CloudBooksTransaction {
  return {
    async create(input: CreateBookPersistence) {
      const row = await db.originalBook.create({
        data: {
          id: input.id,
          userId: input.userId,
          title: input.title,
          author: input.author,
          sourceLanguage: input.sourceLanguage as never,
          format: "TXT",
          fileSizeBytes: input.fileSizeBytes,
          storagePath: input.storagePath,
          chapterCount: input.chapterCount,
          chapters: { create: input.chapters.map((chapter) => ({
            index: chapter.index, title: chapter.title, content: chapter.content,
            wordCount: chapter.wordCount, status: chapter.status, isSkipped: chapter.isSkipped,
          })) },
        },
        include: { chapters: { orderBy: { index: "asc" } } },
      });
      return mapBook(row);
    },
    async find(userId, bookId) {
      const row = await findBook(db, userId, bookId);
      return row ? mapBook(row) : null;
    },
    async delete(userId, bookId) {
      const row = await db.originalBook.findFirst({ where: { id: bookId, userId }, include: { chapters: { orderBy: { index: "asc" } } } });
      if (!row) return null;
      await db.originalBook.delete({ where: { id: row.id } });
      return mapBook(row);
    },
    async upsertCleanupIntent(input) {
      await upsertCleanup(db, input);
    },
    async findCleanupIntent(bucket, objectPath) {
      return (await db.storageCleanupTask.count({ where: { bucket, objectPath } })) > 0;
    },
    async resolveCleanupIntent(bucket, objectPath) {
      await db.storageCleanupTask.deleteMany({ where: { bucket, objectPath } });
    },
  };
}

export function createPrismaCloudBooksRepository(db: PrismaClient = getDb()): CloudBooksRepository {
  return {
    async list(userId) {
      const rows = await db.originalBook.findMany({ where: { userId }, orderBy: { uploadedAt: "desc" }, include: { chapters: { orderBy: { index: "asc" } } } });
      return rows.map(mapBook);
    },
    async find(userId, bookId) {
      const row = await findBook(db, userId, bookId);
      return row ? mapBook(row) : null;
    },
    async update(userId, bookId, data) {
      const updated = await db.originalBook.updateMany({ where: { id: bookId, userId }, data });
      if (updated.count !== 1) return null;
      return mapBook(await selectBook(db, userId, bookId));
    },
    async transaction(work) { return db.$transaction((tx) => work(transactionAdapter(tx))); },
    async withObjectLock(bucket, objectPath, work) {
      return db.$transaction(async (tx) => {
        const key = `${bucket}\u0000${objectPath}`;
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
        return work(transactionAdapter(tx));
      }, OBJECT_LOCK_TRANSACTION_OPTIONS);
    },
    async upsertCleanupIntent(input) {
      await upsertCleanup(db, input);
    },
    async resolveCleanupIntent(bucket, objectPath) {
      await db.storageCleanupTask.deleteMany({ where: { bucket, objectPath } });
    },
  };
}

async function upsertCleanup(db: DbClient, input: { userId: string; bucket: string; objectPath: string; reason: string }) {
  await db.storageCleanupTask.upsert({
    where: { bucket_objectPath: { bucket: input.bucket, objectPath: input.objectPath } },
    create: { ...input, nextAttemptAt: new Date(Date.now() + 5 * 60_000) },
    update: { reason: input.reason, attempts: 0, nextAttemptAt: new Date(Date.now() + 5 * 60_000) },
  });
}

let singleton: ReturnType<typeof createCloudBooksService> | undefined;
export function getCloudBooksService() {
  if (singleton) return singleton;
  if (process.env.CLOUD_DATA_PROVIDER === "edgeone") {
    return (singleton = getCloudServices().books);
  }
  const storage = getOriginalBookStorage();
  singleton = createCloudBooksService({ repository: createPrismaCloudBooksRepository(), storage });
  return singleton;
}
