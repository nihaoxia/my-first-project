import type { TranslationProviderSegmentResult } from "./translation-provider.ts";
import type { TranslationSegment } from "./translation-segments.ts";

export type TranslationQualityIssueCode =
  | "empty-translation"
  | "segment-count-mismatch"
  | "untranslated-source-remnant";

export type TranslationQualityIssue = {
  code: TranslationQualityIssueCode;
  segmentId?: string;
  message: string;
};

export type TranslationQualityResult = {
  status: "passed" | "needs-review";
  issues: TranslationQualityIssue[];
};

export type AssessTranslationQualityInput = {
  sourceSegments: TranslationSegment[];
  translatedSegments: TranslationProviderSegmentResult[];
};

export function assessTranslationQuality(
  input: AssessTranslationQualityInput,
): TranslationQualityResult {
  const issues: TranslationQualityIssue[] = [];

  if (input.sourceSegments.length !== input.translatedSegments.length) {
    issues.push({
      code: "segment-count-mismatch",
      message: "源分段和译文分段数量不一致。",
    });
  }

  for (const translatedSegment of input.translatedSegments) {
    const sourceSegment = input.sourceSegments.find(
      (segment) => segment.id === translatedSegment.segmentId,
    );

    if (translatedSegment.translatedText.trim().length === 0) {
      issues.push({
        code: "empty-translation",
        segmentId: translatedSegment.segmentId,
        message: "译文为空。",
      });
      continue;
    }

    if (sourceSegment && containsLikelySourceRemnant(sourceSegment.text, translatedSegment.translatedText)) {
      issues.push({
        code: "untranslated-source-remnant",
        segmentId: translatedSegment.segmentId,
        message: "译文中残留明显原文片段。",
      });
    }
  }

  return {
    status: issues.length === 0 ? "passed" : "needs-review",
    issues,
  };
}

function containsLikelySourceRemnant(sourceText: string, translatedText: string) {
  const sourceTerms = extractLikelySourceTerms(sourceText);

  return sourceTerms.some((term) => translatedText.includes(term));
}

function extractLikelySourceTerms(sourceText: string) {
  const terms = new Set<string>();

  for (const match of sourceText.matchAll(/[\u4e00-\u9fff]{2,}/g)) {
    const chineseRun = match[0];
    terms.add(chineseRun);

    for (let index = 0; index < chineseRun.length - 1; index += 1) {
      terms.add(chineseRun.slice(index, index + 2));
    }
  }

  for (const match of sourceText.matchAll(/\b[A-Za-z]{5,}\b/g)) {
    terms.add(match[0]);
  }

  return [...terms];
}
