"use client";

import {
  BookOpen,
  ChevronRight,
  MoreVertical,
  Plus,
} from "lucide-react";
import { useMemo, useState, useSyncExternalStore } from "react";
import {
  removeLibraryBookTile,
  renameLibraryBookTile,
} from "@/lib/library/library-book-actions";
import {
  createShelfCategory,
  type ShelfCategory,
} from "@/lib/library/library-categories";
import {
  localLibraryBooksStorageKey,
  parseStoredLocalLibraryBooks,
  removeStoredLocalLibraryBook,
  renameStoredLocalLibraryBook,
} from "@/lib/library/local-library-storage";
import {
  buildLocalLibraryBookTile,
  isLocalLibraryBookId,
} from "@/lib/library/local-library-view";

export type LibraryBookTile = {
  id: string;
  title: string;
  detail: string;
  href: string;
  tone: string;
  coverTitle: string;
  coverSubTitle: string;
  kind: string;
};

const categoryErrorLabels = {
  "empty-title": "请输入分类名称",
  "duplicate-title": "已经有这个分类",
} as const;

const bookErrorLabels = {
  "empty-title": "请输入书名",
  "duplicate-title": "已经有这本书",
  "not-found": "没有找到这本书",
} as const;

const localLibraryBooksChangedEvent = "stray-pages.local-library-books-changed";

function subscribeToLocalLibraryBooks(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(localLibraryBooksChangedEvent, onStoreChange);

  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(localLibraryBooksChangedEvent, onStoreChange);
  };
}

function getServerLocalLibraryBooksSnapshot() {
  return null;
}

function readLocalLibraryBooksSnapshot() {
  return window.localStorage.getItem(localLibraryBooksStorageKey);
}

function writeStoredLocalLibraryBooks(
  books: ReturnType<typeof parseStoredLocalLibraryBooks>,
) {
  window.localStorage.setItem(localLibraryBooksStorageKey, JSON.stringify(books));
  window.dispatchEvent(new Event(localLibraryBooksChangedEvent));
}

