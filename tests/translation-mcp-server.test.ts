import assert from "node:assert/strict";
import test from "node:test";
import type { AddressInfo } from "node:net";
import { request as httpRequest } from "node:http";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { createMcpTranslationProvider, McpTranslationProviderError } from "../src/lib/translation/mcp-translation-provider.ts";

import {
  createIdempotentMcpCleanup,
  createTranslationMcpHttpApp,
} from "../src/server/translation-mcp/server.ts";

const secret = "mcp-test-secret-that-is-at-least-32-characters";
const validInput = {
  requestId: "request-1",
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

test("serves health without exposing model configuration", async (context) => {
  const running = await startTestServer();
  context.after(() => running.close());

  const response = await fetch(`${running.origin}/health`);
  assert.equal(response.status, 200);
  const body = await response.text();
  assert.deepEqual(JSON.parse(body), { status: "ok", configured: true });
  assert.equal(body.includes("secret"), false);
});

test("allows only explicitly trusted Host header names", async (context) => {
  const running = await startTestServer(["mcp.example.test"]);
  context.after(() => running.close());
  assert.equal((await requestWithHost(running.origin, "mcp.example.test")).status, 200);
  const rejected = await requestWithHost(running.origin, "evil.example.test");
  assert.equal(rejected.status, 403);
  assert.equal(rejected.body.includes(secret), false);
});

test("rejects MCP requests without the shared bearer secret", async (context) => {
  const running = await startTestServer();
  context.after(() => running.close());

  const response = await fetch(`${running.origin}/mcp`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
  });
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "Unauthorized" });
});

test("authenticates before parsing or buffering an MCP request body", async (context) => {
  const running = await startTestServer();
  context.after(() => running.close());

  const malformed = await fetch(`${running.origin}/mcp`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{\"jsonrpc\":",
  });
  assert.equal(malformed.status, 401);
  assert.equal(malformed.headers.get("content-type")?.includes("application/json"), true);
  assert.deepEqual(await malformed.json(), { error: "Unauthorized" });

  const oversized = await fetch(`${running.origin}/mcp`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ padding: "x".repeat(300 * 1024) }),
  });
  assert.equal(oversized.status, 401);
  assert.deepEqual(await oversized.json(), { error: "Unauthorized" });
});

test("returns bounded JSON errors for authenticated malformed and oversized bodies", async (context) => {
  const running = await startTestServer();
  context.after(() => running.close());
  const headers = {
    authorization: `Bearer ${secret}`,
    "content-type": "application/json",
  };

  const malformed = await fetch(`${running.origin}/mcp`, {
    method: "POST",
    headers,
    body: "{\"jsonrpc\":",
  });
  assert.equal(malformed.status, 400);
  const malformedBody = await malformed.text();
  assert.equal(malformed.headers.get("content-type")?.includes("application/json"), true);
  assert.equal(malformedBody.includes("SyntaxError"), false);
  assert.equal(malformedBody.includes("Stray Pages"), false);

  const oversized = await fetch(`${running.origin}/mcp`, {
    method: "POST",
    headers,
    body: JSON.stringify({ padding: "x".repeat(300 * 1024) }),
  });
  assert.equal(oversized.status, 413);
  const oversizedBody = await oversized.text();
  assert.equal(oversized.headers.get("content-type")?.includes("application/json"), true);
  assert.equal(oversizedBody.includes("PayloadTooLargeError"), false);
  assert.equal(oversizedBody.includes("Stray Pages"), false);
});

test("lists and calls translate_segments through Streamable HTTP", async (context) => {
  const running = await startTestServer();
  context.after(() => running.close());
  const transport = new StreamableHTTPClientTransport(new URL(`${running.origin}/mcp`), {
    requestInit: { headers: { authorization: `Bearer ${secret}` } },
  });
  const client = new Client({ name: "translation-mcp-test", version: "1.0.0" });
  context.after(async () => client.close());

  await client.connect(transport);
  const tools = await client.listTools();
  assert.equal(tools.tools.some((tool) => tool.name === "translate_segments"), true);

  const result = await client.request(
    { method: "tools/call", params: { name: "translate_segments", arguments: validInput } },
    CallToolResultSchema,
  );
  assert.equal(result.isError, undefined);
  const textContent = result.content.find((item) => item.type === "text");
  assert.ok(textContent && textContent.type === "text");
  assert.equal(JSON.parse(textContent.text).translations[0].translatedText, "Translated segment 1");
});

test("the real SDK transport rejects oversized MCP tool responses before parsing", async (context) => {
  const running = await startTestServer(undefined, () => "x".repeat(6 * 1024 * 1024));
  context.after(() => running.close());
  const provider = createMcpTranslationProvider({ url: `${running.origin}/mcp`, secret, timeoutMs: 10_000 });
  await assert.rejects(provider.translateSegments({
    sourceLanguage: "中文",
    targetLanguage: "英文",
    style: "自然",
    webLookupEnabled: false,
    glossaryTerms: [],
    segments: [{ id: "segment-1", index: 0, chapterId: "chapter-1", chapterTitle: "第一章", text: "原文", characterCount: 2 }],
  }), (error: unknown) => error instanceof McpTranslationProviderError && error.code === "PROVIDER_RESPONSE_INVALID" && !error.message.includes("x".repeat(100)));
});

test("returns method and path boundaries", async (context) => {
  const running = await startTestServer();
  context.after(() => running.close());

  assert.equal((await fetch(`${running.origin}/mcp`)).status, 405);
  assert.equal((await fetch(`${running.origin}/missing`)).status, 404);
});

test("closes MCP protocol resources exactly once across disconnect and finally paths", async () => {
  let closeCalls = 0;
  const cleanup = createIdempotentMcpCleanup(async () => {
    closeCalls += 1;
  });

  await Promise.all([cleanup(), cleanup(), cleanup()]);
  assert.equal(closeCalls, 1);
});

async function startTestServer(trustedHosts?: string[], translatedText?: () => string) {
  const app = createTranslationMcpHttpApp({
    secret,
    trustedHosts,
    async execute(input) {
      return {
        ok: true as const,
        output: {
          requestId: input.requestId,
          providerName: "openai-compatible" as const,
          model: "test-model",
          translations: input.segments.map((segment) => ({
            segmentId: segment.id,
            index: segment.index,
            translatedText: translatedText?.() ?? `Translated segment ${segment.index + 1}`,
          })),
          usage: { inputTokens: 10, outputTokens: 5 },
        },
      };
    },
  });
  const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });
  const address = server.address() as AddressInfo;

  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((error?: Error) => (error ? reject(error) : resolve())),
      ),
  };
}

async function requestWithHost(origin: string, host: string) {
  return await new Promise<{ status: number; body: string }>((resolve, reject) => {
    const request = httpRequest(`${origin}/health`, { headers: { host } }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { body += chunk; });
      response.on("end", () => resolve({ status: response.statusCode ?? 0, body }));
    });
    request.on("error", reject);
    request.end();
  });
}
