import assert from "node:assert/strict";
import test from "node:test";

import { assessTranslationQuality } from "../src/lib/translation/translation-quality.ts";

const sourceSegments = [
  {
    id: "segment-1",
    index: 0,
    chapterId: "chapter-1",
    chapterTitle: "第一章",
    text: "雾守举起灯。",
    characterCount: 6,
  },
  {
    id: "segment-2",
    index: 1,
    chapterId: "chapter-1",
    chapterTitle: "第一章",
    text: "黑桥在远处。",
    characterCount: 6,
  },
];

test("passes when translated segments are complete and aligned", () => {
  const result = assessTranslationQuality({
    sourceSegments,
    translatedSegments: [
      { segmentId: "segment-1", index: 0, translatedText: "The mistwarden raised the lamp." },
      { segmentId: "segment-2", index: 1, translatedText: "The black bridge stood far away." },
    ],
  });

  assert.equal(result.status, "passed");
  assert.deepEqual(result.issues, []);
});

test("reports empty translations, count mismatch and source remnants", () => {
  const result = assessTranslationQuality({
    sourceSegments,
    translatedSegments: [
      { segmentId: "segment-1", index: 0, translatedText: "雾守 raised the lamp." },
      { segmentId: "segment-2", index: 1, translatedText: "   " },
      { segmentId: "segment-extra", index: 2, translatedText: "extra" },
    ],
  });

  assert.equal(result.status, "needs-review");
  assert.deepEqual(
    result.issues.map((issue) => issue.code),
    ["segment-count-mismatch", "untranslated-source-remnant", "empty-translation"],
  );
});