export function LibraryShelf({
  initialCollections,
  books,
}: {
  initialCollections: ShelfCategory[];
  books: LibraryBookTile[];
}) {
  const localLibrarySnapshot = useSyncExternalStore(
    subscribeToLocalLibraryBooks,
    readLocalLibraryBooksSnapshot,
    getServerLocalLibraryBooksSnapshot,
  );
  const storedLocalBooks = useMemo(
    () => parseStoredLocalLibraryBooks(localLibrarySnapshot),
    [localLibrarySnapshot],
  );
  const storedBookTiles = useMemo(
    () => storedLocalBooks.map(buildLocalLibraryBookTile),
    [storedLocalBooks],
  );
  const [collections, setCollections] = useState(initialCollections);
  const [localBooks, setLocalBooks] = useState(books);
  const visibleBooks = [...storedBookTiles, ...localBooks];
  const [isAdding, setIsAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [error, setError] = useState("");
  const [openBookMenuId, setOpenBookMenuId] = useState("");
  const [renamingBookId, setRenamingBookId] = useState("");
  const [renameTitle, setRenameTitle] = useState("");
  const [bookError, setBookError] = useState("");

  function handleCreateCategory() {
    const result = createShelfCategory(collections, newTitle);

    if (!result.ok) {
      setError(categoryErrorLabels[result.reason]);
      return;
    }

    setCollections(result.categories);
    setNewTitle("");
    setError("");
    setIsAdding(false);
  }

  function handleCancel() {
    setNewTitle("");
    setError("");
    setIsAdding(false);
  }

  function startRenamingBook(book: LibraryBookTile) {
    setRenamingBookId(book.id);
    setRenameTitle(book.title);
    setOpenBookMenuId("");
    setBookError("");
  }

  function submitBookRename() {
    if (isLocalLibraryBookId(renamingBookId)) {
      const result = renameStoredLocalLibraryBook(storedLocalBooks, renamingBookId, renameTitle);

      if (!result.ok) {
        setBookError(bookErrorLabels[result.reason]);
        return;
      }

      writeStoredLocalLibraryBooks(result.books);
      setRenamingBookId("");
      setRenameTitle("");
      setBookError("");
      return;
    }

    const result = renameLibraryBookTile(localBooks, renamingBookId, renameTitle);

    if (!result.ok) {
      setBookError(bookErrorLabels[result.reason]);
      return;
    }

    setLocalBooks(result.books);
    setRenamingBookId("");
    setRenameTitle("");
    setBookError("");
  }

  function cancelBookRename() {
    setRenamingBookId("");
    setRenameTitle("");
    setBookError("");
  }

  function removeBook(bookId: string) {
    if (isLocalLibraryBookId(bookId)) {
      writeStoredLocalLibraryBooks(removeStoredLocalLibraryBook(storedLocalBooks, bookId));
      setOpenBookMenuId("");
      setRenamingBookId("");
      setBookError("");
      return;
    }

    setLocalBooks((currentBooks) => removeLibraryBookTile(currentBooks, bookId));
    setOpenBookMenuId("");
    setRenamingBookId("");
    setBookError("");
  }

  return (
    <div className="px-5 py-7 md:px-7">
      <div className="mb-7 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">我的书架</h1>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            原文、译文和学习中的书都放在这里。
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-5 gap-y-9 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
        {collections.map((collection) => (
          <CollectionTile key={collection.id} collection={collection} />
        ))}

        {visibleBooks.map((book) => (
          <BookTile
            key={book.id}
            book={book}
            bookError={renamingBookId === book.id ? bookError : ""}
            isMenuOpen={openBookMenuId === book.id}
            isRenaming={renamingBookId === book.id}
            renameTitle={renameTitle}
            onCancelRename={cancelBookRename}
            onChangeRename={(value) => {
              setRenameTitle(value);
              setBookError("");
            }}
            onRemove={() => removeBook(book.id)}
            onStartRename={() => startRenamingBook(book)}
            onSubmitRename={submitBookRename}
            onToggleMenu={() => setOpenBookMenuId(openBookMenuId === book.id ? "" : book.id)}
          />
        ))}

        {isAdding ? (
          <AddCategoryForm
            error={error}
            newTitle={newTitle}
            onCancel={handleCancel}
            onChange={(value) => {
              setNewTitle(value);
              setError("");
            }}
            onCreate={handleCreateCategory}
          />
        ) : (
          <button
            className="group block rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface-2)] p-4 text-left transition hover:border-[var(--primary)] hover:bg-white"
            type="button"
            onClick={() => setIsAdding(true)}
          >
            <div className="grid aspect-[0.72] place-items-center rounded-lg bg-white">
              <span className="grid size-12 place-items-center rounded-full bg-[var(--primary)] text-[var(--primary-foreground)] transition group-hover:scale-105">
                <Plus aria-hidden="true" size={24} />
              </span>
            </div>
            <div className="mt-4">
              <p className="text-lg font-semibold">新增分类</p>
              <p className="mt-1 text-sm text-[var(--muted-foreground)]">整理你的书籍</p>
            </div>
          </button>
        )}
      </div>
    </div>
  );
}

function AddCategoryForm({
  error,
  newTitle,
  onCancel,
  onChange,
  onCreate,
}: {
  error: string;
  newTitle: string;
  onCancel: () => void;
  onChange: (value: string) => void;
  onCreate: () => void;
}) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-4">
      <div className="flex aspect-[0.72] flex-col justify-between rounded-lg bg-white p-4">
        <div>
          <label className="text-sm font-medium text-[var(--foreground)]" htmlFor="new-shelf-category">
            分类名称
          </label>
          <input
            id="new-shelf-category"
            className="mt-3 w-full rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none transition focus:border-[var(--primary)]"
            value={newTitle}
            autoFocus
            maxLength={16}
            placeholder="例如：短篇小说"
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                onCreate();
              }

              if (event.key === "Escape") {
                onCancel();
              }
            }}
          />
          {error ? <p className="mt-2 text-xs text-red-700">{error}</p> : null}
        </div>
        <div className="grid gap-2">
          <button
            className="rounded-md bg-[var(--primary)] px-3 py-2 text-sm font-semibold text-[var(--primary-foreground)]"
            type="button"
            onClick={onCreate}
          >
            创建
          </button>
          <button
            className="rounded-md border border-[var(--border)] px-3 py-2 text-sm font-medium text-[var(--muted-foreground)]"
            type="button"
            onClick={onCancel}
          >
            取消
          </button>
        </div>
      </div>
      <div className="mt-4">
        <p className="text-lg font-semibold">新增分类</p>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">创建后会显示在书架前排</p>
      </div>
    </div>
  );
}

function CollectionTile({ collection }: { collection: ShelfCategory }) {
  return (
    <article className="group">
      <div className="relative rounded-lg bg-[var(--surface-2)] p-3 shadow-[0_4px_8px_rgba(15,23,42,0.08)] transition group-hover:-translate-y-0.5">
        <div className="grid aspect-[0.72] grid-cols-2 gap-2">
          {collection.miniCovers.map((label, index) => (
            <div
              key={`${collection.id}-${label}-${index}`}
              className={`flex items-end rounded-md bg-gradient-to-br ${collection.palette} p-2 text-xs font-semibold text-white shadow-sm`}
            >
              <span>{index === 0 ? label : label.slice(0, 2)}</span>
            </div>
          ))}
        </div>
      </div>
      <TileMeta title={collection.title} detail={collection.detail} />
    </article>
  );
}

