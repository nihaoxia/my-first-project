import assert from "node:assert/strict";
import test from "node:test";

import { buildTranslatedBookEpubExport, EpubExportError } from "../src/lib/export/epub-export.ts";
import { inspectEpubArchive, readEpubEntries } from "../src/lib/upload/epub-archive.ts";
import { parseEpubBook } from "../src/lib/upload/epub-parser.ts";

const input = {
  title: "The Border & Mist",
  originalTitle: "迷雾边境",
  targetLanguage: "英文",
  chapters: [
    { id: "two", title: "第二章 <桥>", paragraphs: ["He raised the lamp."] },
    { id: "one", title: "第一章 & 雾", paragraphs: ["The mist rose.", "It moved slowly."] },
  ],
  chapterOrder: ["one", "two"],
};

test("packages a valid EPUB 3 and preserves ordered translated chapters", async () => {
  const exported = await buildTranslatedBookEpubExport(input, {
    now: () => new Date("2026-07-20T12:34:56Z"),
  });
  assert.equal(exported.fileName, "the-border-mist.epub");
  assert.equal(exported.mimeType, "application/epub+zip");
  const archive = inspectEpubArchive(exported.bytes);
  const files = await readEpubEntries(archive, new Set([
    "META-INF/container.xml", "OEBPS/content.opf", "OEBPS/nav.xhtml",
    "OEBPS/text/chapter-0001.xhtml", "OEBPS/text/chapter-0002.xhtml",
  ]));
  const decode = (path: string) => new TextDecoder().decode(files.get(path));
  assert.match(decode("OEBPS/content.opf"), /<dc:language>en<\/dc:language>/u);
  assert.match(decode("OEBPS/content.opf"), /2026-07-20T12:34:56Z/u);
  assert.match(decode("OEBPS/nav.xhtml"), /第一章 &amp; 雾/u);
  assert.match(decode("OEBPS/text/chapter-0002.xhtml"), /第二章 &lt;桥&gt;/u);

  const roundTrip = await parseEpubBook(exported.bytes, {
    title: "fallback", author: null, format: "EPUB", originalFileName: exported.fileName,
  });
  assert.deepEqual(roundTrip.chapters.map((chapter) => chapter.title), ["第一章 & 雾", "第二章 <桥>"]);
  assert.match(roundTrip.chapters[0].content, /The mist rose/u);
});

test("maps supported target languages to EPUB language tags", async () => {
  const cases = new Map([["中文", "zh-CN"], ["英文", "en"], ["日文", "ja"], ["韩文", "ko"], ["俄语", "ru"], ["德语", "de"], ["西班牙语", "es"], ["法语", "fr"], ["未知", "und"]]);
  for (const [targetLanguage, expected] of cases) {
    const exported = await buildTranslatedBookEpubExport({ ...input, targetLanguage });
    const archive = inspectEpubArchive(exported.bytes);
    const opf = (await readEpubEntries(archive, new Set(["OEBPS/content.opf"]))).get("OEBPS/content.opf");
    assert.match(new TextDecoder().decode(opf), new RegExp(`<dc:language>${expected}</dc:language>`));
  }
});

test("fails closed for empty, duplicate, unknown-order, and invalid XML text", async () => {
  const cases: Array<[unknown, EpubExportError["code"]]> = [
    [{ ...input, chapters: [] }, "EPUB_EXPORT_EMPTY_BOOK"],
    [{ ...input, chapters: [input.chapters[0], input.chapters[0]] }, "EPUB_EXPORT_INVALID_ORDER"],
    [{ ...input, chapterOrder: ["missing"] }, "EPUB_EXPORT_INVALID_ORDER"],
    [{ ...input, title: "bad\u0000title" }, "EPUB_EXPORT_INVALID_TEXT"],
  ];
  for (const [value, code] of cases) {
    await assert.rejects(
      buildTranslatedBookEpubExport(value as typeof input),
      (error: unknown) => error instanceof EpubExportError && error.code === code,
    );
  }
});
