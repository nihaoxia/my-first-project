export type LibraryBookActionTile = {
  id: string;
  title: string;
};

export type FilterableLibraryBookTile = LibraryBookActionTile & {
  source: "upload" | "translation";
  kind: string;
};

export function filterLibraryBookTiles<T extends FilterableLibraryBookTile>(
  books: T[],
  filter: { source: "all" | FilterableLibraryBookTile["source"]; kind: string },
) {
  return books.filter(
    (book) =>
      (filter.source === "all" || book.source === filter.source) &&
      (filter.kind === "all" || book.kind === filter.kind),
  );
}

export type RenameLibraryBookResult<T extends LibraryBookActionTile> =
  | {
      ok: true;
      books: T[];
    }
  | {
      ok: false;
      reason: "empty-title" | "duplicate-title" | "not-found";
    };

export function renameLibraryBookTile<T extends LibraryBookActionTile>(
  books: T[],
  bookId: string,
  titleInput: string,
): RenameLibraryBookResult<T> {
  const title = normalizeLibraryBookTitle(titleInput);

  if (!title) {
    return {
      ok: false,
      reason: "empty-title",
    };
  }

  const target = books.find((book) => book.id === bookId);

  if (!target) {
    return {
      ok: false,
      reason: "not-found",
    };
  }

  if (hasLibraryBookTitleConflict(books, bookId, title)) {
    return {
      ok: false,
      reason: "duplicate-title",
    };
  }

  return {
    ok: true,
    books: books.map((book) => (book.id === bookId ? { ...book, title, coverTitle: title } : book)),
  };
}

export function hasLibraryBookTitleConflict(
  books: LibraryBookActionTile[],
  bookId: string,
  titleInput: string,
) {
  const title = normalizeLibraryBookTitle(titleInput);

  return books.some((book) => book.id !== bookId && normalizeLibraryBookTitle(book.title) === title);
}

export function removeLibraryBookTile<T extends LibraryBookActionTile>(books: T[], bookId: string) {
  return books.filter((book) => book.id !== bookId);
}

function normalizeLibraryBookTitle(value: string) {
  return value.trim().replace(/\s+/g, " ");
}
