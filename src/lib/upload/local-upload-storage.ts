import type { UploadDraftResult } from "./upload-draft.ts";

export const localUploadBookId = "local-upload";
export const localUploadDraftStorageKey = "stray-pages.local-upload-draft";

export type StoredLocalUploadDraft = Extract<UploadDraftResult, { ok: true }> & {
  parseStatus: "parsed";
};

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
    Array.isArray(value.chapters) &&
    value.chapters.length > 0 &&
    Array.isArray(value.warnings)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
