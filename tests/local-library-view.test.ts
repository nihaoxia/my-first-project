import assert from "node:assert/strict";
import test from "node:test";

import {
  buildLocalLibraryBookTile,
  isLocalLibraryBookId,
} from "../src/lib/library/local-library-view.ts";
import type { StoredLocalLibraryBook } from "../src/lib/library/local-library-storage.ts";

const storedBook: StoredLocalLibraryBook = {
  id: "local-book-the-local-book-txt-mb1be1",
  title: "The Local Book",
  author: "A. Writer",
  format: "TXT",
  originalFileName: "the-local-book.txt",
  chapterCount: 2,
  skippedChapterCount: 1,
  totalCharacters: 1200,
  savedAt: "2026-06-26T12:00:00.000Z",
  chapters: [],
  skippedChapters: [],
};

test("detects stored local library book ids", () => {
  assert.equal(isLocalLibraryBookId("local-book-the-local-book-txt-mb1be1"), true);
  assert.equal(isLocalLibraryBookId("demo-book"), false);
});

test("builds a user-facing library tile for a stored local book", () => {
  const tile = buildLocalLibraryBookTile(storedBook);

  assert.equal(tile.id, "local-book-the-local-book-txt-mb1be1");
  assert.equal(tile.title, "The Local Book");
  assert.equal(tile.detail, "2 章 / TXT");
  assert.equal(tile.href, "/books/local-book-the-local-book-txt-mb1be1/chapters");
  assert.equal(tile.coverSubTitle, "A. Writer");
  assert.equal(tile.kind, "TXT");
});

test("uses a neutral subtitle when a stored local book has no author", () => {
  const tile = buildLocalLibraryBookTile({ ...storedBook, author: null });

  assert.equal(tile.coverSubTitle, "导入书籍");
});
