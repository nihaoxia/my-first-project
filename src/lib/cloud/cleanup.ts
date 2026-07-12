import "server-only";

import type { Prisma, PrismaClient } from "@prisma/client";
import { getDb } from "../db";
import { createStorageCleanupService, type StorageCleanupRepository, type StorageCleanupTransaction } from "./cleanup-core";
import { getOriginalBookStorage } from "./storage";

const CLEANUP_TRANSACTION_OPTIONS = { maxWait: 5_000, timeout: 150_000 } as const;

function cleanupTransaction(tx: Prisma.TransactionClient): StorageCleanupTransaction {
  return {
    findCleanupIntent(bucket, objectPath) {
      return tx.storageCleanupTask.findUnique({ where: { bucket_objectPath: { bucket, objectPath } } });
    },
    async originalBookExists(userId, bookId, objectPath) {
      return (await tx.originalBook.count({ where: { id: bookId, userId, storagePath: objectPath } })) > 0;
    },
    async resolveCleanupIntent(bucket, objectPath) {
      await tx.storageCleanupTask.deleteMany({ where: { bucket, objectPath } });
    },
    async markCleanupFailure(id, attempts, nextAttemptAt) {
      await tx.storageCleanupTask.update({ where: { id }, data: { attempts, nextAttemptAt } });
    },
  };
}

export function createPrismaStorageCleanupRepository(db: PrismaClient = getDb()): StorageCleanupRepository {
  return {
    listDue(now, limit) {
      return db.storageCleanupTask.findMany({
        where: { OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }] },
        orderBy: [{ nextAttemptAt: "asc" }, { createdAt: "asc" }],
        take: limit,
      });
    },
    withObjectLock(bucket, objectPath, work) {
      return db.$transaction(async (tx) => {
        const key = `${bucket}\u0000${objectPath}`;
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
        return work(cleanupTransaction(tx));
      }, CLEANUP_TRANSACTION_OPTIONS);
    },
  };
}

export function getStorageCleanupService() {
  return createStorageCleanupService({ repository: createPrismaStorageCleanupRepository(), storage: getOriginalBookStorage() });
}

export function runStorageCleanupBatch(limit?: number) {
  return getStorageCleanupService().runBatch(limit);
}
