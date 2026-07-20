"use client";

import { Download, Loader2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { buildTranslatedBookEpubExport } from "@/lib/export/epub-export";
import { triggerBrowserDownload, type TextDownloadLink, type TextDownloadRuntime } from "@/lib/export/browser-download";
import type { TranslatedBookExportInput } from "@/lib/export/translation-export";

export function EpubDownloadButton({ input }: { input: TranslatedBookExportInput }) {
  const [building, setBuilding] = useState(false);
  const [notice, setNotice] = useState<{ message: string; error: boolean } | null>(null);

  async function handleDownload() {
    if (building) return;
    setBuilding(true); setNotice(null);
    try {
      const exported = await buildTranslatedBookEpubExport(input);
      const result = triggerBrowserDownload(
        { fileName: exported.fileName, data: exported.bytes, mimeType: exported.mimeType },
        createRuntime(),
      );
      setNotice({ message: result.ok ? `已准备下载 ${exported.fileName}` : "无法准备 EPUB 下载，请重试。", error: !result.ok });
    } catch {
      setNotice({ message: "无法生成 EPUB，请检查译本内容后重试。", error: true });
    } finally { setBuilding(false); }
  }

  return <div className="space-y-2">
    <Button type="button" variant="secondary" onClick={handleDownload} disabled={building}>
      {building ? <Loader2 aria-hidden="true" className="animate-spin" size={17}/> : <Download aria-hidden="true" size={17}/>} 
      {building ? "正在生成 EPUB" : "下载完整译本 EPUB"}
    </Button>
    {notice ? <p className={notice.error ? "max-w-72 break-all text-sm text-red-700" : "max-w-72 break-all text-sm text-[var(--muted-foreground)]"} role={notice.error ? "alert" : "status"}>{notice.message}</p> : null}
  </div>;
}

function createRuntime(): TextDownloadRuntime {
  return {
    createBlob(content, mimeType) { return new Blob([content as BlobPart], { type: mimeType }); },
    createObjectUrl(blob) { return URL.createObjectURL(blob as Blob); },
    revokeObjectUrl(url) { URL.revokeObjectURL(url); },
    createLink() { return document.createElement("a"); },
    appendLink(link) { document.body.append(link as HTMLAnchorElement & TextDownloadLink); },
  };
}
