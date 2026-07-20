"use client";

import { Download } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  buildTextDownloadNotice,
  triggerTextDownload,
  type TextDownloadInput,
  type TextDownloadLink,
  type TextDownloadRuntime,
} from "@/lib/export/browser-download";

export function TextDownloadButton({
  content,
  fileName,
  kind,
  label,
}: TextDownloadInput & { label: string }) {
  const [notice, setNotice] = useState<{ message: string; error: boolean } | null>(null);

  function handleDownload() {
    const result = triggerTextDownload(
      { content, fileName, kind },
      createBrowserDownloadRuntime(),
    );
    setNotice({ message: buildTextDownloadNotice(result, fileName), error: !result.ok });
  }

  return (
    <div className="space-y-2">
      <Button type="button" variant="secondary" onClick={handleDownload}>
        <Download aria-hidden="true" size={17} />
        {label}
      </Button>
      {notice ? (
        <p
          className={notice.error
            ? "max-w-72 break-all text-sm text-red-700"
            : "max-w-72 break-all text-sm text-[var(--muted-foreground)]"}
          role={notice.error ? "alert" : "status"}
        >
          {notice.message}
        </p>
      ) : null}
    </div>
  );
}

function createBrowserDownloadRuntime(): TextDownloadRuntime {
  return {
    createBlob(content, mimeType) {
      return new Blob([content], { type: mimeType });
    },
    createObjectUrl(blob) {
      return URL.createObjectURL(blob as Blob);
    },
    revokeObjectUrl(url) {
      URL.revokeObjectURL(url);
    },
    createLink() {
      return document.createElement("a");
    },
    appendLink(link) {
      document.body.append(link as HTMLAnchorElement & TextDownloadLink);
    },
  };
}
