import "server-only";

import { Prisma, type PrismaClient, type Prisma as PrismaTypes } from "@prisma/client";
import { getDb } from "../db";
import { createMcpTranslationProvider, parseMcpTranslationClientConfig } from "../translation/mcp-translation-provider";
import type { TranslationProvider } from "../translation/translation-provider";
import { getCloudServices } from "./service-factory";
import { withSerializableReconciliation, withSerializableRetry } from "./serializable-retry";
import { createCloudTranslationsService, estimateTranslationCostCents, MAX_CHECKPOINT_SEGMENTS, type CloudBookLanguage, type CloudTranslationRepository, type CloudTranslationSummary, type CloudTranslationTaskRecord, type PersistedTranslationSegment } from "./translations-core";

type Db = PrismaClient | PrismaTypes.TransactionClient;
const TX_OPTIONS = { maxWait: 5_000, timeout: 180_000, isolationLevel: Prisma.TransactionIsolationLevel.Serializable } as const;
function ownedTaskWhere(userId: string, translationId: string, taskId: string) { return { id: taskId, translatedBookId: translationId, translatedBook: { userId } }; }
async function selectTask(db: Db, userId: string, translationId: string, taskId: string) { return db.translationTask.findFirst({ where: ownedTaskWhere(userId, translationId, taskId), include: { chapter: true, translatedBook: { include: { originalBook: true } } } }); }
function checkpointSegments(value: PrismaTypes.JsonValue): PersistedTranslationSegment[] { return Array.isArray(value) ? value as unknown as PersistedTranslationSegment[] : []; }
function mapTask(row: NonNullable<Awaited<ReturnType<typeof selectTask>>>): CloudTranslationTaskRecord { return { id: row.id, translatedBookId: row.translatedBookId, userId: row.translatedBook.userId, chapterId: row.chapterId, chapterIndex: row.chapter.index, chapterTitle: row.chapter.title, chapterContent: row.chapter.content, sourceLanguage: row.translatedBook.originalBook.sourceLanguage as CloudBookLanguage, targetLanguage: row.translatedBook.targetLanguage as CloudBookLanguage, webSearchTerms: row.translatedBook.webSearchTerms, status: row.status, retryCount: row.retryCount, estimatedCostCents: Math.round(Number(row.estimatedCost) * 100), attemptId: row.attemptId, attemptStartedAt: row.attemptStartedAt, attemptExpiresAt: row.attemptExpiresAt, translatedSegments: checkpointSegments(row.translatedSegments), nextSegmentIndex: row.nextSegmentIndex, checkpointProvider: row.checkpointProvider, checkpointModel: row.checkpointModel, accumulatedInputTokens: row.accumulatedInputTokens, accumulatedOutputTokens: row.accumulatedOutputTokens, lastHeartbeatAt: row.lastHeartbeatAt, batchExecutionId: row.batchExecutionId, batchExecutionExpiresAt: row.batchExecutionExpiresAt, batchExecutionIndex: row.batchExecutionIndex, lastBatchExecutionId: row.lastBatchExecutionId, errorCode: row.errorCode, errorMessage: row.errorMessage }; }
async function findExecutionReceipt(db: Db, executionId: string) { return db.translationBatchReceipt.findUnique({ where: { executionId } }); }
async function findRetryReceipt(db: Db, retryExecutionId: string) { return db.translationRetryReceipt.findUnique({ where: { retryExecutionId }, include: { task: { include: { chapter: true, translatedBook: { include: { originalBook: true } } } } } }); }
function serialTx<T>(db: PrismaClient, work: (tx: PrismaTypes.TransactionClient) => Promise<T>, confirm?: () => Promise<{ confirmed: true; value: T } | { confirmed: false }>): Promise<T> { return confirm ? withSerializableReconciliation<T>(() => db.$transaction(work, TX_OPTIONS), confirm) : withSerializableRetry<T>(() => db.$transaction(work, TX_OPTIONS)); }

