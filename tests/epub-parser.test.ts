import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { EpubParseError } from "../src/lib/upload/epub-archive.ts";
import { parseEpubBook } from "../src/lib/upload/epub-parser.ts";
import { makeMinimalEpub2, makeMinimalEpub3 } from "./epub-fixtures.ts";

const fallback = {
  title: "文件名标题",
  author: "文件名作者",
  format: "EPUB" as const,
  originalFileName: "文件名标题 - 文件名作者.epub",
};

test("parses a minimal EPUB 3 in spine order with navigation labels", async () => {
  const result = await parseEpubBook(makeMinimalEpub3(), fallback);
  assert.deepEqual(result.metadata, {
    title: "边境档案",
    author: "林间客",
    format: "EPUB",
    originalFileName: fallback.originalFileName,
  });
  assert.deepEqual(result.chapters.map((chapter) => chapter.title), ["导航第一章", "导航第二章"]);
  assert.match(result.chapters[0].content, /雾从边境漫过来/u);
  assert.equal(result.chapters[0].index, 1);
});

test("parses EPUB 2 NCX labels and falls back to file metadata", async () => {
  const epub2 = await parseEpubBook(makeMinimalEpub2(), fallback);
  assert.equal(epub2.chapters[0].title, "NCX 第一章");

  const noMetadata = await parseEpubBook(makeMinimalEpub3({ title: "", author: "" }), fallback);
  assert.equal(noMetadata.metadata.title, fallback.title);
  assert.equal(noMetadata.metadata.author, fallback.author);
});

test("uses heading, document title, and numbered title fallbacks while skipping empty documents", async () => {
  const result = await parseEpubBook(
    makeMinimalEpub3({
      chapters: [
        { id: "heading", file: "heading.xhtml", body: "<h2>标题来自正文</h2><p>第一段。</p>" },
        { id: "doc", file: "doc.xhtml", body: "<p>第二段。</p>" },
        { id: "empty", file: "empty.xhtml", body: "<script>ignored</script>" },
      ],
    }),
    fallback,
  );
  assert.deepEqual(result.chapters.map((chapter) => chapter.title), ["标题来自正文", "doc"]);
  assert.equal(result.chapters.length, 2);
});

test("rejects EPUBs without any readable text", async () => {
  await assert.rejects(
    parseEpubBook(
      makeMinimalEpub3({ chapters: [{ id: "empty", file: "empty.xhtml", body: "<script>x</script>" }] }),
      fallback,
    ),
    (error: unknown) => error instanceof EpubParseError && error.code === "EPUB_NO_READABLE_TEXT",
  );
});

test("keeps the EPUB parser free of network, cloud, model, and filesystem writes", () => {
  const source = ["epub-archive", "epub-xml", "epub-package", "epub-text", "epub-parser"]
    .map((name) => readFileSync(`src/lib/upload/${name}.ts`, "utf8"))
    .join("\n");
  assert.doesNotMatch(source, /fetch\s*\(|XMLHttpRequest|WebSocket|node:fs|writeFile|edgeone|models?/iu);
});
