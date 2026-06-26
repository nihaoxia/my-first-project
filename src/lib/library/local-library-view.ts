import { routeBuilders } from "../routes.ts";
import type { StoredLocalLibraryBook } from "./local-library-storage.ts";

export type LocalLibraryBookTile = {
  id: string;
  title: string;
  detail: string;
  href: string;
  tone: string;
  coverTitle: string;
  coverSubTitle: string;
  kind: string;
};

export function isLocalLibraryBookId(bookId: string) {
  return bookId.startsWith("local-book-");
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
  };
}
