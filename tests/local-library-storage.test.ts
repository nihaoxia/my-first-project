import assert from "node:assert/strict";
import test from "node:test";

import {
  buildStoredLocalLibraryBook,
  findStoredLocalLibraryBook,
  localLibraryBooksStorageKey,
  removeStoredLocalLibraryBook,
  renameStoredLocalLibraryBook,
  upsertStoredLocalLibraryBook,
} from "../src/lib/library/local-library-storage.ts";
import type { OriginalBookDraftResult } from "../src/lib/upload/original-book-draft.ts";

const originalBookDraft: Extract<OriginalBookDraftResult, { ok: true }> = {
  ok: true,
  book: {
    title: "The Local Book",
    author: "A. Writer",
    format: "TXT",
    originalFileName: "the-local-book.txt",
    includedChapterCount: 2,
    skippedChapterCount: 1,
    totalCharacters: 1200,
  },
  chapters: [
    {
      position: 1,
      sourceIndex: 1,
      title: "Chapter 1",
      originalTitle: "Chapter 1",
      characterCount: 600,
      contentPreview: "Opening text.",
      warnings: [],
    },
    {
      position: 2,
      sourceIndex: 2,
      title: "Chapter 2",
      originalTitle: "Chapter 2",
      characterCount: 600,
      contentPreview: "More text.",
      warnings: [],
    },
  ],
  skippedChapters: [
    {
      sourceIndex: 3,
      title: "Contents",
      originalTitle: "Contents",
      warnings: ["likely-toc"],
    },
  ],
};

test("defines a stable local library storage key", () => {
  assert.equal(localLibraryBooksStorageKey, "stray-pages.local-library-books");
});

test("builds a stored local library book from an original book draft", () => {
  const book = buildStoredLocalLibraryBook(originalBookDraft, "2026-06-26T12:00:00.000Z");

  assert.equal(book.id, "local-book-the-local-book-txt-mb1be1");
  assert.equal(book.title, "The Local Book");
  assert.equal(book.chapterCount, 2);
  assert.equal(book.skippedChapterCount, 1);
  assert.equal(book.savedAt, "2026-06-26T12:00:00.000Z");
  assert.equal(book.chapters[0].contentPreview, "Opening text.");
});

test("upserts local library books by id instead of duplicating them", () => {
  const first = buildStoredLocalLibraryBook(originalBookDraft, "2026-06-26T12:00:00.000Z");
  const second = {
    ...first,
    title: "Renamed Local Book",
    savedAt: "2026-06-26T13:00:00.000Z",
  };

  assert.deepEqual(upsertStoredLocalLibraryBook([first], second), [second]);
});

test("finds a stored local library book by id", () => {
  const book = buildStoredLocalLibraryBook(originalBookDraft, "2026-06-26T12:00:00.000Z");

  assert.equal(findStoredLocalLibraryBook([book], book.id)?.title, "The Local Book");
  assert.equal(findStoredLocalLibraryBook([book], "missing"), null);
});

test("renames and removes stored local library books", () => {
  const book = buildStoredLocalLibraryBook(originalBookDraft, "2026-06-26T12:00:00.000Z");
  const renamed = renameStoredLocalLibraryBook([book], book.id, "  Better Title  ");

  assert.equal(renamed.ok, true);

  if (!renamed.ok) {
    return;
  }

  assert.equal(renamed.books[0].title, "Better Title");
  assert.deepEqual(removeStoredLocalLibraryBook(renamed.books, book.id), []);
});

test("rejects invalid stored local library book rename requests", () => {
  const book = buildStoredLocalLibraryBook(originalBookDraft, "2026-06-26T12:00:00.000Z");

  assert.deepEqual(renameStoredLocalLibraryBook([book], book.id, " "), {
    ok: false,
    reason: "empty-title",
  });
  assert.deepEqual(renameStoredLocalLibraryBook([book], "missing", "New Title"), {
    ok: false,
    reason: "not-found",
  });
});
