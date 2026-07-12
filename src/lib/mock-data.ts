import { routeBuilders } from "@/lib/routes";
import {
  buildAdminAuditRecord,
  summarizeAdminAuditRecords,
} from "@/lib/admin/admin-audit-policy";
import { buildAdminExportSummary } from "@/lib/admin/admin-export-summary";
import {
  getDataRetentionPolicies,
  summarizeDataRetentionPolicies,
} from "@/lib/admin/data-retention-policy";
import { buildMockAccountSummary, formatYuanFromCents } from "@/lib/account/mock-account-summary";
import { buildMockBalanceRecords } from "@/lib/account/mock-balance-ledger";
import { buildMyPageSummary } from "@/lib/account/my-page-summary";
import {
  buildEpubExportDraft,
  buildTranslatedBookTxtExport,
} from "@/lib/export/translation-export";
import {
  buildSentenceMarkdownExport,
  buildVocabularyCsvExport,
} from "@/lib/export/study-export";
import {
  getLaunchChecklist,
  getLaunchDisplayStates,
} from "@/lib/launch/launch-states";
import {
  getLegalNoticesForSurface,
  getLaunchLegalNotices,
} from "@/lib/launch/legal-notices";
import {
  evaluateLocalRateLimit,
  getLaunchRateLimitPolicies,
} from "@/lib/launch/rate-limit-policy";
import {
  evaluateProductionPreflight,
  getProductionEnvRequirements,
  getProductionRolloutSteps,
} from "@/lib/launch/production-preflight";
import { answerReaderQuestion, buildReadingAssistantResult } from "@/lib/reader/reading-assistant";
import { buildReaderView } from "@/lib/reader/reader-view";
import {
  createSentenceDraft,
  createVocabularyDraft,
  filterSentenceItems,
  filterVocabularyItems,
  previewStudyItemDeletion,
} from "@/lib/reader/study-collections";
import { assessTranslationQuality } from "@/lib/translation/translation-quality";
import {
  buildMockTranslationQueue,
  getMockTranslationQueueSummary,
  runMockTranslationQueueBatch,
  type MockTranslationTaskStatus,
} from "@/lib/translation/mock-translation-queue";
import {
  buildMockReaderChapter,
  buildMockTranslatedChapter,
} from "@/lib/translation/mock-translator";
import {
  assessTranslationCostHealth,
  buildTranslationCostLedgerEntry,
  getTranslationCostLedgerSummary,
} from "@/lib/translation/translation-cost-ledger";
import { extractTerminologyCandidates } from "@/lib/translation/terminology";
import {
  assessGlossaryTermUsage,
  confirmBookGlossaryTerm,
  getRelevantGlossaryTermsForText,
  upsertTerminologyCandidatesIntoGlossary,
} from "@/lib/translation/terminology-glossary";
import { buildTranslationPrompt } from "@/lib/translation/translation-prompt";
import { splitChapterIntoTranslationSegments } from "@/lib/translation/translation-segments";

export type TranslationStatus =
  | "ready"
  | "processing"
  | "review"
  | "failed"
  | "queued"
  | "skipped";

const mockAccountSummary = buildMockAccountSummary();

export const accountSummary = {
  balance: mockAccountSummary.balanceYuan,
  frozen: mockAccountSummary.frozenYuan,
  available: mockAccountSummary.availableYuan,
  freeChaptersLeft: mockAccountSummary.freeChaptersLeft,
  estimatedAfterSelection: "11.40",
};

export const myPageSummary = buildMyPageSummary({
  balanceYuan: mockAccountSummary.balanceYuan,
  freeChaptersLeft: mockAccountSummary.freeChaptersLeft,
  originalBookCount: 2,
  translatedBookCount: 2,
  recentTaskCount: 3,
});

