import {
  createMcpTranslationProvider,
  McpTranslationProviderError,
  parseMcpTranslationClientConfig,
  type McpTranslationClientConfig,
} from "./mcp-translation-provider.ts";
import { parseTranslateSegmentsInput, type TranslationServiceError } from "./mcp-contract.ts";
import type { TranslationProvider } from "./translation-provider.ts";

export type TranslationRequestLocks = Set<string>;

const sharedTranslationRequestLocks = new Set<string>();

export function createTranslationRequestLocks(): TranslationRequestLocks {
  return new Set<string>();
}

export async function handleTranslateChapter(input: {
  body: unknown;
  sessionScope: string | null;
  origin: string | null;
  appUrl: string | undefined;
  env: Record<string, string | undefined>;
  signal?: AbortSignal;
  locks?: TranslationRequestLocks;
  providerFactory?: (config: McpTranslationClientConfig) => TranslationProvider;
}) {
  if (!input.sessionScope) {
    return errorResult(401, {
      code: "AUTH_REQUIRED",
      message: "请先登录后再开始翻译。",
      retryable: false,
    });
  }

  if (!hasAllowedOrigin(input.origin, input.appUrl)) {
    return errorResult(403, {
      code: "ORIGIN_REJECTED",
      message: "翻译请求来源无效，请刷新页面后重试。",
      retryable: false,
    });
  }

  const parsedRequest = parseTranslateSegmentsInput({
    ...(isRecord(input.body) ? input.body : {}),
    requestId: "api-validation",
  });

  if (!parsedRequest.ok) {
    return errorResult(400, {
      code: "INVALID_INPUT",
      message: parsedRequest.message,
      retryable: false,
    });
  }

  const configResult = parseMcpTranslationClientConfig(input.env);
  if (!configResult.ok) {
    return errorResult(503, {
      code: configResult.code,
      message: configResult.message,
      retryable: false,
    });
  }

  const locks = input.locks ?? sharedTranslationRequestLocks;
  if (locks.has(input.sessionScope)) {
    return errorResult(409, {
      code: "TRANSLATION_BUSY",
      message: "当前账号已有章节正在翻译，请等待完成。",
      retryable: true,
    });
  }

  locks.add(input.sessionScope);

  try {
    const provider = (input.providerFactory ?? createMcpTranslationProvider)(configResult.value);
    const result = await provider.translateSegments({
      signal: input.signal,
      sourceLanguage: parsedRequest.value.sourceLanguage,
      targetLanguage: parsedRequest.value.targetLanguage,
      style: parsedRequest.value.style,
      webLookupEnabled: false,
      glossaryTerms: parsedRequest.value.glossaryTerms,
      segments: parsedRequest.value.segments.map((segment) => ({
        ...segment,
        characterCount: segment.text.length,
      })),
    });

    return {
      status: 200,
      body: {
        ok: true as const,
        providerName: result.providerName,
        model: result.model,
        usage: result.usage,
        translations: result.translations,
      },
    };
  } catch (error) {
    if (error instanceof McpTranslationProviderError) {
      return errorResult(statusForErrorCode(error.code), {
        code: error.code,
        message: error.message,
        retryable: error.retryable,
      });
    }

    return errorResult(502, {
      code: "TRANSLATION_FAILED",
      message: "翻译暂时失败，请稍后重试。",
      retryable: true,
    });
  } finally {
    locks.delete(input.sessionScope);
  }
}

export async function handleTranslationCapabilities(input: {
  sessionScope: string | null;
  env: Record<string, string | undefined>;
  probe?: (config: McpTranslationClientConfig) => Promise<boolean>;
}) {
  if (!input.sessionScope) {
    return errorResult(401, {
      code: "AUTH_REQUIRED",
      message: "请先登录后再检查翻译服务。",
      retryable: false,
    });
  }

  const configResult = parseMcpTranslationClientConfig(input.env);
  if (!configResult.ok) {
    return {
      status: 200,
      body: { configured: false, available: false, message: configResult.message },
    };
  }

  const available = await (input.probe ?? probeTranslationMcpHealth)(configResult.value);
  return {
    status: 200,
    body: {
      configured: true,
      available,
      message: available
        ? "翻译 MCP 服务已就绪。"
        : "无法连接翻译 MCP 服务，请启动服务后重试。",
    },
  };
}

export async function probeTranslationMcpHealth(config: McpTranslationClientConfig) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2_000);

  try {
    const healthUrl = new URL(config.url);
    healthUrl.pathname = healthUrl.pathname.replace(/\/mcp\/?$/, "/health");
    healthUrl.search = "";
    const response = await fetch(healthUrl, {
      headers: { authorization: `Bearer ${config.secret}` },
      signal: controller.signal,
      cache: "no-store",
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

function hasAllowedOrigin(origin: string | null, appUrl: string | undefined) {
  if (!origin || !appUrl) {
    return false;
  }

  try {
    return new URL(origin).origin === new URL(appUrl).origin;
  } catch {
    return false;
  }
}

function statusForErrorCode(code: TranslationServiceError["code"]) {
  if (code === "PROVIDER_RATE_LIMITED") return 429;
  if (code === "PROVIDER_TIMEOUT") return 504;
  if (code === "MCP_UNAVAILABLE" || code === "MCP_NOT_CONFIGURED") return 503;
  if (code === "INVALID_INPUT") return 400;
  return 502;
}

function errorResult(status: number, error: TranslationServiceError) {
  return { status, body: { ok: false as const, error } };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
