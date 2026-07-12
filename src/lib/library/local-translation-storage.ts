import { formatYuanFromCents } from "../account/mock-account-summary.ts";
import { buildReaderView, type ReaderView } from "../reader/reader-view.ts";
import type { TranslationOrderDraftResult } from "../translation/translation-order-draft.ts";
import type { TranslationProviderSegmentResult } from "../translation/translation-provider.ts";
import { splitChapterIntoTranslationSegments } from "../translation/translation-segments.ts";
import type { StoredLocalLibraryBook } from "./local-library-storage.ts";

export const localTranslationsStorageKey = "stray-pages.local-translations";

type SuccessfulTranslationOrderDraft = Extract<TranslationOrderDraftResult, { ok: true }>;

export type StoredLocalTranslationTask = {
  id: string;
  chapterId: string;
  chapterTitle: string;
  status: "queued" | "translating" | "ready" | "failed";
  attemptCount?: number;
  attemptId?: string;
  failureReason?: string;
  qualityStatus?: "passed" | "needs-review";
  providerName?: string;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  progressText: string;
  balanceText: string;
  updatedAt: string;
};

export type StoredLocalTranslatedChapter = {
  id: string;
  sourceChapterId: string;
  title: string;
  wordCount: number;
  sourceParagraphs: string[];
  translatedParagraphs: string[];
  secondaryTranslationParagraphs: string[];
};

export type StoredLocalTranslation = {
  id: string;
  originalBookId: string;
  originalTitle: string;
  title: string;
  sourceLanguage: string;
  targetLanguage: string;
  status: "queued" | "processing" | "ready" | "partial" | "failed";
  origin?: "mcp" | "legacy-demo";
  style?: "自然";
  webLookupEnabled?: boolean;
  createdAt: string;
  updatedAt: string;
  tasks: StoredLocalTranslationTask[];
  chapters: StoredLocalTranslatedChapter[];
};

export type StoredLocalTranslationSummary = {
  totalChapters: number;
  finishedChapters: number;
  failedChapters: number;
  queuedChapters: number;
  progressPercent: number;
};

export type StoredLocalTranslationMutationResult =
  | { ok: true; translation: StoredLocalTranslation }
  | {
      ok: false;
      reason:
        | "task-not-found"
        | "invalid-task-state"
        | "attempt-not-owned"
        | "chapter-not-found"
        | "misaligned-translations";
    };

export function buildQueuedLocalTranslationFromOrder(input: {
  book: StoredLocalLibraryBook;
  orderDraft: SuccessfulTranslationOrderDraft;
  sourceLanguage: string;
  createdAt?: string;
}): StoredLocalTranslation {
  const createdAt = input.createdAt ?? new Date().toISOString();
  const selectedTaskByChapterId = new Map(
    input.orderDraft.tasks.map((task) => [task.chapterId, task]),
  );
  const selectedChapters = input.book.chapters.filter((chapter) =>
    selectedTaskByChapterId.has(buildSourceChapterId(input.book.id, chapter.sourceIndex)),
  );

  return {
    id: buildStoredLocalTranslationId(
      input.book.id,
      input.orderDraft.translation.targetLanguage,
      createdAt,
    ),
    originalBookId: input.book.id,
    originalTitle: input.book.title,
    title: `${input.book.title}（${input.orderDraft.translation.targetLanguage}译本）`,
    sourceLanguage: input.sourceLanguage,
    targetLanguage: input.orderDraft.translation.targetLanguage,
    status: "queued",
    origin: "mcp",
    style: "自然",
    webLookupEnabled: false,
    createdAt,
    updatedAt: createdAt,
    tasks: selectedChapters.map((chapter) => {
      const chapterId = buildSourceChapterId(input.book.id, chapter.sourceIndex);
      const task = selectedTaskByChapterId.get(chapterId);

      return {
        id: `${input.book.id}-task-${chapter.sourceIndex}`,
        chapterId,
        chapterTitle: chapter.title,
        status: "queued",
        attemptCount: 0,
        progressText: "等待翻译",
        balanceText: task
          ? buildBalancePreviewText(task.frozenCents, task.freeUnitsApplied)
          : "演示计价",
        updatedAt: formatLocalTime(createdAt),
      };
    }),
    chapters: selectedChapters.map((chapter) => {
      const chapterId = buildSourceChapterId(input.book.id, chapter.sourceIndex);
      const sourceParagraphs = splitChapterIntoTranslationSegments({
        chapterId,
        chapterTitle: chapter.title,
        text: chapter.content || chapter.contentPreview,
      }).map((segment) => segment.text);

      return {
        id: chapterId,
        sourceChapterId: chapterId,
        title: chapter.title,
        wordCount: chapter.characterCount,
        sourceParagraphs,
        translatedParagraphs: [],
        secondaryTranslationParagraphs: sourceParagraphs,
      };
    }),
  };
}

