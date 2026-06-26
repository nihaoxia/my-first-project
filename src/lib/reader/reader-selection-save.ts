export type ReaderSelectionCollectionKind = "vocabulary" | "sentence";

export type ReaderSelectionCollections = {
  vocabularyTexts: string[];
  sentenceTexts: string[];
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
