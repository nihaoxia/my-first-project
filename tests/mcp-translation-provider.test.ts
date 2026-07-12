import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import {
  McpTranslationProviderError,
  createMcpTranslationProvider,
  createBoundedMcpFetch,
  parseMcpTranslationClientConfig,
  type McpClientAdapter,
} from "../src/lib/translation/mcp-translation-provider.ts";
import { BATCH_EXECUTION_LEASE_MS, TRANSLATION_LEASE_MS } from "../src/lib/cloud/translations-core.ts";

const providerInput = {
  sourceLanguage: "中文",
  targetLanguage: "英文",
  style: "自然",
  webLookupEnabled: false,
  glossaryTerms: [],
  segments: [
    {
      id: "chapter-1-segment-1",
      index: 0,
      chapterId: "chapter-1",
      chapterTitle: "第一章",
      text: "雾越过了黑桥。",
      characterCount: 8,
    },
  ],
};

test("parses only complete server-side MCP client configuration", () => {
  assert.deepEqual(
    parseMcpTranslationClientConfig({
      TRANSLATION_MCP_URL: "http://127.0.0.1:8787/mcp",
      TRANSLATION_MCP_SECRET: "x".repeat(32),
    }),
    {
      ok: true,
      value: {
        url: "http://127.0.0.1:8787/mcp",
        secret: "x".repeat(32),
        timeoutMs: 180_000,
      },
    },
  );
  assert.deepEqual(parseMcpTranslationClientConfig({}), {
    ok: false,
    code: "MCP_NOT_CONFIGURED",
    message: "翻译 MCP 服务尚未配置。",
  });
});

test("production requires HTTPS while development HTTP is loopback-only", () => {
  const base = { TRANSLATION_MCP_SECRET: "x".repeat(32) };
  assert.equal(parseMcpTranslationClientConfig({ ...base, NODE_ENV: "production", TRANSLATION_MCP_URL: "http://mcp.example.com/mcp" }).ok, false);
  assert.equal(parseMcpTranslationClientConfig({ ...base, NODE_ENV: "production", TRANSLATION_MCP_URL: "https://mcp.example.com/mcp" }).ok, true);
  assert.equal(parseMcpTranslationClientConfig({ ...base, NODE_ENV: "development", TRANSLATION_MCP_URL: "http://127.0.0.1:8787/mcp" }).ok, true);
  assert.equal(parseMcpTranslationClientConfig({ ...base, NODE_ENV: "development", TRANSLATION_MCP_URL: "http://mcp.example.com/mcp" }).ok, false);
});

test("connect is bounded by the provider deadline and never reaches callTool after timeout", async () => {
  let calls = 0;
  const adapter: McpClientAdapter = {
    async connect() { await new Promise((resolve) => setTimeout(resolve, 200)); },
    async callTool() { calls += 1; throw new Error("must not run"); },
    async close() {},
  };
  const provider = createMcpTranslationProvider({ url: "http://127.0.0.1:8787/mcp", secret: "x".repeat(32), timeoutMs: 25 }, () => adapter);
  const started = Date.now();
  await assert.rejects(provider.translateSegments(providerInput), (error: unknown) => error instanceof McpTranslationProviderError && error.code === "PROVIDER_TIMEOUT");
  const elapsed = Date.now() - started;
  assert.equal(elapsed < 150, true);
  await new Promise((resolve) => setTimeout(resolve, 220));
  assert.equal(calls, 0);
});

test("maximum provider deadline expires before route, batch, and attempt leases", () => {
  const maximum = parseMcpTranslationClientConfig({ TRANSLATION_MCP_URL: "https://mcp.example.test/mcp", TRANSLATION_MCP_SECRET: "x".repeat(32), TRANSLATION_MCP_TIMEOUT_MS: "300000" });
  assert.equal(maximum.ok, true);
  const route = readFileSync("src/app/api/cloud/translations/[translationId]/tasks/[taskId]/route.ts", "utf8");
  const routeSeconds = Number(route.match(/maxDuration\s*=\s*(\d+)/)?.[1]);
  assert.equal(maximum.ok && maximum.value.timeoutMs < routeSeconds * 1_000, true);
  assert.equal(routeSeconds * 1_000 < BATCH_EXECUTION_LEASE_MS, true);
  assert.equal(BATCH_EXECUTION_LEASE_MS < TRANSLATION_LEASE_MS, true);
  assert.equal(parseMcpTranslationClientConfig({ TRANSLATION_MCP_URL: "https://mcp.example.test/mcp", TRANSLATION_MCP_SECRET: "x".repeat(32), TRANSLATION_MCP_TIMEOUT_MS: "300001" }).ok, false);
});

