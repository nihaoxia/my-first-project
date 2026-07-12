"use client";

import { AlertTriangle, ArrowRight } from "lucide-react";
import { useMemo, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import {
  getLocalStorageFailureMessage,
  getLocalStorageSnapshotFailure,
  readScopedLocalStorage,
  toLocalStorageSnapshot,
} from "@/lib/storage/safe-local-storage";
import {
  findStoredLocalLibraryBook,
  localLibraryBooksStorageKey,
  parseStoredLocalLibraryBooksResult,
} from "@/lib/library/local-library-storage";
import { routes, routeBuilders } from "@/lib/routes";

const localLibraryBooksChangedEvent = "stray-pages.local-library-books-changed";

type LocalStoredBookState =
  | { status: "loading" }
  | { status: "missing" }
  | { status: "malformed" }
  | { status: "storage-error"; reason: "unavailable" | "scope-unavailable" }
  | {
      status: "ready";
      book: NonNullable<ReturnType<typeof findStoredLocalLibraryBook>>;
    };

export function LocalStoredBookChapters({ bookId }: { bookId: string }) {
  const rawBooks = useSyncExternalStore(
    subscribeToLocalLibraryBooks,
    readLocalLibraryBooksSnapshot,
    getServerLocalLibraryBooksSnapshot,
  );
  const state = useMemo(() => parseLocalStoredBookState(rawBooks, bookId), [bookId, rawBooks]);

  if (state.status === "loading") {
    return (
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-8 text-sm text-[var(--muted-foreground)]">
        正在读取书籍...
      </div>
    );
  }

  if (state.status === "missing" || state.status === "malformed" || state.status === "storage-error") {
    const description =
      state.status === "storage-error"
        ? getLocalStorageFailureMessage(state.reason)
        : state.status === "malformed"
          ? "本地书架数据已损坏，系统没有继续解析，也不会自动覆盖原始内容。"
          : "这本书可能已经从书架移出。你可以回到书架查看当前保存的书籍。";

    return (
      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-8">
        <div className="flex gap-3">
          <AlertTriangle className="mt-0.5 text-amber-700" size={19} aria-hidden="true" />
          <div>
            <h1 className="text-2xl font-semibold">
              {state.status === "missing" ? "没有找到这本书" : "无法读取本地书架"}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted-foreground)]">
              {description}
            </p>
            <Button href={routes.library} className="mt-5">
              回到书架
            </Button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div>
          <p className="text-sm text-[var(--muted-foreground)]">章节预览</p>
          <h1 className="mt-1 text-3xl font-semibold">《{state.book.title}》</h1>
          <p className="mt-2 text-[var(--muted-foreground)]">
            共 {state.book.chapterCount} 章，来自 {state.book.format} 导入。
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button href={routes.library} variant="secondary">
            回到书架
          </Button>
          <Button href={routeBuilders.bookTranslate(state.book.id)}>
            创建译本
            <ArrowRight aria-hidden="true" size={18} />
          </Button>
        </div>
      </div>

      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)]">
        <div className="border-b border-[var(--border)] p-5">
          <h2 className="font-semibold">章节列表</h2>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            这里展示已保存到书架的章节结构。
          </p>
        </div>
        <div className="divide-y divide-[var(--border)]">
          {state.book.chapters.map((chapter) => (
            <div key={`${state.book.id}-${chapter.sourceIndex}`} className="grid gap-4 p-5 lg:grid-cols-[1fr_120px]">
              <div>
                <h3 className="font-medium">{chapter.title}</h3>
                <p className="mt-2 line-clamp-2 text-sm leading-6 text-[var(--muted-foreground)]">
                  {chapter.content || chapter.contentPreview}
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
  );
}

function subscribeToLocalLibraryBooks(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(localLibraryBooksChangedEvent, onStoreChange);

  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(localLibraryBooksChangedEvent, onStoreChange);
  };
}

function getServerLocalLibraryBooksSnapshot() {
  return undefined;
}

function readLocalLibraryBooksSnapshot() {
  const result = readScopedLocalStorage(localLibraryBooksStorageKey);
  return toLocalStorageSnapshot(result);
}

function parseLocalStoredBookState(
  rawBooks: string | null | undefined,
  bookId: string,
): LocalStoredBookState {
  if (rawBooks === undefined) {
    return { status: "loading" };
  }

  const storageFailure = getLocalStorageSnapshotFailure(rawBooks);

  if (storageFailure) {
    return { status: "storage-error", reason: storageFailure };
  }

  const booksParseResult = parseStoredLocalLibraryBooksResult(rawBooks);

  if (!booksParseResult.ok) {
    return { status: "malformed" };
  }

  const book = findStoredLocalLibraryBook(booksParseResult.records, bookId);

  if (!book) {
    return { status: "missing" };
  }

  return { status: "ready", book };
}
