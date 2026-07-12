import { randomUUID } from "node:crypto";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { isAllowedServerHttpUrl } from "../security/server-url-policy.ts";

import {
  parseTranslateSegmentsOutput,
  parseTranslationServiceError,
  type TranslationServiceErrorCode,
} from "./mcp-contract.ts";
import type { TranslationProvider } from "./translation-provider.ts";

const clientConfigSchema = z.object({
  NODE_ENV: z.string().optional(),
  TRANSLATION_MCP_URL: z.url(),
  TRANSLATION_MCP_SECRET: z.string().min(32),
  TRANSLATION_MCP_TIMEOUT_MS: z.coerce.number().int().min(5_000).max(300_000).default(180_000),
});

export type McpTranslationClientConfig = {
  url: string;
  secret: string;
  timeoutMs: number;
};

export type McpClientAdapter = {
  connect(): Promise<void>;
  callTool(
    input: { name: string; arguments: Record<string, unknown> },
    timeoutMs?: number,
    signal?: AbortSignal,
  ): Promise<unknown>;
  close(): Promise<void>;
};

export class McpTranslationProviderError extends Error {
  readonly code: TranslationServiceErrorCode;
  readonly retryable: boolean;

  constructor(code: TranslationServiceErrorCode, message: string, retryable: boolean) {
    super(message);
    this.name = "McpTranslationProviderError";
    this.code = code;
    this.retryable = retryable;
  }
}

class McpDeadlineError extends Error {}
class McpResponseTooLargeError extends Error { readonly code = "UPSTREAM_TOO_LARGE"; }

export function parseMcpTranslationClientConfig(
  env: Record<string, string | undefined>,
):
  | { ok: true; value: McpTranslationClientConfig }
  | { ok: false; code: "MCP_NOT_CONFIGURED"; message: string } {
  const result = clientConfigSchema.safeParse(env);

  if (result.success && !isAllowedServerHttpUrl(result.data.TRANSLATION_MCP_URL, result.data.NODE_ENV)) {
    return { ok: false, code: "MCP_NOT_CONFIGURED", message: "翻译 MCP 服务尚未配置。" };
  }

  return result.success
    ? {
        ok: true,
        value: {
          url: result.data.TRANSLATION_MCP_URL,
          secret: result.data.TRANSLATION_MCP_SECRET,
          timeoutMs: result.data.TRANSLATION_MCP_TIMEOUT_MS,
        },
      }
    : { ok: false, code: "MCP_NOT_CONFIGURED", message: "翻译 MCP 服务尚未配置。" };
}

export function createMcpTranslationProvider(
  config: McpTranslationClientConfig,
  adapterFactory: (config: McpTranslationClientConfig) => McpClientAdapter = createSdkMcpClientAdapter,
  requestIdFactory: () => string = randomUUID,
): TranslationProvider {
  return {
    name: "openai-compatible",
    async translateSegments(input) {
      if (input.webLookupEnabled) {
        throw new McpTranslationProviderError("WEB_LOOKUP_UNAVAILABLE", "Web lookup is not available for this translation provider.", false);
      }
      const startedAt = Date.now();
      const deadlineAt = startedAt + config.timeoutMs;
      const deadlineController = new AbortController();
      const deadlineTimer = setTimeout(() => deadlineController.abort(), config.timeoutMs);
      const signal = input.signal ? AbortSignal.any([input.signal, deadlineController.signal]) : deadlineController.signal;
      const requestId = requestIdFactory();
      const adapter = adapterFactory(config);
      const connectPromise = Promise.resolve().then(() => adapter.connect());

      try {
        try {
          await withinDeadline(connectPromise, Math.min(30_000, remaining(deadlineAt)), signal);
        } catch (error) {
          if (error instanceof McpDeadlineError || signal.aborted) {
            void connectPromise.then(
              () => boundedClose(adapter, 5_000),
              () => boundedClose(adapter, 5_000),
            ).catch(() => undefined);
          }
          throw error;
        }
        const callTimeout = remaining(deadlineAt);
        if (callTimeout <= 0) throw new McpDeadlineError();
        const callToolPromise = adapter.callTool(
          {
            name: "translate_segments",
            arguments: {
              requestId,
              sourceLanguage: input.sourceLanguage ?? "自动识别",
              targetLanguage: input.targetLanguage,
              style: input.style,
              webLookupEnabled: input.webLookupEnabled,
              glossaryTerms: input.glossaryTerms,
              segments: input.segments.map((segment) => ({
                id: segment.id,
                index: segment.index,
                chapterId: segment.chapterId,
                chapterTitle: segment.chapterTitle,
                text: segment.text,
              })),
            },
          },
          callTimeout,
          signal,
        );
        const toolResult = await withinDeadline(callToolPromise, callTimeout, signal);
        const content = readTextToolContent(toolResult);

        if (!content) {
          throw invalidProviderResponse();
        }

        const payload = safeParseJson(content.text);

        if (content.isError) {
          const errorResult = parseTranslationServiceError(payload);
          if (!errorResult.ok) {
            throw invalidProviderResponse();
          }
          throw new McpTranslationProviderError(
            errorResult.value.code,
            errorResult.value.message,
            errorResult.value.retryable,
          );
        }

        const outputResult = parseTranslateSegmentsOutput(payload, input.segments);
        if (!outputResult.ok || outputResult.value.requestId !== requestId) {
          throw invalidProviderResponse();
        }

        return {
          providerName: outputResult.value.providerName,
          model: outputResult.value.model,
          usage: outputResult.value.usage,
          translations: outputResult.value.translations,
        };
      } catch (error) {
        if (error instanceof McpTranslationProviderError) {
          throw error;
        }

        if (error instanceof McpDeadlineError || signal.aborted) {
          throw new McpTranslationProviderError("PROVIDER_TIMEOUT", "翻译 MCP 服务响应超时，请稍后重试。", true);
        }

        if (hasErrorCode(error, "UPSTREAM_TOO_LARGE")) throw invalidProviderResponse();

        throw new McpTranslationProviderError(
          "MCP_UNAVAILABLE",
          "无法连接翻译 MCP 服务，请检查服务状态后重试。",
          true,
        );
      } finally {
        await boundedClose(adapter, Math.min(5_000, remaining(deadlineAt)));
        clearTimeout(deadlineTimer);
      }
    },
  };
}

