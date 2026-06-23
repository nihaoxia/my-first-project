import { routes } from "@/lib/routes";
import { buildMockAccountSummary } from "@/lib/account/mock-account-summary";
import { buildMockBalanceRecords } from "@/lib/account/mock-balance-ledger";

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
  estimatedAfterSelection: "11.60",
};

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
    href: routes.chapters,
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
    href: routes.chapters,
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
    href: routes.tasks,
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
    href: routes.tasks,
  },
];

export const chapters = [
  {
    id: "chapter-1",
    title: "第一章 雾起",
    words: 3180,
    cost: "0.20",
    status: "ready" as TranslationStatus,
    note: "标题和正文识别正常",
  },
  {
    id: "chapter-2",
    title: "第二章 黑桥",
    words: 2760,
    cost: "0.10",
    status: "processing" as TranslationStatus,
    note: "发现 6 个新增术语",
  },
  {
    id: "chapter-3",
    title: "第三章 无名旅店",
    words: 6120,
    cost: "0.30",
    status: "review" as TranslationStatus,
    note: "章节较长，质检提示段落数量异常",
  },
  {
    id: "chapter-4",
    title: "目录",
    words: 420,
    cost: "0.10",
    status: "skipped" as TranslationStatus,
    note: "疑似目录页，已跳过",
  },
];

export const translationTasks = [
  {
    chapter: "第一章 雾起",
    status: "ready" as TranslationStatus,
    progress: "已完成",
    frozen: "0.20",
    updatedAt: "17:32",
  },
  {
    chapter: "第二章 黑桥",
    status: "processing" as TranslationStatus,
    progress: "翻译中 68%",
    frozen: "0.10",
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
    note: "设定词，后续译名需保持一致。",
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
    reason: "模型响应超时",
    time: "16:28",
  },
];

export const balanceRecords = buildMockBalanceRecords();