export const originalBooks = [
  {
    id: "demo-book",
    title: "迷雾边境",
    author: "林间客",
    language: "中文",
    format: "EPUB",
    size: "1.8 MB",
    chapters: 42,
    uploadedAt: "2026-06-22",
    lastOpenedAt: "今天 17:20",
    progress: "第 3 章",
    href: routeBuilders.bookChapters("demo-book"),
  },
  {
    id: "silent-archive",
    title: "Silent Archive",
    author: "M. Vale",
    language: "英文",
    format: "TXT",
    size: "930 KB",
    chapters: 28,
    uploadedAt: "2026-06-18",
    lastOpenedAt: "昨天 21:10",
    progress: "未开始",
    href: routeBuilders.bookChapters("silent-archive"),
  },
];

export const translatedBooks = [
  {
    id: "demo-translation",
    originalTitle: "迷雾边境",
    title: "The Border of Mist",
    targetLanguage: "英文",
    status: "processing" as TranslationStatus,
    progress: 62,
    completedChapters: 26,
    failedChapters: 1,
    createdAt: "2026-06-22",
    lastReadAt: "今天 17:35",
    readingProgress: "第 2 章",
    href: routeBuilders.translationTasks("demo-translation"),
  },
  {
    id: "demo-jp",
    originalTitle: "迷雾边境",
    title: "霧の境界",
    targetLanguage: "日文",
    status: "queued" as TranslationStatus,
    progress: 0,
    completedChapters: 0,
    failedChapters: 0,
    createdAt: "2026-06-21",
    lastReadAt: "未阅读",
    readingProgress: "未开始",
    href: routeBuilders.translationTasks("demo-jp"),
  },
];

export const chapters = [
  {
    id: "chapter-1",
    title: "第一章 雾起",
    words: 3180,
    cost: "1.00",
    status: "ready" as TranslationStatus,
    note: "标题和正文识别正常",
  },
  {
    id: "chapter-2",
    title: "第二章 黑桥",
    words: 2760,
    cost: "0.50",
    status: "processing" as TranslationStatus,
    note: "发现 6 个需要统一翻译的名字",
  },
  {
    id: "chapter-3",
    title: "第三章 无名旅店",
    words: 6120,
    cost: "1.50",
    status: "review" as TranslationStatus,
    note: "章节较长，质检提示段落数量异常",
  },
  {
    id: "chapter-4",
    title: "目录",
    words: 420,
    cost: "0.50",
    status: "skipped" as TranslationStatus,
    note: "疑似目录页，已跳过",
  },
];

export const translationTasks = [
  {
    chapter: "第一章 雾起",
    status: "ready" as TranslationStatus,
    progress: "已完成",
    frozen: "1.00",
    updatedAt: "17:32",
  },
  {
    chapter: "第二章 黑桥",
    status: "processing" as TranslationStatus,
    progress: "翻译中 68%",
    frozen: "0.50",
    updatedAt: "17:36",
  },
  {
    chapter: "第三章 无名旅店",
    status: "review" as TranslationStatus,
    progress: "需检查",
    frozen: "已返还",
    updatedAt: "17:41",
  },
  {
    chapter: "第五章 灯塔",
    status: "failed" as TranslationStatus,
    progress: "重试后失败",
    frozen: "已返还",
    updatedAt: "17:43",
  },
];

export const vocabularyItems = [
  {
    term: "threshold",
    meaning: "门槛；临界点",
    context: "He paused at the threshold of the inn.",
    source: "迷雾边境 · 第二章",
    note: "这里不是物理门槛，而是进入事件的边界。",
  },
  {
    term: "mistwarden",
    meaning: "雾境守望者",
    context: "The old mistwarden raised his lantern.",
    source: "迷雾边境 · 第一章",
    note: "书中专有名字，翻译时保持一致。",
  },
  {
    term: "make out",
    meaning: "勉强辨认出",
    context: "She could barely make out the bridge.",
    source: "迷雾边境 · 第二章",
    note: "",
  },
];

