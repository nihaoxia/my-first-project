import type { TranslationGlossaryTerm } from "./terminology.ts";
import type { TranslationSegment } from "./translation-segments.ts";

export type TranslationPromptInput = {
  targetLanguage: string;
  style: string;
  webLookupEnabled: boolean;
  glossaryTerms: TranslationGlossaryTerm[];
  segment: TranslationSegment;
};

export type TranslationPrompt = {
  system: string;
  user: string;
  metadata: {
    segmentId: string;
    chapterId: string;
    chapterTitle: string;
    segmentIndex: number;
  };
};

export function buildTranslationPrompt(input: TranslationPromptInput): TranslationPrompt {
  return {
    system:
      "你是专业小说翻译助手。请保持术语一致、叙事自然，不增删剧情，不输出解释。",
    user: [
      `章节：${input.segment.chapterTitle}`,
      `段落编号：${input.segment.index + 1}`,
      `目标语言：${input.targetLanguage}`,
      `翻译风格：${input.style}`,
      `联网查证：${input.webLookupEnabled ? "启用" : "关闭"}`,
      `术语表：${formatGlossaryTerms(input.glossaryTerms)}`,
      "原文：",
      input.segment.text,
    ].join("\n"),
    metadata: {
      segmentId: input.segment.id,
      chapterId: input.segment.chapterId,
      chapterTitle: input.segment.chapterTitle,
      segmentIndex: input.segment.index,
    },
  };
}

function formatGlossaryTerms(glossaryTerms: TranslationGlossaryTerm[]) {
  if (glossaryTerms.length === 0) {
    return "无";
  }

  return glossaryTerms
    .map((term) => {
      const target = term.targetTerm ? ` => ${term.targetTerm}` : "";
      const note = term.note ? `（${term.note}）` : "";
      return `${term.sourceTerm}${target}${note}`;
    })
    .join("；");
}