export const buildStoredLocalTranslationFromOrder = buildQueuedLocalTranslationFromOrder;

export function getStoredLocalTranslationSummary(
  translation: StoredLocalTranslation,
): StoredLocalTranslationSummary {
  const totalChapters = translation.tasks.length;
  const finishedChapters = translation.tasks.filter((task) => task.status === "ready").length;
  const failedChapters = translation.tasks.filter((task) => task.status === "failed").length;
  const queuedChapters = translation.tasks.filter(
    (task) => task.status === "queued" || task.status === "translating",
  ).length;

  return {
    totalChapters,
    finishedChapters,
    failedChapters,
    queuedChapters,
    progressPercent: totalChapters === 0 ? 0 : Math.round((finishedChapters / totalChapters) * 100),
  };
}

export function getReadableStoredLocalTranslationChapters(translation: StoredLocalTranslation) {
  return translation.chapters.filter((chapter) => chapter.translatedParagraphs.length > 0);
}

export function buildStoredLocalTranslationReaderView(
  translation: StoredLocalTranslation,
  currentChapterId?: string,
): ReaderView {
  return buildReaderView({
    chapters: getReadableStoredLocalTranslationChapters(translation).map((chapter) => ({
      id: chapter.id,
      title: chapter.title,
      wordCount: chapter.wordCount,
      sourceParagraphs: chapter.sourceParagraphs,
      translatedParagraphs: chapter.translatedParagraphs,
      secondaryTranslationParagraphs: chapter.secondaryTranslationParagraphs,
    })),
    currentChapterId,
    mode: "translation",
    settings: { contentWidth: 1360, theme: "light" },
  });
}

export function startStoredLocalTranslationTask(
  translation: StoredLocalTranslation,
  taskId: string,
  startedAt = new Date().toISOString(),
  attemptId?: string,
): StoredLocalTranslationMutationResult {
  const task = translation.tasks.find((item) => item.id === taskId);
  if (!task) return { ok: false, reason: "task-not-found" };
  if (task.status !== "queued") return { ok: false, reason: "invalid-task-state" };

  return {
    ok: true,
    translation: updateTranslationTask(
      translation,
      taskId,
      {
        ...task,
        status: "translating",
        attemptCount: (task.attemptCount ?? 0) + 1,
        attemptId,
        failureReason: undefined,
        progressText: "正在通过 MCP 翻译",
        updatedAt: formatLocalTime(startedAt),
      },
      startedAt,
    ),
  };
}

export function completeStoredLocalTranslationTask(
  translation: StoredLocalTranslation,
  taskId: string,
  input: {
    translations: TranslationProviderSegmentResult[];
    providerName: string;
    model?: string;
    qualityStatus: "passed" | "needs-review";
    usage?: { inputTokens: number; outputTokens: number };
    completedAt?: string;
    attemptId?: string;
  },
): StoredLocalTranslationMutationResult {
  const task = translation.tasks.find((item) => item.id === taskId);
  if (!task) return { ok: false, reason: "task-not-found" };
  if (task.status !== "translating") return { ok: false, reason: "invalid-task-state" };
  if (input.attemptId !== undefined && task.attemptId !== input.attemptId) {
    return { ok: false, reason: "attempt-not-owned" };
  }
  const chapter = translation.chapters.find((item) => item.id === task.chapterId);
  if (!chapter) return { ok: false, reason: "chapter-not-found" };

  const translationsByIndex = [...input.translations].sort((left, right) => left.index - right.index);
  const aligned =
    translationsByIndex.length === chapter.sourceParagraphs.length &&
    translationsByIndex.every(
      (item, index) =>
        item.index === index &&
        item.segmentId === `${task.chapterId}-segment-${index + 1}` &&
        item.translatedText.trim().length > 0,
    );
  if (!aligned) return { ok: false, reason: "misaligned-translations" };

  const completedAt = input.completedAt ?? new Date().toISOString();
  const nextTask: StoredLocalTranslationTask = {
    ...task,
    status: "ready",
    attemptId: undefined,
    progressText: input.qualityStatus === "passed" ? "翻译完成" : "翻译完成，建议检查",
    failureReason: undefined,
    qualityStatus: input.qualityStatus,
    providerName: input.providerName,
    model: input.model,
    inputTokens: input.usage?.inputTokens,
    outputTokens: input.usage?.outputTokens,
    updatedAt: formatLocalTime(completedAt),
  };
  const nextTranslation = updateTranslationTask(translation, taskId, nextTask, completedAt);
  const chapters = nextTranslation.chapters.map((item) =>
    item.id === chapter.id
      ? {
          ...item,
          translatedParagraphs: translationsByIndex.map((result) => result.translatedText.trim()),
        }
      : item,
  );

  return { ok: true, translation: withDerivedStatus({ ...nextTranslation, chapters }) };
}

