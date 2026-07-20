export type TranslatedBookExportChapter = {
  id: string;
  title: string;
  paragraphs: string[];
};

export type TranslatedBookExportInput = {
  title: string;
  originalTitle: string;
  targetLanguage: string;
  chapters: TranslatedBookExportChapter[];
  chapterOrder?: string[];
};

export type TextExportResult = {
  fileName: string;
  content: string;
};

export type EpubExportDraft = {
  fileName: string;
  packaged: false;
  title: string;
  originalTitle: string;
  targetLanguage: string;
  chapterFiles: Array<{
    chapterId: string;
    title: string;
    path: string;
    content: string;
  }>;
  note: string;
};

export function buildTranslatedBookTxtExport(input: TranslatedBookExportInput): TextExportResult {
  const chapters = orderChapters(input.chapters, input.chapterOrder);
  const header = [input.title, `原书：${input.originalTitle}`, `目标语言：${input.targetLanguage}`].join(
    "\n",
  );
  const chapterBlocks = chapters.map((chapter) =>
    [chapter.title, ...chapter.paragraphs.map((paragraph) => paragraph.trim()).filter(Boolean)].join(
      "\n\n",
    ),
  );

  return {
    fileName: `${slugifyFileName(input.title)}.txt`,
    content: [header, ...chapterBlocks].join("\n\n"),
  };
}

export function buildEpubExportDraft(input: TranslatedBookExportInput): EpubExportDraft {
  const chapters = orderChapters(input.chapters, input.chapterOrder);

  return {
    fileName: `${slugifyFileName(input.title)}.epub`,
    packaged: false,
    title: input.title,
    originalTitle: input.originalTitle,
    targetLanguage: input.targetLanguage,
    chapterFiles: chapters.map((chapter) => ({
      chapterId: chapter.id,
      title: chapter.title,
      path: `chapters/${chapter.id}.xhtml`,
      content: buildChapterXhtml(chapter),
    })),
    note: "尚未生成真实 EPUB 文件；当前仅保留后续打包所需的本地草稿数据。",
  };
}

function orderChapters(
  chapters: TranslatedBookExportChapter[],
  chapterOrder: string[] | undefined,
) {
  if (!chapterOrder || chapterOrder.length === 0) {
    return chapters;
  }

  const chapterById = new Map(chapters.map((chapter) => [chapter.id, chapter]));
  const ordered = chapterOrder
    .map((chapterId) => chapterById.get(chapterId))
    .filter((chapter): chapter is TranslatedBookExportChapter => Boolean(chapter));
  const orderedIds = new Set(ordered.map((chapter) => chapter.id));
  const remaining = chapters.filter((chapter) => !orderedIds.has(chapter.id));

  return [...ordered, ...remaining];
}

function buildChapterXhtml(chapter: TranslatedBookExportChapter) {
  const paragraphs = chapter.paragraphs
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
    .join("\n");

  return [`<h1>${escapeHtml(chapter.title)}</h1>`, paragraphs].filter(Boolean).join("\n");
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function slugifyFileName(value: string) {
  const transliterated = value.replace(
    /[\u4e00-\u9fa5]/g,
    (character) => ` ${pinyinMap[character] ?? ""} `,
  );

  const slug = transliterated
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "stray-pages-export";
}

const pinyinMap: Record<string, string> = {
  边: "bian",
  境: "jing",
  迷: "mi",
  雾: "wu",
};
