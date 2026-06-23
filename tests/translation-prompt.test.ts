import assert from "node:assert/strict";
import test from "node:test";

import { buildTranslationPrompt } from "../src/lib/translation/translation-prompt.ts";

test("builds a prompt with target language, style, lookup flag, glossary and source segment", () => {
  const prompt = buildTranslationPrompt({
    targetLanguage: "英文",
    style: "自然流畅，保留小说叙事节奏",
    webLookupEnabled: true,
    glossaryTerms: [
      {
        sourceTerm: "雾守",
        targetTerm: "mistwarden",
        note: "设定职业名",
      },
    ],
    segment: {
      id: "chapter-1-segment-1",
      index: 0,
      chapterId: "chapter-1",
      chapterTitle: "第一章 雾起",
      text: "雾守举起灯。",
      characterCount: 6,
    },
  });

  assert.match(prompt.system, /专业小说翻译助手/);
  assert.match(prompt.user, /目标语言：英文/);
  assert.match(prompt.user, /翻译风格：自然流畅，保留小说叙事节奏/);
  assert.match(prompt.user, /联网查证：启用/);
  assert.match(prompt.user, /雾守 => mistwarden（设定职业名）/);
  assert.match(prompt.user, /雾守举起灯。/);
  assert.equal(prompt.metadata.segmentId, "chapter-1-segment-1");
});

test("uses an explicit empty glossary section when no terms are provided", () => {
  const prompt = buildTranslationPrompt({
    targetLanguage: "日文",
    style: "轻小说风格",
    webLookupEnabled: false,
    glossaryTerms: [],
    segment: {
      id: "chapter-2-segment-1",
      index: 0,
      chapterId: "chapter-2",
      chapterTitle: "第二章",
      text: "桥在雾里。",
      characterCount: 5,
    },
  });

  assert.match(prompt.user, /联网查证：关闭/);
  assert.match(prompt.user, /术语表：无/);
});