async function boundedClose(adapter: McpClientAdapter, timeoutMs: number) {
  const closePromise = Promise.resolve().then(() => adapter.close()).catch(() => undefined);
  await withinDeadline(closePromise, timeoutMs).catch(() => undefined);
}

function createSdkMcpClientAdapter(config: McpTranslationClientConfig): McpClientAdapter {
  const client = new Client({ name: "stray-pages-web", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(config.url), {
    requestInit: { headers: { authorization: `Bearer ${config.secret}` } },
    fetch: createBoundedMcpFetch(6 * 1024 * 1024),
  });

  return {
    connect: () => client.connect(transport),
    callTool: (input, timeoutMs, signal) =>
      client.request(
        { method: "tools/call", params: input },
        CallToolResultSchema,
        { timeout: timeoutMs, signal },
      ),
    close: () => client.close(),
  };
}

type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

export function createBoundedMcpFetch(maxBytes: number, fetchImpl: FetchLike = fetch): FetchLike {
  return async (url, init) => {
    const response = await fetchImpl(url, init);
    if ((init?.method ?? "GET").toUpperCase() !== "POST" || !response.body) return response;
    const declared = response.headers.get("content-length");
    if (declared && /^\d+$/.test(declared) && Number(declared) > maxBytes) {
      await response.body.cancel().catch(() => undefined);
      throw new McpResponseTooLargeError();
    }
    let received = 0;
    const limited = response.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        received += chunk.byteLength;
        if (received > maxBytes) {
          controller.error(new McpResponseTooLargeError());
          return;
        }
        controller.enqueue(chunk);
      },
    }));
    return new Response(limited, { status: response.status, statusText: response.statusText, headers: response.headers });
  };
}

function remaining(deadlineAt: number) { return Math.max(0, deadlineAt - Date.now()); }

async function withinDeadline<T>(promise: Promise<T>, timeoutMs: number, signal?: AbortSignal): Promise<T> {
  if (timeoutMs <= 0 || signal?.aborted) throw new McpDeadlineError();
  return await new Promise<T>((resolve, reject) => {
    let settled = false;
    const finish = (action: () => void) => { if (!settled) { settled = true; clearTimeout(timer); signal?.removeEventListener("abort", onAbort); action(); } };
    const onAbort = () => finish(() => reject(new McpDeadlineError()));
    const timer = setTimeout(onAbort, timeoutMs);
    signal?.addEventListener("abort", onAbort, { once: true });
    promise.then((value) => finish(() => resolve(value)), (error) => finish(() => reject(error)));
  });
}

function hasErrorCode(error: unknown, code: string): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && isRecord(current); depth += 1) {
    if (current.code === code) return true;
    current = current.cause;
  }
  return false;
}

function readTextToolContent(value: unknown): { text: string; isError: boolean } | null {
  if (!isRecord(value) || !Array.isArray(value.content)) {
    return null;
  }

  const textItem = value.content.find(
    (item): item is { type: "text"; text: string } =>
      isRecord(item) && item.type === "text" && typeof item.text === "string",
  );

  return textItem
    ? { text: textItem.text, isError: value.isError === true }
    : null;
}

function safeParseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function invalidProviderResponse() {
  return new McpTranslationProviderError(
    "PROVIDER_RESPONSE_INVALID",
    "翻译 MCP 服务返回了无效结果，请重试。",
    true,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