export function failStoredLocalTranslationTask(
  translation: StoredLocalTranslation,
  taskId: string,
  failureReason: string,
  failedAt = new Date().toISOString(),
  attemptId?: string,
): StoredLocalTranslationMutationResult {
  const task = translation.tasks.find((item) => item.id === taskId);
  if (!task) return { ok: false, reason: "task-not-found" };
  if (task.status !== "translating") return { ok: false, reason: "invalid-task-state" };
  if (attemptId !== undefined && task.attemptId !== attemptId) {
    return { ok: false, reason: "attempt-not-owned" };
  }

  return {
    ok: true,
    translation: updateTranslationTask(
      translation,
      taskId,
      {
        ...task,
        status: "failed",
        attemptId: undefined,
        failureReason: failureReason.trim() || "翻译失败，请重试。",
        progressText: "翻译失败",
        updatedAt: formatLocalTime(failedAt),
      },
      failedAt,
    ),
  };
}

export function retryStoredLocalTranslationTask(
  translation: StoredLocalTranslation,
  taskId: string,
  retriedAt = new Date().toISOString(),
): StoredLocalTranslationMutationResult {
  const task = translation.tasks.find((item) => item.id === taskId);
  if (!task) return { ok: false, reason: "task-not-found" };
  if (task.status !== "failed") return { ok: false, reason: "invalid-task-state" };

  return {
    ok: true,
    translation: updateTranslationTask(
      translation,
      taskId,
      {
        ...task,
        status: "queued",
        attemptId: undefined,
        failureReason: undefined,
        progressText: "等待重试",
        updatedAt: formatLocalTime(retriedAt),
      },
      retriedAt,
    ),
  };
}

export function upsertStoredLocalTranslation(
  translations: StoredLocalTranslation[],
  incomingTranslation: StoredLocalTranslation,
) {
  const existingIndex = translations.findIndex(
    (translation) => translation.id === incomingTranslation.id,
  );

  if (existingIndex === -1) return [incomingTranslation, ...translations];
  return translations.map((translation, index) =>
    index === existingIndex ? incomingTranslation : translation,
  );
}

export function findStoredLocalTranslation(
  translations: StoredLocalTranslation[],
  translationId: string,
) {
  return translations.find((translation) => translation.id === translationId) ?? null;
}

export type RenameStoredLocalTranslationResult =
  | { ok: true; translations: StoredLocalTranslation[] }
  | { ok: false; reason: "empty-title" | "duplicate-title" | "not-found" };

export function renameStoredLocalTranslation(
  translations: StoredLocalTranslation[],
  translationId: string,
  nextTitle: string,
): RenameStoredLocalTranslationResult {
  const title = normalizeTitle(nextTitle);
  if (!title) return { ok: false, reason: "empty-title" };
  if (!translations.some((translation) => translation.id === translationId)) {
    return { ok: false, reason: "not-found" };
  }
  if (
    translations.some(
      (translation) =>
        translation.id !== translationId && normalizeTitle(translation.title) === title,
    )
  ) {
    return { ok: false, reason: "duplicate-title" };
  }

  return {
    ok: true,
    translations: translations.map((translation) =>
      translation.id === translationId ? { ...translation, title } : translation,
    ),
  };
}

