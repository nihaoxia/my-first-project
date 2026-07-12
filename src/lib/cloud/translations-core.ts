import { splitChapterIntoTranslationSegments, type TranslationSegment } from "../translation/translation-segments.ts";
import type { TranslationProvider, TranslationProviderResult } from "../translation/translation-provider.ts";

export type CloudTaskStatus = "PENDING" | "EXTRACTING_TERMS" | "QUEUED" | "TRANSLATING" | "QUALITY_CHECKING" | "COMPLETED" | "NEEDS_REVIEW" | "FAILED" | "CANCELED";
export type CloudBookLanguage = "CHINESE" | "ENGLISH" | "JAPANESE" | "KOREAN" | "RUSSIAN" | "GERMAN" | "SPANISH" | "FRENCH" | "UNKNOWN";
export type PersistedTranslationSegment = { segmentId: string; index: number; translatedText: string };

export type CloudTranslationTaskRecord = {
  id: string; translatedBookId: string; userId: string; chapterId: string; chapterIndex: number;
  chapterTitle: string; chapterContent: string; sourceLanguage: CloudBookLanguage; targetLanguage: CloudBookLanguage;
  webSearchTerms: boolean; status: CloudTaskStatus; retryCount: number; estimatedCostCents: number;
  attemptId: string | null; attemptStartedAt: Date | null; attemptExpiresAt: Date | null;
  nextSegmentIndex: number; translatedSegments: PersistedTranslationSegment[]; checkpointProvider: string | null;
  checkpointModel: string | null; accumulatedInputTokens: number; accumulatedOutputTokens: number; lastHeartbeatAt: Date | null;
  batchExecutionId: string | null; batchExecutionExpiresAt: Date | null; batchExecutionIndex: number | null;
  lastBatchExecutionId: string | null;
  errorCode?: string | null; errorMessage?: string | null;
};
export type CloudTranslationSummary = { id: string; originalBookId: string; title: string; targetLanguage: CloudBookLanguage; status: string; progressPercent: number; completedChapters: number; failedChapters: number; createdAt: Date };
export type CloudTranslationTaskDto = { id: string; translationId: string; chapterId: string; chapterIndex: number; chapterTitle: string; status: CloudTaskStatus; retryCount: number; estimatedCostCents: number; progressPercent: number; canContinue: boolean; isLeaseExpired: boolean; error?: { code: string; message: string } };
export type CloudReaderDto = { id: string; originalBookId: string; title: string; targetLanguage: CloudBookLanguage; chapters: Array<{ id: string; chapterId: string; index: number; title: string; content: string }> };
type OriginalBookForTranslation = { id: string; title: string; sourceLanguage: CloudBookLanguage; chapters: Array<{ id: string; index: number; title: string; content: string; wordCount: number; status: string; isSkipped: boolean }> };
type CreateTranslationPersistence = { id: string; userId: string; originalBookId: string; title: string; targetLanguage: CloudBookLanguage; webSearchTerms: boolean; tasks: Array<{ id: string; chapterId: string; estimatedCostCents: number }> };
type CheckpointInput = { userId: string; translationId: string; taskId: string; attemptId: string; expectedNextSegmentIndex: number; now: Date; expiresAt: Date; segments: PersistedTranslationSegment[]; providerName: string; model: string; inputTokens: number; outputTokens: number; final: boolean; chapterTitle: string };

export type CloudTranslationRepository = {
  listTranslations(userId: string): Promise<CloudTranslationSummary[]>;
  findBook(userId: string, bookId: string): Promise<OriginalBookForTranslation | null>;
  createTranslation(input: CreateTranslationPersistence): Promise<CloudTranslationSummary>;
  listTasks(userId: string, translationId: string): Promise<CloudTranslationTaskRecord[] | null>;
  claimTask(input: { userId: string; translationId: string; taskId: string; attemptId: string; now: Date; expiresAt: Date }): Promise<CloudTranslationTaskRecord | null>;
  acquireBatchExecution(input: { userId: string; translationId: string; taskId: string; attemptId: string; expectedNextSegmentIndex: number; executionId: string; now: Date; executionExpiresAt: Date; attemptExpiresAt: Date }): Promise<CloudTranslationTaskRecord | null>;
  checkpointTask(input: CheckpointInput & { executionId: string }): Promise<"CHECKPOINTED" | "COMPLETED" | null>;
  failTask(input: { userId: string; translationId: string; taskId: string; attemptId: string; executionId: string; now: Date; errorCode: string; errorMessage: string }): Promise<boolean>;
  retryTask(input: { userId: string; translationId: string; taskId: string; retryExecutionId: string; maxRetries: number; now: Date }): Promise<CloudTranslationTaskRecord | null>;
  cancelTask(input: { userId: string; translationId: string; taskId: string; attemptId: string | null; now: Date }): Promise<CloudTranslationTaskRecord | "BUSY" | null>;
  getReader(userId: string, translationId: string): Promise<CloudReaderDto | null>;
};

