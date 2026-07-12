import { routeBuilders } from "../routes.ts";
import type { StoredLocalLibraryBook } from "./local-library-storage.ts";
import type { StoredLocalTranslation } from "./local-translation-storage.ts";

export type LocalLibraryBookTile = {
  id: string;
  title: string;
  detail: string;
  href: string;
  tone: string;
  coverTitle: string;
  coverSubTitle: string;
  kind: string;
  source: "upload" | "translation";
};

export function isLocalLibraryBookId(bookId: string) {
  return bookId.startsWith("local-book-");
}

export function isLocalTranslationBookId(bookId: string) {
  return bookId.startsWith("local-translation-");
}

export function buildLocalLibraryBookTile(book: StoredLocalLibraryBook): LocalLibraryBookTile {
  return {
    id: book.id,
    title: book.title,
    detail: `${book.chapterCount} 章 / ${book.format}`,
    href: routeBuilders.bookChapters(book.id),
    tone: "from-emerald-950 via-teal-700 to-lime-200",
    coverTitle: book.title,
    coverSubTitle: book.author ?? "导入书籍",
    kind: book.format,
    source: "upload",
  };
}

export function buildLocalTranslationBookTile(
  translation: StoredLocalTranslation,
): LocalLibraryBookTile {
  return {
    id: translation.id,
    title: translation.title,
    detail: `${translation.targetLanguage} / ${translation.chapters.length} 章`,
    href: `/reader?translationId=${encodeURIComponent(translation.id)}`,
    tone: "from-indigo-950 via-sky-700 to-emerald-200",
    coverTitle: translation.title,
    coverSubTitle: translation.originalTitle,
    kind: translation.targetLanguage,
    source: "translation",
  };
}
