export type ReadingAssistantKind = "word" | "sentence" | "paragraph";

export type ReadingAssistantResult = {
  kind: ReadingAssistantKind;
  title: string;
  explanation: string;
  sourceLabel: string;
  saveTarget: "vocabulary" | "sentence";
  suggestedNote: string;
};

export type ReaderQuestionAnswer = {
  question: string;
  answer: string;
  sourceLabel: string;
};

export function buildReadingAssistantResult(input: {
  kind: ReadingAssistantKind;
  selectedText: string;
  sourceText: string;
  translatedText?: string;
  bookTitle: string;
  chapterTitle: string;
}): ReadingAssistantResult {
  const selectedText = input.selectedText.trim();
  const sourceLabel = buildSourceLabel(input.bookTitle, input.chapterTitle);

  if (input.kind === "word") {
    return {
      kind: input.kind,
      title: selectedText,
      explanation: `结合上下文，“${selectedText}”在这里更适合理解为和当前场景相关的具体含义，而不是孤立词典义。`,
      sourceLabel,
      saveTarget: "vocabulary",
      suggestedNote: `在 ${sourceLabel} 中出现，可结合原句复习。`,
    };
  }

  const translatedHint = input.translatedText?.trim()
    ? `译文处理为：“${input.translatedText.trim()}”。`
    : "当前还没有可用译文。";

  return {
    kind: input.kind,
    title: input.kind === "sentence" ? "句子解释" : "段落解释",
    explanation: `这段内容的重点在叙事节奏和动作衔接。${translatedHint}`,
    sourceLabel,
    saveTarget: "sentence",
    suggestedNote: `保留原文、译文和解释，方便之后回看叙事节奏。`,
  };
}

export function answerReaderQuestion(input: {
  question: string;
  paragraph: string;
  chapterTitle: string;
}): ReaderQuestionAnswer {
  const question = input.question.trim();
  const paragraph = input.paragraph.trim();
  const mentionsSemicolon = question.includes("分号") || paragraph.includes(";");
  const focus = mentionsSemicolon
    ? "分号把两个动作连在一起，保留了停顿，但没有把叙事切得太碎。"
    : "可以先看动作、情绪和前后句的因果关系，再判断译文为什么这样处理。";

  return {
    question,
    sourceLabel: input.chapterTitle,
    answer: `当前段落可以这样理解：${focus} 这类解释只基于当前阅读内容，适合保存到句子本继续复习。`,
  };
}

function buildSourceLabel(bookTitle: string, chapterTitle: string) {
  return `${bookTitle} · ${chapterTitle}`;
}
