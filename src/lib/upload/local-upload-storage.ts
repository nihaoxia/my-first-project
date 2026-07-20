import type { LocalUploadDraftResult } from "./local-upload-draft.ts";
import type { UploadDraftResult } from "./upload-draft.ts";

export const localUploadBookId = "local-upload";
export const localUploadDraftStorageKey = "stray-pages.local-upload-draft";

export type StoredLocalUploadDraft = Extract<UploadDraftResult, { ok: true }> & {
  parseStatus: "parsed";
};

export type LocalUploadDraftStorageUpdate =
  | {
      action: "save";
      draft: StoredLocalUploadDraft;
    }
  | {
      action: "clear";
    };

export function getLocalUploadDraftStorageUpdate(
  value: LocalUploadDraftResult,
): LocalUploadDraftStorageUpdate {
  if (isStoredLocalUploadDraft(value)) {
    return {
      action: "save",
      draft: value,
    };
  }

  return {
    action: "clear",
  };
}

export function isStoredLocalUploadDraft(value: unknown): value is StoredLocalUploadDraft {
  if (!isRecord(value)) {
    return false;
  }

  return (
    value.ok === true &&
    isStoredUploadFormat(value.format) &&
    value.parseStatus === "parsed" &&
    isRecord(value.metadata) &&
    typeof value.metadata.title === "string" &&
    (typeof value.metadata.author === "string" || value.metadata.author === null) &&
    value.metadata.format === value.format &&
    typeof value.metadata.originalFileName === "string" &&
    Array.isArray(value.chapters) &&
    value.chapters.length > 0 &&
    value.chapters.every((chapter, index) => isStoredLocalUploadChapter(chapter, index + 1)) &&
    Array.isArray(value.warnings) &&
    value.warnings.every(isTxtChapterWarning)
  );
}

function isStoredUploadFormat(value: unknown): value is "TXT" | "EPUB" {
  return value === "TXT" || value === "EPUB";
}

function isStoredLocalUploadChapter(value: unknown, expectedIndex: number) {
  if (!isRecord(value)) {
    return false;
  }

  return (
    value.index === expectedIndex &&
    typeof value.title === "string" &&
    value.title.trim().length > 0 &&
    typeof value.characterCount === "number" &&
    Number.isFinite(value.characterCount) &&
    value.characterCount >= 0 &&
    typeof value.content === "string" &&
    typeof value.contentPreview === "string" &&
    typeof value.suggestedSkip === "boolean" &&
    Array.isArray(value.warnings) &&
    value.warnings.every(isTxtChapterWarning)
  );
}

function isTxtChapterWarning(value: unknown) {
  return (
    value === "leading-content" ||
    value === "single-chapter" ||
    value === "likely-toc" ||
    value === "short-chapter"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
