export const localSpeechRates = [0.75, 1, 1.25, 1.5] as const;
export type LocalSpeechRate = (typeof localSpeechRates)[number];

export const localSpeechUtteranceCodePointLimit = 1_200;

export type LocalSpeechVoice = {
  name: string;
  lang: string;
  default: boolean;
  localService: boolean;
  native: unknown;
};

export type LocalSpeechParagraph = {
  index: number;
  text: string;
};

export type LocalSpeechSegment = {
  paragraphIndex: number;
  text: string;
};

const languageTags: Record<string, string> = {
  中文: "zh-CN",
  英文: "en",
  日文: "ja",
  韩文: "ko",
  俄语: "ru",
  德语: "de",
  西班牙语: "es",
  法语: "fr",
};

const preferredBoundaries = new Set(["。", "！", "？", "!", "?", "；", ";", "：", ":", "\n"]);

export function getLocalSpeechLanguageTag(language: string | undefined) {
  return language ? languageTags[language.trim()] : undefined;
}

export function selectLocalSpeechVoice(voices: LocalSpeechVoice[], language?: string) {
  const localVoices = voices
    .filter((voice) => voice.localService === true)
    .slice()
    .sort((left, right) => left.name.localeCompare(right.name, "en"));
  const normalizedLanguage = normalizeLanguageTag(language);

  if (normalizedLanguage) {
    const exact = localVoices.find(
      (voice) => normalizeLanguageTag(voice.lang) === normalizedLanguage,
    );

    if (exact) {
      return { voice: exact, languageMatched: true };
    }

    const primaryLanguage = normalizedLanguage.split("-")[0];
    const primary = localVoices.find(
      (voice) => normalizeLanguageTag(voice.lang)?.split("-")[0] === primaryLanguage,
    );

    if (primary) {
      return { voice: primary, languageMatched: true };
    }
  }

  const fallback = localVoices.find((voice) => voice.default) ?? localVoices[0];
  return { voice: fallback, languageMatched: false };
}

export function buildLocalSpeechSegments(
  paragraphs: LocalSpeechParagraph[],
): LocalSpeechSegment[] {
  const segments: LocalSpeechSegment[] = [];

  for (const paragraph of paragraphs) {
    let remaining = Array.from(paragraph.text.trim());

    while (remaining.length > localSpeechUtteranceCodePointLimit) {
      const window = remaining.slice(0, localSpeechUtteranceCodePointLimit);
      const minimumBoundaryIndex = Math.floor(localSpeechUtteranceCodePointLimit / 2);
      const punctuationIndex = findBoundaryIndex(
        window,
        minimumBoundaryIndex,
        (character) => preferredBoundaries.has(character),
      );
      const whitespaceIndex = findBoundaryIndex(
        window,
        minimumBoundaryIndex,
        (character) => /\s/u.test(character),
      );
      const splitIndex =
        (punctuationIndex >= 0 ? punctuationIndex : whitespaceIndex) + 1 ||
        localSpeechUtteranceCodePointLimit;

      segments.push({
        paragraphIndex: paragraph.index,
        text: remaining.slice(0, splitIndex).join(""),
      });
      remaining = remaining.slice(splitIndex);
    }

    if (remaining.length > 0) {
      segments.push({ paragraphIndex: paragraph.index, text: remaining.join("") });
    }
  }

  return segments;
}

function normalizeLanguageTag(language: string | undefined) {
  const normalized = language?.trim().replace(/_/gu, "-").toLowerCase();
  return normalized || undefined;
}

function findBoundaryIndex(
  characters: string[],
  minimumIndex: number,
  matches: (character: string) => boolean,
) {
  for (let index = characters.length - 1; index >= minimumIndex; index -= 1) {
    if (matches(characters[index])) {
      return index;
    }
  }

  return -1;
}
