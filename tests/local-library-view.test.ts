import assert from "node:assert/strict";
import test from "node:test";

import {
  buildLocalLibraryBookTile,
  buildLocalTranslationBookTile,
  isLocalLibraryBookId,
  isLocalTranslationBookId,
} from "../src/lib/library/local-library-view.ts";
import type { StoredLocalLibraryBook } from "../src/lib/library/local-library-storage.ts";
import type { StoredLocalTranslation } from "../src/lib/library/local-translation-storage.ts";

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

const storedTranslation: StoredLocalTranslation = {
  id: "local-translation-local-book-the-local-book-txt-mb1be1-zhong-wen",
  originalBookId: storedBook.id,
  originalTitle: storedBook.title,
  title: "The Local Book（中文译本）",
  sourceLanguage: "英文",
  targetLanguage: "中文",
  status: "ready",
  createdAt: "2026-06-26T13:00:00.000Z",
  updatedAt: "2026-06-26T13:00:00.000Z",
  tasks: [],
  chapters: [],
};

test("detects stored local library book ids", () => {
  assert.equal(isLocalLibraryBookId("local-book-the-local-book-txt-mb1be1"), true);
  assert.equal(isLocalLibraryBookId("demo-book"), false);
  assert.equal(isLocalTranslationBookId(storedTranslation.id), true);
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

test("builds a user-facing library tile for a stored local translation", () => {
  const tile = buildLocalTranslationBookTile(storedTranslation);

  assert.equal(tile.id, storedTranslation.id);
  assert.equal(tile.title, "The Local Book（中文译本）");
  assert.equal(tile.detail, "中文 / 0 章");
  assert.equal(tile.href, `/reader?translationId=${encodeURIComponent(storedTranslation.id)}`);
  assert.equal(tile.coverSubTitle, "The Local Book");
  assert.equal(tile.kind, "中文");
});
