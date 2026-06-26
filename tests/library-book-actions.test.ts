import assert from "node:assert/strict";
import test from "node:test";

import {
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

test("removes a local library book tile", () => {
  assert.deepEqual(removeLibraryBookTile(books, "book-2"), [{ id: "book-1", title: "迷雾边境" }]);
});
