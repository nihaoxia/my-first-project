"use client";

import { Download } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  buildStudyExportDownloadNotice,
  getStudyExportMimeType,
  type StudyExportDownloadKind,
} from "@/lib/export/study-download";

export function StudyExportButton({
  content,
  fileName,
  kind,
  label,
}: {
  content: string;
  fileName: string;
  kind: StudyExportDownloadKind;
  label: string;
}) {
  const [notice, setNotice] = useState("");

  function handleDownload() {
    const blob = new Blob([content], { type: getStudyExportMimeType(kind) });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = fileName;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setNotice(buildStudyExportDownloadNotice(fileName));
  }

  return (
    <div className="space-y-2">
      <Button type="button" variant="secondary" onClick={handleDownload}>
        <Download aria-hidden="true" size={17} />
        {label}
      </Button>
      {notice ? <p className="max-w-72 break-all text-sm text-[var(--muted-foreground)]">{notice}</p> : null}
    </div>
  );
}
