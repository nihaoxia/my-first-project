import type { OriginalBookDraftResult } from "@/lib/upload/original-book-draft";

export const localLibraryBooksStorageKey = "stray-pages.local-library-books";

export type StoredLocalLibraryBook = {
  id: string;
  title: string;
  author: string | null;
  format: string;
  originalFileName: string;
  chapterCount: number;
  skippedChapterCount: number;
  totalCharacters: number;
  savedAt: string;
  chapters: Extract<OriginalBookDraftResult, { ok: true }>["chapters"];
  skippedChapters: Extract<OriginalBookDraftResult, { ok: true }>["skippedChapters"];
};

export function buildStoredLocalLibraryBook(
  draft: Extract<OriginalBookDraftResult, { ok: true }>,
  savedAt = new Date().toISOString(),
): StoredLocalLibraryBook {
  return {
    id: buildStoredBookId(draft.book.title, draft.book.originalFileName),
    title: draft.book.title,
    author: draft.book.author,
    format: draft.book.format,
    originalFileName: draft.book.originalFileName,
    chapterCount: draft.book.includedChapterCount,
    skippedChapterCount: draft.book.skippedChapterCount,
    totalCharacters: draft.book.totalCharacters,
    savedAt,
    chapters: draft.chapters,
    skippedChapters: draft.skippedChapters,
  };
}

export function upsertStoredLocalLibraryBook(
  books: StoredLocalLibraryBook[],
  incomingBook: StoredLocalLibraryBook,
) {
  const existingIndex = books.findIndex((book) => book.id === incomingBook.id);

  if (existingIndex === -1) {
    return [incomingBook, ...books];
  }

  return books.map((book, index) => (index === existingIndex ? incomingBook : book));
}

export function findStoredLocalLibraryBook(books: StoredLocalLibraryBook[], bookId: string) {
  return books.find((book) => book.id === bookId) ?? null;
}

export type RenameStoredLocalLibraryBookResult =
  | { ok: true; books: StoredLocalLibraryBook[] }
  | { ok: false; reason: "empty-title" | "not-found" };

export function renameStoredLocalLibraryBook(
  books: StoredLocalLibraryBook[],
  bookId: string,
  nextTitle: string,
): RenameStoredLocalLibraryBookResult {
  const title = nextTitle.trim();

  if (!title) {
    return { ok: false, reason: "empty-title" };
  }

  if (!books.some((book) => book.id === bookId)) {
    return { ok: false, reason: "not-found" };
  }

  return {
    ok: true,
    books: books.map((book) => (book.id === bookId ? { ...book, title } : book)),
  };
}

export function removeStoredLocalLibraryBook(
  books: StoredLocalLibraryBook[],
  bookId: string,
) {
  return books.filter((book) => book.id !== bookId);
}

export function isStoredLocalLibraryBook(value: unknown): value is StoredLocalLibraryBook {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    value.id.startsWith("local-book-") &&
    typeof value.title === "string" &&
    typeof value.format === "string" &&
    typeof value.originalFileName === "string" &&
    typeof value.chapterCount === "number" &&
    typeof value.skippedChapterCount === "number" &&
    typeof value.totalCharacters === "number" &&
    typeof value.savedAt === "string" &&
    Array.isArray(value.chapters) &&
    Array.isArray(value.skippedChapters)
  );
}

export function parseStoredLocalLibraryBooks(rawValue: string | null): StoredLocalLibraryBook[] {
  if (!rawValue) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawValue) as unknown;

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(isStoredLocalLibraryBook);
  } catch {
    return [];
  }
}

function buildStoredBookId(_title: string, originalFileName: string) {
  return `local-book-${slugify(originalFileName)}-${stableTextId(originalFileName)}`;
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function stableTextId(value: string) {
  const text = value.trim();
  let hash = 0;

  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
  }

  return hash.toString(36);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