export function removeStoredLocalTranslation(
  translations: StoredLocalTranslation[],
  translationId: string,
) {
  return translations.filter((translation) => translation.id !== translationId);
}

export function parseStoredLocalTranslations(rawValue: string | null): StoredLocalTranslation[] {
  return parseStoredLocalTranslationsResult(rawValue).records;
}

export type StoredLocalTranslationsParseResult =
  | { ok: true; status: "missing" | "ready"; records: StoredLocalTranslation[] }
  | { ok: false; reason: "malformed"; records: StoredLocalTranslation[] };

export function parseStoredLocalTranslationsResult(
  rawValue: string | null,
): StoredLocalTranslationsParseResult {
  if (!rawValue) return { ok: true, status: "missing", records: [] };

  try {
    const parsed = JSON.parse(rawValue) as unknown;
    if (!Array.isArray(parsed)) return { ok: false, reason: "malformed", records: [] };
    const records = parsed
      .filter(isStoredLocalTranslation)
      .map((translation) => withDerivedStatus(translation));
    return records.length === parsed.length
      ? { ok: true, status: "ready", records }
      : { ok: false, reason: "malformed", records };
  } catch {
    return { ok: false, reason: "malformed", records: [] };
  }
}

export function isStoredLocalTranslation(value: unknown): value is StoredLocalTranslation {
  if (!isRecord(value)) return false;

  return (
    typeof value.id === "string" &&
    value.id.startsWith("local-translation-") &&
    typeof value.originalBookId === "string" &&
    typeof value.originalTitle === "string" &&
    typeof value.title === "string" &&
    typeof value.sourceLanguage === "string" &&
    typeof value.targetLanguage === "string" &&
    isTranslationStatus(value.status) &&
    (value.origin === undefined || value.origin === "mcp" || value.origin === "legacy-demo") &&
    (value.style === undefined || value.style === "自然") &&
    (value.webLookupEnabled === undefined || typeof value.webLookupEnabled === "boolean") &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string" &&
    Array.isArray(value.tasks) &&
    value.tasks.every(isStoredLocalTranslationTask) &&
    Array.isArray(value.chapters) &&
    value.chapters.every(isStoredLocalTranslatedChapter) &&
    hasConsistentTranslationRelationships(value as unknown as StoredLocalTranslation)
  );
}

function updateTranslationTask(
  translation: StoredLocalTranslation,
  taskId: string,
  nextTask: StoredLocalTranslationTask,
  updatedAt: string,
) {
  return withDerivedStatus({
    ...translation,
    updatedAt,
    tasks: translation.tasks.map((task) => (task.id === taskId ? nextTask : task)),
  });
}

function withDerivedStatus(translation: StoredLocalTranslation): StoredLocalTranslation {
  const statuses = translation.tasks.map((task) => task.status);
  const hasReady = statuses.some((value) => value === "ready");
  const hasFailed = statuses.some((value) => value === "failed");
  const status: StoredLocalTranslation["status"] = statuses.some((value) => value === "translating")
    ? "processing"
    : statuses.length > 0 && statuses.every((value) => value === "ready")
      ? "ready"
      : statuses.length > 0 && statuses.every((value) => value === "failed")
        ? "failed"
        : hasReady && hasFailed
          ? "partial"
          : "queued";
  return { ...translation, status };
}

function isStoredLocalTranslationTask(value: unknown): value is StoredLocalTranslationTask {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.chapterId === "string" &&
    typeof value.chapterTitle === "string" &&
    isTaskStatus(value.status) &&
    isOptionalNonNegativeInteger(value.attemptCount) &&
    isOptionalString(value.attemptId) &&
    isOptionalString(value.failureReason) &&
    (value.qualityStatus === undefined ||
      value.qualityStatus === "passed" ||
      value.qualityStatus === "needs-review") &&
    isOptionalString(value.providerName) &&
    isOptionalString(value.model) &&
    isOptionalNonNegativeInteger(value.inputTokens) &&
    isOptionalNonNegativeInteger(value.outputTokens) &&
    typeof value.progressText === "string" &&
    typeof value.balanceText === "string" &&
    typeof value.updatedAt === "string"
  );
}

