import assert from "node:assert/strict";
import test from "node:test";

import {
  buildReadingAssistantResult,
  answerReaderQuestion,
} from "../src/lib/reader/reading-assistant.ts";

test("builds a vocabulary-friendly explanation for selected words", () => {
  const result = buildReadingAssistantResult({
    kind: "word",
    selectedText: "threshold",
    sourceText: "He paused at the threshold of the inn.",
    translatedText: "他停在旅店门槛前。",
    bookTitle: "迷雾边境",
    chapterTitle: "第二章：黑桥",
  });

  assert.equal(result.saveTarget, "vocabulary");
  assert.equal(result.title, "threshold");
  assert.match(result.explanation, /结合上下文/);
  assert.match(result.sourceLabel, /迷雾边境 · 第二章：黑桥/);
});

test("builds a sentence explanation that can be saved to sentence book", () => {
  const result = buildReadingAssistantResult({
    kind: "sentence",
    selectedText: "他没有回答，只把灯举得更高。",
    sourceText: "他没有回答，只把灯举得更高。",
    translatedText: "He did not answer; he simply raised the lamp higher.",
    bookTitle: "迷雾边境",
    chapterTitle: "第二章：黑桥",
  });

  assert.equal(result.saveTarget, "sentence");
  assert.match(result.explanation, /叙事节奏/);
  assert.equal(result.suggestedNote.includes("token"), false);
  assert.equal(result.suggestedNote.includes("API"), false);
});

test("answers a reader question without exposing internal AI concepts", () => {
  const answer = answerReaderQuestion({
    question: "为什么这里用分号？",
    paragraph: "He did not answer; he simply raised the lamp higher.",
    chapterTitle: "第二章：黑桥",
  });

  assert.match(answer.answer, /当前段落/);
  assert.match(answer.answer, /分号/);
  assert.equal(answer.answer.includes("模型"), false);
  assert.equal(answer.answer.includes("token"), false);
  assert.equal(answer.answer.includes("API"), false);
  assert.equal(answer.answer.includes("联网"), false);
});
