import assert from "node:assert/strict";
import test from "node:test";

import {
  buildLocalSpeechSegments,
  getLocalSpeechLanguageTag,
  localSpeechUtteranceCodePointLimit,
  selectLocalSpeechVoice,
  type LocalSpeechVoice,
} from "../src/lib/reader/local-speech-core.ts";

function localVoice(name: string, lang: string, isDefault = false): LocalSpeechVoice {
  return {
    name,
    lang,
    default: isDefault,
    localService: true,
    native: { name },
  };
}

test("maps supported product languages to browser speech language tags", () => {
  assert.deepEqual(
    ["中文", "英文", "日文", "韩文", "俄语", "德语", "西班牙语", "法语", "未知"].map(
      getLocalSpeechLanguageTag,
    ),
    ["zh-CN", "en", "ja", "ko", "ru", "de", "es", "fr", undefined],
  );
  assert.equal(getLocalSpeechLanguageTag(undefined), undefined);
});

test("selects only local voices by exact, primary, default, then stable name order", () => {
  const remoteExact = {
    ...localVoice("Remote exact", "en-US"),
    localService: false,
  };
  const voices = [
    remoteExact,
    localVoice("Zulu", "fr-FR"),
    localVoice("English UK", "en_GB"),
    localVoice("Default local", "de-DE", true),
  ];

  assert.deepEqual(selectLocalSpeechVoice(voices, "en-GB"), {
    voice: voices[2],
    languageMatched: true,
  });
  assert.deepEqual(selectLocalSpeechVoice(voices, "en-US"), {
    voice: voices[2],
    languageMatched: true,
  });
  assert.deepEqual(selectLocalSpeechVoice(voices, "ja"), {
    voice: voices[3],
    languageMatched: false,
  });
  assert.deepEqual(selectLocalSpeechVoice([remoteExact], "en-US"), {
    voice: undefined,
    languageMatched: false,
  });
  assert.equal(
    selectLocalSpeechVoice(
      [localVoice("Zulu", "fr"), localVoice("Alpha", "de")],
      undefined,
    ).voice?.name,
    "Alpha",
  );
});

test("splits long paragraphs by Unicode code points and preserves paragraph indexes", () => {
  const text = `${"甲".repeat(700)}。${"😀".repeat(700)}`;
  const segments = buildLocalSpeechSegments([
    { index: 4, text: "   " },
    { index: 9, text },
  ]);

  assert.equal(segments.length, 2);
  assert.deepEqual(
    segments.map((segment) => segment.paragraphIndex),
    [9, 9],
  );
  assert.ok(
    segments.every(
      (segment) => Array.from(segment.text).length <= localSpeechUtteranceCodePointLimit,
    ),
  );
  assert.equal(
    segments.map((segment) => segment.text).join(""),
    text,
  );
});

test("prefers sentence punctuation, then whitespace, then a hard code-point split", () => {
  const punctuation = `${"甲".repeat(700)}。${"乙".repeat(700)}`;
  const whitespace = `${"a".repeat(800)} ${"b".repeat(500)}`;
  const hard = "😀".repeat(1_201);

  const punctuationParts = buildLocalSpeechSegments([{ index: 1, text: punctuation }]);
  const whitespaceParts = buildLocalSpeechSegments([{ index: 2, text: whitespace }]);
  const hardParts = buildLocalSpeechSegments([{ index: 3, text: hard }]);

  assert.equal(punctuationParts[0].text.endsWith("。"), true);
  assert.equal(whitespaceParts[0].text.endsWith(" "), true);
  assert.equal(Array.from(hardParts[0].text).length, 1_200);
  assert.equal(
    punctuationParts.map((part) => part.text).join(""),
    punctuation,
  );
  assert.equal(
    whitespaceParts.map((part) => part.text).join(""),
    whitespace,
  );
  assert.equal(
    hardParts.map((part) => part.text).join(""),
    hard,
  );
});
