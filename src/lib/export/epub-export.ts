import { strToU8, zip, type Zippable } from "fflate";

import { inspectEpubArchive } from "../upload/epub-archive.ts";
import {
  buildExportFileSlug,
  orderTranslatedBookChapters,
  type TranslatedBookExportChapter,
  type TranslatedBookExportInput,
} from "./translation-export.ts";

export type EpubExportErrorCode = "EPUB_EXPORT_EMPTY_BOOK" | "EPUB_EXPORT_INVALID_ORDER" | "EPUB_EXPORT_INVALID_TEXT" | "EPUB_EXPORT_TOO_LARGE" | "EPUB_EXPORT_PACKAGING_FAILED";
export class EpubExportError extends Error {
  readonly code: EpubExportErrorCode;
  constructor(code: EpubExportErrorCode) { super(code); this.name = "EpubExportError"; this.code = code; }
}
export type EpubExportResult = { fileName: string; mimeType: "application/epub+zip"; bytes: Uint8Array };
type EpubExportRuntime = {
  now(): Date;
  packageFiles?(files: Zippable): Promise<Uint8Array>;
};

const policy = { maxChapters: 2_000, maxTitle: 500, maxChapterTitle: 200, maxParagraphs: 20_000, maxChapterBytes: 2 * 1024 * 1024, maxBookBytes: 16 * 1024 * 1024, maxPackageBytes: 32 * 1024 * 1024 } as const;
const languageTags: Record<string, string> = { 中文: "zh-CN", 英文: "en", 日文: "ja", 韩文: "ko", 俄语: "ru", 德语: "de", 西班牙语: "es", 法语: "fr" };

export async function buildTranslatedBookEpubExport(input: TranslatedBookExportInput, runtime: EpubExportRuntime = { now: () => new Date() }): Promise<EpubExportResult> {
  const chapters = validateAndOrder(input);
  const title = input.title.trim() || "未命名译本";
  validateText(title, policy.maxTitle);
  validateText(input.originalTitle, policy.maxTitle);
  const language = languageTags[input.targetLanguage] ?? "und";
  const modified = runtime.now().toISOString().replace(/\.\d{3}Z$/u, "Z");
  const files = buildFiles({ ...input, title }, chapters, language, modified);
  let bytes: Uint8Array;
  try { bytes = await (runtime.packageFiles ?? zipFiles)(files); }
  catch { throw new EpubExportError("EPUB_EXPORT_PACKAGING_FAILED"); }
  if (bytes.byteLength > policy.maxPackageBytes) throw new EpubExportError("EPUB_EXPORT_TOO_LARGE");
  try { inspectEpubArchive(bytes); }
  catch { throw new EpubExportError("EPUB_EXPORT_PACKAGING_FAILED"); }
  return { fileName: `${buildExportFileSlug(title)}.epub`, mimeType: "application/epub+zip", bytes };
}

export function buildEpubExportFileName(title: string) { return `${buildExportFileSlug(title.trim() || "未命名译本")}.epub`; }

function validateAndOrder(input: TranslatedBookExportInput) {
  if (!input.chapters.length) throw new EpubExportError("EPUB_EXPORT_EMPTY_BOOK");
  if (input.chapters.length > policy.maxChapters) throw new EpubExportError("EPUB_EXPORT_TOO_LARGE");
  const ids = new Set<string>();
  let total = 0;
  for (const chapter of input.chapters) {
    if (!chapter.id.trim() || ids.has(chapter.id)) throw new EpubExportError("EPUB_EXPORT_INVALID_ORDER");
    ids.add(chapter.id); validateText(chapter.title, policy.maxChapterTitle);
    if (chapter.paragraphs.length > policy.maxParagraphs) throw new EpubExportError("EPUB_EXPORT_TOO_LARGE");
    let size = byteLength(chapter.title);
    for (const paragraph of chapter.paragraphs) { validateText(paragraph); size += byteLength(paragraph); }
    if (size > policy.maxChapterBytes) throw new EpubExportError("EPUB_EXPORT_TOO_LARGE");
    total += size;
  }
  if (total > policy.maxBookBytes) throw new EpubExportError("EPUB_EXPORT_TOO_LARGE");
  if (input.chapterOrder) {
    const seen = new Set<string>();
    for (const id of input.chapterOrder) if (!ids.has(id) || seen.has(id)) throw new EpubExportError("EPUB_EXPORT_INVALID_ORDER"); else seen.add(id);
  }
  return orderTranslatedBookChapters(input.chapters, input.chapterOrder);
}

