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
    value.format === "TXT" &&
    value.parseStatus === "parsed" &&
    isRecord(value.metadata) &&
    typeof value.metadata.title === "string" &&
    (typeof value.metadata.author === "string" || value.metadata.author === null) &&
    value.metadata.format === "TXT" &&
    typeof value.metadata.originalFileName === "string" &&
    Array.isArray(value.chapters) &&
    value.chapters.length > 0 &&
    value.chapters.every(isStoredLocalUploadChapter) &&
    Array.isArray(value.warnings) &&
    value.warnings.every(isTxtChapterWarning)
  );
}

function isStoredLocalUploadChapter(value: unknown) {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.index === "number" &&
    Number.isFinite(value.index) &&
    typeof value.title === "string" &&
    typeof value.characterCount === "number" &&
    Number.isFinite(value.characterCount) &&
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
