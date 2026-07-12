import assert from "node:assert/strict";
import test from "node:test";

import {
  executeTranslateSegmentsTool,
  toMcpToolResult,
  translateSegmentsWithGateway,
} from "../src/server/translation-mcp/translate-segments-tool.ts";
import type { OpenAiCompatibleGateway } from "../src/server/translation-mcp/openai-compatible-gateway.ts";

const validInput = {
  requestId: "request-1",
  sourceLanguage: "中文",
  targetLanguage: "英文" as const,
  style: "自然" as const,
  webLookupEnabled: false,
  glossaryTerms: [],
  segments: Array.from({ length: 5 }, (_, index) => ({
    id: `segment-${index}`,
    index,
    chapterId: "chapter-1",
    chapterTitle: "第一章",
    text: `原文 ${index}`,
  })),
};

test("limits provider concurrency and restores source order", async () => {
  let active = 0;
  let maxActive = 0;
  const gateway: OpenAiCompatibleGateway = {
    model: "translator-model",
    async translateSegment(input) {
      assert.equal(input.webLookupEnabled, false);
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, (5 - input.segment.index) * 2));
      active -= 1;
      return {
        ok: true,
        text: `Translation ${input.segment.index}`,
        inputTokens: 10,
        outputTokens: 4,
      };
    },
  };

  const result = await translateSegmentsWithGateway(validInput, gateway, 3);
  assert.equal(result.ok, true);
  assert.equal(maxActive, 3);
  assert.deepEqual(
    result.ok ? result.output.translations.map((item) => item.segmentId) : [],
    ["segment-0", "segment-1", "segment-2", "segment-3", "segment-4"],
  );
  assert.deepEqual(result.ok && result.output.usage, { inputTokens: 50, outputTokens: 20 });
});

test("rejects enabled web lookup before any gateway call", async () => {
  let calls = 0;
  const gateway: OpenAiCompatibleGateway = {
    model: "translator-model",
    async translateSegment(input) {
      void input;
      calls += 1;
      return { ok: true, text: "Translated", inputTokens: 1, outputTokens: 1 };
    },
  };
  const result = await translateSegmentsWithGateway({ ...validInput, webLookupEnabled: true }, gateway, 2);
  assert.equal(result.ok, false);
  assert.equal(!result.ok && result.error.code, "WEB_LOOKUP_UNAVAILABLE");
  assert.equal(calls, 0);
});

test("returns no partial chapter when one segment fails", async () => {
  const gateway: OpenAiCompatibleGateway = {
    model: "translator-model",
    async translateSegment(input) {
      return input.segment.index === 2
        ? {
            ok: false,
            error: {
              code: "PROVIDER_TIMEOUT",
              message: "模型响应超时，请稍后重试。",
              retryable: true,
            },
          }
        : { ok: true, text: "Translated", inputTokens: 1, outputTokens: 1 };
    },
  };

  assert.deepEqual(await translateSegmentsWithGateway(validInput, gateway), {
    ok: false,
    error: {
      code: "PROVIDER_TIMEOUT",
      message: "模型响应超时，请稍后重试。",
      retryable: true,
    },
  });
});

test("validates unknown tool arguments before calling the provider", async () => {
  let calls = 0;
  const gateway: OpenAiCompatibleGateway = {
    model: "translator-model",
    async translateSegment() {
      calls += 1;
      return { ok: true, text: "Translated", inputTokens: 1, outputTokens: 1 };
    },
  };

  const result = await executeTranslateSegmentsTool({ ...validInput, targetLanguage: "invalid" }, gateway);
  assert.equal(result.ok, false);
  assert.equal(calls, 0);
});

test("maps execution results to standard MCP content", async () => {
  const success = toMcpToolResult({
    ok: true,
    output: {
      requestId: "request-1",
      providerName: "openai-compatible",
      model: "translator-model",
      translations: [{ segmentId: "segment-1", index: 0, translatedText: "Translation" }],
      usage: { inputTokens: 1, outputTokens: 1 },
    },
  });
  assert.equal(success.isError, undefined);
  assert.equal(JSON.parse(success.content[0].text).requestId, "request-1");

  const failure = toMcpToolResult({
    ok: false,
    error: { code: "TRANSLATION_FAILED", message: "翻译失败，请稍后重试。", retryable: true },
  });
  assert.equal(failure.isError, true);
  assert.deepEqual(JSON.parse(failure.content[0].text), {
    code: "TRANSLATION_FAILED",
    message: "翻译失败，请稍后重试。",
    retryable: true,
  });
});
