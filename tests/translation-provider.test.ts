import assert from "node:assert/strict";
import test from "node:test";

import { createFakeTranslationProvider } from "../src/lib/translation/translation-provider.ts";

test("fake provider translates every segment with stable ids", async () => {
  const provider = createFakeTranslationProvider();

  const result = await provider.translateSegments({
    targetLanguage: "英文",
    style: "自然",
    webLookupEnabled: false,
    glossaryTerms: [],
    segments: [
      {
        id: "chapter-1-segment-1",
        index: 0,
        chapterId: "chapter-1",
        chapterTitle: "第一章",
        text: "雾起。",
        characterCount: 3,
      },
      {
        id: "chapter-1-segment-2",
        index: 1,
        chapterId: "chapter-1",
        chapterTitle: "第一章",
        text: "灯亮。",
        characterCount: 3,
      },
    ],
  });

  assert.equal(result.providerName, "fake-local-provider");
  assert.deepEqual(
    result.translations.map((translation) => translation.segmentId),
    ["chapter-1-segment-1", "chapter-1-segment-2"],
  );
  assert.match(result.translations[0].translatedText, /\[Fake AI:英文\]/);
  assert.match(result.translations[1].translatedText, /灯亮。/);
});