export const sentenceItems = [
  {
    original: "雾像一层没睡醒的灰布，缓慢地盖过了边境。",
    translation: "The mist moved like a drowsy gray cloth, slowly covering the border.",
    explanation: "比喻句，译文保留了雾的缓慢和沉重感。",
    source: "迷雾边境 · 第一章",
    note: "适合学习具象比喻。",
  },
  {
    original: "他没有回答，只把灯举得更高。",
    translation: "He did not answer; he simply raised the lamp higher.",
    explanation: "分号处理两个紧密动作，保持小说叙事节奏。",
    source: "迷雾边境 · 第二章",
    note: "",
  },
];

export const adminMetrics = [
  { label: "用户数量", value: "128", detail: "今日新增 9" },
  { label: "上传书籍", value: "342", detail: "EPUB 占 64%" },
  { label: "翻译任务", value: "1,906", detail: "运行中 23" },
  { label: "冻结金额", value: "86.40", detail: "人民币模拟余额" },
  { label: "失败任务", value: "17", detail: "近 24 小时" },
  { label: "模型用量", value: "2.1M", detail: "今日 tokens" },
];

export const failedTasks = [
  {
    user: "138****1024",
    book: "迷雾边境",
    chapter: "第五章 灯塔",
    reason: "质检重试后仍存在未翻译段落",
    time: "17:43",
  },
  {
    user: "186****7731",
    book: "Silent Archive",
    chapter: "Chapter 9",
    reason: "翻译超时",
    time: "16:28",
  },
];

export const balanceRecords = buildMockBalanceRecords();

const stageFiveTaskDrafts = [
  {
    chapterId: "chapter-1",
    chapterTitle: "第一章：雾起",
    status: "queued" as const,
    standardUnits: 1,
    baseCostCents: 50,
    freeUnitsApplied: 1,
    frozenCents: 0,
  },
  {
    chapterId: "chapter-2",
    chapterTitle: "第二章：黑桥",
    status: "queued" as const,
    standardUnits: 1,
    baseCostCents: 50,
    freeUnitsApplied: 0,
    frozenCents: 50,
  },
  {
    chapterId: "chapter-3",
    chapterTitle: "第三章：无名旅店",
    status: "queued" as const,
    standardUnits: 3,
    baseCostCents: 150,
    freeUnitsApplied: 0,
    frozenCents: 150,
  },
  {
    chapterId: "chapter-5",
    chapterTitle: "第五章：灯塔",
    status: "queued" as const,
    standardUnits: 2,
    baseCostCents: 100,
    freeUnitsApplied: 0,
    frozenCents: 100,
  },
];

export const stageFiveQueue = buildMockTranslationQueue(stageFiveTaskDrafts);

export const stageFiveQueueRun = runMockTranslationQueueBatch({
  account: {
    balanceCents: 1230,
    frozenCents: 300,
    freeChaptersLeft: 0,
  },
  tasks: stageFiveQueue.tasks,
  failedChapterIds: ["chapter-5"],
  canceledChapterIds: ["chapter-3"],
  failureReason: "本章检查未通过，未收取费用。",
});

export const stageFiveQueueSummary = getMockTranslationQueueSummary(stageFiveQueueRun.tasks);

const stageFiveProviderPricing = {
  inputCentsPerMillionTokens: 15,
  outputCentsPerMillionTokens: 60,
};

export const stageFiveCostLedgerEntries = stageFiveQueueRun.tasks.map((task) =>
  buildTranslationCostLedgerEntry({
    taskId: `mock-${task.chapterId}`,
    chapterId: task.chapterId,
    providerName: "fake-local-provider",
    modelName: "local-cost-model",
    standardUnits: task.standardUnits,
    freeUnitsApplied: task.freeUnitsApplied,
    chargedCents: task.chargedCents,
    status: task.status,
    tokenUsage: {
      inputTokens: task.status === "canceled" ? 0 : task.standardUnits * 1600 + task.attempt * 250,
      outputTokens: task.status === "canceled" ? 0 : task.standardUnits * 2100,
    },
    providerPricing: stageFiveProviderPricing,
    retryCount: task.status === "failed" ? task.attempt + 1 : task.attempt,
    qualityIssueCount: task.status === "failed" ? 1 : 0,
  }),
);

