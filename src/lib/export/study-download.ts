export type StudyExportDownloadKind = "csv" | "markdown";

const studyExportMimeTypes: Record<StudyExportDownloadKind, string> = {
  csv: "text/csv",
  markdown: "text/markdown",
};

export function getStudyExportMimeType(kind: StudyExportDownloadKind) {
  return `${studyExportMimeTypes[kind]};charset=utf-8`;
}

export function buildStudyExportDownloadNotice(fileName: string) {
  return `已准备下载 ${fileName}`;
}