function BookTile({
  book,
  bookError,
  isMenuOpen,
  isRenaming,
  renameTitle,
  onCancelRename,
  onChangeRename,
  onRemove,
  onStartRename,
  onSubmitRename,
  onToggleMenu,
}: {
  book: LibraryBookTile;
  bookError: string;
  isMenuOpen: boolean;
  isRenaming: boolean;
  renameTitle: string;
  onCancelRename: () => void;
  onChangeRename: (value: string) => void;
  onRemove: () => void;
  onStartRename: () => void;
  onSubmitRename: () => void;
  onToggleMenu: () => void;
}) {
  return (
    <article className="group">
      <a className="block" href={book.href}>
        <div className="relative rounded-lg bg-[var(--surface-2)] p-3 shadow-[0_4px_8px_rgba(15,23,42,0.08)] transition group-hover:-translate-y-0.5">
          <div
            className={`relative flex aspect-[0.72] flex-col justify-between overflow-hidden rounded-lg bg-gradient-to-br ${book.tone} p-4`}
          >
            <div className="absolute inset-x-0 top-0 h-16 bg-white/30" />
            <div className="relative">
              <span className="rounded-sm bg-black/20 px-2 py-1 text-xs font-medium text-white">
                {book.kind}
              </span>
            </div>
            <div className="relative">
              <p className="max-w-[9rem] text-xl font-semibold leading-tight text-white drop-shadow-sm">
                {book.coverTitle}
              </p>
              <p className="mt-2 line-clamp-2 text-xs font-medium text-white/85">{book.coverSubTitle}</p>
            </div>
            <div className="relative flex items-center gap-1 text-xs font-semibold text-white/90">
              <BookOpen aria-hidden="true" size={14} />
              <span>继续阅读</span>
              <ChevronRight aria-hidden="true" size={14} />
            </div>
          </div>
        </div>
      </a>
      {isRenaming ? (
        <div className="mt-4 rounded-md border border-[var(--border)] bg-white p-3">
          <input
            className="h-10 w-full rounded-md border border-[var(--border)] px-3 text-sm outline-none transition focus:border-[var(--primary)]"
            value={renameTitle}
            autoFocus
            maxLength={28}
            onChange={(event) => onChangeRename(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                onSubmitRename();
              }

              if (event.key === "Escape") {
                onCancelRename();
              }
            }}
          />
          {bookError ? <p className="mt-2 text-xs text-red-700">{bookError}</p> : null}
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              className="rounded-md bg-[var(--primary)] px-3 py-2 text-sm font-semibold text-[var(--primary-foreground)]"
              type="button"
              onClick={onSubmitRename}
            >
              保存
            </button>
            <button
              className="rounded-md border border-[var(--border)] px-3 py-2 text-sm font-medium text-[var(--muted-foreground)]"
              type="button"
              onClick={onCancelRename}
            >
              取消
            </button>
          </div>
        </div>
      ) : (
        <TileMeta
          title={book.title}
          detail={book.detail}
          isMenuOpen={isMenuOpen}
          onRemove={onRemove}
          onStartRename={onStartRename}
          onToggleMenu={onToggleMenu}
        />
      )}
    </article>
  );
}

function TileMeta({
  title,
  detail,
  isMenuOpen = false,
  onRemove,
  onStartRename,
  onToggleMenu,
}: {
  title: string;
  detail: string;
  isMenuOpen?: boolean;
  onRemove?: () => void;
  onStartRename?: () => void;
  onToggleMenu?: () => void;
}) {
  return (
    <div className="relative mt-4 grid grid-cols-[1fr_auto] items-start gap-2">
      <div className="min-w-0">
        <h2 className="line-clamp-2 text-lg font-semibold leading-snug">{title}</h2>
        <p className="mt-2 text-sm text-[var(--muted-foreground)]">{detail}</p>
      </div>
      {onToggleMenu ? (
        <button
          aria-label={`${title} 更多操作`}
          className="mt-1 grid size-8 place-items-center rounded-md text-[var(--muted-foreground)] transition hover:bg-[var(--surface-2)] hover:text-[var(--foreground)]"
          onClick={onToggleMenu}
          type="button"
        >
          <MoreVertical aria-hidden="true" size={18} />
        </button>
      ) : null}
      {isMenuOpen && onStartRename && onRemove ? (
        <div className="absolute right-0 top-10 z-10 w-32 rounded-md border border-[var(--border)] bg-white p-1 text-sm shadow-sm">
          <button
            className="block w-full rounded px-3 py-2 text-left hover:bg-[var(--surface-2)]"
            type="button"
            onClick={onStartRename}
          >
            重命名
          </button>
          <button
            className="block w-full rounded px-3 py-2 text-left text-red-700 hover:bg-red-50"
            type="button"
            onClick={onRemove}
          >
            移出书架
          </button>
        </div>
      ) : null}
    </div>
  );
}
