import test from "node:test";
import assert from "node:assert/strict";

import {
  inferBookMetadataFromFileName,
  normalizeBookTitle,
  splitTitleAndAuthor,
} from "../src/lib/upload/book-metadata.ts";

test("normalizes file names into readable book titles", () => {
  assert.equal(normalizeBookTitle("Silent_Archive.final"), "Silent Archive final");
  assert.equal(normalizeBookTitle("  迷雾边境  "), "迷雾边境");
});

test("splits title and author by common separators", () => {
  assert.deepEqual(splitTitleAndAuthor("迷雾边境 - 林间客"), {
    title: "迷雾边境",
    author: "林间客",
  });
  assert.deepEqual(splitTitleAndAuthor("Silent Archive by M. Vale"), {
    title: "Silent Archive",
    author: "M. Vale",
  });
});

test("keeps author empty when no separator is present", () => {
  assert.deepEqual(splitTitleAndAuthor("迷雾边境"), {
    title: "迷雾边境",
    author: null,
  });
});

test("infers title author and format from supported upload file name", () => {
  assert.deepEqual(inferBookMetadataFromFileName("迷雾边境 - 林间客.epub"), {
    title: "迷雾边境",
    author: "林间客",
    format: "EPUB",
    originalFileName: "迷雾边境 - 林间客.epub",
  });
  assert.deepEqual(inferBookMetadataFromFileName("Silent Archive by M. Vale.mobi"), {
    title: "Silent Archive",
    author: "M. Vale",
    format: "MOBI",
    originalFileName: "Silent Archive by M. Vale.mobi",
  });
  assert.deepEqual(inferBookMetadataFromFileName("学习资料.pdf"), {
    title: "学习资料",
    author: null,
    format: "PDF",
    originalFileName: "学习资料.pdf",
  });
});

test("returns null for unsupported upload file names", () => {
  assert.equal(inferBookMetadataFromFileName("scan.docx"), null);
});
