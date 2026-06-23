export type TranslationSegment = {
  id: string;
  index: number;
  chapterId: string;
  chapterTitle: string;
  text: string;
  characterCount: number;
};

export type SplitChapterIntoTranslationSegmentsInput = {
  chapterId: string;
  chapterTitle: string;
  text: string;
  maxCharactersPerSegment?: number;
};

const DEFAULT_MAX_CHARACTERS_PER_SEGMENT = 1200;
const PARAGRAPH_SEPARATOR = "\n\n";

export function splitChapterIntoTranslationSegments(
  input: SplitChapterIntoTranslationSegmentsInput,
): TranslationSegment[] {
  const maxCharactersPerSegment =
    input.maxCharactersPerSegment ?? DEFAULT_MAX_CHARACTERS_PER_SEGMENT;
  const paragraphs = splitIntoCleanParagraphs(input.text);
  const segmentTexts: string[] = [];
  let currentSegment = "";

  for (const paragraph of paragraphs) {
    if (paragraph.length > maxCharactersPerSegment) {
      if (currentSegment.length > 0) {
        segmentTexts.push(currentSegment);
        currentSegment = "";
      }

      segmentTexts.push(...splitLongParagraph(paragraph, maxCharactersPerSegment));
      continue;
    }

    const nextSegment =
      currentSegment.length === 0
        ? paragraph
        : `${currentSegment}${PARAGRAPH_SEPARATOR}${paragraph}`;

    if (nextSegment.length > maxCharactersPerSegment && currentSegment.length > 0) {
      segmentTexts.push(currentSegment);
      currentSegment = paragraph;
      continue;
    }

    currentSegment = nextSegment;
  }

  if (currentSegment.length > 0) {
    segmentTexts.push(currentSegment);
  }

  return segmentTexts.map((text, index) => ({
    id: `${input.chapterId}-segment-${index + 1}`,
    index,
    chapterId: input.chapterId,
    chapterTitle: input.chapterTitle,
    text,
    characterCount: text.length,
  }));
}

function splitIntoCleanParagraphs(text: string) {
  return text
    .split(/\n\s*\n/g)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

function splitLongParagraph(paragraph: string, maxCharactersPerSegment: number) {
  const chunks: string[] = [];

  for (let index = 0; index < paragraph.length; index += maxCharactersPerSegment) {
    chunks.push(paragraph.slice(index, index + maxCharactersPerSegment));
  }

  return chunks;
}