export type CloudTranslationErrorCode = "INVALID_TRANSLATION" | "BOOK_NOT_FOUND" | "TRANSLATION_NOT_FOUND" | "TASK_NOT_FOUND" | "TRANSLATION_CONFLICT" | "TASK_CONFLICT" | "TASK_BUSY" | "RETRY_LIMIT_REACHED" | "STALE_ATTEMPT" | "CHECKPOINT_INVALID" | "WEB_LOOKUP_UNAVAILABLE" | "TRANSLATION_FAILED" | "PROVIDER_RESPONSE_INVALID" | "PROVIDER_RATE_LIMITED" | "PROVIDER_TIMEOUT" | "MCP_UNAVAILABLE" | "MCP_NOT_CONFIGURED";
export class CloudTranslationError extends Error { readonly code: CloudTranslationErrorCode; constructor(code: CloudTranslationErrorCode, message: string = code) { super(message); this.code = code; this.name = "CloudTranslationError"; } }

const TARGET_LANGUAGES = new Set<CloudBookLanguage>(["CHINESE", "ENGLISH", "JAPANESE", "KOREAN", "RUSSIAN", "GERMAN", "SPANISH", "FRENCH"]);
const LANGUAGE_LABEL: Record<CloudBookLanguage, string> = { CHINESE: "中文", ENGLISH: "英文", JAPANESE: "日文", KOREAN: "韩文", RUSSIAN: "俄语", GERMAN: "德语", SPANISH: "西班牙语", FRENCH: "法语", UNKNOWN: "未知" };
export const TRANSLATION_LEASE_MS = 10 * 60_000;
export const BATCH_EXECUTION_LEASE_MS = 7 * 60_000;
export const MAX_CHECKPOINT_SEGMENTS = 2_000;
export const MAX_TRANSLATED_SEGMENT_UTF8_BYTES = 32 * 1024;
export const MAX_TRANSLATED_CHAPTER_UTF8_BYTES = 5 * 1024 * 1024;
const DEFAULT_MAX_RETRIES = 3;

