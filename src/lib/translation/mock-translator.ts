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
    return "The mist moved like a sleeping gray cloth, slowly covering the border.";
  }

  if (paragraph.includes("灯") || paragraph.toLowerCase().includes("lamp")) {
    return "He did not answer; he only raised the lamp higher.";
  }

  if (paragraph.includes("桥") || paragraph.toLowerCase().includes("bridge")) {
    return "The black bridge blurred in the distance.";
  }

  return "A clear literary translation is ready for this paragraph.";
}
