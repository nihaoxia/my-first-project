import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("reader exposes one complete translation text download", () => {
  const reader = source("src/components/reader/reader-workspace.tsx");

  assert.match(reader, /download\?: TextExportResult/);
  assert.match(reader, /TextDownloadButton/);
  assert.match(reader, /下载完整译本 TXT/);
  assert.match(reader, /epubDownloadInput\?: TranslatedBookExportInput/);
  assert.match(reader, /EpubDownloadButton/);
});

test("local and cloud readers build downloads from their authoritative readable chapters", () => {
  const local = source("src/components/reader/local-translation-reader.tsx");
  const cloud = source("src/components/cloud/cloud-translation-reader.tsx");

  assert.match(local, /getReadableStoredLocalTranslationChapters/);
  assert.match(local, /buildTranslatedBookTxtExport/);
  assert.match(local, /download=\{download\}/);
  assert.match(local, /epubDownloadInput=\{exportInput\}/);

  assert.match(cloud, /getCloudBooksService\(\)\.get/);
  assert.match(cloud, /buildTranslatedBookTxtExport/);
  assert.match(cloud, /getCloudBookLanguageLabel/);
  assert.match(cloud, /download=\{download\}/);
  assert.match(cloud, /epubDownloadInput=\{exportInput\}/);
});

test("text downloads remain local browser work and notes exclude unsaved drafts", () => {
  const button = source("src/components/export/text-download-button.tsx");
  const notes = source("src/components/study/notes-workspace.tsx");

  assert.doesNotMatch(button, /fetch\s*\(/);
  assert.match(button, /createObjectURL/);
  assert.match(button, /revokeObjectURL/);
  assert.match(notes, /buildNotesMarkdownExport\(\{ notes: exportNotes \}\)/);
  assert.doesNotMatch(notes, /buildNotesMarkdownExport\(\{ notes: drafts/);
});