export const stageFiveCostLedgerSummary = getTranslationCostLedgerSummary(stageFiveCostLedgerEntries);
export const stageFiveCostHealth = assessTranslationCostHealth(stageFiveCostLedgerSummary);

export const translationCostMonitor = {
  healthLabel: stageFiveCostHealth.label,
  healthReasonCount: stageFiveCostHealth.reasons.length,
  chargedYuan: formatYuanFromCents(stageFiveCostLedgerSummary.totalChargedCents),
  freeCoverageYuan: formatYuanFromCents(stageFiveCostLedgerSummary.totalFreeCoverageCents),
  providerCostYuan: formatYuanFromCents(stageFiveCostLedgerSummary.totalProviderCostCents),
  grossMarginYuan: formatYuanFromCents(stageFiveCostLedgerSummary.totalGrossMarginCents),
  grossMarginPercent:
    stageFiveCostLedgerSummary.grossMarginPercent === null
      ? "-"
      : `${stageFiveCostLedgerSummary.grossMarginPercent.toFixed(2)}%`,
  lossMakingTasks: stageFiveCostLedgerSummary.lossMakingTasks,
  totalRetryCount: stageFiveCostLedgerSummary.totalRetryCount,
  totalQualityIssueCount: stageFiveCostLedgerSummary.totalQualityIssueCount,
  reasons: stageFiveCostHealth.reasons,
};

export const stageFiveTranslationTasks = stageFiveQueueRun.tasks.map((task, index) => ({
  chapter: task.chapterTitle,
  status: mapMockTaskStatusToDisplayStatus(task.status),
  progress: getStageFiveTaskProgress(task.status, task.progressPercent),
  frozen: task.frozenCents > 0 ? formatYuanFromCents(task.frozenCents) : "免费额度",
  balanceEffect: getStageFiveBalanceEffect(task),
  updatedAt: `17:${32 + index * 4}`,
  failureReason: task.failureReason,
}));

export const stageFiveQueueMonitor = {
  totalChapters: stageFiveQueueSummary.total,
  runningTasks: stageFiveQueueSummary.running,
  queuedChapters: stageFiveQueueSummary.queued,
  succeededChapters: stageFiveQueueSummary.succeeded,
  failedChapters: stageFiveQueueSummary.failed,
  canceledChapters: stageFiveQueueSummary.canceled,
  progressPercent:
    stageFiveQueueSummary.total === 0
      ? 0
      : Math.round(
          ((stageFiveQueueSummary.succeeded +
            stageFiveQueueSummary.failed +
            stageFiveQueueSummary.canceled) /
            stageFiveQueueSummary.total) *
            100,
        ),
  chargedYuan: formatYuanFromCents(stageFiveQueueSummary.chargedCents),
  releasedYuan: formatYuanFromCents(stageFiveQueueSummary.releasedCents),
};

export const stageFiveTranslatedChapters = [
  buildMockTranslatedChapter({
    chapterId: "chapter-1",
    title: "第一章：雾起",
    targetLanguage: "英文",
    sourceParagraphs: [
      "雾像一层沉睡的灰布，缓慢盖过边境。",
      "守望塔上，林已经看不见黑桥，只能看见桥肋上的灯在摇晃。",
    ],
  }),
  buildMockTranslatedChapter({
    chapterId: "chapter-2",
    title: "第二章：黑桥",
    targetLanguage: "英文",
    sourceParagraphs: [
      "他没有回答，只把灯举得更高。",
      "老雾守曾提醒他，雾里的名字会改变，粗心的翻译会唤来错误的记忆。",
      "旅店门槛前，地板发出耐心的轻响。",
    ],
  }),
];

export const stageFiveReaderChapter = buildMockReaderChapter(stageFiveTranslatedChapters, "chapter-2");

