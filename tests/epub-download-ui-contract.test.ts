import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("builds and downloads EPUB only from the client button", () => {
  const source = readFileSync("src/components/export/epub-download-button.tsx", "utf8");
  assert.match(source, /buildTranslatedBookEpubExport/);
  assert.match(source, /triggerBrowserDownload/);
  assert.match(source, /正在生成 EPUB/);
  assert.match(source, /下载完整译本 EPUB/);
  assert.doesNotMatch(source, /fetch\s*\(|edgeone|node:fs|writeFile|models?/iu);
});
