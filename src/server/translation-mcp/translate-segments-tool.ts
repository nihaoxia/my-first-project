import {
  parseTranslateSegmentsInput,
  type TranslateSegmentsInput,
  type TranslateSegmentsOutput,
  type TranslationServiceError,
} from "../../lib/translation/mcp-contract.ts";
import type { OpenAiCompatibleGateway } from "./openai-compatible-gateway.ts";

export type TranslateSegmentsExecutionResult =
  | { ok: true; output: TranslateSegmentsOutput }
  | { ok: false; error: TranslationServiceError };

export async function executeTranslateSegmentsTool(
  value: unknown,
  gateway: OpenAiCompatibleGateway,
  signal?: AbortSignal,
): Promise<TranslateSegmentsExecutionResult> {
  const parsed = parseTranslateSegmentsInput(value);

  if (!parsed.ok) {
    return {
      ok: false,
      error: {
        code: "INVALID_INPUT",
        message: parsed.message,
        retryable: false,
      },
    };
  }

  return translateSegmentsWithGateway(parsed.value, gateway, 3, signal);
}

export async function translateSegmentsWithGateway(
  input: TranslateSegmentsInput,
  gateway: OpenAiCompatibleGateway,
  concurrency = 3,
  signal?: AbortSignal,
): Promise<TranslateSegmentsExecutionResult> {
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
  const results: Array<TranslateSegmentsOutput["translations"][number] | undefined> = new Array(
    input.segments.length,
  );
  const usage = { inputTokens: 0, outputTokens: 0 };
  let nextIndex = 0;
  let failure: TranslationServiceError | null = null;

  async function worker() {
    while (!failure) {
      const sourceIndex = nextIndex;
      nextIndex += 1;

      if (sourceIndex >= input.segments.length) {
        return;
      }

      const segment = input.segments[sourceIndex];
      const result = await gateway.translateSegment({
        signal,
        sourceLanguage: input.sourceLanguage,
        targetLanguage: input.targetLanguage,
        style: input.style,
        webLookupEnabled: input.webLookupEnabled,
        glossaryTerms: input.glossaryTerms,
        segment,
      });

      if (!result.ok) {
        failure ??= result.error;
        return;
      }

      results[sourceIndex] = {
        segmentId: segment.id,
        index: segment.index,
        translatedText: result.text,
      };
      usage.inputTokens += result.inputTokens;
      usage.outputTokens += result.outputTokens;
    }
  }

  const workerCount = Math.max(1, Math.min(Math.floor(concurrency), input.segments.length));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  if (failure) {
    return { ok: false, error: failure };
  }

  const translations = results.filter(
    (result): result is TranslateSegmentsOutput["translations"][number] => result !== undefined,
  );

  if (translations.length !== input.segments.length) {
    return {
      ok: false,
      error: {
        code: "PROVIDER_RESPONSE_INVALID",
        message: "模型服务没有返回完整译文，请重试。",
        retryable: true,
      },
    };
  }

  return {
    ok: true,
    output: {
      requestId: input.requestId,
      providerName: "openai-compatible",
      model: gateway.model,
      translations,
      usage,
    },
  };
}

export function toMcpToolResult(result: TranslateSegmentsExecutionResult): {
  content: Array<{ type: "text"; text: string }>;
  isError?: true;
} {
  return result.ok
    ? { content: [{ type: "text", text: JSON.stringify(result.output) }] }
    : {
        content: [{ type: "text", text: JSON.stringify(result.error) }],
        isError: true,
      };
}
