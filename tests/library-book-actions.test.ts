import assert from "node:assert/strict";
import test from "node:test";

import {
  hasLibraryBookTitleConflict,
  filterLibraryBookTiles,
  removeLibraryBookTile,
  renameLibraryBookTile,
  type LibraryBookActionTile,
} from "../src/lib/library/library-book-actions.ts";

const books: LibraryBookActionTile[] = [
  { id: "book-1", title: "迷雾边境" },
  { id: "book-2", title: "Silent Archive" },
];

test("renames a local library book tile", () => {
  const result = renameLibraryBookTile(books, "book-1", "  雾中边境  ");

  assert.equal(result.ok, true);

  if (!result.ok) {
    return;
  }

  assert.equal(result.books[0].title, "雾中边境");
});

test("filters book tiles by source and language", () => {
  const filterableBooks = [
    { id: "book-1", title: "原书", source: "upload" as const, kind: "英文" },
    { id: "book-2", title: "译本", source: "translation" as const, kind: "中文" },
  ];

  assert.deepEqual(
    filterLibraryBookTiles(filterableBooks, { source: "translation", kind: "all" }).map(
      (book) => book.id,
    ),
    ["book-2"],
  );
  assert.deepEqual(
    filterLibraryBookTiles(filterableBooks, { source: "all", kind: "英文" }).map(
      (book) => book.id,
    ),
    ["book-1"],
  );
});

test("rejects empty local library book names", () => {
  assert.deepEqual(renameLibraryBookTile(books, "book-1", " "), {
    ok: false,
    reason: "empty-title",
  });
});

test("rejects duplicated local library book names", () => {
  assert.deepEqual(renameLibraryBookTile(books, "book-1", "Silent Archive"), {
    ok: false,
    reason: "duplicate-title",
  });
});

test("detects visible library title conflicts across book groups", () => {
  assert.equal(hasLibraryBookTitleConflict(books, "book-1", " Silent   Archive "), true);
  assert.equal(hasLibraryBookTitleConflict(books, "book-1", "New Title"), false);
  assert.equal(hasLibraryBookTitleConflict(books, "book-1", "迷雾边境"), false);
});

test("removes a local library book tile", () => {
  assert.deepEqual(removeLibraryBookTile(books, "book-2"), [{ id: "book-1", title: "迷雾边境" }]);
});
