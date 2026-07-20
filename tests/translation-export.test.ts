import assert from "node:assert/strict";
import test from "node:test";

import {
  buildTranslatedBookTxtExport,
} from "../src/lib/export/translation-export.ts";

const translatedBook = {
  title: "The Border of Mist",
  originalTitle: "迷雾边境",
  targetLanguage: "英文",
  chapters: [
    {
      id: "chapter-2",
      title: "第二章：黑桥",
      paragraphs: ["He did not answer.", "He simply raised the lamp higher."],
    },
    {
      id: "chapter-1",
      title: "第一章：雾起",
      paragraphs: ["The mist rose slowly."],
    },
  ],
};

test("builds a translated book TXT export with stable chapter order", () => {
  const exported = buildTranslatedBookTxtExport({
    ...translatedBook,
    chapterOrder: ["chapter-1", "chapter-2"],
  });

  assert.equal(exported.fileName, "the-border-of-mist.txt");
  assert.match(exported.content, /^The Border of Mist\n原书：迷雾边境\n目标语言：英文/);
  assert.ok(exported.content.indexOf("第一章：雾起") < exported.content.indexOf("第二章：黑桥"));
  assert.match(exported.content, /He did not answer\.\n\nHe simply raised the lamp higher\./);
});

test("uses a safe non-empty fallback for an unmapped Unicode title", () => {
  const exported = buildTranslatedBookTxtExport({
    title: "星河",
    originalTitle: "星河",
    targetLanguage: "英文",
    chapters: [{ id: "chapter-1", title: "第一章", paragraphs: ["Text"] }],
  });

  assert.equal(exported.fileName, "stray-pages-export.txt");
});
