import type { EditableChapter } from "./chapter-editing.ts";
import type { UploadDraftResult } from "./upload-draft.ts";

type SuccessfulUploadDraft = Extract<UploadDraftResult, { ok: true }>;

export type OriginalBookDraftFailureReason = "upload-not-parsed" | "no-included-chapters";

export type OriginalBookDraftInput = {
  uploadDraft: SuccessfulUploadDraft;
  chapters: EditableChapter[];
};

export type OriginalBookDraft = {
  book: {
    title: string;
    author: string | null;
    format: SuccessfulUploadDraft["format"];
    originalFileName: string;
    includedChapterCount: number;
    skippedChapterCount: number;
    totalCharacters: number;
  };
  chapters: Array<{
    position: number;
    sourceIndex: number;
    title: string;
    originalTitle: string;
    characterCount: number;
    content: string;
    contentPreview: string;
    warnings: EditableChapter["warnings"];
  }>;
  skippedChapters: Array<{
    sourceIndex: number;
    title: string;
    originalTitle: string;
    warnings: EditableChapter["warnings"];
  }>;
};

export type OriginalBookDraftResult =
  | {
      ok: true;
      book: OriginalBookDraft["book"];
      chapters: OriginalBookDraft["chapters"];
      skippedChapters: OriginalBookDraft["skippedChapters"];
    }
  | {
      ok: false;
      reason: OriginalBookDraftFailureReason;
    };

export function buildOriginalBookDraft(input: OriginalBookDraftInput): OriginalBookDraftResult {
  if (input.uploadDraft.parseStatus !== "parsed") {
    return {
      ok: false,
      reason: "upload-not-parsed",
    };
  }

  const includedChapters = input.chapters.filter((chapter) => chapter.included);

  if (includedChapters.length === 0) {
    return {
      ok: false,
      reason: "no-included-chapters",
    };
  }

  const skippedChapters = input.chapters.filter((chapter) => !chapter.included);

  return {
    ok: true,
    book: {
      title: input.uploadDraft.metadata.title,
      author: input.uploadDraft.metadata.author,
      format: input.uploadDraft.format,
      originalFileName: input.uploadDraft.metadata.originalFileName,
      includedChapterCount: includedChapters.length,
      skippedChapterCount: skippedChapters.length,
      totalCharacters: includedChapters.reduce((total, chapter) => total + chapter.characterCount, 0),
    },
    chapters: includedChapters.map((chapter, index) => ({
      position: index + 1,
      sourceIndex: chapter.index,
      title: chapter.title,
      originalTitle: chapter.originalTitle,
      characterCount: chapter.characterCount,
      content: chapter.content,
      contentPreview: chapter.contentPreview,
      warnings: chapter.warnings,
    })),
    skippedChapters: skippedChapters.map((chapter) => ({
      sourceIndex: chapter.index,
      title: chapter.title,
      originalTitle: chapter.originalTitle,
      warnings: chapter.warnings,
    })),
  };
}
