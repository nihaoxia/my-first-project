import assert from "node:assert/strict";
import test from "node:test";

import {
  parseTranslateSegmentsInput,
  parseTranslateSegmentsOutput,
  parseTranslationChapterHttpResponse,
  parseTranslationServiceError,
} from "../src/lib/translation/mcp-contract.ts";

const validInput = {
  requestId: "request-1",
  sourceLanguage: "中文",
  targetLanguage: "英文",
  style: "自然",
  glossaryTerms: [{ sourceTerm: "黑桥", targetTerm: "Black Bridge", note: "地名" }],
  segments: [
    {
      id: "segment-1",
      index: 0,
      chapterId: "chapter-1",
      chapterTitle: "第一章",
      text: "雾越过了黑桥。",
    },
  ],
};

test("accepts a bounded MCP translation request", () => {
  const result = parseTranslateSegmentsInput(validInput);
  assert.equal(result.ok, true);
  assert.equal(result.ok && result.value.segments[0].id, "segment-1");
  assert.equal(result.ok && result.value.webLookupEnabled, false);
  const enabled = parseTranslateSegmentsInput({ ...validInput, webLookupEnabled: true });
  assert.equal(enabled.ok && enabled.value.webLookupEnabled, true);
});

test("rejects duplicate and oversized translation segments", () => {
  const duplicate = parseTranslateSegmentsInput({
    ...validInput,
    segments: [validInput.segments[0], validInput.segments[0]],
  });
  assert.equal(duplicate.ok, false);

  const oversized = parseTranslateSegmentsInput({
    ...validInput,
    segments: [{ ...validInput.segments[0], text: "字".repeat(1201) }],
  });
  assert.equal(oversized.ok, false);

  const tooMany = parseTranslateSegmentsInput({
    ...validInput,
    segments: Array.from({ length: 11 }, (_, index) => ({
      ...validInput.segments[0],
      id: `segment-${index}`,
      index,
    })),
  });
  assert.equal(tooMany.ok, false);
});

test("rejects unsupported target languages and excessive total text", () => {
  assert.equal(
    parseTranslateSegmentsInput({ ...validInput, targetLanguage: "克林贡语" }).ok,
    false,
  );

  const excessive = parseTranslateSegmentsInput({
    ...validInput,
    segments: Array.from({ length: 10 }, (_, index) => ({
      ...validInput.segments[0],
      id: `segment-${index}`,
      index,
      text: "字".repeat(1200),
    })),
    glossaryTerms: Array.from({ length: 101 }, (_, index) => ({ sourceTerm: `术语${index}` })),
  });
  assert.equal(excessive.ok, false);
});

test("accepts only provider output aligned with every source segment", () => {
  const validOutput = {
    requestId: "request-1",
    providerName: "openai-compatible",
    model: "translator-model",
    translations: [{ segmentId: "segment-1", index: 0, translatedText: "The mist crossed the Black Bridge." }],
    usage: { inputTokens: 30, outputTokens: 10 },
  };
  assert.equal(parseTranslateSegmentsOutput(validOutput, validInput.segments).ok, true);

  assert.deepEqual(
    parseTranslateSegmentsOutput(
      {
        ...validOutput,
        translations: [{ segmentId: "other", index: 0, translatedText: "Translation" }],
      },
      validInput.segments,
    ),
    {
      ok: false,
      code: "PROVIDER_RESPONSE_INVALID",
      message: "翻译服务返回的片段与请求不一致。",
    },
  );
  assert.equal(
    parseTranslateSegmentsOutput(
      { ...validOutput, translations: [{ segmentId: "segment-1", index: 0, translatedText: " " }] },
      validInput.segments,
    ).ok,
    false,
  );
});

test("parses only stable public translation errors", () => {
  assert.deepEqual(
    parseTranslationServiceError({
      code: "PROVIDER_TIMEOUT",
      message: "模型响应超时，请稍后重试。",
      retryable: true,
    }),
    {
      ok: true,
      value: {
        code: "PROVIDER_TIMEOUT",
        message: "模型响应超时，请稍后重试。",
        retryable: true,
      },
    },
  );
  assert.equal(
    parseTranslationServiceError({ code: "INTERNAL_STACK", message: "secret", retryable: true }).ok,
    false,
  );
});

test("rejects translated text over the 32 KiB UTF-8 contract limit", () => {
  const translatedText = "界".repeat(11_000);
  assert.equal(Buffer.byteLength(translatedText, "utf8") > 32 * 1024, true);
  assert.equal(parseTranslateSegmentsOutput({
    requestId: "request-1",
    providerName: "openai-compatible",
    model: "translator-model",
    translations: [{ segmentId: "segment-1", index: 0, translatedText }],
  }, validInput.segments).ok, false);
});

test("validates browser chapter responses against requested segment ids", () => {
  assert.equal(
    parseTranslationChapterHttpResponse(
      {
        ok: true,
        providerName: "openai-compatible",
        model: "translator-model",
        translations: [
          { segmentId: "segment-1", index: 0, translatedText: "The mist crossed the bridge." },
        ],
      },
      validInput.segments,
    ).ok,
    true,
  );
  assert.deepEqual(
    parseTranslationChapterHttpResponse(
      { ok: false, error: { code: "PROVIDER_TIMEOUT", message: "模型响应超时。", retryable: true } },
      validInput.segments,
    ),
    {
      ok: false,
      error: { code: "PROVIDER_TIMEOUT", message: "模型响应超时。", retryable: true },
    },
  );
  assert.equal(
    parseTranslationChapterHttpResponse(
      {
        ok: true,
        providerName: "openai-compatible",
        model: "translator-model",
        translations: [{ segmentId: "wrong", index: 0, translatedText: "Wrong" }],
      },
      validInput.segments,
    ).ok,
    false,
  );
});
