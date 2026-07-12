import assert from "node:assert/strict";
import test from "node:test";

import { McpTranslationProviderError } from "../src/lib/translation/mcp-translation-provider.ts";
import {
  createTranslationRequestLocks,
  handleTranslateChapter,
  handleTranslationCapabilities,
} from "../src/lib/translation/translation-api-service.ts";
import type { TranslationProvider } from "../src/lib/translation/translation-provider.ts";

const env = {
  TRANSLATION_MCP_URL: "http://127.0.0.1:8787/mcp",
  TRANSLATION_MCP_SECRET: "x".repeat(32),
};
const body = {
  sourceLanguage: "中文",
  targetLanguage: "英文",
  style: "自然",
  glossaryTerms: [],
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

test("rejects unauthenticated, cross-origin, and invalid translation requests", async () => {
  const base = {
    body,
    sessionScope: "user-scope",
    origin: "http://localhost:3000",
    appUrl: "http://localhost:3000",
    env,
    providerFactory: () => successfulProvider(),
  };
  assert.equal((await handleTranslateChapter({ ...base, sessionScope: null })).status, 401);
  assert.equal((await handleTranslateChapter({ ...base, origin: "https://evil.example" })).status, 403);
  assert.equal(
    (await handleTranslateChapter({ ...base, body: { ...body, segments: [] } })).status,
    400,
  );
});

test("returns MCP translations without exposing server configuration", async () => {
  const controller = new AbortController();
  let receivedSignal: AbortSignal | undefined;
  const result = await handleTranslateChapter({
    body,
    sessionScope: "user-scope",
    origin: "http://localhost:3000",
    appUrl: "http://localhost:3000",
    env,
    signal: controller.signal,
    providerFactory: () => ({
      name: "success",
      async translateSegments(input) {
        receivedSignal = input.signal;
        return successfulResult();
      },
    }),
  });
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, {
    ok: true,
    providerName: "openai-compatible",
    model: "translator-model",
    usage: { inputTokens: 20, outputTokens: 8 },
    translations: [{ segmentId: "segment-1", index: 0, translatedText: "Translation" }],
  });
  assert.equal(JSON.stringify(result.body).includes("8787"), false);
  assert.equal(JSON.stringify(result.body).includes("xxxx"), false);
  assert.equal(receivedSignal, controller.signal);
});

test("prevents concurrent chapter requests for one account and releases the lock", async () => {
  const locks = createTranslationRequestLocks();
  let release: (() => void) | undefined;
  const waitingProvider: TranslationProvider = {
    name: "waiting",
    async translateSegments() {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return successfulResult();
    },
  };
  const input = {
    body,
    sessionScope: "same-user",
    origin: "http://localhost:3000",
    appUrl: "http://localhost:3000",
    env,
    locks,
    providerFactory: () => waitingProvider,
  };
  const first = handleTranslateChapter(input);
  await new Promise((resolve) => setTimeout(resolve, 0));
  const second = await handleTranslateChapter(input);
  assert.equal(second.status, 409);
  release?.();
  assert.equal((await first).status, 200);
  assert.equal(locks.has("same-user"), false);
});

test("maps stable provider errors to HTTP without leaking raw failures", async () => {
  const result = await handleTranslateChapter({
    body,
    sessionScope: "user-scope",
    origin: "http://localhost:3000",
    appUrl: "http://localhost:3000",
    env,
    providerFactory: () => ({
      name: "failed",
      async translateSegments() {
        throw new McpTranslationProviderError(
          "PROVIDER_RATE_LIMITED",
          "模型服务当前请求过多，请稍后重试。",
          true,
        );
      },
    }),
  });
  assert.deepEqual(result, {
    status: 429,
    body: {
      ok: false,
      error: {
        code: "PROVIDER_RATE_LIMITED",
        message: "模型服务当前请求过多，请稍后重试。",
        retryable: true,
      },
    },
  });
});

test("reports configured and available MCP capability without revealing its URL", async () => {
  assert.deepEqual(
    await handleTranslationCapabilities({
      sessionScope: "user-scope",
      env,
      probe: async () => true,
    }),
    {
      status: 200,
      body: { configured: true, available: true, message: "翻译 MCP 服务已就绪。" },
    },
  );
  assert.equal((await handleTranslationCapabilities({ sessionScope: null, env })).status, 401);
  assert.deepEqual(await handleTranslationCapabilities({ sessionScope: "user-scope", env: {} }), {
    status: 200,
    body: { configured: false, available: false, message: "翻译 MCP 服务尚未配置。" },
  });
});

function successfulProvider(): TranslationProvider {
  return { name: "success", async translateSegments() { return successfulResult(); } };
}

function successfulResult() {
  return {
    providerName: "openai-compatible",
    model: "translator-model",
    usage: { inputTokens: 20, outputTokens: 8 },
    translations: [{ segmentId: "segment-1", index: 0, translatedText: "Translation" }],
  };
}
