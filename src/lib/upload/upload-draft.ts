import type { InferredBookMetadata } from "./book-metadata.ts";
import { inferBookMetadataFromFileName } from "./book-metadata.ts";
import type { UploadFileCandidate, UploadFileFormat, UploadFileValidationResult } from "./file-policy.ts";
import { validateUploadFileCandidate } from "./file-policy.ts";
import type { TxtChapterPreview, TxtChapterWarning } from "./txt-chapter-parser.ts";
import { parseTxtChapters } from "./txt-chapter-parser.ts";

export type UploadDraftInput = UploadFileCandidate & {
  textContent?: string;
};

export type UploadDraftParseStatus = "needs-text-content" | "needs-epub-parser" | "needs-file-parser" | "parsed";

export type UploadDraftResult =
  | {
      ok: false;
      reason: Extract<UploadFileValidationResult, { ok: false }>["reason"];
    }
  | {
      ok: true;
      format: UploadFileFormat;
      metadata: InferredBookMetadata;
      parseStatus: UploadDraftParseStatus;
      chapters: TxtChapterPreview[];
      warnings: TxtChapterWarning[];
    };

export type ChapterPreviewCandidate =
  | null
  | { ok: false; reason?: string }
  | {
      ok: true;
      parseStatus: UploadDraftParseStatus;
      chapters: TxtChapterPreview[];
    };

export function buildUploadDraft(input: UploadDraftInput): UploadDraftResult {
  const validation = validateUploadFileCandidate(input);

  if (!validation.ok) {
    return {
      ok: false,
      reason: validation.reason,
    };
  }

  const metadata = inferBookMetadataFromFileName(input.name);

  if (!metadata) {
    return {
      ok: false,
      reason: "unsupported-format",
    };
  }

  if (validation.format === "EPUB") {
    return {
      ok: true,
      format: validation.format,
      metadata,
      parseStatus: "needs-epub-parser",
      chapters: [],
      warnings: [],
    };
  }

  if (validation.format === "MOBI" || validation.format === "PDF") {
    return {
      ok: true,
      format: validation.format,
      metadata,
      parseStatus: "needs-file-parser",
      chapters: [],
      warnings: [],
    };
  }

  if (typeof input.textContent !== "string") {
    return {
      ok: true,
      format: validation.format,
      metadata,
      parseStatus: "needs-text-content",
      chapters: [],
      warnings: [],
    };
  }

  const parseResult = parseTxtChapters(input.textContent);

  return {
    ok: true,
    format: validation.format,
    metadata,
    parseStatus: "parsed",
    chapters: parseResult.chapters,
    warnings: parseResult.warnings,
  };
}

export function canContinueToChapterPreview(draft: ChapterPreviewCandidate) {
  return Boolean(draft?.ok === true && draft.parseStatus === "parsed" && draft.chapters.length > 0);
}
