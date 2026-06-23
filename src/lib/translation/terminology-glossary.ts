import type { TranslationGlossaryTerm } from "./terminology.ts";
import type { TerminologyCandidate } from "./terminology.ts";

export type BookGlossaryTermStatus = "confirmed" | "pending" | "ignored";

export type BookGlossaryTerm = {
  bookId: string;
  sourceLanguage: string;
  targetLanguage: string;
  sourceTerm: string;
  targetTerm?: string;
  status: BookGlossaryTermStatus;
  confidence: number;
  occurrences: number;
  firstSeenChapterId: string;
  lastSeenChapterId: string;
  contexts: string[];
};

export type UpsertTerminologyCandidatesIntoGlossaryInput = {
  bookId: string;
  sourceLanguage: string;
  targetLanguage: string;
  chapterId: string;
  existingTerms: BookGlossaryTerm[];
  candidates: TerminologyCandidate[];
};

export type ConfirmBookGlossaryTermInput = {
  targetTerm: string;
  confidence?: number;
};

export type GetRelevantGlossaryTermsForTextInput = {
  text: string;
  glossary: BookGlossaryTerm[];
};

export type GlossaryTermUsageIssue = {
  sourceTerm: string;
  expectedTargetTerm: string;
  message: string;
};

export type AssessGlossaryTermUsageInput = {
  sourceText: string;
  translatedText: string;
  glossary: BookGlossaryTerm[];
};

const DEFAULT_PENDING_CONFIDENCE = 0.6;

export function upsertTerminologyCandidatesIntoGlossary(
  input: UpsertTerminologyCandidatesIntoGlossaryInput,
): BookGlossaryTerm[] {
  const termsBySourceTerm = new Map(input.existingTerms.map((term) => [term.sourceTerm, { ...term }]));

  for (const candidate of input.candidates) {
    const existingTerm = termsBySourceTerm.get(candidate.term);

    if (existingTerm) {
      termsBySourceTerm.set(candidate.term, {
        ...existingTerm,
        occurrences: existingTerm.occurrences + candidate.count,
        lastSeenChapterId: input.chapterId,
        contexts: mergeContexts(existingTerm.contexts, candidate.contexts),
      });
      continue;
    }

    termsBySourceTerm.set(candidate.term, {
      bookId: input.bookId,
      sourceLanguage: input.sourceLanguage,
      targetLanguage: input.targetLanguage,
      sourceTerm: candidate.term,
      targetTerm: undefined,
      status: "pending",
      confidence: DEFAULT_PENDING_CONFIDENCE,
      occurrences: candidate.count,
      firstSeenChapterId: input.chapterId,
      lastSeenChapterId: input.chapterId,
      contexts: candidate.contexts,
    });
  }

  return [...termsBySourceTerm.values()];
}

export function confirmBookGlossaryTerm(
  term: BookGlossaryTerm,
  input: ConfirmBookGlossaryTermInput,
): BookGlossaryTerm {
  return {
    ...term,
    targetTerm: input.targetTerm,
    status: "confirmed",
    confidence: input.confidence ?? term.confidence,
  };
}

export function getRelevantGlossaryTermsForText(
  input: GetRelevantGlossaryTermsForTextInput,
): TranslationGlossaryTerm[] {
  return input.glossary
    .filter((term) => term.status === "confirmed")
    .filter((term) => Boolean(term.targetTerm))
    .filter((term) => input.text.includes(term.sourceTerm))
    .map((term) => ({
      sourceTerm: term.sourceTerm,
      targetTerm: term.targetTerm,
      note: "内部术语本",
    }));
}

export function assessGlossaryTermUsage(
  input: AssessGlossaryTermUsageInput,
): GlossaryTermUsageIssue[] {
  return input.glossary
    .filter((term) => term.status === "confirmed" && term.targetTerm)
    .filter((term) => input.sourceText.includes(term.sourceTerm))
    .filter((term) => !input.translatedText.includes(term.targetTerm as string))
    .map((term) => ({
      sourceTerm: term.sourceTerm,
      expectedTargetTerm: term.targetTerm as string,
      message: `原文出现术语“${term.sourceTerm}”，但译文未使用内部术语本译法“${term.targetTerm}”。`,
    }));
}

function mergeContexts(left: string[], right: string[]) {
  return [...new Set([...left, ...right])];
}
