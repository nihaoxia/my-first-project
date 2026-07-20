import assert from "node:assert/strict";
import test from "node:test";

import {
  buildNotesMarkdownExport,
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

test("builds one Markdown file from saved notes", () => {
  const exported = buildNotesMarkdownExport({
    notes: [
      {
        id: "n1",
        title: "黑桥",
        source: "迷雾边境 · 第二章",
        updatedAt: "2026/7/20 20:00",
        content: "先看动作，再看环境。",
      },
      {
        id: "n2",
        title: "空白记录",
        source: "自由笔记",
        updatedAt: "2026/7/20 21:00",
        content: "",
      },
    ],
  });

  assert.equal(exported.fileName, "stray-pages-notes.md");
  assert.match(exported.content, /^# Stray Pages · 笔记本/);
  assert.ok(exported.content.indexOf("## 1. 黑桥") < exported.content.indexOf("## 2. 空白记录"));
  assert.match(exported.content, /\*\*来源：\*\* 迷雾边境 · 第二章/);
  assert.match(exported.content, /先看动作，再看环境。/);
});
