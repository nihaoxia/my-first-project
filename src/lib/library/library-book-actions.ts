export type LibraryBookActionTile = {
  id: string;
  title: string;
};

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
  const title = titleInput.trim().replace(/\s+/g, " ");

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

  if (books.some((book) => book.id !== bookId && book.title === title)) {
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

export function removeLibraryBookTile<T extends LibraryBookActionTile>(books: T[], bookId: string) {
  return books.filter((book) => book.id !== bookId);
}