test("caller cancellation during connect prevents every provider call", async () => {
  let calls = 0;
  const adapter: McpClientAdapter = {
    async connect() { await new Promise((resolve) => setTimeout(resolve, 200)); },
    async callTool() { calls += 1; throw new Error("must not run"); },
    async close() {},
  };
  const controller = new AbortController();
  const provider = createMcpTranslationProvider({ url: "http://127.0.0.1:8787/mcp", secret: "x".repeat(32), timeoutMs: 1_000 }, () => adapter);
  const pending = provider.translateSegments({ ...providerInput, signal: controller.signal });
  setTimeout(() => controller.abort(), 10);
  await assert.rejects(pending, (error: unknown) => error instanceof McpTranslationProviderError && error.code === "PROVIDER_TIMEOUT");
  assert.equal(calls, 0);
});

test("close is best-effort and cannot extend the total provider deadline", async () => {
  const adapter = createFakeAdapter({ content: [{ type: "text", text: JSON.stringify({ requestId: "close-deadline", providerName: "openai-compatible", model: "m", translations: [{ segmentId: "chapter-1-segment-1", index: 0, translatedText: "ok" }] }) }] });
  adapter.close = async () => await new Promise<void>(() => undefined);
  const provider = createMcpTranslationProvider({ url: "http://127.0.0.1:8787/mcp", secret: "x".repeat(32), timeoutMs: 30 }, () => adapter, () => "close-deadline");
  const started = Date.now();
  await provider.translateSegments(providerInput);
  assert.equal(Date.now() - started < 120, true);
});

test("an MCP transport byte-limit error is sanitized as an invalid provider response", async () => {
  const adapter: McpClientAdapter = {
    async connect() {},
    async callTool() { throw Object.assign(new Error("huge raw secret body"), { code: "UPSTREAM_TOO_LARGE" }); },
    async close() {},
  };
  const provider = createMcpTranslationProvider({ url: "http://127.0.0.1:8787/mcp", secret: "x".repeat(32), timeoutMs: 1_000 }, () => adapter);
  await assert.rejects(provider.translateSegments(providerInput), (error: unknown) => error instanceof McpTranslationProviderError && error.code === "PROVIDER_RESPONSE_INVALID" && !error.message.includes("secret"));
});

test("callTool receives only the remaining total deadline after connect", async () => {
  let callTimeout = 0;
  const adapter: McpClientAdapter = {
    async connect() { await new Promise((resolve) => setTimeout(resolve, 25)); },
    async callTool(_input, timeoutMs) {
      callTimeout = timeoutMs ?? 0;
      return { content: [{ type: "text", text: JSON.stringify({ requestId: "deadline", providerName: "openai-compatible", model: "m", translations: [{ segmentId: "chapter-1-segment-1", index: 0, translatedText: "ok" }] }) }] };
    },
    async close() {},
  };
  const provider = createMcpTranslationProvider({ url: "http://127.0.0.1:8787/mcp", secret: "x".repeat(32), timeoutMs: 80 }, () => adapter, () => "deadline");
  await provider.translateSegments(providerInput);
  assert.equal(callTimeout > 0 && callTimeout < 70, true);
});

test("bounded MCP fetch rejects chunked and declared oversized POST responses", async () => {
  const chunked = createBoundedMcpFetch(5, async () => new Response(new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(3)); controller.enqueue(new Uint8Array(3)); controller.close(); } })));
  const chunkedResponse = await chunked("http://127.0.0.1/mcp", { method: "POST" });
  await assert.rejects(chunkedResponse.text(), (error: unknown) => typeof error === "object" && error !== null && "code" in error && error.code === "UPSTREAM_TOO_LARGE");

  let canceled = false;
  const declared = createBoundedMcpFetch(5, async () => new Response(new ReadableStream<Uint8Array>({ cancel() { canceled = true; } }), { headers: { "content-length": "6" } }));
  await assert.rejects(declared("http://127.0.0.1/mcp", { method: "POST" }), (error: unknown) => typeof error === "object" && error !== null && "code" in error && error.code === "UPSTREAM_TOO_LARGE");
  assert.equal(canceled, true);
});

test("calls translate_segments and closes the MCP client", async () => {
  const adapter = createFakeAdapter({
    content: [
      {
        type: "text",
        text: JSON.stringify({
          requestId: "request-test",
          providerName: "openai-compatible",
          model: "translator-model",
          translations: [
            { segmentId: "chapter-1-segment-1", index: 0, translatedText: "The mist crossed the Black Bridge." },
          ],
          usage: { inputTokens: 20, outputTokens: 8 },
        }),
      },
    ],
  });
  const provider = createMcpTranslationProvider(
    { url: "http://127.0.0.1:8787/mcp", secret: "x".repeat(32), timeoutMs: 10_000 },
    () => adapter,
    () => "request-test",
  );

  const controller = new AbortController();
  const result = await provider.translateSegments({ ...providerInput, signal: controller.signal });
  assert.equal(adapter.connected, true);
  assert.equal(adapter.closed, true);
  assert.equal(adapter.lastCall?.name, "translate_segments");
  assert.equal(adapter.lastCall?.arguments.sourceLanguage, "中文");
  assert.equal(adapter.lastCall?.arguments.webLookupEnabled, false);
  assert.notEqual(adapter.lastSignal, controller.signal);
  assert.equal(adapter.lastSignal?.aborted, false);
  controller.abort();
  assert.equal(adapter.lastSignal?.aborted, true);
  assert.deepEqual(result, {
    providerName: "openai-compatible",
    model: "translator-model",
    usage: { inputTokens: 20, outputTokens: 8 },
    translations: [
      { segmentId: "chapter-1-segment-1", index: 0, translatedText: "The mist crossed the Black Bridge." },
    ],
  });
});

