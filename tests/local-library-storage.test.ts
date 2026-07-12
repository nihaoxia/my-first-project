import assert from "node:assert/strict";
import test from "node:test";

import {
  buildStoredLocalLibraryBook,
  findStoredLocalLibraryBook,
  localLibraryBooksStorageKey,
  parseStoredLocalLibraryBooks,
  parseStoredLocalLibraryBooksResult,
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
      content: "Opening text.\nFull saved chapter.",
      contentPreview: "Opening text.",
      warnings: [],
    },
    {
      position: 2,
      sourceIndex: 2,
      title: "Chapter 2",
      originalTitle: "Chapter 2",
      characterCount: 600,
      content: "More text.\nFull saved chapter.",
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

test("distinguishes a missing local library from malformed persisted data", () => {
  assert.deepEqual(parseStoredLocalLibraryBooksResult(null), {
    ok: true,
    status: "missing",
    records: [],
  });
  assert.deepEqual(parseStoredLocalLibraryBooksResult("not-json"), {
    ok: false,
    reason: "malformed",
    records: [],
  });
  assert.equal(
    parseStoredLocalLibraryBooksResult(JSON.stringify([{ id: "bad" }])).ok,
    false,
  );
});

test("builds a stored local library book from an original book draft", () => {
  const book = buildStoredLocalLibraryBook(originalBookDraft, "2026-06-26T12:00:00.000Z");

  assert.equal(book.id.startsWith("local-book-the-local-book-txt-mb1be1-"), true);
  assert.equal(book.title, "The Local Book");
  assert.equal(book.chapterCount, 2);
  assert.equal(book.skippedChapterCount, 1);
  assert.equal(book.savedAt, "2026-06-26T12:00:00.000Z");
  assert.equal(book.chapters[0].content, "Opening text.\nFull saved chapter.");
  assert.equal(book.chapters[0].contentPreview, "Opening text.");
});

test("does not silently overwrite two imports that use the same file name", () => {
  const first = buildStoredLocalLibraryBook(originalBookDraft, "2026-06-26T12:00:00.000Z");
  const second = buildStoredLocalLibraryBook(originalBookDraft, "2026-06-26T13:00:00.000Z");

  assert.notEqual(first.id, second.id);
  assert.equal(upsertStoredLocalLibraryBook([first], second).length, 2);
});

test("normalizes legacy stored books that only have chapter previews", () => {
  const book = buildStoredLocalLibraryBook(originalBookDraft, "2026-06-26T12:00:00.000Z");
  const legacyBook = {
    ...book,
    chapters: book.chapters.map((chapter) => ({
      position: chapter.position,
      sourceIndex: chapter.sourceIndex,
      title: chapter.title,
      originalTitle: chapter.originalTitle,
      characterCount: chapter.characterCount,
      contentPreview: chapter.contentPreview,
      warnings: chapter.warnings,
    })),
  };

  const parsedBooks = parseStoredLocalLibraryBooks(JSON.stringify([legacyBook]));

  assert.equal(parsedBooks[0].chapters[0].content, "Opening text.");
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
  const otherBook = {
    ...book,
    id: "local-book-other-book-txt-1",
    title: "Other Book",
    originalFileName: "other-book.txt",
  };

  assert.deepEqual(renameStoredLocalLibraryBook([book], book.id, " "), {
    ok: false,
    reason: "empty-title",
  });
  assert.deepEqual(renameStoredLocalLibraryBook([book], "missing", "New Title"), {
    ok: false,
    reason: "not-found",
  });
  assert.deepEqual(renameStoredLocalLibraryBook([book, otherBook], book.id, " Other   Book "), {
    ok: false,
    reason: "duplicate-title",
  });
});

test("drops persisted books whose nested chapter data is malformed", () => {
  const book = buildStoredLocalLibraryBook(originalBookDraft, "2026-06-26T12:00:00.000Z");
  const malformedBook = {
    ...book,
    chapters: [{ ...book.chapters[0], characterCount: "600" }],
  };

  assert.deepEqual(parseStoredLocalLibraryBooks(JSON.stringify([malformedBook])), []);
});
