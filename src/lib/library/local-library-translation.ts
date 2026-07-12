import type { StoredLocalLibraryBook } from "./local-library-storage.ts";

export type LocalLibraryTranslationChapter = {
  id: string;
  title: string;
  words: number;
  status: "ready";
  note: string;
};

export type LocalLibraryTranslationSource = {
  id: string;
  title: string;
  sourceLanguage: string;
  chapters: LocalLibraryTranslationChapter[];
};

const cjkTextPattern = /[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]/u;

export function inferLocalBookSourceLanguage(book: StoredLocalLibraryBook) {
  const chapterText = book.chapters
    .slice(0, 8)
    .map((chapter) => `${chapter.content ?? ""}\n${chapter.contentPreview}`)
    .join("\n");
  const fallbackText = `${book.title}\n${chapterText}`;

  return cjkTextPattern.test(fallbackText) ? "中文" : "英文";
}

export function buildLocalLibraryTranslationSource(
  book: StoredLocalLibraryBook,
): LocalLibraryTranslationSource {
  return {
    id: book.id,
    title: book.title,
    sourceLanguage: inferLocalBookSourceLanguage(book),
    chapters: book.chapters.map((chapter) => ({
      id: `${book.id}-chapter-${chapter.sourceIndex}`,
      title: chapter.title,
      words: Math.max(0, chapter.characterCount),
      status: "ready",
      note: "本章可选择翻译。",
    })),
  };
}
