import type { AuthoritativeBlobStore } from "../edgeone/blob-store-core.ts";
import { resolveRevisionState, type Revision } from "../edgeone/revisions-core.ts";
import type {
  CloudBookLanguage, CloudReaderDto,
  CloudTranslationRepository, CloudTranslationSummary,
  CloudTranslationTaskRecord, PersistedTranslationSegment,
} from "./translations-core.ts";

type Book = Awaited<ReturnType<CloudTranslationRepository["findBook"]>>;
type TranslationValue = {
  id: string; userId: string; originalBookId: string; title: string;
  targetLanguage: CloudBookLanguage; webSearchTerms: boolean; createdAt: string;
};
type TaskValue = Omit<CloudTranslationTaskRecord,
  "attemptStartedAt" | "attemptExpiresAt" | "lastHeartbeatAt" | "batchExecutionExpiresAt"> & {
  attemptStartedAt: string | null; attemptExpiresAt: string | null;
  lastHeartbeatAt: string | null; batchExecutionExpiresAt: string | null;
  retryExecutionIds: string[];
};

export class EdgeOneTranslationsRepositoryError extends Error {
  readonly code = "TRANSLATION_CONFLICT" as const;
  constructor() { super("TRANSLATION_CONFLICT"); this.name = "EdgeOneTranslationsRepositoryError"; }
}

function iso(value: Date | null): string | null { return value ? value.toISOString() : null; }
function date(value: string | null): Date | null { return value ? new Date(value) : null; }
function task(value: TaskValue): CloudTranslationTaskRecord {
  const { retryExecutionIds, ...rest } = value;
  void retryExecutionIds;
  return { ...rest, attemptStartedAt: date(value.attemptStartedAt), attemptExpiresAt: date(value.attemptExpiresAt),
    lastHeartbeatAt: date(value.lastHeartbeatAt), batchExecutionExpiresAt: date(value.batchExecutionExpiresAt) };
}
function stored(value: CloudTranslationTaskRecord, retryExecutionIds: string[] = []): TaskValue {
  return { ...value, attemptStartedAt: iso(value.attemptStartedAt), attemptExpiresAt: iso(value.attemptExpiresAt),
    lastHeartbeatAt: iso(value.lastHeartbeatAt), batchExecutionExpiresAt: iso(value.batchExecutionExpiresAt), retryExecutionIds };
}

