export type UploadFileFormat = "TXT" | "EPUB";

export type UploadFileCandidate = {
  name: string;
  size: number;
};

export type UploadFileValidationResult =
  | {
      ok: true;
      format: UploadFileFormat;
    }
  | {
      ok: false;
      reason: "empty-name" | "unsupported-format" | "empty-file" | "file-too-large";
    };

export const uploadFilePolicy = {
  supportedFormats: [
    { label: "TXT", extension: ".txt" },
    { label: "EPUB", extension: ".epub" },
  ] as const,
  maxSizeBytes: 20 * 1024 * 1024,
};

export function detectUploadFileFormat(fileName: string): UploadFileFormat | null {
  const normalized = fileName.trim().toLowerCase();

  if (normalized.endsWith(".txt")) {
    return "TXT";
  }

  if (normalized.endsWith(".epub")) {
    return "EPUB";
  }

  return null;
}

export function validateUploadFileCandidate(file: UploadFileCandidate): UploadFileValidationResult {
  if (!file.name.trim()) {
    return { ok: false, reason: "empty-name" };
  }

  const format = detectUploadFileFormat(file.name);

  if (!format) {
    return { ok: false, reason: "unsupported-format" };
  }

  if (file.size <= 0) {
    return { ok: false, reason: "empty-file" };
  }

  if (file.size > uploadFilePolicy.maxSizeBytes) {
    return { ok: false, reason: "file-too-large" };
  }

  return { ok: true, format };
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const kilobytes = bytes / 1024;

  if (kilobytes < 1024) {
    return `${formatNumber(kilobytes)} KB`;
  }

  return `${formatNumber(kilobytes / 1024)} MB`;
}

function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
