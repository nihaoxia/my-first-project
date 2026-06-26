"use client";

import { AlertTriangle } from "lucide-react";
import { useMemo, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import {
  findStoredLocalLibraryBook,
  localLibraryBooksStorageKey,
  parseStoredLocalLibraryBooks,
} from "@/lib/library/local-library-storage";
import { routes } from "@/lib/routes";

const localLibraryBooksChangedEvent = "stray-pages.local-library-books-changed";

type LocalStoredBookState =
  | { status: "loading" }
  | { status: "missing" }
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

  if (state.status === "missing") {
    return (
      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-8">
        <div className="flex gap-3">
          <AlertTriangle className="mt-0.5 text-amber-700" size={19} aria-hidden="true" />
          <div>
            <h1 className="text-2xl font-semibold">没有找到这本书</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted-foreground)]">
              这本书可能已经从书架移出。你可以回到书架查看当前保存的书籍。
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
        <Button href={routes.library} variant="secondary">
          回到书架
        </Button>
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
  return window.localStorage.getItem(localLibraryBooksStorageKey);
}

function parseLocalStoredBookState(
  rawBooks: string | null | undefined,
  bookId: string,
): LocalStoredBookState {
  if (rawBooks === undefined) {
    return { status: "loading" };
  }

  const book = findStoredLocalLibraryBook(parseStoredLocalLibraryBooks(rawBooks), bookId);

  if (!book) {
    return { status: "missing" };
  }

  return { status: "ready", book };
}