export function createEdgeOneTranslationsRepository(input: {
  blob: AuthoritativeBlobStore;
  now: () => Date;
  uuid: () => string;
  findBook(userId: string, bookId: string): Promise<Book>;
}): CloudTranslationRepository {
  const translationPrefix = (userId: string, id: string) => `translations/${userId}/${id}/revisions/`;
  const taskPrefix = (userId: string, translationId: string, id: string) => `translation-tasks/${userId}/${translationId}/${id}/revisions/`;

  async function load<T>(prefix: string) {
    const items = await input.blob.listAll(prefix);
    const values: Revision<T>[] = [];
    for (const item of items) { const value = await input.blob.getJSON<Revision<T>>(item.key); if (!value) throw new EdgeOneTranslationsRepositoryError(); values.push(value); }
    const state = resolveRevisionState(values);
    if (state.kind === "conflict") throw new EdgeOneTranslationsRepositoryError();
    return state.kind === "current" ? state.revision : null;
  }
  async function write<T>(prefix: string, value: T, parent: Revision<T> | null) {
    const createdAt = input.now().toISOString();
    const revision: Revision<T> = { id: input.uuid(), parentIds: parent ? [parent.id] : [], operationId: input.uuid(), createdAt, deleted: false, value };
    await input.blob.createJSON(`${prefix}${revision.id}.json`, revision);
    return revision;
  }
  const getTranslation = (userId: string, id: string) => load<TranslationValue>(translationPrefix(userId, id));
  const getTask = (userId: string, translationId: string, id: string) => load<TaskValue>(taskPrefix(userId, translationId, id));

  async function taskIds(userId: string, translationId: string) {
    const items = await input.blob.listAll(`translation-tasks/${userId}/${translationId}/`);
    return [...new Set(items.map((item) => item.key.split("/")[3]).filter(Boolean))].sort();
  }
  async function allTasks(userId: string, translationId: string) {
    const values: CloudTranslationTaskRecord[] = [];
    for (const id of await taskIds(userId, translationId)) { const value = await getTask(userId, translationId, id); if (value) values.push(task(value.value)); }
    return values;
  }
  async function summary(value: TranslationValue): Promise<CloudTranslationSummary> {
    const tasks = await allTasks(value.userId, value.id);
    const completed = tasks.filter((item) => item.status === "COMPLETED").length;
    const failed = tasks.filter((item) => item.status === "FAILED").length;
    const terminal = tasks.filter((item) => ["COMPLETED", "FAILED", "CANCELED", "NEEDS_REVIEW"].includes(item.status)).length;
    const status = tasks.length && completed === tasks.length ? "COMPLETED" : tasks.some((item) => item.status === "TRANSLATING") ? "PROCESSING" : failed ? "FAILED" : "QUEUED";
    return { id: value.id, originalBookId: value.originalBookId, title: value.title, targetLanguage: value.targetLanguage,
      status, progressPercent: tasks.length ? Math.floor(terminal / tasks.length * 100) : 0,
      completedChapters: completed, failedChapters: failed, createdAt: new Date(value.createdAt) };
  }
  async function mutateTask(
    request: { userId: string; translationId: string; taskId: string },
    change: (value: TaskValue) => TaskValue | null,
  ) {
    const parent = await getTask(request.userId, request.translationId, request.taskId);
    if (!parent) return null;
    const next = change(parent.value);
    if (!next) return null;
    await write(taskPrefix(request.userId, request.translationId, request.taskId), next, parent);
    return task(next);
  }

  return {
    async listTranslations(userId) {
      const items = await input.blob.listAll(`translations/${userId}/`);
      const ids = [...new Set(items.map((item) => item.key.split("/")[2]).filter(Boolean))].sort();
      const values: CloudTranslationSummary[] = [];
      for (const id of ids) { const current = await getTranslation(userId, id); if (current) values.push(await summary(current.value)); }
      return values;
    },
    findBook: input.findBook,
    async createTranslation(value) {
      const existing = await getTranslation(value.userId, value.id);
      const book = await input.findBook(value.userId, value.originalBookId);
      if (!book) throw new EdgeOneTranslationsRepositoryError();
      const chapters = new Map(book.chapters.map((chapter) => [chapter.id, chapter]));
      const requestedChapters = value.tasks.map((requested) => chapters.get(requested.chapterId));
      if (
        book.sourceLanguage === value.targetLanguage ||
        requestedChapters.some((chapter) => !chapter || chapter.status !== "ACTIVE" || chapter.isSkipped)
      ) throw new EdgeOneTranslationsRepositoryError();
      let translation = existing;
      if (!translation) {
        translation = await write(translationPrefix(value.userId, value.id), {
          id: value.id, userId: value.userId, originalBookId: value.originalBookId,
          title: value.title, targetLanguage: value.targetLanguage,
          webSearchTerms: value.webSearchTerms, createdAt: input.now().toISOString(),
        }, null);
      }
      for (const [index, requested] of value.tasks.entries()) {
        if (await getTask(value.userId, value.id, requested.id)) continue;
        const chapter = requestedChapters[index]!;
        const initial: CloudTranslationTaskRecord = {
          id: requested.id, translatedBookId: value.id, userId: value.userId,
          chapterId: chapter.id, chapterIndex: chapter.index, chapterTitle: chapter.title,
          chapterContent: chapter.content, sourceLanguage: book.sourceLanguage,
          targetLanguage: value.targetLanguage, webSearchTerms: value.webSearchTerms,
          status: "PENDING", retryCount: 0, estimatedCostCents: requested.estimatedCostCents,
          attemptId: null, attemptStartedAt: null, attemptExpiresAt: null,
          nextSegmentIndex: 0, translatedSegments: [], checkpointProvider: null,
          checkpointModel: null, accumulatedInputTokens: 0, accumulatedOutputTokens: 0,
          lastHeartbeatAt: null, batchExecutionId: null, batchExecutionExpiresAt: null,
          batchExecutionIndex: null, lastBatchExecutionId: null, errorCode: null, errorMessage: null,
        };
        await write(taskPrefix(value.userId, value.id, requested.id), stored(initial), null);
      }
      return summary(translation.value);
    },
    async listTasks(userId, translationId) {
      if (!await getTranslation(userId, translationId)) return null;
      return allTasks(userId, translationId);
    },
    claimTask(request) {
      return mutateTask(request, (value) => {
        const expires = date(value.attemptExpiresAt);
        if (value.status === "TRANSLATING" && expires && expires > request.now) return value;
        if (value.status !== "PENDING" && !(value.status === "TRANSLATING" && expires && expires <= request.now)) return null;
        return { ...value, status: "TRANSLATING", attemptId: request.attemptId,
          attemptStartedAt: request.now.toISOString(), attemptExpiresAt: request.expiresAt.toISOString(),
          lastHeartbeatAt: request.now.toISOString(), batchExecutionId: null,
          batchExecutionExpiresAt: null, batchExecutionIndex: null, errorCode: null, errorMessage: null };
      });
    },
    acquireBatchExecution(request) {
      return mutateTask(request, (value) => {
        const attemptExpiry = date(value.attemptExpiresAt);
        const batchExpiry = date(value.batchExecutionExpiresAt);
        if (value.status !== "TRANSLATING" || value.attemptId !== request.attemptId || !attemptExpiry || attemptExpiry <= request.now ||
          value.nextSegmentIndex !== request.expectedNextSegmentIndex || (value.batchExecutionId && batchExpiry && batchExpiry > request.now)) return null;
        return { ...value, batchExecutionId: request.executionId,
          batchExecutionExpiresAt: request.executionExpiresAt.toISOString(),
          batchExecutionIndex: request.expectedNextSegmentIndex,
          attemptExpiresAt: request.attemptExpiresAt.toISOString(), lastHeartbeatAt: request.now.toISOString() };
      });
    },
    async checkpointTask(request) {
      let outcome: "CHECKPOINTED" | "COMPLETED" | null = null;
      const changed = await mutateTask(request, (value) => {
        const attemptExpiry = date(value.attemptExpiresAt);
        const batchExpiry = date(value.batchExecutionExpiresAt);
        if (value.status !== "TRANSLATING" || value.attemptId !== request.attemptId || value.batchExecutionId !== request.executionId ||
          value.batchExecutionIndex !== request.expectedNextSegmentIndex || value.nextSegmentIndex !== request.expectedNextSegmentIndex ||
          !attemptExpiry || attemptExpiry <= request.now || !batchExpiry || batchExpiry <= request.now ||
          request.segments.length < 1 || request.segments.length > 10) return null;
        const segments = [...value.translatedSegments, ...request.segments];
        outcome = request.final ? "COMPLETED" : "CHECKPOINTED";
        return { ...value, translatedSegments: segments, nextSegmentIndex: segments.length,
          checkpointProvider: request.providerName, checkpointModel: request.model,
          accumulatedInputTokens: value.accumulatedInputTokens + request.inputTokens,
          accumulatedOutputTokens: value.accumulatedOutputTokens + request.outputTokens,
          lastHeartbeatAt: request.final ? null : request.now.toISOString(),
          attemptExpiresAt: request.final ? null : request.expiresAt.toISOString(),
          batchExecutionId: null, batchExecutionExpiresAt: null, batchExecutionIndex: null,
          lastBatchExecutionId: request.executionId, status: request.final ? "COMPLETED" : value.status,
          attemptId: request.final ? null : value.attemptId,
          attemptStartedAt: request.final ? null : value.attemptStartedAt,
          errorCode: null, errorMessage: null };
      });
      return changed ? outcome : null;
    },
    async failTask(request) {
      const changed = await mutateTask(request, (value) => {
        const expiry = date(value.attemptExpiresAt);
        if (value.status !== "TRANSLATING" || value.attemptId !== request.attemptId || value.batchExecutionId !== request.executionId || !expiry || expiry <= request.now) return null;
        return { ...value, status: "FAILED", errorCode: request.errorCode, errorMessage: request.errorMessage,
          attemptId: null, attemptStartedAt: null, attemptExpiresAt: null,
          lastHeartbeatAt: null, batchExecutionId: null, batchExecutionExpiresAt: null,
          batchExecutionIndex: null, lastBatchExecutionId: request.executionId };
      });
      return Boolean(changed);
    },
    retryTask(request) {
      return mutateTask(request, (value) => {
        if (value.retryExecutionIds.includes(request.retryExecutionId)) return value;
        if (value.status !== "FAILED" || value.retryCount >= request.maxRetries) return null;
        const reset = value.errorCode === "CHECKPOINT_INVALID";
        return { ...value, status: "PENDING", retryCount: value.retryCount + 1,
          retryExecutionIds: [...value.retryExecutionIds, request.retryExecutionId],
          errorCode: null, errorMessage: null, attemptId: null, attemptStartedAt: null,
          attemptExpiresAt: null, lastHeartbeatAt: null, batchExecutionId: null,
          batchExecutionExpiresAt: null, batchExecutionIndex: null,
          ...(reset ? { translatedSegments: [], nextSegmentIndex: 0, checkpointProvider: null,
            checkpointModel: null, accumulatedInputTokens: 0, accumulatedOutputTokens: 0,
            lastBatchExecutionId: null } : {}) };
      });
    },
    async cancelTask(request) {
      const current = await getTask(request.userId, request.translationId, request.taskId);
      if (!current) return null;
      const batchExpiry = date(current.value.batchExecutionExpiresAt);
      if (current.value.batchExecutionId && batchExpiry && batchExpiry > request.now) return "BUSY";
      const changed = await mutateTask(request, (value) => {
        if (request.attemptId ? value.status !== "TRANSLATING" || value.attemptId !== request.attemptId : !["PENDING", "FAILED"].includes(value.status)) return null;
        return { ...value, status: "CANCELED", attemptId: null, attemptStartedAt: null,
          attemptExpiresAt: null, lastHeartbeatAt: null, batchExecutionId: null,
          batchExecutionExpiresAt: null, batchExecutionIndex: null };
      });
      return changed;
    },
    async getReader(userId, translationId): Promise<CloudReaderDto | null> {
      const translation = await getTranslation(userId, translationId);
      if (!translation) return null;
      const tasks = (await allTasks(userId, translationId)).filter((item) => item.status === "COMPLETED");
      return { id: translationId, originalBookId: translation.value.originalBookId,
        title: translation.value.title, targetLanguage: translation.value.targetLanguage,
        chapters: tasks.map((item) => ({ id: item.id, chapterId: item.chapterId,
          index: item.chapterIndex, title: item.chapterTitle,
          content: item.translatedSegments.map((segment: PersistedTranslationSegment) => segment.translatedText).join("\n\n") })) };
    },
  };
}