export function createCloudTranslationsService(input: { repository: CloudTranslationRepository; provider: TranslationProvider; now?: () => Date; uuid?: () => string; leaseMs?: number; maxRetries?: number }) {
  const now = input.now ?? (() => new Date()); const uuid = input.uuid ?? (() => crypto.randomUUID());
  const leaseMs = input.leaseMs ?? TRANSLATION_LEASE_MS; const maxRetries = input.maxRetries ?? DEFAULT_MAX_RETRIES;
  return {
    list: (userId: string) => input.repository.listTranslations(userId),
    async create(userId: string, raw: unknown) {
      const value = parseCreate(raw); if (value.webSearchTerms) throw new CloudTranslationError("WEB_LOOKUP_UNAVAILABLE"); const book = await input.repository.findBook(userId, value.originalBookId);
      if (!book) throw new CloudTranslationError("BOOK_NOT_FOUND");
      if (book.sourceLanguage === value.targetLanguage) throw new CloudTranslationError("INVALID_TRANSLATION");
      const active = book.chapters.filter((chapter) => chapter.status === "ACTIVE" && !chapter.isSkipped);
      const selected = value.chapterIds ? active.filter((chapter) => value.chapterIds!.includes(chapter.id)) : active;
      if (!selected.length || (value.chapterIds && selected.length !== value.chapterIds.length)) throw new CloudTranslationError("INVALID_TRANSLATION");
      const tasks = selected.sort((a, b) => a.index - b.index).map((chapter) => ({ id: uuid(), chapterId: chapter.id, estimatedCostCents: estimateTranslationCostCents(book.sourceLanguage, chapter.content.length) }));
      try { return await input.repository.createTranslation({ id: uuid(), userId, originalBookId: book.id, title: value.title ?? `${book.title} (${LANGUAGE_LABEL[value.targetLanguage]})`, targetLanguage: value.targetLanguage, webSearchTerms: value.webSearchTerms, tasks }); }
      catch (error) { if (isRecord(error) && error.code === "P2002") throw new CloudTranslationError("TRANSLATION_CONFLICT"); throw error; }
    },
    async listTasks(userId: string, translationId: string) { const tasks = await input.repository.listTasks(userId, translationId); if (!tasks) throw new CloudTranslationError("TRANSLATION_NOT_FOUND"); return tasks.sort((a, b) => a.chapterIndex - b.chapterIndex).map((task) => toTaskDto(task, now())); },
    async run(userId: string, translationId: string, taskId: string, signal?: AbortSignal) {
      await requireTask(input.repository, userId, translationId, taskId);
      const claimedAt = now();
      const task = await input.repository.claimTask({ userId, translationId, taskId, attemptId: uuid(), now: claimedAt, expiresAt: new Date(claimedAt.getTime() + leaseMs) });
      if (!task || !task.attemptId) throw new CloudTranslationError("TASK_CONFLICT");
      const executionId = uuid();
      const executionNow = now();
      const executingTask = await input.repository.acquireBatchExecution({ userId, translationId, taskId, attemptId: task.attemptId, expectedNextSegmentIndex: task.nextSegmentIndex, executionId, now: executionNow, executionExpiresAt: new Date(executionNow.getTime() + BATCH_EXECUTION_LEASE_MS), attemptExpiresAt: new Date(executionNow.getTime() + leaseMs) });
      if (!executingTask) throw new CloudTranslationError("TASK_BUSY");
      try {
        const allSegments = splitChapterIntoTranslationSegments({ chapterId: executingTask.chapterId, chapterTitle: executingTask.chapterTitle, text: executingTask.chapterContent });
        validateCheckpoint(executingTask, allSegments);
        if (!allSegments.length || executingTask.nextSegmentIndex >= allSegments.length) throw new CloudTranslationError("PROVIDER_RESPONSE_INVALID");
        const batch = allSegments.slice(executingTask.nextSegmentIndex, executingTask.nextSegmentIndex + 10);
        const result = await translateBatch(input.provider, executingTask, batch, signal);
        const model = result.model ?? "unknown";
        if (executingTask.checkpointProvider && (executingTask.checkpointProvider !== result.providerName || executingTask.checkpointModel !== model)) throw new CloudTranslationError("PROVIDER_RESPONSE_INVALID");
        const newSegments = result.translations.map((part) => ({ segmentId: part.segmentId, index: part.index, translatedText: part.translatedText.trim() }));
        validateAggregateSize(executingTask.translatedSegments, newSegments);
        const checkpointNow = now();
        const checkpointed = await input.repository.checkpointTask({ userId, translationId, taskId, attemptId: executingTask.attemptId!, executionId, expectedNextSegmentIndex: executingTask.nextSegmentIndex, now: checkpointNow, expiresAt: new Date(checkpointNow.getTime() + leaseMs), segments: newSegments, providerName: result.providerName, model, inputTokens: result.usage?.inputTokens ?? 0, outputTokens: result.usage?.outputTokens ?? 0, final: executingTask.nextSegmentIndex + batch.length === allSegments.length, chapterTitle: executingTask.chapterTitle });
        if (!checkpointed) throw new CloudTranslationError("STALE_ATTEMPT");
        return { status: checkpointed === "COMPLETED" ? "COMPLETED" as const : "TRANSLATING" as const, progressPercent: Math.floor(((executingTask.nextSegmentIndex + batch.length) / allSegments.length) * 100), canContinue: checkpointed === "CHECKPOINTED" };
      } catch (error) {
        if (error instanceof CloudTranslationError && error.code === "STALE_ATTEMPT") throw error;
        const mapped = sanitizeProviderError(error);
        const failed = await input.repository.failTask({ userId, translationId, taskId, attemptId: executingTask.attemptId!, executionId, now: now(), ...mapped });
        if (!failed) throw new CloudTranslationError("STALE_ATTEMPT");
        throw new CloudTranslationError(mapped.errorCode, mapped.errorMessage);
      }
    },
    async retry(userId: string, translationId: string, taskId: string) { await requireTask(input.repository, userId, translationId, taskId); const task = await input.repository.retryTask({ userId, translationId, taskId, retryExecutionId: uuid(), maxRetries, now: now() }); if (!task) throw new CloudTranslationError("RETRY_LIMIT_REACHED"); return toTaskDto(task, now()); },
    async cancel(userId: string, translationId: string, taskId: string) { const existing = await requireTask(input.repository, userId, translationId, taskId); const task = await input.repository.cancelTask({ userId, translationId, taskId, attemptId: existing.attemptId, now: now() }); if (task === "BUSY") throw new CloudTranslationError("TASK_BUSY"); if (!task) throw new CloudTranslationError("TASK_CONFLICT"); return toTaskDto(task, now()); },
    async getReader(userId: string, translationId: string) { const reader = await input.repository.getReader(userId, translationId); if (!reader) throw new CloudTranslationError("TRANSLATION_NOT_FOUND"); return { ...reader, chapters: [...reader.chapters].sort((a, b) => a.index - b.index) }; },
  };
}

