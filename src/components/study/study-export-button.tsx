import { TextDownloadButton } from "@/components/export/text-download-button";
import type { TextDownloadKind } from "@/lib/export/browser-download";

export function StudyExportButton({
  content,
  fileName,
  kind,
  label,
}: {
  content: string;
  fileName: string;
  kind: Extract<TextDownloadKind, "csv" | "markdown">;
  label: string;
}) {
  return <TextDownloadButton content={content} fileName={fileName} kind={kind} label={label} />;
}
