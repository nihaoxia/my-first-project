import { assertOriginalBookObjectPathForOwner, parseOriginalBookObjectPath, type CloudStorageService } from "./storage-core.ts";

export type CleanupIntent = {
  id: string; userId: string; bucket: string; objectPath: string; reason: string;
  attempts: number; nextAttemptAt: Date | null;
};

export interface StorageCleanupTransaction {
  findCleanupIntent(bucket: string, objectPath: string): Promise<CleanupIntent | null>;
  originalBookExists(userId: string, bookId: string, objectPath: string): Promise<boolean>;
  resolveCleanupIntent(bucket: string, objectPath: string): Promise<void>;
  markCleanupFailure(id: string, attempts: number, nextAttemptAt: Date): Promise<void>;
}

export interface StorageCleanupRepository {
  listDue(now: Date, limit: number): Promise<CleanupIntent[]>;
  withObjectLock<T>(bucket: string, objectPath: string, work: (transaction: StorageCleanupTransaction) => Promise<T>): Promise<T>;
}

export function createStorageCleanupService(input: {
  repository: StorageCleanupRepository;
  storage: Pick<CloudStorageService, "bucket" | "remove">;
  now?: () => Date;
}) {
  const now = input.now ?? (() => new Date());
  return {
    async runBatch(limit = 25) {
      const boundedLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
      const candidates = await input.repository.listDue(now(), boundedLimit);
      const summary = { claimed: 0, removed: 0, resolved: 0, failed: 0 };
      for (const candidate of candidates) {
        try {
          const outcome = await input.repository.withObjectLock(candidate.bucket, candidate.objectPath, async (transaction) => {
            const intent = await transaction.findCleanupIntent(candidate.bucket, candidate.objectPath);
            if (!intent || (intent.nextAttemptAt && intent.nextAttemptAt > now())) return "skipped" as const;
            summary.claimed += 1;
            const parsed = parseOriginalBookObjectPath(intent.objectPath);
            if (!parsed || parsed.userId !== intent.userId || intent.bucket !== input.storage.bucket) {
              await transaction.markCleanupFailure(intent.id, intent.attempts + 1, nextAttempt(now(), intent.attempts + 1));
              return "failed" as const;
            }
            assertOriginalBookObjectPathForOwner(intent.objectPath, intent.userId, parsed.bookId);
            if (await transaction.originalBookExists(intent.userId, parsed.bookId, intent.objectPath)) {
              await transaction.resolveCleanupIntent(intent.bucket, intent.objectPath);
              return "resolved" as const;
            }
            try { await input.storage.remove(intent.objectPath); }
            catch {
              await transaction.markCleanupFailure(intent.id, intent.attempts + 1, nextAttempt(now(), intent.attempts + 1));
              return "failed" as const;
            }
            await transaction.resolveCleanupIntent(intent.bucket, intent.objectPath);
            return "removed" as const;
          });
          if (outcome === "removed") { summary.removed += 1; summary.resolved += 1; }
          else if (outcome === "resolved") summary.resolved += 1;
          else if (outcome === "failed") summary.failed += 1;
        } catch { summary.failed += 1; }
      }
      return summary;
    },
  };
}

function nextAttempt(now: Date, attempts: number): Date {
  const delay = Math.min(24 * 60 * 60_000, 60_000 * 2 ** Math.min(attempts - 1, 10));
  return new Date(now.getTime() + delay);
}
