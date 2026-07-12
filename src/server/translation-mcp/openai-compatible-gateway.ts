import type {
  TranslateSegmentInput,
  TranslateSegmentsInput,
  TranslationServiceError,
} from "../../lib/translation/mcp-contract.ts";

export type OpenAiGatewayConfig = {
  aiBaseUrl: string;
  aiApiKey: string;
  aiModel: string;
  aiRequestTimeoutMs: number;
};

export type TranslateSegmentGatewayInput = Pick<
  TranslateSegmentsInput,
  "sourceLanguage" | "targetLanguage" | "style" | "glossaryTerms" | "webLookupEnabled"
> & {
  segment: TranslateSegmentInput;
  signal?: AbortSignal;
};

export type TranslateSegmentGatewayResult =
  | { ok: true; text: string; inputTokens: number; outputTokens: number }
  | { ok: false; error: TranslationServiceError };

export type OpenAiCompatibleGateway = {
  model: string;
  translateSegment(input: TranslateSegmentGatewayInput): Promise<TranslateSegmentGatewayResult>;
};

type FetchImplementation = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
const MAX_UPSTREAM_RESPONSE_BYTES = 6 * 1024 * 1024;

export function createOpenAiCompatibleGateway(
  config: OpenAiGatewayConfig,
  fetchImpl: FetchImplementation = fetch,
): OpenAiCompatibleGateway {
  return {
    model: config.aiModel,
    async translateSegment(input) {
      if (input.webLookupEnabled) {
        return {
          ok: false,
          error: {
            code: "WEB_LOOKUP_UNAVAILABLE",
            message: "Web lookup is not available for this translation provider.",
            retryable: false,
          },
        };
      }
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), config.aiRequestTimeoutMs);
      const signal = input.signal
        ? AbortSignal.any([controller.signal, input.signal])
        : controller.signal;

      try {
        const response = await fetchImpl(`${config.aiBaseUrl.replace(/\/+$/, "")}/chat/completions`, {
          method: "POST",
          headers: {
            accept: "application/json",
            authorization: `Bearer ${config.aiApiKey}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model: config.aiModel,
            temperature: 0.2,
            messages: buildMessages(input),
          }),
          signal,
        });

        if (response.status === 429) {
          return {
            ok: false,
            error: {
              code: "PROVIDER_RATE_LIMITED",
              message: "模型服务当前请求过多，请稍后重试。",
              retryable: true,
            },
          };
        }

        if (!response.ok) {
          return {
            ok: false,
            error: {
              code: "TRANSLATION_FAILED",
              message: "模型服务暂时无法完成翻译，请稍后重试。",
              retryable: response.status >= 500,
            },
          };
        }

        const payload = await safeReadJson(response);
        const content = readTranslationContent(payload);

        if (!content) {
          return {
            ok: false,
            error: {
              code: "PROVIDER_RESPONSE_INVALID",
              message: "模型服务没有返回有效译文，请重试或更换模型。",
              retryable: true,
            },
          };
        }

        return {
          ok: true,
          text: stripSingleMarkdownFence(content),
          inputTokens: readUsageValue(payload, "prompt_tokens"),
          outputTokens: readUsageValue(payload, "completion_tokens"),
        };
      } catch (error) {
        if (isAbortError(error)) {
          return {
            ok: false,
            error: {
              code: "PROVIDER_TIMEOUT",
              message: "模型响应超时，请稍后重试。",
              retryable: true,
            },
          };
        }

        return {
          ok: false,
          error: {
            code: "TRANSLATION_FAILED",
            message: "无法连接模型服务，请检查配置后重试。",
            retryable: true,
          },
        };
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}

function buildMessages(input: TranslateSegmentGatewayInput) {
  const glossary = input.glossaryTerms.length
    ? input.glossaryTerms
        .map((term) => {
          const target = term.targetTerm ? ` => ${term.targetTerm}` : "";
          const note = term.note ? `（${term.note}）` : "";
          return `${term.sourceTerm}${target}${note}`;
        })
        .join("；")
    : "无";

  return [
    {
      role: "system",
      content: "你是专业小说翻译助手。保持剧情、语气和段落信息完整，严格遵守术语表，只输出译文，不输出解释、标题或 Markdown。",
    },
    {
      role: "user",
      content: [
        `章节：${input.segment.chapterTitle}`,
        `源语言：${input.sourceLanguage}`,
        `目标语言：${input.targetLanguage}`,
        `翻译风格：${input.style}`,
        "联网查证：不可用",
        `术语表：${glossary}`,
        "原文：",
        input.segment.text,
      ].join("\n"),
    },
  ];
}

async function safeReadJson(response: Response): Promise<unknown> {
  try {
    const declaredLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_UPSTREAM_RESPONSE_BYTES) {
      await response.body?.cancel().catch(() => undefined);
      return null;
    }
    if (!response.body) return null;
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_UPSTREAM_RESPONSE_BYTES) {
        await reader.cancel().catch(() => undefined);
        return null;
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return null;
  }
}

function readTranslationContent(payload: unknown) {
  if (!isRecord(payload) || !Array.isArray(payload.choices)) {
    return "";
  }

  const choice = payload.choices[0];
  if (!isRecord(choice) || !isRecord(choice.message) || typeof choice.message.content !== "string") {
    return "";
  }

  return choice.message.content.trim();
}

function readUsageValue(payload: unknown, key: "prompt_tokens" | "completion_tokens") {
  if (!isRecord(payload) || !isRecord(payload.usage)) {
    return 0;
  }

  const value = payload.usage[key];
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}

function stripSingleMarkdownFence(value: string) {
  const match = value.trim().match(/^```(?:[A-Za-z0-9_-]+)?\s*\n?([\s\S]*?)\n?```$/);
  return (match?.[1] ?? value).trim();
}

function isAbortError(error: unknown) {
  return isRecord(error) && error.name === "AbortError";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
