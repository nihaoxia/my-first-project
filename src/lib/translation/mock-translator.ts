export type MockTranslatedChapterInput = {
  chapterId: string;
  title: string;
  targetLanguage: string;
  sourceParagraphs: string[];
};

export type MockTranslatedChapter = {
  chapterId: string;
  title: string;
  targetLanguage: string;
  paragraphs: string[];
};

export function buildMockTranslatedChapter(input: MockTranslatedChapterInput): MockTranslatedChapter {
  return {
    chapterId: input.chapterId,
    title: input.title,
    targetLanguage: input.targetLanguage,
    paragraphs: input.sourceParagraphs
      .map((paragraph) => paragraph.trim())
      .filter(Boolean)
      .map((paragraph) => buildMockParagraphTranslation(paragraph)),
  };
}

export function buildMockReaderChapter(
  chapters: MockTranslatedChapter[],
  chapterId: string,
): MockTranslatedChapter | undefined {
  return chapters.find((chapter) => chapter.chapterId === chapterId) ?? chapters[0];
}

function buildMockParagraphTranslation(paragraph: string) {
  if (paragraph.includes("雾") || paragraph.toLowerCase().includes("mist")) {
    return `[Mock English] The mist-like border scene is rendered from: ${paragraph}`;
  }

  if (paragraph.includes("灯") || paragraph.toLowerCase().includes("lamp")) {
    return `[Mock English] The lamp-lit response is rendered from: ${paragraph}`;
  }

  if (paragraph.includes("桥") || paragraph.toLowerCase().includes("bridge")) {
    return `[Mock English] The bridge scene is rendered from: ${paragraph}`;
  }

  return `[Mock English] A clear literary translation is rendered from: ${paragraph}`;
}
