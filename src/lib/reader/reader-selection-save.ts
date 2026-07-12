export type ReaderSelectionCollectionKind = "vocabulary" | "sentence";

export const localReaderSelectionsStorageKey = "stray-pages.reader-selections";

export type ReaderSelectionCollections = {
  vocabularyTexts: string[];
  sentenceTexts: string[];
};

export type ReaderSelectionCollectionsParseResult =
  | {
      ok: true;
      status: "missing" | "ready";
      collections: ReaderSelectionCollections;
    }
  | {
      ok: false;
      reason: "malformed";
      collections: ReaderSelectionCollections;
    };

export type AddReaderSelectionResult = {
  status: "added" | "exists" | "empty";
  message: string;
  collections: ReaderSelectionCollections;
};

export function createEmptyReaderSelectionCollections(): ReaderSelectionCollections {
  return {
    vocabularyTexts: [],
    sentenceTexts: [],
  };
}

export function parseReaderSelectionCollectionsResult(
  rawValue: string | null,
): ReaderSelectionCollectionsParseResult {
  if (!rawValue) {
    return {
      ok: true,
      status: "missing",
      collections: createEmptyReaderSelectionCollections(),
    };
  }

  try {
    const parsed = JSON.parse(rawValue) as unknown;

    if (
      !parsed ||
      typeof parsed !== "object" ||
      !("vocabularyTexts" in parsed) ||
      !("sentenceTexts" in parsed) ||
      !Array.isArray(parsed.vocabularyTexts) ||
      !parsed.vocabularyTexts.every((item) => typeof item === "string") ||
      !Array.isArray(parsed.sentenceTexts) ||
      !parsed.sentenceTexts.every((item) => typeof item === "string")
    ) {
      return {
        ok: false,
        reason: "malformed",
        collections: createEmptyReaderSelectionCollections(),
      };
    }

    return {
      ok: true,
      status: "ready",
      collections: {
        vocabularyTexts: parsed.vocabularyTexts,
        sentenceTexts: parsed.sentenceTexts,
      },
    };
  } catch {
    return {
      ok: false,
      reason: "malformed",
      collections: createEmptyReaderSelectionCollections(),
    };
  }
}

export function prepareReaderSelectionSave(
  rawValue: string | null,
  kind: ReaderSelectionCollectionKind,
  selectedText: string,
):
  | { ok: false; reason: "malformed" }
  | {
      ok: true;
      addResult: AddReaderSelectionResult;
      serializedValue: string | null;
    } {
  const parseResult = parseReaderSelectionCollectionsResult(rawValue);

  if (!parseResult.ok) {
    return { ok: false, reason: parseResult.reason };
  }

  const addResult = addReaderSelectionToLocalCollection(
    parseResult.collections,
    kind,
    selectedText,
  );

  return {
    ok: true,
    addResult,
    serializedValue:
      addResult.status === "added" ? JSON.stringify(addResult.collections) : null,
  };
}

export function addReaderSelectionToLocalCollection(
  collections: ReaderSelectionCollections,
  kind: ReaderSelectionCollectionKind,
  selectedText: string,
): AddReaderSelectionResult {
  const text = selectedText.trim();

  if (!text) {
    return {
      status: "empty",
      message: "请先选择文本",
      collections,
    };
  }

  const key = kind === "vocabulary" ? "vocabularyTexts" : "sentenceTexts";
  const exists = collections[key].some((item) => item.toLowerCase() === text.toLowerCase());

  if (exists) {
    return {
      status: "exists",
      message: kind === "vocabulary" ? "已在词汇本" : "已在句子本",
      collections,
    };
  }

  return {
    status: "added",
    message: kind === "vocabulary" ? "已加入词汇本" : "已加入句子本",
    collections: {
      ...collections,
      [key]: [...collections[key], text],
    },
  };
}

export function removeReaderSelectionFromLocalCollection(
  collections: ReaderSelectionCollections,
  kind: ReaderSelectionCollectionKind,
  selectedText: string,
): ReaderSelectionCollections {
  const key = kind === "vocabulary" ? "vocabularyTexts" : "sentenceTexts";
  const normalizedText = selectedText.trim().toLowerCase();

  return {
    ...collections,
    [key]: collections[key].filter((item) => item.trim().toLowerCase() !== normalizedText),
  };
}
