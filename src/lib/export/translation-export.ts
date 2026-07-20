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

export function buildTranslatedBookTxtExport(input: TranslatedBookExportInput): TextExportResult {
  const chapters = orderTranslatedBookChapters(input.chapters, input.chapterOrder);
  const header = [input.title, `原书：${input.originalTitle}`, `目标语言：${input.targetLanguage}`].join(
    "\n",
  );
  const chapterBlocks = chapters.map((chapter) =>
    [chapter.title, ...chapter.paragraphs.map((paragraph) => paragraph.trim()).filter(Boolean)].join(
      "\n\n",
    ),
  );

  return {
    fileName: `${buildExportFileSlug(input.title)}.txt`,
    content: [header, ...chapterBlocks].join("\n\n"),
  };
}

export function orderTranslatedBookChapters(
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

export function buildExportFileSlug(value: string) {
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
