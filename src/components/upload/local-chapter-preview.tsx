"use client";

import { AlertTriangle } from "lucide-react";
import { useMemo, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import {
  buildStoredLocalLibraryBook,
  localLibraryBooksStorageKey,
  parseStoredLocalLibraryBooksResult,
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
import {
  getLocalStorageFailureMessage,
  getLocalStorageSnapshotFailure,
  readScopedLocalStorage,
  removeScopedLocalStorage,
  toLocalStorageSnapshot,
  writeScopedLocalStorage,
} from "@/lib/storage/safe-local-storage";
import { ChapterEditorPanel } from "./chapter-editor-panel";

type LocalDraftState =
  | { status: "loading" }
  | { status: "missing" }
  | { status: "malformed" }
  | { status: "storage-error"; reason: "unavailable" | "scope-unavailable" }
  | { status: "ready"; draft: StoredLocalUploadDraft };

export function LocalChapterPreview() {
  const [clearError, setClearError] = useState("");
  const rawDraft = useSyncExternalStore(
    subscribeToLocalDraft,
    readLocalDraftSnapshot,
    getServerDraftSnapshot,
  );
  const state = useMemo(() => parseLocalDraftState(rawDraft), [rawDraft]);

  if (state.status === "loading") {
    return (
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-8 text-sm text-[var(--muted-foreground)]">
        正在读取章节...
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
              请先在导入页面选择一个可以拆章的 TXT 或 EPUB 文件，再进入章节预览。
            </p>
            <Button href={routes.upload} className="mt-5">
              返回导入
            </Button>
          </div>
        </div>
      </section>
    );
  }

  if (state.status === "malformed" || state.status === "storage-error") {
    const message =
      state.status === "malformed"
        ? "已保存的上传草稿结构损坏，系统没有继续读取，也不会自动覆盖原始数据。"
        : getLocalStorageFailureMessage(state.reason);

    return (
      <section className="rounded-xl border border-red-200 bg-[var(--surface)] p-8">
        <div className="flex gap-3">
          <AlertTriangle className="mt-0.5 text-red-700" size={19} aria-hidden="true" />
          <div>
            <h1 className="text-2xl font-semibold">无法读取上传草稿</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted-foreground)]">
              {message}
            </p>
            {clearError ? <p className="mt-3 text-sm text-red-700">{clearError}</p> : null}
            <div className="mt-5 flex flex-wrap gap-3">
              {state.status === "malformed" ? (
                <Button
                  type="button"
                  onClick={() => {
                    const result = removeScopedLocalStorage(localUploadDraftStorageKey);

                    if (!result.ok) {
                      setClearError(getLocalStorageFailureMessage(result.reason));
                      return;
                    }

                    window.location.assign(routes.upload);
                  }}
                >
                  清除损坏草稿
                </Button>
              ) : null}
              <Button href={routes.upload} variant="secondary">
                返回导入
              </Button>
            </div>
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
  const result = readScopedLocalStorage(localUploadDraftStorageKey);
  return toLocalStorageSnapshot(result);
}

function parseLocalDraftState(rawDraft: string | null | undefined): LocalDraftState {
  if (rawDraft === undefined) {
    return { status: "loading" };
  }

  const storageFailure = getLocalStorageSnapshotFailure(rawDraft);

  if (storageFailure) {
    return { status: "storage-error", reason: storageFailure };
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

  return { status: "malformed" };
}

function LocalChapterPreviewReady({ draft }: { draft: StoredLocalUploadDraft }) {
  const editableChapters = useMemo(() => buildEditableChapters(draft.chapters), [draft.chapters]);
  const [notice, setNotice] = useState("");
  const [saveError, setSaveError] = useState("");

  function handleSaveDraft(originalBookDraft: Extract<OriginalBookDraftResult, { ok: true }>) {
    const currentBooksResult = readScopedLocalStorage(localLibraryBooksStorageKey);

    if (!currentBooksResult.ok) {
      setNotice("");
      setSaveError(getLocalStorageFailureMessage(currentBooksResult.reason));
      return;
    }

    const currentBooksParseResult = parseStoredLocalLibraryBooksResult(currentBooksResult.value);

    if (!currentBooksParseResult.ok) {
      setNotice("");
      setSaveError("本地书架数据已损坏，为避免覆盖原始数据，本次保存已取消。");
      return;
    }

    const currentBooks = currentBooksParseResult.records;
    const storedBook = buildStoredLocalLibraryBook(originalBookDraft);
    const nextBooks = upsertStoredLocalLibraryBook(currentBooks, storedBook);
    const writeResult = writeScopedLocalStorage(
      localLibraryBooksStorageKey,
      JSON.stringify(nextBooks),
    );

    if (!writeResult.ok) {
      setNotice("");
      setSaveError(getLocalStorageFailureMessage(writeResult.reason));
      return;
    }

    window.dispatchEvent(new Event("stray-pages.local-library-books-changed"));
    const cleanupResult = removeScopedLocalStorage(localUploadDraftStorageKey);
    setSaveError(
      cleanupResult.ok
        ? ""
        : `书籍已保存，但上传临时数据未能清理：${getLocalStorageFailureMessage(cleanupResult.reason)}`,
    );
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
          {saveError ? (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">
              {saveError}
            </div>
          ) : null}
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
              这里显示的是刚刚从 TXT 或 EPUB 文件提取的文字内容，可在左侧调整标题和跳过不需要的章节。
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
