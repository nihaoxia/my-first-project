import assert from "node:assert/strict";
import test from "node:test";

import { parseTranslationMcpServerConfig } from "../src/server/translation-mcp/config.ts";
import { createOpenAiCompatibleGateway } from "../src/server/translation-mcp/openai-compatible-gateway.ts";

const validConfig = {
  aiBaseUrl: "https://example.test/v1",
  aiApiKey: "test-key",
  aiModel: "translator-model",
  aiRequestTimeoutMs: 20_000,
};

const validRequest = {
  sourceLanguage: "中文",
  targetLanguage: "英文" as const,
  style: "自然" as const,
  webLookupEnabled: false,
  glossaryTerms: [{ sourceTerm: "黑桥", targetTerm: "Black Bridge" }],
  segment: {
    id: "segment-1",
    index: 0,
    chapterId: "chapter-1",
    chapterTitle: "第一章",
    text: "雾越过了黑桥。",
  },
};

test("validates MCP server environment without exposing secrets", () => {
  const result = parseTranslationMcpServerConfig({
    MCP_TRANSLATION_PORT: "8787",
    TRANSLATION_MCP_SECRET: "x".repeat(32),
    AI_BASE_URL: "https://example.test/v1/",
    AI_API_KEY: "private-key",
    AI_MODEL: "translator-model",
    AI_REQUEST_TIMEOUT_MS: "60000",
  });
  assert.equal(result.ok, true);
  assert.equal(result.ok && result.value.aiBaseUrl, "https://example.test/v1");
  assert.equal(result.ok && result.value.port, 8787);

  const invalid = parseTranslationMcpServerConfig({ AI_API_KEY: "private-key" });
  assert.deepEqual(invalid, {
    ok: false,
    message: "翻译 MCP 服务配置不完整或格式无效。",
  });
});

test("AI gateway URL policy requires production HTTPS and development loopback HTTP", () => {
  const base = { TRANSLATION_MCP_SECRET: "x".repeat(32), AI_API_KEY: "private", AI_MODEL: "m" };
  assert.equal(parseTranslationMcpServerConfig({ ...base, NODE_ENV: "production", AI_BASE_URL: "http://ai.example.com/v1", MCP_TRUSTED_HOSTS: "mcp.example.com" }).ok, false);
  assert.equal(parseTranslationMcpServerConfig({ ...base, NODE_ENV: "production", AI_BASE_URL: "https://ai.example.com/v1", MCP_TRUSTED_HOSTS: "mcp.example.com" }).ok, true);
  assert.equal(parseTranslationMcpServerConfig({ ...base, NODE_ENV: "development", AI_BASE_URL: "http://127.0.0.1:11434/v1" }).ok, true);
  assert.equal(parseTranslationMcpServerConfig({ ...base, NODE_ENV: "development", AI_BASE_URL: "http://ai.example.com/v1" }).ok, false);
});

test("production requires explicit normalized trusted MCP hosts", () => {
  const base = { NODE_ENV: "production", TRANSLATION_MCP_SECRET: "x".repeat(32), AI_BASE_URL: "https://ai.example.com/v1", AI_API_KEY: "private", AI_MODEL: "m" };
  assert.equal(parseTranslationMcpServerConfig(base).ok, false);
  const parsed = parseTranslationMcpServerConfig({ ...base, MCP_TRUSTED_HOSTS: "mcp.example.com, api.example.com" });
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.ok && parsed.value.trustedHosts, ["mcp.example.com", "api.example.com"]);
  assert.equal(parseTranslationMcpServerConfig({ ...base, MCP_TRUSTED_HOSTS: "https://mcp.example.com" }).ok, false);
});

test("rejects web lookup before contacting a gateway that has no search tool", async () => {
  let calls = 0;
  const gateway = createOpenAiCompatibleGateway(validConfig, async () => {
    calls += 1;
    return new Response(JSON.stringify({ choices: [{ message: { content: "Translated" } }] }));
  });
  assert.equal((await gateway.translateSegment(validRequest)).ok, true);
  const rejected = await gateway.translateSegment({ ...validRequest, webLookupEnabled: true });
  assert.equal(rejected.ok, false);
  assert.equal(!rejected.ok && rejected.error.code, "WEB_LOOKUP_UNAVAILABLE");
  assert.equal(calls, 1);
});

