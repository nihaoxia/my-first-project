import assert from "node:assert/strict";
import test from "node:test";

import {
  buildLocalLibraryTranslationSource,
  inferLocalBookSourceLanguage,
} from "../src/lib/library/local-library-translation.ts";
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

test("infers English source language for local books without CJK text", () => {
  assert.equal(inferLocalBookSourceLanguage(storedBook), "英文");
});

test("infers Chinese source language from saved local chapter content", () => {
  assert.equal(
    inferLocalBookSourceLanguage({
      ...storedBook,
      chapters: [
        {
          ...storedBook.chapters[0],
          content: "雾从边境漫过来。",
          contentPreview: "雾从边境漫过来。",
        },
      ],
    }),
    "中文",
  );
});

test("builds translation page source data from a stored local book", () => {
  const source = buildLocalLibraryTranslationSource(storedBook);

  assert.equal(source.id, "local-book-the-local-book-txt-mb1be1");
  assert.equal(source.title, "The Local Book");
  assert.equal(source.sourceLanguage, "英文");
  assert.deepEqual(
    source.chapters.map((chapter) => ({
      id: chapter.id,
      title: chapter.title,
      words: chapter.words,
      status: chapter.status,
    })),
    [
      {
        id: "local-book-the-local-book-txt-mb1be1-chapter-1",
        title: "Chapter 1",
        words: 600,
        status: "ready",
      },
      {
        id: "local-book-the-local-book-txt-mb1be1-chapter-2",
        title: "Chapter 2",
        words: 600,
        status: "ready",
      },
    ],
  );
});