function validateCheckpoint(task: CloudTranslationTaskRecord, source: TranslationSegment[]) {
  if (!Number.isSafeInteger(task.nextSegmentIndex) || task.nextSegmentIndex < 0 || task.nextSegmentIndex > source.length || task.translatedSegments.length !== task.nextSegmentIndex || task.translatedSegments.length > MAX_CHECKPOINT_SEGMENTS) throw new CloudTranslationError("CHECKPOINT_INVALID");
  for (let index = 0; index < task.translatedSegments.length; index += 1) { const item = task.translatedSegments[index]; const expected = source[index]; if (!expected || item.segmentId !== expected.id || item.index !== expected.index || !validCheckpointText(item.translatedText)) throw new CloudTranslationError("CHECKPOINT_INVALID"); }
  try { validateAggregateSize([], task.translatedSegments); } catch { throw new CloudTranslationError("CHECKPOINT_INVALID"); }
}
async function translateBatch(provider: TranslationProvider, task: CloudTranslationTaskRecord, segments: TranslationSegment[], signal?: AbortSignal): Promise<TranslationProviderResult> { const result = await provider.translateSegments({ signal, sourceLanguage: LANGUAGE_LABEL[task.sourceLanguage], targetLanguage: LANGUAGE_LABEL[task.targetLanguage], style: "自然", webLookupEnabled: task.webSearchTerms, glossaryTerms: [], segments }); validateResult(result, segments); return result; }
function validateResult(result: TranslationProviderResult, source: TranslationSegment[]) { if (!result || typeof result.providerName !== "string" || !result.providerName.trim() || result.providerName.length > 200 || (result.model !== undefined && (typeof result.model !== "string" || !result.model.trim() || result.model.length > 200)) || result.translations.length !== source.length) throw new CloudTranslationError("PROVIDER_RESPONSE_INVALID"); const expected = new Map(source.map((segment) => [segment.id, segment.index])); const seen = new Set<string>(); for (const part of result.translations) { if (seen.has(part.segmentId) || expected.get(part.segmentId) !== part.index || !validCheckpointText(part.translatedText)) throw new CloudTranslationError("PROVIDER_RESPONSE_INVALID"); seen.add(part.segmentId); } if (result.usage && (!Number.isSafeInteger(result.usage.inputTokens) || result.usage.inputTokens < 0 || !Number.isSafeInteger(result.usage.outputTokens) || result.usage.outputTokens < 0)) throw new CloudTranslationError("PROVIDER_RESPONSE_INVALID"); }
function parseCreate(raw: unknown) { if (!isRecord(raw) || Object.keys(raw).some((key) => !["originalBookId", "title", "targetLanguage", "chapterIds", "webSearchTerms"].includes(key))) throw new CloudTranslationError("INVALID_TRANSLATION"); if (typeof raw.originalBookId !== "string" || !isUuid(raw.originalBookId) || typeof raw.targetLanguage !== "string" || !TARGET_LANGUAGES.has(raw.targetLanguage as CloudBookLanguage)) throw new CloudTranslationError("INVALID_TRANSLATION"); if (raw.title !== undefined && (typeof raw.title !== "string" || !raw.title.trim() || raw.title.trim().length > 200)) throw new CloudTranslationError("INVALID_TRANSLATION"); if (raw.webSearchTerms !== undefined && typeof raw.webSearchTerms !== "boolean") throw new CloudTranslationError("INVALID_TRANSLATION"); if (raw.chapterIds !== undefined && (!Array.isArray(raw.chapterIds) || raw.chapterIds.length < 1 || raw.chapterIds.length > 2_000 || raw.chapterIds.some((id) => typeof id !== "string" || !isUuid(id)) || new Set(raw.chapterIds).size !== raw.chapterIds.length)) throw new CloudTranslationError("INVALID_TRANSLATION"); return { originalBookId: raw.originalBookId, targetLanguage: raw.targetLanguage as CloudBookLanguage, title: typeof raw.title === "string" ? raw.title.trim() : undefined, webSearchTerms: raw.webSearchTerms === true, chapterIds: raw.chapterIds as string[] | undefined }; }
function sanitizeProviderError(error: unknown): { errorCode: CloudTranslationErrorCode; errorMessage: string } { const reported = isRecord(error) && typeof error.code === "string" ? error.code : ""; const allowed = new Set<CloudTranslationErrorCode>(["CHECKPOINT_INVALID", "PROVIDER_RESPONSE_INVALID", "PROVIDER_RATE_LIMITED", "PROVIDER_TIMEOUT", "MCP_UNAVAILABLE", "MCP_NOT_CONFIGURED"]); const errorCode = allowed.has(reported as CloudTranslationErrorCode) ? reported as CloudTranslationErrorCode : "TRANSLATION_FAILED"; const messages: Partial<Record<CloudTranslationErrorCode, string>> = { CHECKPOINT_INVALID: "The stored translation checkpoint is invalid and must be reset.", PROVIDER_RESPONSE_INVALID: "The translation provider returned an invalid response.", PROVIDER_RATE_LIMITED: "The translation provider is rate limited.", PROVIDER_TIMEOUT: "The translation provider timed out.", MCP_UNAVAILABLE: "The translation MCP service is unavailable.", MCP_NOT_CONFIGURED: "The translation MCP service is not configured." }; return { errorCode, errorMessage: messages[errorCode] ?? "The translation provider failed." }; }
function toTaskDto(task: CloudTranslationTaskRecord, at: Date): CloudTranslationTaskDto { const total = splitChapterIntoTranslationSegments({ chapterId: task.chapterId, chapterTitle: task.chapterTitle, text: task.chapterContent }).length; const isLeaseExpired = task.status === "TRANSLATING" && !!task.attemptExpiresAt && task.attemptExpiresAt <= at; const batchAvailable = !task.batchExecutionId || !task.batchExecutionExpiresAt || task.batchExecutionExpiresAt <= at; return { id: task.id, translationId: task.translatedBookId, chapterId: task.chapterId, chapterIndex: task.chapterIndex, chapterTitle: task.chapterTitle, status: task.status, retryCount: task.retryCount, estimatedCostCents: task.estimatedCostCents, progressPercent: total ? Math.floor((task.nextSegmentIndex / total) * 100) : 0, canContinue: (task.status === "PENDING" || task.status === "TRANSLATING") && batchAvailable, isLeaseExpired, ...(task.status === "FAILED" ? { error: { code: task.errorCode || "TRANSLATION_FAILED", message: task.errorMessage || "Translation failed." } } : {}) }; }
async function requireTask(repository: CloudTranslationRepository, userId: string, translationId: string, taskId: string) { const tasks = await repository.listTasks(userId, translationId); if (!tasks) throw new CloudTranslationError("TRANSLATION_NOT_FOUND"); const task = tasks.find((item) => item.id === taskId); if (!task) throw new CloudTranslationError("TASK_NOT_FOUND"); return task; }
function validCheckpointText(value: unknown): value is string { return typeof value === "string" && !!value.trim() && utf8Bytes(value) <= MAX_TRANSLATED_SEGMENT_UTF8_BYTES; }
function validateAggregateSize(existing: PersistedTranslationSegment[], added: PersistedTranslationSegment[]) { const total = [...existing, ...added].reduce((sum, segment) => { if (!validCheckpointText(segment.translatedText)) throw new CloudTranslationError("PROVIDER_RESPONSE_INVALID"); return sum + utf8Bytes(segment.translatedText); }, 0) + Math.max(0, existing.length + added.length - 1) * 2; if (total > MAX_TRANSLATED_CHAPTER_UTF8_BYTES) throw new CloudTranslationError("PROVIDER_RESPONSE_INVALID"); }
function utf8Bytes(value: string) { return new TextEncoder().encode(value).byteLength; }
export function estimateTranslationCostCents(language: CloudBookLanguage, characters: number) { const unit = ["CHINESE", "JAPANESE", "KOREAN"].includes(language) ? 3_000 : 6_000; return Math.max(1, Math.ceil(characters / unit)) * 50; }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function isUuid(value: string) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }
