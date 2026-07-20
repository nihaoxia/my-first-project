export type TextDownloadKind = "text" | "csv" | "markdown";

export type TextDownloadInput = {
  fileName: string;
  content: string;
  kind: TextDownloadKind;
};

export type BrowserDownloadInput = {
  fileName: string;
  data: string | Uint8Array;
  mimeType: string;
};

export type TextDownloadResult =
  | { ok: true }
  | { ok: false; code: "INVALID_FILE_NAME" | "DOWNLOAD_FAILED" };

export type TextDownloadLink = {
  href: string;
  download: string;
  click(): void;
  remove(): void;
};

export type TextDownloadRuntime = {
  createBlob(content: string | Uint8Array, mimeType: string): unknown;
  createObjectUrl(blob: unknown): string;
  revokeObjectUrl(url: string): void;
  createLink(): TextDownloadLink;
  appendLink(link: TextDownloadLink): void;
};

const mimeTypes: Record<TextDownloadKind, string> = {
  text: "text/plain;charset=utf-8",
  csv: "text/csv;charset=utf-8",
  markdown: "text/markdown;charset=utf-8",
};

export function getTextDownloadMimeType(kind: TextDownloadKind) {
  return mimeTypes[kind];
}

export function triggerTextDownload(
  input: TextDownloadInput,
  runtime: TextDownloadRuntime,
): TextDownloadResult {
  return triggerBrowserDownload(
    { fileName: input.fileName, data: input.content, mimeType: getTextDownloadMimeType(input.kind) },
    runtime,
  );
}

export function triggerBrowserDownload(
  input: BrowserDownloadInput,
  runtime: TextDownloadRuntime,
): TextDownloadResult {
  if (!isSafeFileName(input.fileName)) {
    return { ok: false, code: "INVALID_FILE_NAME" };
  }

  let url = "";
  let link: TextDownloadLink | undefined;

  try {
    const blob = runtime.createBlob(input.data, input.mimeType);
    url = runtime.createObjectUrl(blob);
    link = runtime.createLink();
    link.href = url;
    link.download = input.fileName;
    runtime.appendLink(link);
    link.click();
    return { ok: true };
  } catch {
    return { ok: false, code: "DOWNLOAD_FAILED" };
  } finally {
    try {
      link?.remove();
    } catch {
      // A failed cleanup must not hide the stable download result.
    }

    if (url) {
      try {
        runtime.revokeObjectUrl(url);
      } catch {
        // A failed cleanup must not escape into the UI.
      }
    }
  }
}

export function buildTextDownloadNotice(result: TextDownloadResult, fileName: string) {
  if (result.ok) {
    return `已准备下载 ${fileName}`;
  }

  return result.code === "INVALID_FILE_NAME" ? "下载文件名无效。" : "无法准备下载，请重试。";
}

function isSafeFileName(value: string) {
  return (
    value.trim() === value &&
    value.length > 0 &&
    value.length <= 240 &&
    !/[\\/\u0000-\u001f\u007f]/u.test(value)
  );
}
