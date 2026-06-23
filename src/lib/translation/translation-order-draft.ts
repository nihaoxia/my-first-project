import type { MockAccountInput } from "../account/mock-account-summary.ts";
import { applyMockBalanceHold, canCreateMockBalanceHold } from "../account/mock-balance-operations.ts";
import {
  DEFAULT_TRANSLATION_STYLE,
  type SupportedTargetLanguage,
  isSupportedTargetLanguage,
} from "./translation-options.ts";
import {
  TRANSLATION_PRICE_PER_STANDARD_UNIT_CENTS,
  type TranslationChapterForPricing,
  type TranslationSelectionCostSummary,
  estimateTranslationSelectionCost,
} from "./translation-pricing.ts";

export type TranslationOrderDraftInput = {
  userId: string;
  originalBookId: string;
  sourceLanguage: string;
  targetLanguage: string;
  webLookupEnabled: boolean;
  account: MockAccountInput;
  chapters: TranslationChapterForPricing[];
  selectedChapterIds: string[];
};

export type TranslationDraft = {
  userId: string;
  originalBookId: string;
  targetLanguage: SupportedTargetLanguage;
  webLookupEnabled: boolean;
  style: typeof DEFAULT_TRANSLATION_STYLE;
  status: "queued";
};

export type TranslationTaskDraft = {
  chapterId: string;
  chapterTitle: string;
  status: "queued";
  standardUnits: number;
  baseCostCents: number;
  freeUnitsApplied: number;
  frozenCents: number;
};

export type TranslationOrderDraftResult =
  | {
      ok: true;
      translation: TranslationDraft;
      tasks: TranslationTaskDraft[];
      pricing: TranslationSelectionCostSummary;
      accountAfterHold: MockAccountInput;
    }
  | {
      ok: false;
      reason: "no-selected-chapters" | "unsupported-target-language";
    }
  | {
      ok: false;
      reason: "insufficient-balance";
      availableCents: number;
      requiredCents: number;
    };

export function buildTranslationOrderDraft(input: TranslationOrderDraftInput): TranslationOrderDraftResult {
  if (!isSupportedTargetLanguage(input.targetLanguage)) {
    return {
      ok: false,
      reason: "unsupported-target-language",
    };
  }

  const pricing = estimateTranslationSelectionCost({
    chapters: input.chapters,
    selectedChapterIds: input.selectedChapterIds,
    sourceLanguage: input.sourceLanguage,
    freeChaptersLeft: input.account.freeChaptersLeft,
  });

  if (pricing.selectedChapterCount === 0) {
    return {
      ok: false,
      reason: "no-selected-chapters",
    };
  }

  const holdDecision = canCreateMockBalanceHold(input.account, pricing.payableCostCents);

  if (!holdDecision.ok) {
    return {
      ok: false,
      reason: "insufficient-balance",
      availableCents: holdDecision.availableCents,
      requiredCents: pricing.payableCostCents,
    };
  }

  const accountAfterHold = {
    ...applyMockBalanceHold(input.account, pricing.payableCostCents),
    freeChaptersLeft: Math.max(0, input.account.freeChaptersLeft - pricing.freeUnitsApplied),
  };

  return {
    ok: true,
    translation: {
      userId: input.userId,
      originalBookId: input.originalBookId,
      targetLanguage: input.targetLanguage,
      webLookupEnabled: input.webLookupEnabled,
      style: DEFAULT_TRANSLATION_STYLE,
      status: "queued",
    },
    tasks: buildTaskDrafts(pricing),
    pricing,
    accountAfterHold,
  };
}

function buildTaskDrafts(pricing: TranslationSelectionCostSummary): TranslationTaskDraft[] {
  let freeUnitsRemaining = pricing.freeUnitsApplied;

  return pricing.chapterEstimates.map((estimate) => {
    const freeUnitsApplied = Math.min(freeUnitsRemaining, estimate.standardUnits);
    freeUnitsRemaining -= freeUnitsApplied;
    const payableUnits = estimate.standardUnits - freeUnitsApplied;

    return {
      chapterId: estimate.id,
      chapterTitle: estimate.title,
      status: "queued",
      standardUnits: estimate.standardUnits,
      baseCostCents: estimate.baseCostCents,
      freeUnitsApplied,
      frozenCents: payableUnits * TRANSLATION_PRICE_PER_STANDARD_UNIT_CENTS,
    };
  });
}
