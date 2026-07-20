import { detectUploadFileFormat } from "./file-policy.ts";
import { EpubParseError, type EpubParseErrorCode } from "./epub-archive.ts";
import { parseEpubBook } from "./epub-parser.ts";
import { buildUploadDraft, type UploadDraftResult } from "./upload-draft.ts";

export type LocalUploadFile = {
  name: string;
  size: number;
  text: () => Promise<string>;
  arrayBuffer?: () => Promise<ArrayBuffer>;
};

export type LocalUploadDraftResult =
  | UploadDraftResult
  | {
      ok: false;
      reason:
        | "file-read-failed"
        | "invalid-epub"
        | "epub-drm-unsupported"
        | "epub-fixed-layout-unsupported"
        | "epub-multiple-renditions-unsupported"
        | "epub-unsafe-archive"
        | "epub-expanded-too-large"
        | "epub-no-readable-text";
    };

export async function buildLocalUploadDraftFromFile(file: LocalUploadFile): Promise<LocalUploadDraftResult> {
  const initialDraft = buildUploadDraft({
    name: file.name,
    size: file.size,
  });

  if (!initialDraft.ok) {
    return initialDraft;
  }

  const format = detectUploadFileFormat(file.name);

  if (format === "EPUB") {
    if (!file.arrayBuffer) return { ok: false, reason: "file-read-failed" };
    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(await file.arrayBuffer());
    } catch {
      return { ok: false, reason: "file-read-failed" };
    }
    try {
      const parsed = await parseEpubBook(bytes, initialDraft.metadata);
      return {
        ok: true,
        format: "EPUB",
        metadata: parsed.metadata,
        parseStatus: "parsed",
        chapters: parsed.chapters,
        warnings: parsed.warnings,
      };
    } catch (error) {
      return {
        ok: false,
        reason: error instanceof EpubParseError ? mapEpubError(error.code) : "invalid-epub",
      };
    }
  }

  if (format !== "TXT") {
    return initialDraft;
  }

  try {
    const textContent = file.arrayBuffer
      ? decodeLocalTxtBytes(await file.arrayBuffer())
      : await file.text();

    return buildUploadDraft({
      name: file.name,
      size: file.size,
      textContent,
    });
  } catch {
    return {
      ok: false,
      reason: "file-read-failed",
    };
  }
}

function mapEpubError(code: EpubParseErrorCode): Extract<LocalUploadDraftResult, { ok: false }>["reason"] {
  const mapping: Record<EpubParseErrorCode, Extract<LocalUploadDraftResult, { ok: false }>["reason"]> = {
    EPUB_INVALID_ARCHIVE: "invalid-epub",
    EPUB_INVALID_XML: "invalid-epub",
    EPUB_DRM_UNSUPPORTED: "epub-drm-unsupported",
    EPUB_FIXED_LAYOUT_UNSUPPORTED: "epub-fixed-layout-unsupported",
    EPUB_MULTIPLE_RENDITIONS_UNSUPPORTED: "epub-multiple-renditions-unsupported",
    EPUB_UNSAFE_ARCHIVE: "epub-unsafe-archive",
    EPUB_EXPANDED_TOO_LARGE: "epub-expanded-too-large",
    EPUB_NO_READABLE_TEXT: "epub-no-readable-text",
  };
  return mapping[code];
}

export function decodeLocalTxtBytes(bytes: ArrayBuffer) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("gb18030", { fatal: true }).decode(bytes);
  }
}
