export type SelectionLookupCardInput = {
  selectedText: string;
  addedToVocabulary: boolean;
};

export type SelectionLookupCard = {
  term: string;
  phonetic: string;
  explanation: string;
  pronunciationLabel: string;
  vocabularyActionLabel: string;
};

const knownLookupEntries: Record<string, { phonetic: string; explanation: string }> = {
  threshold: {
    phonetic: "/ˈθreʃ.hoʊld/",
    explanation: "门槛；临界点；也可表示进入某个状态前的边界。",
  },
  mist: {
    phonetic: "/mɪst/",
    explanation: "薄雾；雾气。小说里也常用来表现遮蔽、迟疑或未知感。",
  },
  lamp: {
    phonetic: "/læmp/",
    explanation: "灯；灯具。这里可理解为人物在雾中确认方向的线索。",
  },
  border: {
    phonetic: "/ˈbɔːr.dɚ/",
    explanation: "边界；边境；也可指故事中两个空间或状态的分界。",
  },
};

export function buildSelectionLookupCard(input: SelectionLookupCardInput): SelectionLookupCard {
  const term = normalizeSelectedText(input.selectedText);
  const lookupKey = term.toLowerCase();
  const knownEntry = knownLookupEntries[lookupKey];
  const isSingleWord = /^[a-zA-Z'-]+$/.test(term);

  return {
    term,
    phonetic: knownEntry?.phonetic ?? (isSingleWord ? "音标待补充" : "短语"),
    explanation:
      knownEntry?.explanation ??
      (isSingleWord
        ? "可结合所在句子的动作、情绪和前后搭配理解这个词。"
        : "选中的短语可先看核心动词和前后搭配，再结合上下文理解。"),
    pronunciationLabel: "播放读音",
    vocabularyActionLabel: input.addedToVocabulary ? "已加入词汇本" : "加入词汇本",
  };
}

function normalizeSelectedText(text: string) {
  return text.replace(/\s+/g, " ").trim();
}
