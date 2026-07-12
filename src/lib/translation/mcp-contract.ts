import { z } from "zod";

export const supportedMcpTargetLanguages = [
  "中文",
  "英文",
  "日文",
  "韩文",
  "俄语",
  "德语",
  "西班牙语",
  "法语",
] as const;

export const translationServiceErrorCodes = [
  "AUTH_REQUIRED",
  "ORIGIN_REJECTED",
  "INVALID_INPUT",
  "TRANSLATION_BUSY",
  "MCP_NOT_CONFIGURED",
  "MCP_UNAVAILABLE",
  "PROVIDER_RATE_LIMITED",
  "PROVIDER_TIMEOUT",
  "PROVIDER_RESPONSE_INVALID",
  "WEB_LOOKUP_UNAVAILABLE",
  "TRANSLATION_FAILED",
] as const;

const glossaryTermSchema = z.object({
  sourceTerm: z.string().trim().min(1).max(200),
  targetTerm: z.string().trim().min(1).max(200).optional(),
  note: z.string().trim().min(1).max(500).optional(),
});

export const translateSegmentInputSchema = z.object({
  id: z.string().trim().min(1).max(128),
  index: z.number().int().min(0).max(10_000),
  chapterId: z.string().trim().min(1).max(128),
  chapterTitle: z.string().trim().min(1).max(300),
  text: z.string().trim().min(1).max(1_200),
});

export const translateSegmentsInputSchema = z
  .object({
    requestId: z.string().trim().min(1).max(128),
    sourceLanguage: z.string().trim().min(1).max(32),
    targetLanguage: z.enum(supportedMcpTargetLanguages),
    style: z.literal("自然"),
    webLookupEnabled: z.boolean().default(false),
    glossaryTerms: z.array(glossaryTermSchema).max(100),
    segments: z.array(translateSegmentInputSchema).min(1).max(10),
  })
  .superRefine((value, context) => {
    const ids = new Set<string>();

    for (const segment of value.segments) {
      if (ids.has(segment.id)) {
        context.addIssue({
          code: "custom",
          message: "片段 ID 不能重复。",
          path: ["segments"],
        });
      }
      ids.add(segment.id);
    }

    const totalCharacters = value.segments.reduce((sum, segment) => sum + segment.text.length, 0);
    if (totalCharacters > 12_000) {
      context.addIssue({
        code: "custom",
        message: "单次翻译总字符数不能超过 12000。",
        path: ["segments"],
      });
    }
  });

const translateSegmentsOutputSchema = z.object({
  requestId: z.string().trim().min(1).max(128),
  providerName: z.literal("openai-compatible"),
  model: z.string().trim().min(1).max(200),
  translations: z
    .array(
      z.object({
        segmentId: z.string().trim().min(1).max(128),
        index: z.number().int().min(0).max(10_000),
        translatedText: z.string().trim().min(1).refine(
          (value) => new TextEncoder().encode(value).byteLength <= 32 * 1024,
          "Translated text exceeds the UTF-8 byte limit.",
        ),
      }),
    )
    .min(1)
    .max(10),
  usage: z
    .object({
      inputTokens: z.number().int().min(0),
      outputTokens: z.number().int().min(0),
    })
    .optional(),
});

const translationServiceErrorSchema = z.object({
  code: z.enum(translationServiceErrorCodes),
  message: z.string().trim().min(1).max(300),
  retryable: z.boolean(),
});

export type TranslateSegmentInput = z.infer<typeof translateSegmentInputSchema>;
export type TranslateSegmentsInput = z.infer<typeof translateSegmentsInputSchema>;
export type TranslateSegmentsOutput = z.infer<typeof translateSegmentsOutputSchema>;
export type TranslationServiceError = z.infer<typeof translationServiceErrorSchema>;
export type TranslationServiceErrorCode = TranslationServiceError["code"];
export type TranslationChapterHttpResponse =
  | {
      ok: true;
      providerName: string;
      model?: string;
      usage?: { inputTokens: number; outputTokens: number };
      translations: TranslateSegmentsOutput["translations"];
    }
  | { ok: false; error: TranslationServiceError };

export type ContractParseResult<T> =
  | { ok: true; value: T }
  | {
      ok: false;
      code: "INVALID_INPUT" | "PROVIDER_RESPONSE_INVALID";
      message: string;
    };

export function parseTranslateSegmentsInput(value: unknown): ContractParseResult<TranslateSegmentsInput> {
  const result = translateSegmentsInputSchema.safeParse(value);

  return result.success
    ? { ok: true, value: result.data }
    : { ok: false, code: "INVALID_INPUT", message: "翻译请求格式无效或超过限制。" };
}

export function parseTranslateSegmentsOutput(
  value: unknown,
  sourceSegments: Array<Pick<TranslateSegmentInput, "id" | "index">>,
): ContractParseResult<TranslateSegmentsOutput> {
  const result = translateSegmentsOutputSchema.safeParse(value);
  const invalidResult = {
    ok: false as const,
    code: "PROVIDER_RESPONSE_INVALID" as const,
    message: "翻译服务返回的片段与请求不一致。",
  };

  if (!result.success || result.data.translations.length !== sourceSegments.length) {
    return invalidResult;
  }

  const expected = new Map(sourceSegments.map((segment) => [segment.id, segment.index]));
  const returnedIds = new Set<string>();

  for (const translation of result.data.translations) {
    if (
      returnedIds.has(translation.segmentId) ||
      expected.get(translation.segmentId) !== translation.index
    ) {
      return invalidResult;
    }
    returnedIds.add(translation.segmentId);
  }

  return returnedIds.size === expected.size
    ? { ok: true, value: result.data }
    : invalidResult;
}

export function parseTranslationServiceError(value: unknown): ContractParseResult<TranslationServiceError> {
  const result = translationServiceErrorSchema.safeParse(value);

  return result.success
    ? { ok: true, value: result.data }
    : { ok: false, code: "PROVIDER_RESPONSE_INVALID", message: "翻译服务返回了无效错误信息。" };
}

export function parseTranslationChapterHttpResponse(
  value: unknown,
  sourceSegments: Array<Pick<TranslateSegmentInput, "id" | "index">>,
): TranslationChapterHttpResponse {
  const invalid: TranslationChapterHttpResponse = {
    ok: false,
    error: {
      code: "PROVIDER_RESPONSE_INVALID",
      message: "翻译接口返回了无效结果，请重试。",
      retryable: true,
    },
  };

  if (!value || typeof value !== "object") {
    return invalid;
  }

  const record = value as Record<string, unknown>;
  if (record.ok === false) {
    const errorResult = parseTranslationServiceError(record.error);
    return errorResult.ok ? { ok: false, error: errorResult.value } : invalid;
  }

  if (record.ok !== true) {
    return invalid;
  }

  const outputResult = parseTranslateSegmentsOutput(
    {
      requestId: "http-response",
      providerName: record.providerName,
      model: record.model,
      usage: record.usage,
      translations: record.translations,
    },
    sourceSegments,
  );

  return outputResult.ok
    ? {
        ok: true,
        providerName: outputResult.value.providerName,
        model: outputResult.value.model,
        usage: outputResult.value.usage,
        translations: outputResult.value.translations,
      }
    : invalid;
}
