"use client";

import { RotateCcw, SkipForward } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  renameEditableChapter,
  restoreEditableChapter,
  skipEditableChapter,
  summarizeEditableChapters,
  type EditableChapter,
} from "@/lib/upload/chapter-editing";
import { buildOriginalBookDraft } from "@/lib/upload/original-book-draft";
import type { UploadDraftResult } from "@/lib/upload/upload-draft";

type SuccessfulUploadDraft = Extract<UploadDraftResult, { ok: true }>;

export function ChapterEditorPanel({
  initialChapters,
  uploadDraft,
}: {
  initialChapters: EditableChapter[];
  uploadDraft: SuccessfulUploadDraft;
}) {
  const [chapters, setChapters] = useState(initialChapters);
  const [error, setError] = useState<string | null>(null);
  const summary = useMemo(() => summarizeEditableChapters(chapters), [chapters]);
  const originalBookDraft = useMemo(() => buildOriginalBookDraft({ uploadDraft, chapters }), [chapters, uploadDraft]);

  function handleRename(chapterIndex: number, title: string) {
    const result = renameEditableChapter(chapters, chapterIndex, title);

    if (!result.ok) {
      setError(result.reason === "empty-title" ? "章节标题不能为空。" : "没有找到这个章节。");
      return;
    }

    setError(null);
    setChapters(result.chapters);
  }

  function handleSkip(chapterIndex: number) {
    const result = skipEditableChapter(chapters, chapterIndex);

    if (result.ok) {
      setError(null);
      setChapters(result.chapters);
    }
  }

  function handleRestore(chapterIndex: number) {
    const result = restoreEditableChapter(chapters, chapterIndex);

    if (result.ok) {
      setError(null);
      setChapters(result.chapters);
    }
  }

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
        <h2 className="font-semibold">章节调整</h2>
        <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-lg bg-[var(--surface-2)] p-3">
            <dt className="text-[var(--muted-foreground)]">保留章节</dt>
            <dd className="mt-1 font-semibold">{summary.includedChapters}</dd>
          </div>
          <div className="rounded-lg bg-[var(--surface-2)] p-3">
            <dt className="text-[var(--muted-foreground)]">跳过章节</dt>
            <dd className="mt-1 font-semibold">{summary.skippedChapters}</dd>
          </div>
        </dl>

        {error ? (
          <p className="mt-3 rounded-lg border border-[var(--danger)] bg-red-50 px-3 py-2 text-sm text-[var(--danger)]">
            {error}
          </p>
        ) : null}

        <div className="mt-4 divide-y divide-[var(--border)] border-t border-[var(--border)]">
          {chapters.map((chapter) => (
            <div key={chapter.index} className="py-4">
              <label className="block text-xs text-[var(--muted-foreground)]" htmlFor={`chapter-title-${chapter.index}`}>
                第 {chapter.index} 章标题
              </label>
              <input
                id={`chapter-title-${chapter.index}`}
                className="mt-1 w-full rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none transition focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary)]/15"
                defaultValue={chapter.title}
                onBlur={(event) => handleRename(chapter.index, event.currentTarget.value)}
              />
              <div className="mt-2 flex items-center justify-between gap-3">
                <span className="text-xs text-[var(--muted-foreground)]">
                  {chapter.included ? "将保存" : "已跳过"}
                  {chapter.title !== chapter.originalTitle ? ` · 原名：${chapter.originalTitle}` : ""}
                </span>
                {chapter.included ? (
                  <Button type="button" variant="ghost" className="h-8 px-2" onClick={() => handleSkip(chapter.index)}>
                    <SkipForward aria-hidden="true" size={15} />
                    跳过
                  </Button>
                ) : (
                  <Button type="button" variant="ghost" className="h-8 px-2" onClick={() => handleRestore(chapter.index)}>
                    <RotateCcw aria-hidden="true" size={15} />
                    恢复
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {originalBookDraft.ok ? (
        <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <h2 className="font-semibold">保存草稿准备</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-[var(--muted-foreground)]">待保存章节</dt>
              <dd className="font-medium">{originalBookDraft.book.includedChapterCount} 章</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-[var(--muted-foreground)]">跳过章节</dt>
              <dd className="font-medium">{originalBookDraft.book.skippedChapterCount} 章</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-[var(--muted-foreground)]">统计字符</dt>
              <dd className="font-medium">{originalBookDraft.book.totalCharacters}</dd>
            </div>
          </dl>
        </section>
      ) : (
        <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <h2 className="font-semibold">保存草稿准备</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">至少保留一个章节后才能保存到书架。</p>
        </section>
      )}
    </div>
  );
}