test("rejects chunked upstream responses over six MiB before JSON parsing", async () => {
  const huge = JSON.stringify({ choices: [{ message: { content: "x".repeat(6 * 1024 * 1024) } }] });
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let offset = 0; offset < huge.length; offset += 64 * 1024) controller.enqueue(new TextEncoder().encode(huge.slice(offset, offset + 64 * 1024)));
      controller.close();
    },
  });
  const gateway = createOpenAiCompatibleGateway(validConfig, async () => new Response(body, { status: 200 }));
  const result = await gateway.translateSegment(validRequest);
  assert.equal(result.ok, false);
  assert.equal(!result.ok && result.error.code, "PROVIDER_RESPONSE_INVALID");
});

test("rejects an oversized declared Content-Length without consuming the body", async () => {
  let readerRequested = false;
  let canceled = false;
  const response = {
    status: 200,
    ok: true,
    headers: new Headers({ "content-length": String(6 * 1024 * 1024 + 1) }),
    body: { getReader() { readerRequested = true; throw new Error("body must not be read"); }, async cancel() { canceled = true; } },
  } as unknown as Response;
  const gateway = createOpenAiCompatibleGateway(validConfig, async () => response);
  const result = await gateway.translateSegment(validRequest);
  assert.equal(result.ok, false);
  assert.equal(!result.ok && result.error.code, "PROVIDER_RESPONSE_INVALID");
  assert.equal(readerRequested, false);
  assert.equal(canceled, true);
});

test("returns translated content and usage from a compatible response", async () => {
  let requestUrl = "";
  let authorization = "";
  const gateway = createOpenAiCompatibleGateway(validConfig, async (input, init) => {
    requestUrl = String(input);
    authorization = new Headers(init?.headers).get("authorization") ?? "";
    return new Response(
      JSON.stringify({
        choices: [{ message: { content: "The mist crossed the Black Bridge." } }],
        usage: { prompt_tokens: 20, completion_tokens: 8 },
      }),
      { status: 200 },
    );
  });

  const result = await gateway.translateSegment(validRequest);
  assert.deepEqual(result, {
    ok: true,
    text: "The mist crossed the Black Bridge.",
    inputTokens: 20,
    outputTokens: 8,
  });
  assert.equal(requestUrl, "https://example.test/v1/chat/completions");
  assert.equal(authorization, "Bearer test-key");
});

test("removes one surrounding markdown fence without changing translation text", async () => {
  const gateway = createOpenAiCompatibleGateway(validConfig, async () =>
    new Response(JSON.stringify({ choices: [{ message: { content: "```text\nTranslated text.\n```" } }] })),
  );
  const result = await gateway.translateSegment(validRequest);
  assert.equal(result.ok && result.text, "Translated text.");
});

test("maps rate limits and invalid responses to stable errors", async () => {
  const limited = createOpenAiCompatibleGateway(validConfig, async () =>
    new Response("provider quota details", { status: 429 }),
  );
  assert.deepEqual(await limited.translateSegment(validRequest), {
    ok: false,
    error: {
      code: "PROVIDER_RATE_LIMITED",
      message: "模型服务当前请求过多，请稍后重试。",
      retryable: true,
    },
  });

  const invalid = createOpenAiCompatibleGateway(validConfig, async () =>
    new Response(JSON.stringify({ choices: [] }), { status: 200 }),
  );
  assert.deepEqual(await invalid.translateSegment(validRequest), {
    ok: false,
    error: {
      code: "PROVIDER_RESPONSE_INVALID",
      message: "模型服务没有返回有效译文，请重试或更换模型。",
      retryable: true,
    },
  });
});

test("maps aborts to a timeout without leaking the upstream error", async () => {
  const gateway = createOpenAiCompatibleGateway(validConfig, async () => {
    throw new DOMException("upstream-secret", "AbortError");
  });
  assert.deepEqual(await gateway.translateSegment(validRequest), {
    ok: false,
    error: {
      code: "PROVIDER_TIMEOUT",
      message: "模型响应超时，请稍后重试。",
      retryable: true,
    },
  });
});

test("forwards caller cancellation to the upstream model request", async () => {
  const controller = new AbortController();
  let receivedSignal: AbortSignal | null | undefined;
  const gateway = createOpenAiCompatibleGateway(validConfig, async (_input, init) => {
    receivedSignal = init?.signal;
    return await new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("cancelled", "AbortError")));
    });
  });

  const pending = gateway.translateSegment({ ...validRequest, signal: controller.signal });
  controller.abort();
  const result = await pending;

  assert.equal(receivedSignal?.aborted, true);
  assert.equal(result.ok, false);
  assert.equal(!result.ok && result.error.code, "PROVIDER_TIMEOUT");
});
