import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("src/components/reader/local-speech-controls.tsx", "utf8");

test("adapts browser speech locally and cleans up every listener and session", () => {
  assert.match(source, /^"use client";/u);
  assert.match(source, /createLocalSpeechController/u);
  assert.match(source, /window\.speechSynthesis/u);
  assert.match(source, /typeof SpeechSynthesisUtterance !== "function"/u);
  assert.match(source, /new SpeechSynthesisUtterance/u);
  assert.match(source, /localService/u);
  assert.match(source, /addEventListener\("voiceschanged"/u);
  assert.match(source, /removeEventListener\("voiceschanged"/u);
  assert.match(source, /controller\.destroy\(\)/u);
  assert.match(source, /useEffectEvent/u);
  assert.match(source, /queueMicrotask/u);
  assert.match(source, /notifyActiveParagraph\(null\)/u);
  assert.doesNotMatch(source, /onActiveParagraphChangeRef\.current\s*=/u);
});

test("renders accessible playback controls and four fixed rates", () => {
  assert.match(source, /朗读本章/u);
  assert.match(source, /暂停朗读/u);
  assert.match(source, /继续朗读/u);
  assert.match(source, /停止朗读/u);
  assert.match(source, /正在读取系统语音/u);
  assert.match(source, /localSpeechRates\.map/u);
  assert.match(source, /aria-live="polite"/u);
  assert.match(
    source,
    /snapshot\.status === "error" \|\| snapshot\.status === "unavailable"/u,
  );
  assert.match(source, /aria-pressed/u);
});

test("contains no network, cloud, model, filesystem, or audio persistence path", () => {
  assert.doesNotMatch(
    source,
    /fetch\s*\(|XMLHttpRequest|WebSocket|edgeone|BlobStore|models?|node:fs|localStorage|indexedDB|MediaRecorder/iu,
  );
});
