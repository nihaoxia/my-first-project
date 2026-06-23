import type { TranslationGlossaryTerm } from "./terminology.ts";
import type { TranslationSegment } from "./translation-segments.ts";

export type TranslationProviderSegmentResult = {
  segmentId: string;
  index: number;
  translatedText: string;
};

export type TranslationProviderInput = {
  targetLanguage: string;
  style: string;
  webLookupEnabled: boolean;
  glossaryTerms: TranslationGlossaryTerm[];
  segments: TranslationSegment[];
};

export type TranslationProviderResult = {
  providerName: string;
  translations: TranslationProviderSegmentResult[];
};

export type TranslationProvider = {
  name: string;
  translateSegments(input: TranslationProviderInput): Promise<TranslationProviderResult>;
};

export function createFakeTranslationProvider(): TranslationProvider {
  return {
    name: "fake-local-provider",
    async translateSegments(input) {
      return {
        providerName: "fake-local-provider",
        translations: input.segments.map((segment) => ({
          segmentId: segment.id,
          index: segment.index,
          translatedText: `[Fake AI:${input.targetLanguage}] ${segment.text}`,
        })),
      };
    },
  };
}
