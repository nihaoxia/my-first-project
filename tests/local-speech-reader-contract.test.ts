import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("reader speaks displayed paragraphs and highlights the active paragraph", () => {
  const reader = source("src/components/reader/reader-workspace.tsx");

  assert.match(reader, /speechLanguage\?: string/u);
  assert.match(reader, /LocalSpeechControls/u);
  assert.match(reader, /const speechParagraphs = useMemo/u);
  assert.match(reader, /index: paragraph\.index/u);
  assert.match(reader, /text: paragraph\.displayText/u);
  assert.match(reader, /activeSpeechParagraphIndex/u);
  assert.match(reader, /scrollIntoView\(\{ block: "center" \}\)/u);
  assert.match(reader, /aria-current=\{isSpeechActive/u);
  assert.match(reader, /--reader-highlight/u);
  assert.match(reader, /--primary/u);
});

test("local, cloud, and example readers reuse existing target-language metadata", () => {
  const local = source("src/components/reader/local-translation-reader.tsx");
  const cloud = source("src/components/cloud/cloud-translation-reader.tsx");
  const example = source("src/app/reader/page.tsx");

  assert.match(local, /speechLanguage=\{state\.translation\.targetLanguage\}/u);
  assert.match(cloud, /const targetLanguageLabel = getCloudBookLanguageLabel/u);
  assert.match(cloud, /speechLanguage=\{targetLanguageLabel\}/u);
  assert.match(example, /speechLanguage=\{translation\.targetLanguage\}/u);

  assert.equal(
    cloud.match(/getCloudTranslationsService\(\)\.getReader/gu)?.length,
    1,
  );
  assert.equal(cloud.match(/getCloudBooksService\(\)\.get/gu)?.length, 1);
  assert.equal(cloud.match(/getCloudStudyService\(\)\.list/gu)?.length, 1);
  assert.doesNotMatch(cloud, /fetch\s*\(/u);
});