const stageSevenReaderSourceChapters = [
  {
    id: "chapter-1",
    title: "第一章：雾起",
    wordCount: 3180,
    sourceParagraphs: [
      "雾像一层沉睡的灰布，缓慢盖过边境。",
      "守望塔上，林已经看不见黑桥，只能看见桥肋上的灯在摇晃。",
    ],
    translatedParagraphs: stageFiveTranslatedChapters[0].paragraphs,
    secondaryTranslationParagraphs: [
      "雾像一层沉睡的灰布，缓慢盖过边境。",
      "守望塔上，林已经看不见黑桥，只能看见桥肋上的灯在摇晃。",
    ],
  },
  {
    id: "chapter-2",
    title: "第二章：黑桥",
    wordCount: 2760,
    sourceParagraphs: [
      "他没有回答，只把灯举得更高。",
      "老雾守曾提醒他，雾里的名字会改变，粗心的翻译会唤来错误的记忆。",
      "旅店门槛前，地板发出耐心的轻响。",
    ],
    translatedParagraphs: stageFiveTranslatedChapters[1].paragraphs,
    secondaryTranslationParagraphs: [
      "他没有回答，只把灯举得更高。",
      "老雾守曾提醒他，雾里的名字会改变，粗心的翻译会唤来错误的记忆。",
      "旅店门槛前，地板发出耐心的轻响。",
    ],
  },
  {
    id: "chapter-3",
    title: "第三章：无名旅店",
    wordCount: 6120,
    sourceParagraphs: ["旅店没有招牌，只有一排被雾打湿的窗。"],
    translatedParagraphs: ["The inn had no sign, only a row of windows dampened by mist."],
    secondaryTranslationParagraphs: ["旅店没有招牌，只有一排被雾打湿的窗。"],
  },
];

export function buildStageSevenReaderView(currentChapterId = "chapter-2") {
  return buildReaderView({
    chapters: stageSevenReaderSourceChapters,
    currentChapterId,
    mode: "parallel",
    settings: {
      fontSize: 19,
      lineHeight: 1.72,
      contentWidth: 1360,
      theme: "light",
    },
  });
}

export const stageSevenReaderView = buildStageSevenReaderView();

export const stageSevenAssistantResult = buildReadingAssistantResult({
  kind: "sentence",
  selectedText: "他没有回答，只把灯举得更高。",
  sourceText: stageSevenReaderView.paragraphRows[0].sourceText,
  translatedText: stageSevenReaderView.paragraphRows[0].translatedText,
  bookTitle: "迷雾边境",
  chapterTitle: stageSevenReaderView.currentChapter.title,
});

export const stageSevenQuestionAnswer = answerReaderQuestion({
  question: "为什么这里用分号？",
  paragraph: stageSevenReaderView.paragraphRows[0].translatedText,
  chapterTitle: stageSevenReaderView.currentChapter.title,
});

export const stageSevenVocabularyItems = [
  createVocabularyDraft({
    term: "threshold",
    explanation: "门槛；临界点",
    contextualMean: "进入事件前的边界感",
    sourceSentence: "He paused at the threshold of the inn.",
    bookId: "demo-book",
    bookTitle: "迷雾边境",
    chapterId: "chapter-2",
    chapterTitle: "第二章：黑桥",
    note: "这里不是普通门槛。",
  }),
  createVocabularyDraft({
    term: "mistwarden",
    explanation: "雾境守望者",
    contextualMean: "负责守望雾境边界的人",
    sourceSentence: "The old mistwarden raised his lantern.",
    bookId: "demo-book",
    bookTitle: "迷雾边境",
    chapterId: "chapter-1",
    chapterTitle: "第一章：雾起",
    note: "书中专有名字，翻译时保持一致。",
  }),
  createVocabularyDraft({
    term: "make out",
    explanation: "勉强辨认出",
    contextualMean: "在雾中看清轮廓",
    sourceSentence: "She could barely make out the bridge.",
    bookId: "demo-book",
    bookTitle: "迷雾边境",
    chapterId: "chapter-2",
    chapterTitle: "第二章：黑桥",
    note: "",
  }),
];

