export type ReaderMode = "translation" | "source" | "parallel";

export type ReaderTheme = "light" | "sepia" | "dark";

export type ReaderSettings = {
  fontSize: number;
  lineHeight: number;
  contentWidth: number;
  theme: ReaderTheme;
};

export type ReaderChapterInput = {
  id: string;
  title: string;
  wordCount: number;
  sourceParagraphs: string[];
  translatedParagraphs: string[];
  secondaryTranslationParagraphs?: string[];
};

export type ReaderParagraphRow = {
  index: number;
  sourceText: string;
  translatedText: string;
  learningText: string;
  secondaryTranslationText: string;
  displayText: string;
};

export type ReaderChapterNavItem = {
  id: string;
  title: string;
  wordCount: number;
  isCurrent: boolean;
};

export type ReaderView = {
  mode: ReaderMode;
  modeLabel: string;
  settings: ReaderSettings;
  chapters: ReaderChapterNavItem[];
  currentChapter: ReaderChapterInput;
  previousChapter?: ReaderChapterNavItem;
  nextChapter?: ReaderChapterNavItem;
  paragraphRows: ReaderParagraphRow[];
};

export const defaultReaderSettings: ReaderSettings = {
  fontSize: 19,
  lineHeight: 1.72,
  contentWidth: 1280,
  theme: "light",
};

export function buildReaderView(input: {
  chapters: ReaderChapterInput[];
  currentChapterId?: string;
  mode?: ReaderMode;
  settings?: Partial<ReaderSettings>;
}): ReaderView {
  if (input.chapters.length === 0) {
    throw new Error("Reader view requires at least one chapter.");
  }

  const currentIndex = Math.max(
    0,
    input.chapters.findIndex((chapter) => chapter.id === input.currentChapterId),
  );
  const currentChapter = input.chapters[currentIndex];
  const mode = input.mode ?? "translation";
  const chapters = input.chapters.map((chapter) => ({
    id: chapter.id,
    title: chapter.title,
    wordCount: chapter.wordCount,
    isCurrent: chapter.id === currentChapter.id,
  }));

  return {
    mode,
    modeLabel: getReaderModeLabel(mode),
    settings: normalizeReaderSettings(input.settings),
    chapters,
    currentChapter,
    previousChapter: currentIndex > 0 ? chapters[currentIndex - 1] : undefined,
    nextChapter: currentIndex < chapters.length - 1 ? chapters[currentIndex + 1] : undefined,
    paragraphRows: buildParagraphRows(currentChapter, mode),
  };
}

export function normalizeReaderSettings(settings: Partial<ReaderSettings> = {}): ReaderSettings {
  return {
    fontSize: clampInteger(settings.fontSize, 16, 24, defaultReaderSettings.fontSize),
    lineHeight: clampNumber(settings.lineHeight, 1.6, 2.2, defaultReaderSettings.lineHeight),
    contentWidth: clampInteger(
      settings.contentWidth,
      640,
      1480,
      defaultReaderSettings.contentWidth,
    ),
    theme: isReaderTheme(settings.theme) ? settings.theme : defaultReaderSettings.theme,
  };
}

export function getReaderModeLabel(mode: ReaderMode) {
  if (mode === "source") {
    return "原文";
  }

  if (mode === "parallel") {
    return "对照";
  }

  return "译文";
}

function buildParagraphRows(
  chapter: ReaderChapterInput,
  mode: ReaderMode,
): ReaderParagraphRow[] {
  const rowCount = Math.max(chapter.sourceParagraphs.length, chapter.translatedParagraphs.length);

  return Array.from({ length: rowCount }, (_, index) => {
    const sourceText = chapter.sourceParagraphs[index] ?? "";
    const translatedText = cleanReaderText(chapter.translatedParagraphs[index] ?? "");
    const secondaryTranslationText = cleanReaderText(
      chapter.secondaryTranslationParagraphs?.[index] ?? sourceText,
    );

    return {
      index,
      sourceText,
      translatedText,
      learningText: translatedText || sourceText,
      secondaryTranslationText,
      displayText: getDisplayTextForMode({ mode, sourceText, translatedText }),
    };
  });
}

function getDisplayTextForMode(input: {
  mode: ReaderMode;
  sourceText: string;
  translatedText: string;
}) {
  if (input.mode === "source") {
    return input.sourceText;
  }

  if (input.mode === "parallel") {
    return input.translatedText || input.sourceText;
  }

  return input.translatedText || input.sourceText;
}

function clampInteger(
  value: number | undefined,
  min: number,
  max: number,
  fallback: number,
) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.round(Math.min(Math.max(value, min), max));
}

function clampNumber(value: number | undefined, min: number, max: number, fallback: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.round(Math.min(Math.max(value, min), max) * 100) / 100;
}

function isReaderTheme(value: unknown): value is ReaderTheme {
  return value === "light" || value === "sepia" || value === "dark";
}

function cleanReaderText(text: string) {
  const trimmed = text.trim();
  const mockMatch = trimmed.match(/^\[Mock [^\]]+\]\s*(.+?)\s+is rendered from:\s+.+$/);

  if (mockMatch) {
    return `${mockMatch[1].trim()}.`;
  }

  return trimmed;
}
