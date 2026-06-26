"use client";

import { FileText, Loader2, UploadCloud } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { routeBuilders } from "@/lib/routes";
import { formatBytes, uploadFilePolicy } from "@/lib/upload/file-policy";
import { buildLocalUploadDraftFromFile, type LocalUploadDraftResult } from "@/lib/upload/local-upload-draft";
import {
  isStoredLocalUploadDraft,
  localUploadBookId,
  localUploadDraftStorageKey,
} from "@/lib/upload/local-upload-storage";
import { canContinueToChapterPreview } from "@/lib/upload/upload-draft";

type LocalUploadDraftFailureReason = Extract<LocalUploadDraftResult, { ok: false }>["reason"];

const uploadErrorLabels: Record<LocalUploadDraftFailureReason, string> = {
  "empty-name": "文件名为空，请重新选择文件。",
  "unsupported-format": "暂不支持这个格式，请选择 TXT、EPUB、MOBI 或 PDF 文件。",
  "empty-file": "文件内容为空，请检查后重新选择。",
  "file-too-large": `文件超过 ${formatBytes(uploadFilePolicy.maxSizeBytes)}，请先拆分或压缩内容。`,
  "file-read-failed": "浏览器读取 TXT 内容失败，请重新选择文件。",
};

const parseStatusLabels = {
  "needs-text-content": "等待读取文本",
  "needs-epub-parser": "EPUB 待处理",
  "needs-file-parser": "文件待处理",
  parsed: "已完成拆章",
};

export function LocalUploadPanel() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<LocalUploadDraftResult | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [isReading, setIsReading] = useState(false);

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setFileName(file.name);
    setIsReading(true);

    try {
      const nextDraft = await buildLocalUploadDraftFromFile(file);

      setDraft(nextDraft);

      if (isStoredLocalUploadDraft(nextDraft)) {
        window.localStorage.setItem(localUploadDraftStorageKey, JSON.stringify(nextDraft));
      }
    } finally {
      setIsReading(false);
    }
  }

  return (
    <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-8">
      <input
        ref={inputRef}
        className="sr-only"
        type="file"
        accept=".txt,.epub,.mobi,.pdf,text/plain,application/epub+zip,application/pdf"
        onChange={handleFileChange}
      />

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex max-w-xl flex-col items-start">
          <div className="flex size-12 items-center justify-center rounded-lg bg-[var(--surface-2)] text-[var(--primary)]">
            <UploadCloud aria-hidden="true" size={24} />
          </div>
          <h2 className="mt-5 text-xl font-semibold">选择 TXT、EPUB、MOBI 或 PDF 文件</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">
            TXT 会读取文本并拆章。EPUB、MOBI 和 PDF 会先保存为待处理状态。
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Button type="button" variant="secondary" onClick={() => inputRef.current?.click()} disabled={isReading}>
              {isReading ? <Loader2 aria-hidden="true" className="animate-spin" size={17} /> : <FileText aria-hidden="true" size={17} />}
              {isReading ? "读取中" : "选择文件"}
            </Button>
            {canContinueToChapterPreview(draft) ? (
              <Button href={routeBuilders.bookChapters(localUploadBookId)}>查看章节预览</Button>
            ) : (
              <Button type="button" disabled>
                查看章节预览
              </Button>
            )}
          </div>
          {fileName ? <p className="mt-3 text-sm text-[var(--muted-foreground)]">当前文件：{fileName}</p> : null}
        </div>

        <UploadDraftPreview draft={draft} isReading={isReading} />
      </div>
    </div>
  );
}

function UploadDraftPreview({ draft, isReading }: { draft: LocalUploadDraftResult | null; isReading: boolean }) {
  if (isReading) {
    return (
      <div className="flex min-h-48 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-5 text-sm text-[var(--muted-foreground)]">
        正在读取文件内容
      </div>
    );
  }

  if (!draft) {
    return (
      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-5">
        <h3 className="font-semibold">解析结果</h3>
        <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">
          选择文件后，这里会显示书名、作者、格式、章节数量和解析状态。
        </p>
      </div>
    );
  }

  if (!draft.ok) {
    return (
      <div className="rounded-lg border border-[var(--danger)]/30 bg-red-50 p-5">
        <h3 className="font-semibold text-[var(--danger)]">无法解析</h3>
        <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">{uploadErrorLabels[draft.reason]}</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-semibold">{draft.metadata.title}</h3>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">{draft.metadata.author ?? "作者待补充"}</p>
        </div>
        <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-[var(--primary)]">{draft.format}</span>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-[var(--muted-foreground)]">状态</dt>
          <dd className="mt-1 font-medium">{parseStatusLabels[draft.parseStatus]}</dd>
        </div>
        <div>
          <dt className="text-[var(--muted-foreground)]">章节</dt>
          <dd className="mt-1 font-medium">{draft.chapters.length} 章</dd>
        </div>
      </dl>

      {draft.parseStatus === "needs-epub-parser" ? (
        <p className="mt-4 text-sm leading-6 text-[var(--muted-foreground)]">
          EPUB 文件已识别。当前还不能拆章，接入解析能力后再继续生成章节。
        </p>
      ) : null}

      {draft.parseStatus === "needs-file-parser" ? (
        <p className="mt-4 text-sm leading-6 text-[var(--muted-foreground)]">
          {draft.format} 文件已识别。当前还不能拆章，接入解析能力后再继续生成章节。
        </p>
      ) : null}

      {draft.chapters.length > 0 ? (
        <div className="mt-4 divide-y divide-[var(--border)] border-t border-[var(--border)]">
          {draft.chapters.slice(0, 4).map((chapter) => (
            <div key={chapter.index} className="py-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium">{chapter.title}</p>
                <span className="shrink-0 text-xs text-[var(--muted-foreground)]">{chapter.characterCount} 字符</span>
              </div>
              {chapter.contentPreview ? (
                <p className="mt-1 line-clamp-2 text-[var(--muted-foreground)]">{chapter.contentPreview}</p>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
