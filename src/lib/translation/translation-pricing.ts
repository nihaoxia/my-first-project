export const TRANSLATION_PRICE_PER_STANDARD_UNIT_CENTS = 50;

const CJK_SOURCE_LANGUAGES = new Set(["中文", "日文", "韩文"]);

export type TranslationChapterForPricing = {
  id: string;
  title: string;
  characterCount: number;
  skipped?: boolean;
};

export type ChapterTranslationCostEstimate = {
  id: string;
  title: string;
  characterCount: number;
  standardUnits: number;
  baseCostCents: number;
};

export type TranslationSelectionCostInput = {
  chapters: TranslationChapterForPricing[];
  selectedChapterIds: string[];
  sourceLanguage: string;
  freeChaptersLeft: number;
};

export type TranslationSelectionCostSummary = {
  chapterEstimates: ChapterTranslationCostEstimate[];
  selectedChapterCount: number;
  skippedChapterCount: number;
  totalCharacterCount: number;
  totalStandardUnits: number;
  freeUnitsApplied: number;
  payableStandardUnits: number;
  baseCostCents: number;
  payableCostCents: number;
};

export function getStandardChapterCharacterLimit(sourceLanguage: string) {
  return CJK_SOURCE_LANGUAGES.has(sourceLanguage) ? 3000 : 6000;
}

export function estimateChapterTranslationCost(
  chapter: TranslationChapterForPricing & { sourceLanguage: string },
): ChapterTranslationCostEstimate {
  const standardChapterCharacterLimit = getStandardChapterCharacterLimit(chapter.sourceLanguage);
  const normalizedCharacterCount = Math.max(0, chapter.characterCount);
  const standardUnits =
    normalizedCharacterCount === 0 ? 0 : Math.max(1, Math.ceil(normalizedCharacterCount / standardChapterCharacterLimit));

  return {
    id: chapter.id,
    title: chapter.title,
    characterCount: normalizedCharacterCount,
    standardUnits,
    baseCostCents: standardUnits * TRANSLATION_PRICE_PER_STANDARD_UNIT_CENTS,
  };
}

export function estimateTranslationSelectionCost(
  input: TranslationSelectionCostInput,
): TranslationSelectionCostSummary {
  const selectedChapterIds = new Set(input.selectedChapterIds);
  const selectedChapters = input.chapters.filter((chapter) => selectedChapterIds.has(chapter.id) && !chapter.skipped);
  const skippedChapterCount = input.chapters.filter((chapter) => chapter.skipped).length;
  const chapterEstimates = selectedChapters.map((chapter) =>
    estimateChapterTranslationCost({
      ...chapter,
      sourceLanguage: input.sourceLanguage,
    }),
  );
  const totalCharacterCount = chapterEstimates.reduce((sum, estimate) => sum + estimate.characterCount, 0);
  const totalStandardUnits = chapterEstimates.reduce((sum, estimate) => sum + estimate.standardUnits, 0);
  const freeUnitsApplied = Math.min(Math.max(0, input.freeChaptersLeft), totalStandardUnits);
  const payableStandardUnits = totalStandardUnits - freeUnitsApplied;

  return {
    chapterEstimates,
    selectedChapterCount: selectedChapters.length,
    skippedChapterCount,
    totalCharacterCount,
    totalStandardUnits,
    freeUnitsApplied,
    payableStandardUnits,
    baseCostCents: totalStandardUnits * TRANSLATION_PRICE_PER_STANDARD_UNIT_CENTS,
    payableCostCents: payableStandardUnits * TRANSLATION_PRICE_PER_STANDARD_UNIT_CENTS,
  };
}