export function createPrismaCloudTranslationRepository(db: PrismaClient = getDb()): CloudTranslationRepository {
  return {
    async listTranslations(userId) { return db.translatedBook.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, select: { id: true, originalBookId: true, title: true, targetLanguage: true, status: true, progressPercent: true, completedChapters: true, failedChapters: true, createdAt: true } }) as never; },
    async findBook(userId, bookId) { const row = await db.originalBook.findFirst({ where: { id: bookId, userId }, include: { chapters: { orderBy: { index: "asc" } } } }); return row ? { id: row.id, title: row.title, sourceLanguage: row.sourceLanguage as CloudBookLanguage, chapters: row.chapters.map((chapter) => ({ ...chapter, status: chapter.status })) } : null; },
    async createTranslation(input): Promise<CloudTranslationSummary> {
      try { return await serialTx<CloudTranslationSummary>(db, async (tx) => {
        const book = await tx.originalBook.findFirst({ where: { id: input.originalBookId, userId: input.userId }, select: { id: true, sourceLanguage: true } });
        const selectedIds = input.tasks.map((task) => task.chapterId);
        const chapters = await tx.chapter.findMany({ where: { id: { in: selectedIds }, originalBookId: input.originalBookId, originalBook: { userId: input.userId }, status: "ACTIVE", isSkipped: false }, select: { id: true, content: true } });
        if (!book || book.sourceLanguage === input.targetLanguage || chapters.length !== selectedIds.length || new Set(chapters.map((chapter) => chapter.id)).size !== selectedIds.length) throw Object.assign(new Error("selected chapters changed"), { code: "TRANSLATION_CONFLICT" });
        const chapterById = new Map(chapters.map((chapter) => [chapter.id, chapter]));
        return await tx.translatedBook.create({ data: { id: input.id, userId: input.userId, originalBookId: input.originalBookId, title: input.title, targetLanguage: input.targetLanguage, status: "QUEUED", webSearchTerms: input.webSearchTerms, tasks: { create: input.tasks.map((task) => { const chapter = chapterById.get(task.chapterId)!; return { id: task.id, chapterId: task.chapterId, estimatedCost: new Prisma.Decimal(estimateTranslationCostCents(book.sourceLanguage as CloudBookLanguage, chapter.content.length)).div(100) }; }) } }, select: { id: true, originalBookId: true, title: true, targetLanguage: true, status: true, progressPercent: true, completedChapters: true, failedChapters: true, createdAt: true } }) as never;
      }, async () => { const row = await db.translatedBook.findFirst({ where: { id: input.id, userId: input.userId }, select: { id: true, originalBookId: true, title: true, targetLanguage: true, status: true, progressPercent: true, completedChapters: true, failedChapters: true, createdAt: true } }); return row ? { confirmed: true as const, value: row as never } : { confirmed: false as const }; }); } catch (error) { const row = await db.translatedBook.findFirst({ where: { id: input.id, userId: input.userId }, select: { id: true, originalBookId: true, title: true, targetLanguage: true, status: true, progressPercent: true, completedChapters: true, failedChapters: true, createdAt: true } }); if (row) return row as never; throw error; }
    },
    async listTasks(userId, translationId) { const translation = await db.translatedBook.findFirst({ where: { id: translationId, userId }, select: { id: true } }); if (!translation) return null; const rows = await db.translationTask.findMany({ where: { translatedBookId: translationId, translatedBook: { userId } }, include: { chapter: true, translatedBook: { include: { originalBook: true } } }, orderBy: { chapter: { index: "asc" } } }); return rows.map(mapTask); },
    async claimTask(input): Promise<CloudTranslationTaskRecord | null> {
      try { return await serialTx<CloudTranslationTaskRecord | null>(db, async (tx) => {
        const row = await selectTask(tx, input.userId, input.translationId, input.taskId); if (!row) return null;
        if (row.status === "TRANSLATING" && row.attemptExpiresAt && row.attemptExpiresAt > input.now) return mapTask(row);
        const oldAttemptId = row.status === "TRANSLATING" ? row.attemptId : null;
        const updated = await tx.translationTask.updateMany({ where: { ...ownedTaskWhere(input.userId, input.translationId, input.taskId), OR: [{ status: "PENDING" }, { status: "TRANSLATING", attemptId: oldAttemptId, attemptExpiresAt: { lte: input.now } }] }, data: { status: "TRANSLATING", attemptId: input.attemptId, attemptStartedAt: input.now, attemptExpiresAt: input.expiresAt, lastHeartbeatAt: input.now, batchExecutionId: null, batchExecutionExpiresAt: null, batchExecutionIndex: null, startedAt: row.startedAt ?? input.now, errorCode: null, errorMessage: null } });
        if (updated.count !== 1) return null;
        if (oldAttemptId) await releaseBalance(tx, input.userId, input.taskId, oldAttemptId, input.now);
        await reserveBalance(tx, input.userId, input.taskId, input.attemptId, row.estimatedCost);
        await refreshTranslation(tx, input.userId, input.translationId);
        const claimed = await selectTask(tx, input.userId, input.translationId, input.taskId); return claimed ? mapTask(claimed) : null;
      }, async () => { const row = await selectTask(db, input.userId, input.translationId, input.taskId); return row?.status === "TRANSLATING" && row.attemptId === input.attemptId ? { confirmed: true as const, value: mapTask(row) } : { confirmed: false as const }; }); } catch (error) { const row = await selectTask(db, input.userId, input.translationId, input.taskId); if (row?.status === "TRANSLATING" && row.attemptId === input.attemptId) return mapTask(row); throw error; }
    },
    async acquireBatchExecution(input): Promise<CloudTranslationTaskRecord | null> {
      return serialTx<CloudTranslationTaskRecord | null>(db, async (tx) => {
        const updated = await tx.translationTask.updateMany({ where: { ...ownedTaskWhere(input.userId, input.translationId, input.taskId), status: "TRANSLATING", attemptId: input.attemptId, attemptExpiresAt: { gt: input.now }, nextSegmentIndex: input.expectedNextSegmentIndex, OR: [{ batchExecutionId: null }, { batchExecutionExpiresAt: { lte: input.now } }] }, data: { batchExecutionId: input.executionId, batchExecutionExpiresAt: input.executionExpiresAt, batchExecutionIndex: input.expectedNextSegmentIndex, lastHeartbeatAt: input.now, attemptExpiresAt: input.attemptExpiresAt } });
        if (updated.count !== 1) return null;
        const row = await selectTask(tx, input.userId, input.translationId, input.taskId); return row ? mapTask(row) : null;
      }, async () => { const row = await selectTask(db, input.userId, input.translationId, input.taskId); return row?.status === "TRANSLATING" && row.attemptId === input.attemptId && row.batchExecutionId === input.executionId && row.batchExecutionIndex === input.expectedNextSegmentIndex ? { confirmed: true as const, value: mapTask(row) } : { confirmed: false as const }; });
    },
    async checkpointTask(input): Promise<"CHECKPOINTED" | "COMPLETED" | null> {
      try { return await serialTx<"CHECKPOINTED" | "COMPLETED" | null>(db, async (tx) => {
        const task = await selectTask(tx, input.userId, input.translationId, input.taskId); if (!task || task.status !== "TRANSLATING" || task.attemptId !== input.attemptId || !task.attemptExpiresAt || task.attemptExpiresAt <= input.now || task.nextSegmentIndex !== input.expectedNextSegmentIndex) return null;
        const stored = checkpointSegments(task.translatedSegments); const combined = [...stored, ...input.segments];
        if (stored.length !== task.nextSegmentIndex || combined.length > MAX_CHECKPOINT_SEGMENTS || input.segments.length < 1 || input.segments.length > 10) return null;
        const next = task.nextSegmentIndex + input.segments.length;
        const data = { translatedSegments: combined as unknown as PrismaTypes.InputJsonValue, nextSegmentIndex: next, checkpointProvider: input.providerName, checkpointModel: input.model, accumulatedInputTokens: { increment: input.inputTokens }, accumulatedOutputTokens: { increment: input.outputTokens }, lastHeartbeatAt: input.final ? null : input.now, attemptExpiresAt: input.final ? null : input.expiresAt, batchExecutionId: null, batchExecutionExpiresAt: null, batchExecutionIndex: null, lastBatchExecutionId: input.executionId, ...(input.final ? { status: "COMPLETED" as const, completedAt: input.now, attemptId: null, attemptStartedAt: null, errorCode: null, errorMessage: null } : {}) };
        const updated = await tx.translationTask.updateMany({ where: { ...ownedTaskWhere(input.userId, input.translationId, input.taskId), status: "TRANSLATING", attemptId: input.attemptId, batchExecutionId: input.executionId, batchExecutionIndex: input.expectedNextSegmentIndex, batchExecutionExpiresAt: { gt: input.now }, attemptExpiresAt: { gt: input.now }, nextSegmentIndex: input.expectedNextSegmentIndex }, data }); if (updated.count !== 1) return null;
        if (input.final) { const content = combined.map((segment) => segment.translatedText).join("\n\n"); const inputTokens = task.accumulatedInputTokens + input.inputTokens; const outputTokens = task.accumulatedOutputTokens + input.outputTokens; const chapterData = { title: input.chapterTitle, content, providerName: input.providerName, modelName: input.model, inputTokens, outputTokens, wordCount: content.trim() ? content.trim().split(/\s+/u).length : 0, qualityPassed: true }; await tx.translatedChapter.upsert({ where: { translatedBookId_chapterId: { translatedBookId: input.translationId, chapterId: task.chapterId } }, create: { translatedBookId: input.translationId, chapterId: task.chapterId, ...chapterData }, update: chapterData }); await settleBalance(tx, input.userId, input.taskId, input.attemptId, input.now); }
        const outcome = input.final ? "COMPLETED" : "CHECKPOINTED";
        await tx.translationBatchReceipt.create({ data: { executionId: input.executionId, userId: input.userId, taskId: input.taskId, attemptId: input.attemptId, startSegmentIndex: input.expectedNextSegmentIndex, endSegmentIndex: next, outcome } });
        await refreshTranslation(tx, input.userId, input.translationId); return outcome;
      }, async () => { const receipt = await findExecutionReceipt(db, input.executionId); return receipt && receipt.userId === input.userId && receipt.taskId === input.taskId && receipt.attemptId === input.attemptId && receipt.startSegmentIndex === input.expectedNextSegmentIndex && receipt.endSegmentIndex === input.expectedNextSegmentIndex + input.segments.length && (receipt.outcome === "CHECKPOINTED" || receipt.outcome === "COMPLETED") ? { confirmed: true as const, value: receipt.outcome } : { confirmed: false as const }; }); } catch (error) { const receipt = await findExecutionReceipt(db, input.executionId); if (receipt && receipt.userId === input.userId && receipt.taskId === input.taskId && receipt.attemptId === input.attemptId && receipt.startSegmentIndex === input.expectedNextSegmentIndex && receipt.endSegmentIndex === input.expectedNextSegmentIndex + input.segments.length && (receipt.outcome === "CHECKPOINTED" || receipt.outcome === "COMPLETED")) return receipt.outcome; throw error; }
    },
    async failTask(input): Promise<boolean> {
      try { return await serialTx<boolean>(db, async (tx) => { const task = await selectTask(tx, input.userId, input.translationId, input.taskId); if (!task || task.status !== "TRANSLATING" || task.attemptId !== input.attemptId || task.batchExecutionId !== input.executionId || task.batchExecutionIndex === null || !task.attemptExpiresAt || task.attemptExpiresAt <= input.now) return false; const updated = await tx.translationTask.updateMany({ where: { ...ownedTaskWhere(input.userId, input.translationId, input.taskId), status: "TRANSLATING", attemptId: input.attemptId, batchExecutionId: input.executionId, attemptExpiresAt: { gt: input.now } }, data: { status: "FAILED", errorCode: input.errorCode, errorMessage: input.errorMessage, attemptId: null, attemptStartedAt: null, attemptExpiresAt: null, lastHeartbeatAt: null, batchExecutionId: null, batchExecutionExpiresAt: null, batchExecutionIndex: null, lastBatchExecutionId: input.executionId } }); if (updated.count !== 1) return false; await releaseBalance(tx, input.userId, input.taskId, input.attemptId, input.now); await tx.translationBatchReceipt.create({ data: { executionId: input.executionId, userId: input.userId, taskId: input.taskId, attemptId: input.attemptId, startSegmentIndex: task.batchExecutionIndex, endSegmentIndex: task.batchExecutionIndex, outcome: "FAILED", errorCode: input.errorCode } }); await refreshTranslation(tx, input.userId, input.translationId); return true; }, async () => { const receipt = await findExecutionReceipt(db, input.executionId); return receipt && receipt.userId === input.userId && receipt.taskId === input.taskId && receipt.attemptId === input.attemptId && receipt.outcome === "FAILED" && receipt.errorCode === input.errorCode ? { confirmed: true as const, value: true } : { confirmed: false as const }; }); }
      catch (error) { const receipt = await findExecutionReceipt(db, input.executionId); if (receipt && receipt.userId === input.userId && receipt.taskId === input.taskId && receipt.attemptId === input.attemptId && receipt.outcome === "FAILED" && receipt.errorCode === input.errorCode) return true; throw error; }
    },
    async retryTask(input): Promise<CloudTranslationTaskRecord | null> {
      let expectedFromRetryCount: number | null = null;
      return serialTx<CloudTranslationTaskRecord | null>(db, async (tx) => {
        const existing = await tx.translationRetryReceipt.findUnique({ where: { retryExecutionId: input.retryExecutionId } });
        if (existing) {
          if (existing.userId !== input.userId || existing.taskId !== input.taskId) return null;
          const current = await selectTask(tx, input.userId, input.translationId, input.taskId);
          return current ? mapTask(current) : null;
        }
        const snapshot = await selectTask(tx, input.userId, input.translationId, input.taskId);
        if (!snapshot || snapshot.status !== "FAILED" || snapshot.retryCount >= input.maxRetries) return null;
        expectedFromRetryCount = snapshot.retryCount;
        const resetCheckpoint = snapshot.errorCode === "CHECKPOINT_INVALID";
        const updated = await tx.translationTask.updateMany({
          where: {
            ...ownedTaskWhere(input.userId, input.translationId, input.taskId),
            status: "FAILED",
            retryCount: snapshot.retryCount,
            errorCode: snapshot.errorCode,
          },
          data: {
            status: "PENDING",
            retryCount: { increment: 1 },
            errorCode: null,
            errorMessage: null,
            completedAt: null,
            attemptId: null,
            attemptStartedAt: null,
            attemptExpiresAt: null,
            lastHeartbeatAt: null,
            batchExecutionId: null,
            batchExecutionExpiresAt: null,
            batchExecutionIndex: null,
            lastBatchExecutionId: resetCheckpoint ? null : undefined,
            translatedSegments: resetCheckpoint ? [] : undefined,
            nextSegmentIndex: resetCheckpoint ? 0 : undefined,
            checkpointProvider: resetCheckpoint ? null : undefined,
            checkpointModel: resetCheckpoint ? null : undefined,
            accumulatedInputTokens: resetCheckpoint ? 0 : undefined,
            accumulatedOutputTokens: resetCheckpoint ? 0 : undefined,
          },
        });
        if (updated.count !== 1) throw Object.assign(new Error("translation retry state changed"), { code: "P2034" });
        await tx.translationRetryReceipt.create({ data: { retryExecutionId: input.retryExecutionId, userId: input.userId, taskId: input.taskId, fromRetryCount: snapshot.retryCount, toRetryCount: snapshot.retryCount + 1, resetCheckpoint } });
        await refreshTranslation(tx, input.userId, input.translationId);
        const row = await selectTask(tx, input.userId, input.translationId, input.taskId);
        return row ? mapTask(row) : null;
      }, async () => {
        const receipt = await findRetryReceipt(db, input.retryExecutionId);
        return receipt && expectedFromRetryCount !== null && receipt.userId === input.userId && receipt.taskId === input.taskId && receipt.fromRetryCount === expectedFromRetryCount && receipt.toRetryCount === expectedFromRetryCount + 1
          ? { confirmed: true as const, value: mapTask(receipt.task) }
          : { confirmed: false as const };
      });
    },
    async cancelTask(input): Promise<CloudTranslationTaskRecord | "BUSY" | null> {
      try { return await serialTx<CloudTranslationTaskRecord | "BUSY" | null>(db, async (tx) => { const current = await selectTask(tx, input.userId, input.translationId, input.taskId); if (!current) return null; if (current.batchExecutionId && current.batchExecutionExpiresAt && current.batchExecutionExpiresAt > input.now) return "BUSY"; const whereStatus = input.attemptId ? { status: "TRANSLATING" as const, attemptId: input.attemptId, OR: [{ batchExecutionId: null }, { batchExecutionExpiresAt: { lte: input.now } }] } : { status: { in: ["PENDING", "FAILED"] as Array<"PENDING" | "FAILED"> } }; const updated = await tx.translationTask.updateMany({ where: { ...ownedTaskWhere(input.userId, input.translationId, input.taskId), ...whereStatus }, data: { status: "CANCELED", completedAt: input.now, attemptId: null, attemptStartedAt: null, attemptExpiresAt: null, lastHeartbeatAt: null, batchExecutionId: null, batchExecutionExpiresAt: null, batchExecutionIndex: null } }); if (updated.count !== 1) return null; if (input.attemptId) await releaseBalance(tx, input.userId, input.taskId, input.attemptId, input.now); await refreshTranslation(tx, input.userId, input.translationId); const row = await selectTask(tx, input.userId, input.translationId, input.taskId); return row ? mapTask(row) : null; }, async () => { const row = await selectTask(db, input.userId, input.translationId, input.taskId); return row?.status === "CANCELED" && !row.attemptId ? { confirmed: true as const, value: mapTask(row) } : { confirmed: false as const }; }); }
      catch (error) { const row = await selectTask(db, input.userId, input.translationId, input.taskId); if (row?.status === "CANCELED" && !row.attemptId) return mapTask(row); throw error; }
    },
    async getReader(userId, translationId) { const row = await db.translatedBook.findFirst({ where: { id: translationId, userId }, select: { id: true, originalBookId: true, title: true, targetLanguage: true, translatedChapters: { orderBy: { chapter: { index: "asc" } }, select: { id: true, chapterId: true, title: true, content: true, chapter: { select: { index: true } } } } } }); return row ? { id: row.id, originalBookId: row.originalBookId, title: row.title, targetLanguage: row.targetLanguage as CloudBookLanguage, chapters: row.translatedChapters.map((chapter) => ({ id: chapter.id, chapterId: chapter.chapterId, index: chapter.chapter.index, title: chapter.title, content: chapter.content })) } : null; },
  };
}

