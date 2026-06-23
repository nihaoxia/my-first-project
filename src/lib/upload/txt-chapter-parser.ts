export type TxtChapterWarning = "leading-content" | "single-chapter" | "likely-toc" | "short-chapter";

export type TxtChapterPreview = {
  index: number;
  title: string;
  characterCount: number;
  contentPreview: string;
  suggestedSkip: boolean;
  warnings: TxtChapterWarning[];
};

export type TxtChapterParseResult = {
  chapters: TxtChapterPreview[];
  warnings: TxtChapterWarning[];
};

export type TxtChapterParseOptions = {
  shortChapterCharacters?: number;
};

export const txtChapterParsePolicy = {
  leadingContentTitle: "开篇",
  singleChapterTitle: "全文",
  defaultShortChapterCharacters: 500,
  contentPreviewCharacters: 120,
  ruleLabels: ["自动识别", "中文章节：第X章 / 第X回", "英文章节：Chapter X", "目录页建议跳过"],
};

const chineseChapterPattern = /^第[零〇一二三四五六七八九十百千万两\d]+[章节回卷部篇](?:[\s:：、.-].{0,60}|.{0,30})?$/;
const englishChapterPattern = /^chapter\s+[0-9ivxlcdm]+(?:[\s:：、.-].{0,60})?$/i;
const standaloneHeadingPattern = /^(目录|楔子|序章|序言|前言|尾声|后记)$/;

export function detectTxtChapterHeading(line: string): string | null {
  const normalized = normalizeLine(line);

  if (!normalized) {
    return null;
  }

  if (
    chineseChapterPattern.test(normalized) ||
    englishChapterPattern.test(normalized) ||
    standaloneHeadingPattern.test(normalized)
  ) {
    return normalized;
  }

  return null;
}

export function parseTxtChapters(content: string, options: TxtChapterParseOptions = {}): TxtChapterParseResult {
  const normalizedContent = normalizeContent(content);
  const shortChapterCharacters = options.shortChapterCharacters ?? txtChapterParsePolicy.defaultShortChapterCharacters;

  if (!normalizedContent) {
    return {
      chapters: [
        buildChapterPreview({
          index: 1,
          title: txtChapterParsePolicy.singleChapterTitle,
          content: "",
          warnings: ["single-chapter", "short-chapter"],
          shortChapterCharacters,
        }),
      ],
      warnings: ["single-chapter"],
    };
  }

  const lines = normalizedContent.split("\n");
  const chunks: Array<{ title: string; contentLines: string[]; warnings: TxtChapterWarning[] }> = [];
  let currentTitle = txtChapterParsePolicy.leadingContentTitle;
  let currentLines: string[] = [];
  let currentWarnings: TxtChapterWarning[] = ["leading-content"];
  let sawHeading = false;

  for (const line of lines) {
    const heading = detectTxtChapterHeading(line);

    if (heading) {
      if (sawHeading || currentLines.some((currentLine) => currentLine.trim())) {
        chunks.push({
          title: currentTitle,
          contentLines: currentLines,
          warnings: currentWarnings,
        });
      }

      sawHeading = true;
      currentTitle = heading;
      currentLines = [];
      currentWarnings = [];
      continue;
    }

    currentLines.push(line);
  }

  if (!sawHeading) {
    return {
      chapters: [
        buildChapterPreview({
          index: 1,
          title: txtChapterParsePolicy.singleChapterTitle,
          content: normalizedContent,
          warnings: ["single-chapter"],
          shortChapterCharacters,
        }),
      ],
      warnings: ["single-chapter"],
    };
  }

  chunks.push({
    title: currentTitle,
    contentLines: currentLines,
    warnings: currentWarnings,
  });

  return {
    chapters: chunks.map((chunk, index) =>
      buildChapterPreview({
        index: index + 1,
        title: chunk.title,
        content: chunk.contentLines.join("\n").trim(),
        warnings: chunk.warnings,
        shortChapterCharacters,
      }),
    ),
    warnings: [],
  };
}

function buildChapterPreview({
  index,
  title,
  content,
  warnings,
  shortChapterCharacters,
}: {
  index: number;
  title: string;
  content: string;
  warnings: TxtChapterWarning[];
  shortChapterCharacters: number;
}): TxtChapterPreview {
  const characterCount = countTextCharacters(`${title}\n${content}`);
  const chapterWarnings = new Set(warnings);
  const likelyToc = isLikelyTableOfContents(title, content);

  if (likelyToc) {
    chapterWarnings.add("likely-toc");
  }

  if (characterCount < shortChapterCharacters) {
    chapterWarnings.add("short-chapter");
  }

  return {
    index,
    title,
    characterCount,
    contentPreview: buildContentPreview(content),
    suggestedSkip: likelyToc,
    warnings: Array.from(chapterWarnings),
  };
}

function normalizeContent(content: string) {
  return content.replace(/\r\n?/g, "\n").trim();
}

function normalizeLine(line: string) {
  return line.replace(/\s+/g, " ").trim();
}

function countTextCharacters(content: string) {
  return content.replace(/\s/g, "").length;
}

function buildContentPreview(content: string) {
  const preview = content.replace(/\s+/g, " ").trim();
  return preview.slice(0, txtChapterParsePolicy.contentPreviewCharacters);
}

function isLikelyTableOfContents(title: string, content: string) {
  if (title === "目录") {
    return true;
  }

  const normalizedContent = content.replace(/\s+/g, "");
  return title.includes("目录") || /^第.+[章节回卷部篇]/.test(normalizedContent);
}
