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

export type LocalSpeechRequest = {
  chapterId: string;
  language?: string;
  rate: LocalSpeechRate;
  paragraphs: LocalSpeechParagraph[];
};

export type LocalSpeechStatus =
  | "checking"
  | "idle"
  | "playing"
  | "paused"
  | "unavailable"
  | "error";

export type LocalSpeechSnapshot = {
  status: LocalSpeechStatus;
  activeParagraphIndex: number | null;
  notice: string;
};

export type LocalSpeechUtterance = {
  text: string;
  lang: string;
  rate: LocalSpeechRate;
  voice?: LocalSpeechVoice;
  onEnd?: () => void;
  onError?: () => void;
};

export type LocalSpeechRuntime = {
  cancel(): void;
  pause(): void;
  resume(): void;
  speak(utterance: LocalSpeechUtterance): void;
};

export type LocalSpeechController = {
  setVoices(voices: LocalSpeechVoice[], options?: { final?: boolean }): void;
  start(request: LocalSpeechRequest): void;
  pause(): void;
  resume(): void;
  stop(): void;
  destroy(): void;
  getSnapshot(): LocalSpeechSnapshot;
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
const checkingNotice = "正在读取系统语音。";
const unavailableNotice = "当前设备没有可用的本地系统语音。";
const emptyChapterNotice = "当前章节没有可朗读的正文。";
const playbackErrorNotice = "无法使用本地语音朗读，请检查系统语音设置后重试。";
const languageFallbackNotice = "未找到与译本语言匹配的本地语音，已使用系统默认本地语音。";

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

export function createLocalSpeechController(input: {
  runtime: LocalSpeechRuntime;
  onSnapshot(snapshot: LocalSpeechSnapshot): void;
}): LocalSpeechController {
  let destroyed = false;
  let generation = 0;
  let voices: LocalSpeechVoice[] = [];
  let queue: LocalSpeechSegment[] = [];
  let cursor = 0;
  let sessionVoice: LocalSpeechVoice | undefined;
  let sessionLanguage = "";
  let sessionRate: LocalSpeechRate = 1;
  let sessionNotice = "";
  let snapshot: LocalSpeechSnapshot = {
    status: "checking",
    activeParagraphIndex: null,
    notice: checkingNotice,
  };

  function publish(next: LocalSpeechSnapshot) {
    snapshot = next;

    if (!destroyed) {
      input.onSnapshot({ ...snapshot });
    }
  }

  function cancelRuntime() {
    try {
      input.runtime.cancel();
    } catch {
      // Cancellation is best-effort after the generation has already been invalidated.
    }
  }

  function invalidate() {
    generation += 1;
    queue = [];
    cursor = 0;
    sessionVoice = undefined;
    cancelRuntime();
  }

  function fail(activeGeneration: number) {
    if (destroyed || activeGeneration !== generation) {
      return;
    }

    invalidate();
    publish({
      status: "error",
      activeParagraphIndex: null,
      notice: playbackErrorNotice,
    });
  }

  function speakNext(activeGeneration: number) {
    if (destroyed || activeGeneration !== generation) {
      return;
    }

    const segment = queue[cursor];

    if (!segment) {
      generation += 1;
      queue = [];
      cursor = 0;
      sessionVoice = undefined;
      publish({ status: "idle", activeParagraphIndex: null, notice: "本章朗读完成。" });
      return;
    }

    const utterance: LocalSpeechUtterance = {
      text: segment.text,
      lang: sessionLanguage,
      rate: sessionRate,
      voice: sessionVoice,
      onEnd() {
        if (destroyed || activeGeneration !== generation) {
          return;
        }

        cursor += 1;
        speakNext(activeGeneration);
      },
      onError() {
        fail(activeGeneration);
      },
    };

    publish({
      status: "playing",
      activeParagraphIndex: segment.paragraphIndex,
      notice: sessionNotice,
    });

    try {
      input.runtime.speak(utterance);
    } catch {
      fail(activeGeneration);
    }
  }

  return {
    setVoices(nextVoices, options = {}) {
      if (destroyed) {
        return;
      }

      voices = nextVoices.slice();

      if (snapshot.status === "playing" || snapshot.status === "paused") {
        return;
      }

      const hasLocalVoice = voices.some((voice) => voice.localService === true);

      if (hasLocalVoice) {
        publish({ status: "idle", activeParagraphIndex: null, notice: "" });
      } else if (options.final) {
        publish({
          status: "unavailable",
          activeParagraphIndex: null,
          notice: unavailableNotice,
        });
      } else {
        publish({
          status: "checking",
          activeParagraphIndex: null,
          notice: checkingNotice,
        });
      }
    },
    start(request) {
      if (destroyed) {
        return;
      }

      invalidate();
      const segments = buildLocalSpeechSegments(request.paragraphs);

      if (segments.length === 0) {
        publish({ status: "error", activeParagraphIndex: null, notice: emptyChapterNotice });
        return;
      }

      const language = getLocalSpeechLanguageTag(request.language);
      const selection = selectLocalSpeechVoice(voices, language);

      if (!selection.voice) {
        publish({
          status: "unavailable",
          activeParagraphIndex: null,
          notice: unavailableNotice,
        });
        return;
      }

      queue = segments;
      cursor = 0;
      sessionVoice = selection.voice;
      sessionLanguage = language ?? selection.voice.lang.trim();
      sessionRate = request.rate;
      sessionNotice = language && !selection.languageMatched ? languageFallbackNotice : "";
      speakNext(generation);
    },
    pause() {
      if (destroyed || snapshot.status !== "playing") {
        return;
      }

      try {
        input.runtime.pause();
        publish({ ...snapshot, status: "paused" });
      } catch {
        fail(generation);
      }
    },
    resume() {
      if (destroyed || snapshot.status !== "paused") {
        return;
      }

      try {
        input.runtime.resume();
        publish({ ...snapshot, status: "playing" });
      } catch {
        fail(generation);
      }
    },
    stop() {
      if (destroyed) {
        return;
      }

      invalidate();
      publish({ status: "idle", activeParagraphIndex: null, notice: "已停止朗读。" });
    },
    destroy() {
      if (destroyed) {
        return;
      }

      generation += 1;
      destroyed = true;
      queue = [];
      cursor = 0;
      sessionVoice = undefined;
      snapshot = { status: "idle", activeParagraphIndex: null, notice: "" };
      cancelRuntime();
    },
    getSnapshot() {
      return { ...snapshot };
    },
  };
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
