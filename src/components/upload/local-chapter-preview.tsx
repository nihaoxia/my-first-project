"use client";

import { AlertTriangle } from "lucide-react";
import { useMemo, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import {
  buildStoredLocalLibraryBook,
  localLibraryBooksStorageKey,
  parseStoredLocalLibraryBooks,
  upsertStoredLocalLibraryBook,
} from "@/lib/library/local-library-storage";
import { buildEditableChapters } from "@/lib/upload/chapter-editing";
import {
  isStoredLocalUploadDraft,
  localUploadDraftStorageKey,
  type StoredLocalUploadDraft,
} from "@/lib/upload/local-upload-storage";
import type { OriginalBookDraftResult } from "@/lib/upload/original-book-draft";
import { routes } from "@/lib/routes";
import { ChapterEditorPanel } from "./chapter-editor-panel";

type LocalDraftState =
  | { status: "loading" }
  | { status: "missing" }
  | { status: "ready"; draft: StoredLocalUploadDraft };

export function LocalChapterPreview() {
  const rawDraft = useSyncExternalStore(
    subscribeToLocalDraft,
    readLocalDraftSnapshot,
    getServerDraftSnapshot,
  );
  const state = useMemo(() => parseLocalDraftState(rawDraft), [rawDraft]);

  if (state.status === "loading") {
    return (
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-8 text-sm text-[var(--muted-foreground)]">
        正在读取章节草稿...
      </div>
    );
  }

  if (state.status === "missing") {
    return (
      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-8">
        <div className="flex gap-3">
          <AlertTriangle className="mt-0.5 text-amber-700" size={19} aria-hidden="true" />
          <div>
            <h1 className="text-2xl font-semibold">没有找到可预览的章节</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted-foreground)]">
              请先在导入页面选择一个可以拆章的 TXT 文件，再进入章节预览。
            </p>
            <Button href={routes.upload} className="mt-5">
              返回导入
            </Button>
          </div>
        </div>
      </section>
    );
  }

  return <LocalChapterPreviewReady draft={state.draft} />;
}

function subscribeToLocalDraft(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);

  return () => window.removeEventListener("storage", onStoreChange);
}

function getServerDraftSnapshot() {
  return undefined;
}

function readLocalDraftSnapshot() {
  return window.localStorage.getItem(localUploadDraftStorageKey);
}

function parseLocalDraftState(rawDraft: string | null | undefined): LocalDraftState {
  if (rawDraft === undefined) {
    return { status: "loading" };
  }

  if (!rawDraft) {
    return { status: "missing" };
  }

  try {
    const parsedDraft = JSON.parse(rawDraft) as unknown;

    if (isStoredLocalUploadDraft(parsedDraft)) {
      return { status: "ready", draft: parsedDraft };
    }
  } catch {
    // Ignore malformed local storage and show the normal empty state below.
  }

  return { status: "missing" };
}

function LocalChapterPreviewReady({ draft }: { draft: StoredLocalUploadDraft }) {
  const editableChapters = useMemo(() => buildEditableChapters(draft.chapters), [draft.chapters]);
  const [notice, setNotice] = useState("");

  function handleSaveDraft(originalBookDraft: Extract<OriginalBookDraftResult, { ok: true }>) {
    const currentBooks = parseStoredLocalLibraryBooks(
      window.localStorage.getItem(localLibraryBooksStorageKey),
    );
    const storedBook = buildStoredLocalLibraryBook(originalBookDraft);
    const nextBooks = upsertStoredLocalLibraryBook(currentBooks, storedBook);

    window.localStorage.setItem(localLibraryBooksStorageKey, JSON.stringify(nextBooks));
    window.dispatchEvent(new Event("stray-pages.local-library-books-changed"));
    setNotice("已保存到书架，可以回到书架继续管理。");
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div>
          <p className="text-sm text-[var(--muted-foreground)]">章节预览</p>
          <h1 className="mt-1 text-3xl font-semibold">《{draft.metadata.title}》</h1>
          <p className="mt-2 text-[var(--muted-foreground)]">
            已识别 {draft.chapters.length} 章。确认章节结构后，可以继续创建译本。
          </p>
        </div>
        <Button href={routes.upload} variant="secondary">
          重新导入
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <aside>
          <ChapterEditorPanel
            initialChapters={editableChapters}
            uploadDraft={draft}
            onSaveDraft={handleSaveDraft}
          />
          {notice ? (
            <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
              <p>{notice}</p>
              <Button href={routes.library} className="mt-3" variant="secondary">
                回到书架
              </Button>
            </div>
          ) : null}
        </aside>
        <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)]">
          <div className="border-b border-[var(--border)] p-5">
            <h2 className="font-semibold">章节列表</h2>
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">
              这里显示的是刚刚导入的 TXT 内容，可在左侧调整标题和跳过不需要的章节。
            </p>
          </div>
          <div className="divide-y divide-[var(--border)]">
            {editableChapters.map((chapter) => (
              <div key={chapter.index} className="grid gap-4 p-5 lg:grid-cols-[1fr_120px]">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-medium">{chapter.title}</h3>
                    {!chapter.included ? (
                      <span className="rounded-full bg-[var(--surface-2)] px-2 py-1 text-xs text-[var(--muted-foreground)]">
                        已跳过
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm leading-6 text-[var(--muted-foreground)]">
                    {chapter.contentPreview}
                  </p>
                </div>
                <div className="text-sm">
                  <p className="text-[var(--muted-foreground)]">字符</p>
                  <p className="mt-1 font-medium">{chapter.characterCount}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