export const stageSevenSentenceItems = [
  createSentenceDraft({
    originalText: "雾像一层没睡醒的灰布，缓慢地盖过了边境。",
    translatedText: "The mist moved like a drowsy gray cloth, slowly covering the border.",
    explanation: "比喻句，译文保留了雾的缓慢和沉重感。",
    bookId: "demo-book",
    bookTitle: "迷雾边境",
    chapterId: "chapter-1",
    chapterTitle: "第一章：雾起",
    note: "适合学习具象比喻。",
  }),
  createSentenceDraft({
    originalText: "他没有回答，只把灯举得更高。",
    translatedText: "He did not answer; he simply raised the lamp higher.",
    explanation: "分号处理两个紧密动作，保持小说叙事节奏。",
    bookId: "demo-book",
    bookTitle: "迷雾边境",
    chapterId: "chapter-2",
    chapterTitle: "第二章：黑桥",
    note: "",
  }),
];

export const stageSevenVocabularyView = {
  query: "mist",
  selectedBookId: "demo-book",
  availableBooks: [{ id: "demo-book", title: "迷雾边境" }],
  items: filterVocabularyItems(stageSevenVocabularyItems, {
    query: "",
    bookId: "demo-book",
  }),
  deletionPreview: previewStudyItemDeletion({
    id: stageSevenVocabularyItems[0].id,
    kind: "vocabulary",
    label: stageSevenVocabularyItems[0].term,
  }),
};

export const stageSevenSentenceView = {
  query: "分号",
  selectedBookId: "demo-book",
  availableBooks: [{ id: "demo-book", title: "迷雾边境" }],
  items: filterSentenceItems(stageSevenSentenceItems, {
    query: "",
    bookId: "demo-book",
  }),
  deletionPreview: previewStudyItemDeletion({
    id: stageSevenSentenceItems[1].id,
    kind: "sentence",
    label: stageSevenSentenceItems[1].originalText,
  }),
};

const stageEightTranslatedBookInput = {
  title: translatedBooks[0].title,
  originalTitle: translatedBooks[0].originalTitle,
  targetLanguage: translatedBooks[0].targetLanguage,
  chapters: stageSevenReaderSourceChapters.map((chapter) => ({
    id: chapter.id,
    title: chapter.title,
    paragraphs: chapter.translatedParagraphs,
  })),
  chapterOrder: stageSevenReaderSourceChapters.map((chapter) => chapter.id),
};

export const stageEightTxtExport = buildTranslatedBookTxtExport(stageEightTranslatedBookInput);
export const stageEightEpubDraft = buildEpubExportDraft(stageEightTranslatedBookInput);
export const stageEightVocabularyCsvExport = buildVocabularyCsvExport({
  bookTitle: "迷雾边境",
  items: stageSevenVocabularyItems,
});
export const stageEightSentenceMarkdownExport = buildSentenceMarkdownExport({
  bookTitle: "迷雾边境",
  items: stageSevenSentenceItems,
});

export const stageEightExportFiles = [
  { fileName: stageEightTxtExport.fileName, format: "TXT" },
  { fileName: stageEightEpubDraft.fileName, format: "EPUB 草稿" },
  { fileName: stageEightVocabularyCsvExport.fileName, format: "CSV" },
  { fileName: stageEightSentenceMarkdownExport.fileName, format: "Markdown" },
];

export const stageEightAdminSummary = buildAdminExportSummary({
  userCount: 128,
  balanceRecordCount: balanceRecords.length,
  translationTaskCount: stageFiveQueueSummary.total,
  failedTaskCount: failedTasks.length,
  usageLabel: "2.1M tokens",
  exportFiles: stageEightExportFiles,
});