function hasConsistentTranslationRelationships(translation: StoredLocalTranslation) {
  if (translation.tasks.length !== translation.chapters.length) return false;

  const taskIds = new Set(translation.tasks.map((task) => task.id));
  const taskChapterIds = new Set(translation.tasks.map((task) => task.chapterId));
  const chapterIds = new Set(translation.chapters.map((chapter) => chapter.id));
  if (
    taskIds.size !== translation.tasks.length ||
    taskChapterIds.size !== translation.tasks.length ||
    chapterIds.size !== translation.chapters.length ||
    [...taskChapterIds].some((chapterId) => !chapterIds.has(chapterId))
  ) {
    return false;
  }

  const chaptersById = new Map(translation.chapters.map((chapter) => [chapter.id, chapter]));
  return translation.tasks.every((task) => {
    const chapter = chaptersById.get(task.chapterId);
    if (!chapter || chapter.sourceChapterId !== chapter.id || task.chapterTitle !== chapter.title) {
      return false;
    }
    if (
      chapter.sourceParagraphs.length === 0 ||
      chapter.secondaryTranslationParagraphs.length !== chapter.sourceParagraphs.length
    ) {
      return false;
    }

    const translatedParagraphsAreComplete =
      chapter.translatedParagraphs.length === chapter.sourceParagraphs.length &&
      chapter.translatedParagraphs.every((paragraph) => paragraph.trim().length > 0);
    if (task.status === "ready") return translatedParagraphsAreComplete;
    return chapter.translatedParagraphs.length === 0;
  });
}

function isStoredLocalTranslatedChapter(value: unknown): value is StoredLocalTranslatedChapter {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.sourceChapterId === "string" &&
    typeof value.title === "string" &&
    typeof value.wordCount === "number" &&
    Number.isFinite(value.wordCount) &&
    Array.isArray(value.sourceParagraphs) &&
    value.sourceParagraphs.every((paragraph) => typeof paragraph === "string") &&
    Array.isArray(value.translatedParagraphs) &&
    value.translatedParagraphs.every((paragraph) => typeof paragraph === "string") &&
    Array.isArray(value.secondaryTranslationParagraphs) &&
    value.secondaryTranslationParagraphs.every((paragraph) => typeof paragraph === "string")
  );
}

function isTranslationStatus(value: unknown): value is StoredLocalTranslation["status"] {
  return ["queued", "processing", "ready", "partial", "failed"].includes(String(value));
}

function isTaskStatus(value: unknown): value is StoredLocalTranslationTask["status"] {
  return ["queued", "translating", "ready", "failed"].includes(String(value));
}

function isOptionalString(value: unknown) {
  return value === undefined || typeof value === "string";
}

function isOptionalNonNegativeInteger(value: unknown) {
  return value === undefined || (typeof value === "number" && Number.isInteger(value) && value >= 0);
}

function buildSourceChapterId(bookId: string, sourceIndex: number) {
  return `${bookId}-chapter-${sourceIndex}`;
}

function buildStoredLocalTranslationId(bookId: string, targetLanguage: string, createdAt: string) {
  return `local-translation-${bookId}-${slugifyLanguage(targetLanguage)}-${stableTextId(createdAt)}`;
}

function slugifyLanguage(language: string) {
  const knownLanguageSlugs: Record<string, string> = {
    中文: "zhong-wen",
    英文: "ying-wen",
    日文: "ri-wen",
    韩文: "han-wen",
    俄语: "e-yu",
    德语: "de-yu",
    西班牙语: "xi-ban-ya-yu",
    法语: "fa-yu",
  };
  return (
    knownLanguageSlugs[language] ??
    language
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
      .replace(/^-+|-+$/g, "")
  );
}

function buildBalancePreviewText(frozenCents: number, freeUnitsApplied: number) {
  if (frozenCents > 0) return `演示预计 ${formatYuanFromCents(frozenCents)} 元`;
  if (freeUnitsApplied > 0) return "演示免费额度";
  return "演示计价";
}

function formatLocalTime(isoTime: string) {
  const parsed = new Date(isoTime);
  if (Number.isNaN(parsed.getTime())) return "刚刚";
  return parsed.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function normalizeTitle(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function stableTextId(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash.toString(36);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