test("rejects enabled web lookup before connecting to MCP", async () => {
  let calls = 0;
  const adapter = createFakeAdapter({
    content: [{ type: "text", text: JSON.stringify({
      requestId: "request-web",
      providerName: "openai-compatible",
      model: "translator-model",
      translations: [{ segmentId: "chapter-1-segment-1", index: 0, translatedText: "Translation" }],
    }) }],
  });
  const provider = createMcpTranslationProvider(
    { url: "http://127.0.0.1:8787/mcp", secret: "x".repeat(32), timeoutMs: 10_000 },
    () => adapter,
    () => "request-web",
  );
  const originalConnect = adapter.connect;
  adapter.connect = async () => { calls += 1; await originalConnect(); };
  await assert.rejects(provider.translateSegments({ ...providerInput, webLookupEnabled: true }), (error: unknown) => error instanceof McpTranslationProviderError && error.code === "WEB_LOOKUP_UNAVAILABLE");
  assert.equal(calls, 0);
  assert.equal(adapter.lastCall, undefined);
});

test("total deadline stops callTool even when an adapter ignores signal and never settles", async () => {
  let closeCalls = 0;
  const adapter: McpClientAdapter = {
    async connect() {},
    async callTool() { return await new Promise<never>(() => undefined); },
    async close() { closeCalls += 1; },
  };
  const provider = createMcpTranslationProvider({ url: "http://127.0.0.1:8787/mcp", secret: "x".repeat(32), timeoutMs: 30 }, () => adapter);
  const started = Date.now();
  await assert.rejects(provider.translateSegments(providerInput), (error: unknown) => error instanceof McpTranslationProviderError && error.code === "PROVIDER_TIMEOUT");
  assert.equal(Date.now() - started < 120, true);
  assert.equal(closeCalls, 1);
});

test("a connect that resolves after timeout is closed again and never calls the provider", async () => {
  let providerCalls = 0;
  let closeCalls = 0;
  const adapter: McpClientAdapter = {
    async connect() { await new Promise((resolve) => setTimeout(resolve, 80)); },
    async callTool() { providerCalls += 1; throw new Error("must not run"); },
    async close() { closeCalls += 1; },
  };
  const provider = createMcpTranslationProvider({ url: "http://127.0.0.1:8787/mcp", secret: "x".repeat(32), timeoutMs: 25 }, () => adapter);
  await assert.rejects(provider.translateSegments(providerInput), (error: unknown) => error instanceof McpTranslationProviderError && error.code === "PROVIDER_TIMEOUT");
  assert.equal(closeCalls >= 1, true);
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(closeCalls, 2);
  assert.equal(providerCalls, 0);
});

test("rejects invalid MCP output and still closes the client", async () => {
  const adapter = createFakeAdapter({ content: [{ type: "text", text: "not-json" }] });
  const provider = createMcpTranslationProvider(
    { url: "http://127.0.0.1:8787/mcp", secret: "x".repeat(32), timeoutMs: 10_000 },
    () => adapter,
  );

  await assert.rejects(
    provider.translateSegments(providerInput),
    (error: unknown) =>
      error instanceof McpTranslationProviderError && error.code === "PROVIDER_RESPONSE_INVALID",
  );
  assert.equal(adapter.closed, true);
});

test("preserves stable MCP tool errors without exposing raw responses", async () => {
  const adapter = createFakeAdapter({
    isError: true,
    content: [
      {
        type: "text",
        text: JSON.stringify({
          code: "PROVIDER_RATE_LIMITED",
          message: "模型服务当前请求过多，请稍后重试。",
          retryable: true,
        }),
      },
    ],
  });
  const provider = createMcpTranslationProvider(
    { url: "http://127.0.0.1:8787/mcp", secret: "x".repeat(32), timeoutMs: 10_000 },
    () => adapter,
  );

  await assert.rejects(
    provider.translateSegments(providerInput),
    (error: unknown) =>
      error instanceof McpTranslationProviderError &&
      error.code === "PROVIDER_RATE_LIMITED" &&
      error.retryable,
  );
});

function createFakeAdapter(result: unknown) {
  const adapter: McpClientAdapter & {
    connected: boolean;
    closed: boolean;
    lastCall?: { name: string; arguments: Record<string, unknown> };
    lastSignal?: AbortSignal;
  } = {
    connected: false,
    closed: false,
    async connect() {
      adapter.connected = true;
    },
    async callTool(input, _timeoutMs, signal) {
      adapter.lastCall = input;
      adapter.lastSignal = signal;
      return result;
    },
    async close() {
      adapter.closed = true;
    },
  };
  return adapter;
}