export const stageNineLegalNotices = getLaunchLegalNotices();
export const stageNineHomeNotices = getLegalNoticesForSurface("home");
export const stageNineUploadNotices = getLegalNoticesForSurface("upload");
export const stageNineTranslationNotices = getLegalNoticesForSurface("translation");
export const stageNineRateLimitPolicies = getLaunchRateLimitPolicies();
export const stageNineReaderAssistantLimit = evaluateLocalRateLimit({
  action: "reader-assistant-question",
  usedCount: 8,
});
export const stageNineCreateTranslationLimit = evaluateLocalRateLimit({
  action: "create-translation",
  usedCount: 2,
});
export const stageNineDisplayStates = getLaunchDisplayStates();
export const stageNineLaunchChecklist = getLaunchChecklist();
export const stageTenProductionRequirements = getProductionEnvRequirements();
export const stageTenProductionPreflight = evaluateProductionPreflight({
  DATABASE_URL: "",
  DIRECT_URL: "",
  NEXT_PUBLIC_SUPABASE_URL: "",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "your-anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "",
  MOCK_AUTH_ENABLED: "true",
  NEXT_PUBLIC_APP_URL: "http://localhost:3000",
});
export const stageTenProductionPreflightItems = [
  {
    label: "必需配置",
    value: `${stageTenProductionPreflight.readyCount}/${stageTenProductionPreflight.requiredCount}`,
  },
  { label: "缺失项", value: String(stageTenProductionPreflight.missingKeys.length) },
  { label: "占位项", value: String(stageTenProductionPreflight.placeholderKeys.length) },
  { label: "风险项", value: String(stageTenProductionPreflight.risks.length) },
];
export const stageTenProductionRolloutSteps = getProductionRolloutSteps();
export const stageElevenAdminAuditRecords = [
  buildAdminAuditRecord({
    action: "add-balance",
    actorId: "admin-001",
    targetId: "user-13800138000",
    reason: "线下充值补录",
    createdAt: "2026-06-24T10:30:00.000Z",
    metadata: {
      phone: "13800138000",
      amountCents: 5000,
      serviceRoleKey: "mock-service-role-secret",
    },
  }),
  buildAdminAuditRecord({
    action: "export-user-data",
    actorId: "admin-001",
    targetId: "user-13900139000",
    reason: "用户请求导出资料",
    createdAt: "2026-06-24T10:45:00.000Z",
    metadata: {
      phone: "13900139000",
      exportFile: "user-data-2026-06-24.csv",
    },
  }),
  buildAdminAuditRecord({
    action: "view-cost-ledger",
    actorId: "admin-002",
    targetId: "translation-task-001",
    reason: "",
    createdAt: "2026-06-24T11:00:00.000Z",
    metadata: {},
  }),
];
export const stageElevenAdminAuditSummary =
  summarizeAdminAuditRecords(stageElevenAdminAuditRecords);
export const stageElevenDataRetentionPolicies = getDataRetentionPolicies();
export const stageElevenDataRetentionSummary = summarizeDataRetentionPolicies(
  stageElevenDataRetentionPolicies,
);

const stageSixSourceText = [
  "《雾灯协议》第一次被 Mistwarden Lin 提起时，黑桥下的水还没有倒流。",
  "他没有回答，只把灯举得更高，让雾守的影子落在旧地图上。",
  "如果联网查证以后仍找不到对应设定，就保留 Mistwarden Lin 的专名，并在术语表里固定译法。",
].join("\n\n");

export const stageSixSegments = splitChapterIntoTranslationSegments({
  chapterId: "chapter-2",
  chapterTitle: "第二章：黑桥",
  text: stageSixSourceText,
  maxCharactersPerSegment: 70,
});

export const stageSixTerminologyCandidates = extractTerminologyCandidates({
  sourceLanguage: "中文",
  texts: stageSixSegments.map((segment) => segment.text),
});

