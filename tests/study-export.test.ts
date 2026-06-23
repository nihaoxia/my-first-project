import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSentenceMarkdownExport,
  buildVocabularyCsvExport,
} from "../src/lib/export/study-export.ts";
import {
  createSentenceDraft,
  createVocabularyDraft,
} from "../src/lib/reader/study-collections.ts";

test("builds escaped vocabulary CSV content", () => {
  const item = createVocabularyDraft({
    term: "threshold",
    explanation: "门槛；临界点",
    contextualMean: "进入事件前的边界感",
    sourceSentence: 'He paused at the "threshold" of the inn.',
    bookId: "demo-book",
    bookTitle: "迷雾边境",
    chapterId: "chapter-2",
    chapterTitle: "第二章：黑桥",
    note: "保留引号",
  });

  const exported = buildVocabularyCsvExport({
    bookTitle: "迷雾边境",
    items: [item],
  });

  assert.equal(exported.fileName, "mi-wu-bian-jing-vocabulary.csv");
  assert.match(exported.content, /^词条,解释,语境含义,例句,来源,备注/);
  assert.match(exported.content, /"He paused at the ""threshold"" of the inn\."/);
});

test("builds sentence Markdown content with source and notes", () => {
  const item = createSentenceDraft({
    originalText: "他没有回答，只把灯举得更高。",
    translatedText: "He did not answer; he simply raised the lamp higher.",
    explanation: "分号处理两个紧密动作。",
    bookId: "demo-book",
    bookTitle: "迷雾边境",
    chapterId: "chapter-2",
    chapterTitle: "第二章：黑桥",
    note: "适合复习叙事节奏。",
  });

  const exported = buildSentenceMarkdownExport({
    bookTitle: "迷雾边境",
    items: [item],
  });

  assert.equal(exported.fileName, "mi-wu-bian-jing-sentences.md");
  assert.match(exported.content, /^# 迷雾边境 · 句子本/);
  assert.match(exported.content, /> 他没有回答，只把灯举得更高。/);
  assert.match(exported.content, /\*\*备注：\*\* 适合复习叙事节奏。/);
});