function buildFiles(input: TranslatedBookExportInput, chapters: TranslatedBookExportChapter[], language: string, modified: string): Zippable {
  const encoder = (value: string) => strToU8(value);
  const paths = chapters.map((_, i) => `text/chapter-${String(i + 1).padStart(4, "0")}.xhtml`);
  const identifier = `urn:stray-pages:${fnv1a(JSON.stringify(input))}`;
  const manifest = paths.map((path, i) => `<item id="chapter-${i + 1}" href="${path}" media-type="application/xhtml+xml"/>`).join("");
  const spine = paths.map((_, i) => `<itemref idref="chapter-${i + 1}"/>`).join("");
  const source = input.originalTitle.trim() ? `<dc:source>${xml(input.originalTitle.trim())}</dc:source>` : "";
  const opf = `<?xml version="1.0" encoding="UTF-8"?><package xmlns="http://www.idpf.org/2007/opf" xmlns:dc="http://purl.org/dc/elements/1.1/" unique-identifier="book-id" version="3.0"><metadata><dc:identifier id="book-id">${identifier}</dc:identifier><dc:title>${xml(input.title)}</dc:title><dc:language>${language}</dc:language>${source}<meta property="dcterms:modified">${modified}</meta></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="css" href="styles/book.css" media-type="text/css"/>${manifest}</manifest><spine>${spine}</spine></package>`;
  const navItems = chapters.map((chapter, i) => `<li><a href="${paths[i]}">${xml(chapter.title.trim() || `第 ${i + 1} 章`)}</a></li>`).join("");
  const nav = `<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${language}" xml:lang="${language}"><head><title>目录</title><link rel="stylesheet" href="styles/book.css"/></head><body><nav epub:type="toc"><h1>目录</h1><ol>${navItems}</ol></nav></body></html>`;
  const files: Zippable = { mimetype: [encoder("application/epub+zip"), { level: 0 }], "META-INF/container.xml": encoder('<?xml version="1.0" encoding="UTF-8"?><container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>'), "OEBPS/content.opf": encoder(opf), "OEBPS/nav.xhtml": encoder(nav), "OEBPS/styles/book.css": encoder("body{font-family:serif;line-height:1.7;margin:5%;}h1{line-height:1.3;}p{white-space:pre-wrap;margin:0 0 1em;}") };
  chapters.forEach((chapter, i) => { const paragraphs = chapter.paragraphs.map((p) => p.trim()).filter(Boolean).map((p) => `<p>${xml(p)}</p>`).join(""); const heading = chapter.title.trim() || `第 ${i + 1} 章`; files[`OEBPS/${paths[i]}`] = encoder(`<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml" lang="${language}" xml:lang="${language}"><head><title>${xml(heading)}</title><link rel="stylesheet" href="../styles/book.css"/></head><body><article><h1>${xml(heading)}</h1>${paragraphs}</article></body></html>`); });
  return files;
}

function zipFiles(files: Zippable) { return new Promise<Uint8Array>((resolve, reject) => zip(files, { level: 6 }, (error, data) => error ? reject(error) : resolve(data))); }
function validateText(value: string, max = Number.POSITIVE_INFINITY) { if (Array.from(value).length > max || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uD800-\uDFFF]/.test(value)) throw new EpubExportError("EPUB_EXPORT_INVALID_TEXT"); }
function xml(value: string) { return value.replace(/&/gu,"&amp;").replace(/</gu,"&lt;").replace(/>/gu,"&gt;").replace(/"/gu,"&quot;").replace(/'/gu,"&apos;"); }
function byteLength(value: string) { return new TextEncoder().encode(value).byteLength; }
function fnv1a(value: string) { let hash = 0x811c9dc5; for (const byte of new TextEncoder().encode(value)) { hash ^= byte; hash = Math.imul(hash, 0x01000193); } return (hash >>> 0).toString(16).padStart(8,"0"); }
