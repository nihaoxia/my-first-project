import assert from "node:assert/strict";
import test from "node:test";

import {
  buildLocalSpeechSegments,
  createLocalSpeechController,
  getLocalSpeechLanguageTag,
  localSpeechUtteranceCodePointLimit,
  selectLocalSpeechVoice,
  type LocalSpeechRuntime,
  type LocalSpeechSnapshot,
  type LocalSpeechUtterance,
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

function createRuntime() {
  const spoken: LocalSpeechUtterance[] = [];
  const events: string[] = [];
  const runtime: LocalSpeechRuntime = {
    cancel() {
      events.push("cancel");
    },
    pause() {
      events.push("pause");
    },
    resume() {
      events.push("resume");
    },
    speak(utterance) {
      spoken.push(utterance);
      events.push(`speak:${utterance.text}`);
    },
  };

  return { events, runtime, spoken };
}

test("plays segments in order and keeps paragraph highlight across chunks", () => {
  const port = createRuntime();
  const snapshots: LocalSpeechSnapshot[] = [];
  const controller = createLocalSpeechController({
    runtime: port.runtime,
    onSnapshot(snapshot) {
      snapshots.push(snapshot);
    },
  });
  controller.setVoices([localVoice("Local", "en-US")], { final: true });
  controller.start({
    chapterId: "chapter-1",
    language: "英文",
    rate: 1,
    paragraphs: [{ index: 7, text: `${"a".repeat(1_200)}${"b".repeat(10)}` }],
  });

  assert.deepEqual(port.events.slice(0, 2), ["cancel", `speak:${"a".repeat(1_200)}`]);
  assert.equal(port.spoken.length, 1);
  assert.equal(controller.getSnapshot().status, "playing");
  assert.equal(controller.getSnapshot().activeParagraphIndex, 7);
  assert.equal(port.spoken[0].rate, 1);
  assert.equal(port.spoken[0].lang, "en");
  assert.equal(port.spoken[0].voice?.name, "Local");

  port.spoken[0].onEnd?.();
  assert.equal(port.spoken.length, 2);
  assert.equal(controller.getSnapshot().activeParagraphIndex, 7);

  port.spoken[1].onEnd?.();
  assert.deepEqual(controller.getSnapshot(), {
    status: "idle",
    activeParagraphIndex: null,
    notice: "本章朗读完成。",
  });
  assert.ok(snapshots.length >= 4);
});

test("pauses, resumes, stops, and ignores callbacks from an invalidated generation", () => {
  const port = createRuntime();
  const controller = createLocalSpeechController({
    runtime: port.runtime,
    onSnapshot() {},
  });
  controller.setVoices([localVoice("Local", "en-US")], { final: true });
  controller.start({
    chapterId: "one",
    language: "英文",
    rate: 1,
    paragraphs: [
      { index: 0, text: "First" },
      { index: 1, text: "Second" },
    ],
  });
  const staleEnd = port.spoken[0].onEnd;

  controller.pause();
  assert.equal(controller.getSnapshot().status, "paused");
  controller.resume();
  assert.equal(controller.getSnapshot().status, "playing");
  controller.stop();
  const spokenCount = port.spoken.length;
  staleEnd?.();

  assert.equal(port.spoken.length, spokenCount);
  assert.deepEqual(controller.getSnapshot(), {
    status: "idle",
    activeParagraphIndex: null,
    notice: "已停止朗读。",
  });
  assert.deepEqual(port.events.slice(0, 5), [
    "cancel",
    "speak:First",
    "pause",
    "resume",
    "cancel",
  ]);
});

test("restart and destroy invalidate old callbacks and destroy prevents notifications", () => {
  const port = createRuntime();
  let notificationCount = 0;
  const controller = createLocalSpeechController({
    runtime: port.runtime,
    onSnapshot() {
      notificationCount += 1;
    },
  });
  controller.setVoices([localVoice("Local", "en-US")], { final: true });
  controller.start({
    chapterId: "a",
    language: "英文",
    rate: 1,
    paragraphs: [{ index: 0, text: "A" }],
  });
  const oldEnd = port.spoken.at(-1)?.onEnd;
  controller.start({
    chapterId: "b",
    language: "英文",
    rate: 1,
    paragraphs: [{ index: 0, text: "B" }],
  });
  const currentEnd = port.spoken.at(-1)?.onEnd;
  const beforeStale = port.spoken.length;
  oldEnd?.();
  assert.equal(port.spoken.length, beforeStale);

  controller.destroy();
  const beforeDestroyedCallback = notificationCount;
  currentEnd?.();
  assert.equal(notificationCount, beforeDestroyedCallback);
  assert.equal(port.events.at(-1), "cancel");
});

test("completion invalidates every later callback from the finished utterance", () => {
  const port = createRuntime();
  const controller = createLocalSpeechController({
    runtime: port.runtime,
    onSnapshot() {},
  });
  controller.setVoices([localVoice("Local", "en")], { final: true });
  controller.start({
    chapterId: "complete",
    language: "英文",
    rate: 1,
    paragraphs: [{ index: 0, text: "Done" }],
  });
  const finishedUtterance = port.spoken[0];

  finishedUtterance.onEnd?.();
  assert.equal(controller.getSnapshot().notice, "本章朗读完成。");
  finishedUtterance.onError?.();

  assert.deepEqual(controller.getSnapshot(), {
    status: "idle",
    activeParagraphIndex: null,
    notice: "本章朗读完成。",
  });
});

test("keeps checking while voices load and fails closed without a local voice", () => {
  const port = createRuntime();
  const controller = createLocalSpeechController({
    runtime: port.runtime,
    onSnapshot() {},
  });

  assert.equal(controller.getSnapshot().status, "checking");
  controller.setVoices([], { final: false });
  assert.deepEqual(controller.getSnapshot(), {
    status: "checking",
    activeParagraphIndex: null,
    notice: "正在读取系统语音。",
  });
  controller.setVoices(
    [{ ...localVoice("Remote", "en"), localService: false }],
    { final: true },
  );
  assert.deepEqual(controller.getSnapshot(), {
    status: "unavailable",
    activeParagraphIndex: null,
    notice: "当前设备没有可用的本地系统语音。",
  });
  controller.start({
    chapterId: "one",
    language: "英文",
    rate: 1,
    paragraphs: [{ index: 0, text: "Never spoken" }],
  });
  assert.equal(port.spoken.length, 0);
});

test("uses a local fallback voice with a stable language mismatch notice", () => {
  const port = createRuntime();
  const controller = createLocalSpeechController({
    runtime: port.runtime,
    onSnapshot() {},
  });
  controller.setVoices([localVoice("German local", "de-DE", true)], { final: true });
  controller.start({
    chapterId: "one",
    language: "日文",
    rate: 1.25,
    paragraphs: [{ index: 5, text: "本文" }],
  });

  assert.deepEqual(controller.getSnapshot(), {
    status: "playing",
    activeParagraphIndex: 5,
    notice: "未找到与译本语言匹配的本地语音，已使用系统默认本地语音。",
  });
  assert.equal(port.spoken[0].voice?.name, "German local");
  assert.equal(port.spoken[0].lang, "ja");
  assert.equal(port.spoken[0].rate, 1.25);
});

test("rejects an empty chapter with a stable error", () => {
  const port = createRuntime();
  const controller = createLocalSpeechController({
    runtime: port.runtime,
    onSnapshot() {},
  });
  controller.setVoices([localVoice("Local", "en")], { final: true });
  controller.start({
    chapterId: "empty",
    language: "英文",
    rate: 1,
    paragraphs: [{ index: 0, text: "   " }],
  });

  assert.deepEqual(controller.getSnapshot(), {
    status: "error",
    activeParagraphIndex: null,
    notice: "当前章节没有可朗读的正文。",
  });
  assert.equal(port.spoken.length, 0);
});

test("maps synchronous and asynchronous speech failures to one stable error", () => {
  const errorSnapshot = {
    status: "error",
    activeParagraphIndex: null,
    notice: "无法使用本地语音朗读，请检查系统语音设置后重试。",
  } as const;
  const syncPort = createRuntime();
  syncPort.runtime.speak = () => {
    throw new Error("raw engine details");
  };
  const syncController = createLocalSpeechController({
    runtime: syncPort.runtime,
    onSnapshot() {},
  });
  syncController.setVoices([localVoice("Local", "en")], { final: true });
  syncController.start({
    chapterId: "sync",
    language: "英文",
    rate: 1,
    paragraphs: [{ index: 0, text: "Speak" }],
  });
  assert.deepEqual(syncController.getSnapshot(), errorSnapshot);

  const asyncPort = createRuntime();
  const asyncController = createLocalSpeechController({
    runtime: asyncPort.runtime,
    onSnapshot() {},
  });
  asyncController.setVoices([localVoice("Local", "en")], { final: true });
  asyncController.start({
    chapterId: "async",
    language: "英文",
    rate: 1,
    paragraphs: [{ index: 0, text: "Speak" }],
  });
  asyncPort.spoken[0].onError?.();
  assert.deepEqual(asyncController.getSnapshot(), errorSnapshot);
});
