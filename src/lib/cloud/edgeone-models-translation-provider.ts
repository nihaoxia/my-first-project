import type {
  TranslationProvider,
  TranslationProviderInput,
  TranslationProviderResult,
} from "../translation/translation-provider.ts";

export const EDGEONE_MODELS_BASE_URL = "https://ai-gateway.edgeone.link/v1";
export const EDGEONE_FREE_MODEL = "@makers/deepseek-v4-flash";

type FetchImplementation = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

type TranslationResult = TranslationProviderResult["translations"][number];

export class EdgeOneModelsTranslationProviderError extends Error {
  readonly code:
    | "FREE_MODEL_UNAVAILABLE"
    | "WEB_LOOKUP_UNAVAILABLE"
    | "PROVIDER_RATE_LIMITED"
    | "PROVIDER_TIMEOUT"
    | "PROVIDER_RESPONSE_INVALID"
    | "TRANSLATION_FAILED";

  constructor(code: EdgeOneModelsTranslationProviderError["code"]) {
    super(code);
    this.code = code;
    this.name = "EdgeOneModelsTranslationProviderError";
  }
}

export function createEdgeOneModelsTranslationProvider(input: {
  apiKey: string | undefined;
  fetchImpl?: FetchImplementation;
  timeoutMs?: number;
  uuid?: () => string;
}): TranslationProvider {
  const apiKey = input.apiKey?.trim();
  const fetchImpl = input.fetchImpl ?? fetch;
  const timeoutMs = input.timeoutMs ?? 120_000;
  const uuid = input.uuid ?? (() => crypto.randomUUID());

  return {
    name: "edgeone-makers-models",
    async translateSegments(request) {
      if (!apiKey) throw new EdgeOneModelsTranslationProviderError("FREE_MODEL_UNAVAILABLE");
      if (request.webLookupEnabled) throw new EdgeOneModelsTranslationProviderError("WEB_LOOKUP_UNAVAILABLE");
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const signal = request.signal
        ? AbortSignal.any([request.signal, controller.signal])
        : controller.signal;
      try {
        const response = await fetchImpl(`${EDGEONE_MODELS_BASE_URL}/chat/completions`, {
          method: "POST",
          headers: {
            accept: "application/json",
            authorization: `Bearer ${apiKey}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model: EDGEONE_FREE_MODEL,
            temperature: 0.2,
            messages: buildMessages(request, uuid()),
          }),
          signal,
        });
        if (response.status === 429) {
          throw new EdgeOneModelsTranslationProviderError("PROVIDER_RATE_LIMITED");
        }
        if (!response.ok) {
          throw new EdgeOneModelsTranslationProviderError("TRANSLATION_FAILED");
        }
        const payload = await readBoundedJson(response);
        const translations = readTranslations(payload, request);
        const usage = readUsage(payload);
        if (!translations || !usage) {
          throw new EdgeOneModelsTranslationProviderError("PROVIDER_RESPONSE_INVALID");
        }
        return {
          providerName: "edgeone-makers-models",
          model: EDGEONE_FREE_MODEL,
          usage,
          translations,
        };
      } catch (error) {
        if (error instanceof EdgeOneModelsTranslationProviderError) throw error;
        if (isAbortError(error)) {
          throw new EdgeOneModelsTranslationProviderError("PROVIDER_TIMEOUT");
        }
        throw new EdgeOneModelsTranslationProviderError("TRANSLATION_FAILED");
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

function buildMessages(input: TranslationProviderInput, requestId: string) {
  const glossary = input.glossaryTerms.map((term) => ({
    sourceTerm: term.sourceTerm,
    targetTerm: term.targetTerm,
    note: term.note,
  }));
  const segments = input.segments.map((segment) => ({
    segmentId: segment.id,
    index: segment.index,
    chapterTitle: segment.chapterTitle,
    text: segment.text,
  }));
  return [
    {
      role: "system",
      content: [
        "你是专业小说翻译助手。保持剧情、语气和段落信息完整，严格遵守术语表。",
        "只输出 JSON 数组，不输出解释或 Markdown。",
        "数组每项必须且只能包含 segmentId、index、translatedText，并与输入一一对应。",
      ].join("\n"),
    },
    {
      role: "user",
      content: JSON.stringify({
        requestId,
        sourceLanguage: input.sourceLanguage ?? "未知",
        targetLanguage: input.targetLanguage,
        style: input.style,
        glossary,
        segments,
      }),
    },
  ];
}

async function readBoundedJson(response: Response): Promise<unknown> {
  const maxBytes = 1024 * 1024;
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    await response.body?.cancel().catch(() => undefined);
    return null;
  }
  if (!response.body) return null;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return null;
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return null;
  }
}

function readTranslations(
  payload: unknown,
  request: TranslationProviderInput,
): TranslationResult[] | null {
  if (!isRecord(payload) || !Array.isArray(payload.choices)) return null;
  const choice = payload.choices[0];
  if (!isRecord(choice) || !isRecord(choice.message) || typeof choice.message.content !== "string") return null;
  const content = stripFence(choice.message.content);
  let decoded: unknown;
  try { decoded = JSON.parse(content); } catch { return null; }
  const values = Array.isArray(decoded)
    ? decoded
    : isRecord(decoded) && Array.isArray(decoded.translations)
      ? decoded.translations
      : null;
  if (!values || values.length !== request.segments.length) return null;
  const expected = new Map(request.segments.map((segment) => [segment.id, segment.index]));
  const seen = new Set<string>();
  const output: TranslationResult[] = [];
  for (const value of values) {
    if (
      !isRecord(value) ||
      typeof value.segmentId !== "string" ||
      !Number.isSafeInteger(value.index) ||
      typeof value.translatedText !== "string" ||
      !value.translatedText.trim() ||
      seen.has(value.segmentId) ||
      expected.get(value.segmentId) !== value.index
    ) return null;
    seen.add(value.segmentId);
    output.push({
      segmentId: value.segmentId,
      index: value.index as number,
      translatedText: value.translatedText.trim(),
    });
  }
  return output.sort((a, b) => a.index - b.index);
}

function readUsage(payload: unknown) {
  if (!isRecord(payload) || !isRecord(payload.usage)) return null;
  const inputTokens = payload.usage.prompt_tokens;
  const outputTokens = payload.usage.completion_tokens;
  if (
    !Number.isSafeInteger(inputTokens) ||
    (inputTokens as number) < 0 ||
    !Number.isSafeInteger(outputTokens) ||
    (outputTokens as number) < 0
  ) return null;
  return { inputTokens: inputTokens as number, outputTokens: outputTokens as number };
}

function stripFence(value: string) {
  const match = value.trim().match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i);
  return (match?.[1] ?? value).trim();
}

function isAbortError(error: unknown) {
  return isRecord(error) && error.name === "AbortError";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