async function reserveBalance(tx: PrismaTypes.TransactionClient, userId: string, taskId: string, attemptId: string, amount: Prisma.Decimal) { const balance = await tx.accountBalance.findUnique({ where: { userId } }); if (!balance) throw Object.assign(new Error("balance missing"), { code: "INSUFFICIENT_BALANCE" }); const useFree = balance.freeChapters > 0; const charge = useFree ? new Prisma.Decimal(0) : amount; const debited = await tx.accountBalance.updateMany({ where: { userId, ...(useFree ? { freeChapters: { gt: 0 } } : { available: { gte: charge } }) }, data: useFree ? { freeChapters: { decrement: 1 } } : { available: { decrement: charge }, frozen: { increment: charge } } }); if (debited.count !== 1) throw Object.assign(new Error("insufficient balance"), { code: "INSUFFICIENT_BALANCE" }); const hold = await tx.balanceHold.create({ data: { userId, taskId, attemptId, amount: charge, freeUnits: useFree ? 1 : 0 } }); await tx.balanceLedger.create({ data: { userId, taskId, holdId: hold.id, type: "HOLD", amount: charge, description: "Translation attempt balance hold" } }); }
async function settleBalance(tx: PrismaTypes.TransactionClient, userId: string, taskId: string, attemptId: string, at: Date) { const hold = await tx.balanceHold.findFirst({ where: { userId, taskId, attemptId, releasedAt: null, chargedAt: null } }); if (!hold) return; const claimed = await tx.balanceHold.updateMany({ where: { id: hold.id, userId, taskId, attemptId, chargedAt: null, releasedAt: null }, data: { chargedAt: at } }); if (claimed.count !== 1) return; if (hold.amount.gt(0)) await tx.accountBalance.update({ where: { userId }, data: { frozen: { decrement: hold.amount } } }); await tx.balanceLedger.create({ data: { userId, taskId, holdId: hold.id, type: "CHARGE", amount: hold.amount, description: "Translation attempt settled" } }); }
async function releaseBalance(tx: PrismaTypes.TransactionClient, userId: string, taskId: string, attemptId: string, at: Date) { const hold = await tx.balanceHold.findFirst({ where: { userId, taskId, attemptId, releasedAt: null, chargedAt: null } }); if (!hold) return; const claimed = await tx.balanceHold.updateMany({ where: { id: hold.id, userId, taskId, attemptId, chargedAt: null, releasedAt: null }, data: { releasedAt: at } }); if (claimed.count !== 1) return; await tx.accountBalance.update({ where: { userId }, data: hold.freeUnits > 0 ? { freeChapters: { increment: hold.freeUnits } } : { available: { increment: hold.amount }, frozen: { decrement: hold.amount } } }); await tx.balanceLedger.create({ data: { userId, taskId, holdId: hold.id, type: "RELEASE", amount: hold.amount, description: "Translation attempt hold released" } }); }
async function refreshTranslation(tx: PrismaTypes.TransactionClient, userId: string, translationId: string) { const tasks = await tx.translationTask.groupBy({ by: ["status"], where: { translatedBookId: translationId, translatedBook: { userId } }, _count: true }); const total = tasks.reduce((sum, group) => sum + group._count, 0); const count = (status: typeof tasks[number]["status"]) => tasks.find((group) => group.status === status)?._count ?? 0; const completed = count("COMPLETED"); const failed = count("FAILED"); const canceled = count("CANCELED"); const needsReview = count("NEEDS_REVIEW"); const active = total - completed - failed - canceled - needsReview; const status = total > 0 && completed === total ? "COMPLETED" : total > 0 && canceled === total ? "CANCELED" : needsReview > 0 ? "NEEDS_REVIEW" : active > 0 ? "PROCESSING" : failed > 0 ? "FAILED" : "CANCELED"; await tx.translatedBook.updateMany({ where: { id: translationId, userId }, data: { completedChapters: completed, failedChapters: failed, progressPercent: total ? Math.floor(((completed + failed + canceled + needsReview) / total) * 100) : 0, status } }); }

let singleton: ReturnType<typeof createCloudTranslationsService> | undefined;
let providerSingleton: TranslationProvider | undefined;
function resolveProvider() { if (providerSingleton) return providerSingleton; const config = parseMcpTranslationClientConfig(process.env); if (!config.ok) throw Object.assign(new Error("translation MCP not configured"), { code: config.code }); return (providerSingleton = createMcpTranslationProvider(config.value)); }
export function getCloudTranslationsService() {
  if (singleton) return singleton;
  if (process.env.CLOUD_DATA_PROVIDER === "edgeone") {
    return (singleton = getCloudServices().translations);
  }
  const provider: TranslationProvider = {
    name: "lazy-mcp",
    translateSegments: (input) => resolveProvider().translateSegments(input),
  };
  const base = createCloudTranslationsService({
    repository: createPrismaCloudTranslationRepository(),
    provider,
  });
  const create = base.create;
  base.create = async (...args) => {
    resolveProvider();
    return create(...args);
  };
  return (singleton = base);
}