const stageSixPendingGlossary = upsertTerminologyCandidatesIntoGlossary({
  bookId: "demo-book",
  sourceLanguage: "中文",
  targetLanguage: "英文",
  chapterId: "chapter-2",
  existingTerms: [],
  candidates: stageSixTerminologyCandidates,
});

export const stageSixBookGlossary = stageSixPendingGlossary.map((term) => {
  if (term.sourceTerm === "《雾灯协议》") {
    return confirmBookGlossaryTerm(term, {
      targetTerm: "The Mist-Lamp Protocol",
      confidence: 0.88,
    });
  }

  if (term.sourceTerm === "Mistwarden Lin") {
    return confirmBookGlossaryTerm(term, {
      targetTerm: "Mistwarden Lin",
      confidence: 0.94,
    });
  }

  return term;
});

const stageSixRelevantGlossaryTerms = getRelevantGlossaryTermsForText({
  text: stageSixSegments.map((segment) => segment.text).join("\n"),
  glossary: stageSixBookGlossary,
});

export const stageSixPromptPreview = buildTranslationPrompt({
  targetLanguage: "英文",
  style: "自然流畅，保留小说叙事节奏",
  webLookupEnabled: true,
  glossaryTerms: stageSixRelevantGlossaryTerms,
  segment: stageSixSegments[0],
});

export const stageSixQualityResult = assessTranslationQuality({
  sourceSegments: stageSixSegments,
  translatedSegments: stageSixSegments.map((segment) => ({
    segmentId: segment.id,
    index: segment.index,
    translatedText: `[Prepared ${segment.index + 1}] The local AI prep layer keeps this segment aligned for English output.`,
  })),
});

const stageSixGlossaryUsageIssues = assessGlossaryTermUsage({
  sourceText: stageSixSegments.map((segment) => segment.text).join("\n"),
  translatedText: "Mistwarden Lin mentioned The Mist-Lamp Protocol near the black bridge.",
  glossary: stageSixBookGlossary,
});

export const stageSixAiPrep = {
  segmentCount: stageSixSegments.length,
  promptSegment: stageSixPromptPreview.metadata.segmentId,
  promptLookup: "启用",
  terminologyCount: stageSixTerminologyCandidates.length,
  topTerms: stageSixTerminologyCandidates.slice(0, 3).map((candidate) => candidate.term),
  glossaryTotal: stageSixBookGlossary.length,
  glossaryConfirmed: stageSixBookGlossary.filter((term) => term.status === "confirmed").length,
  relevantGlossaryTerms: stageSixRelevantGlossaryTerms.map((term) => term.sourceTerm),
  glossaryIssueCount: stageSixGlossaryUsageIssues.length,
  qualityStatus: stageSixQualityResult.status === "passed" ? "通过" : "需检查",
  qualityIssueCount: stageSixQualityResult.issues.length,
  providerStatus: "Fake Provider 就绪",
};

function mapMockTaskStatusToDisplayStatus(status: MockTranslationTaskStatus): TranslationStatus {
  if (status === "succeeded") {
    return "ready";
  }

  if (status === "failed") {
    return "failed";
  }

  if (status === "canceled") {
    return "skipped";
  }

  if (status === "running") {
    return "processing";
  }

  return "queued";
}

function getStageFiveTaskProgress(status: MockTranslationTaskStatus, progressPercent: number) {
  if (status === "succeeded") {
    return "译文已生成，费用已结算。";
  }

  if (status === "failed") {
    return "翻译失败，未扣费。";
  }

  if (status === "canceled") {
    return "本章已取消，未收取费用。";
  }

  if (status === "running") {
    return `翻译处理中 ${progressPercent}%`;
  }

  return "等待翻译。";
}

function getStageFiveBalanceEffect(task: {
  chargedCents: number;
  releasedCents: number;
}) {
  if (task.chargedCents > 0) {
    return `扣费 ${formatYuanFromCents(task.chargedCents)}`;
  }

  if (task.releasedCents > 0) {
    return "未扣费";
  }

  return "无余额变动";
}
