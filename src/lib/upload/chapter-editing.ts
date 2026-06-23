import type { TxtChapterPreview } from "./txt-chapter-parser.ts";

export type EditableChapter = TxtChapterPreview & {
  originalTitle: string;
  included: boolean;
};

export type ChapterEditFailureReason = "chapter-not-found" | "empty-title";

export type ChapterEditResult =
  | {
      ok: true;
      chapters: EditableChapter[];
    }
  | {
      ok: false;
      reason: ChapterEditFailureReason;
      chapters: EditableChapter[];
    };

export type EditableChapterSummary = {
  totalChapters: number;
  includedChapters: number;
  skippedChapters: number;
  warningChapters: number;
};

export function buildEditableChapters(chapters: TxtChapterPreview[]): EditableChapter[] {
  return chapters.map((chapter) => ({
    ...chapter,
    originalTitle: chapter.title,
    included: !chapter.suggestedSkip,
  }));
}

export function renameEditableChapter(
  chapters: EditableChapter[],
  chapterIndex: number,
  title: string,
): ChapterEditResult {
  const nextTitle = title.trim();

  if (!nextTitle) {
    return {
      ok: false,
      reason: "empty-title",
      chapters,
    };
  }

  return updateChapter(chapters, chapterIndex, (chapter) => ({
    ...chapter,
    title: nextTitle,
  }));
}

export function skipEditableChapter(chapters: EditableChapter[], chapterIndex: number): ChapterEditResult {
  return updateChapter(chapters, chapterIndex, (chapter) => ({
    ...chapter,
    included: false,
  }));
}

export function restoreEditableChapter(chapters: EditableChapter[], chapterIndex: number): ChapterEditResult {
  return updateChapter(chapters, chapterIndex, (chapter) => ({
    ...chapter,
    included: true,
  }));
}

export function summarizeEditableChapters(chapters: EditableChapter[]): EditableChapterSummary {
  const includedChapters = chapters.filter((chapter) => chapter.included).length;

  return {
    totalChapters: chapters.length,
    includedChapters,
    skippedChapters: chapters.length - includedChapters,
    warningChapters: chapters.filter((chapter) => chapter.warnings.length > 0).length,
  };
}

function updateChapter(
  chapters: EditableChapter[],
  chapterIndex: number,
  update: (chapter: EditableChapter) => EditableChapter,
): ChapterEditResult {
  let found = false;
  const nextChapters = chapters.map((chapter) => {
    if (chapter.index !== chapterIndex) {
      return chapter;
    }

    found = true;
    return update(chapter);
  });

  if (!found) {
    return {
      ok: false,
      reason: "chapter-not-found",
      chapters,
    };
  }

  return {
    ok: true,
    chapters: nextChapters,
  };
}
