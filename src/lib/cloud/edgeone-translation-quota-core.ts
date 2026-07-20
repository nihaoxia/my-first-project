import {
  assertFreeTokenCapacity,
  type UsageEvent,
  type UsageState,
} from "../edgeone/quota-core.ts";
import type {
  TranslationProvider,
  TranslationProviderInput,
} from "../translation/translation-provider.ts";

type QuotaService = {
  getUsage(userId: string, month: string): Promise<UsageState>;
  appendEvent(userId: string, month: string, event: UsageEvent): Promise<void>;
};

export const EDGEONE_MODEL_QUOTA_LEDGER_ID = "translation-model-global";

export class EdgeOneTranslationQuotaError extends Error {
  readonly code:
    | "FREE_MODEL_UNAVAILABLE"
    | "USAGE_LEDGER_UNAVAILABLE"
    | "WEB_LOOKUP_UNAVAILABLE"
    | "PROVIDER_RATE_LIMITED"
    | "PROVIDER_TIMEOUT"
    | "PROVIDER_RESPONSE_INVALID"
    | "TRANSLATION_FAILED";

  constructor(code: EdgeOneTranslationQuotaError["code"]) {
    super(code);
    this.code = code;
    this.name = "EdgeOneTranslationQuotaError";
  }
}

export function estimateWorstCaseTokens(input: TranslationProviderInput): number {
  const characters = input.segments.reduce((sum, segment) => sum + segment.characterCount, 0);
  const promptAndInput = 2_048 + Math.ceil(characters / 2);
  const maximumOutput = Math.max(1_024, Math.ceil(characters * 1.5));
  return promptAndInput + maximumOutput;
}

export function createFreeQuotaTranslationProvider(input: {
  provider: TranslationProvider;
  quota: QuotaService;
  userId: string;
  freeModelConfirmed: boolean;
  now: () => Date;
  uuid: () => string;
}): TranslationProvider {
  return {
    name: `free-quota:${input.provider.name}`,
    async translateSegments(request) {
      if (!input.freeModelConfirmed) {
        throw new EdgeOneTranslationQuotaError("FREE_MODEL_UNAVAILABLE");
      }
      const now = input.now();
      if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
        throw new EdgeOneTranslationQuotaError("USAGE_LEDGER_UNAVAILABLE");
      }
      const month = now.toISOString().slice(0, 7);
      const at = now.toISOString();
      const tokens = estimateWorstCaseTokens(request);
      let usage: UsageState;
      try { usage = await input.quota.getUsage(input.userId, month); }
      catch { throw new EdgeOneTranslationQuotaError("USAGE_LEDGER_UNAVAILABLE"); }
      assertFreeTokenCapacity(usage, tokens);
      const reservationId = input.uuid();
      try {
        await input.quota.appendEvent(input.userId, month, {
          type: "TOKENS_RESERVED", id: reservationId, tokens, month, at,
        });
      } catch {
        throw new EdgeOneTranslationQuotaError("USAGE_LEDGER_UNAVAILABLE");
      }

      let result: Awaited<ReturnType<TranslationProvider["translateSegments"]>>;
      try {
        result = await input.provider.translateSegments(request);
      } catch (error) {
        await release(input.quota, input.userId, month, reservationId, input.uuid(), at);
        throw new EdgeOneTranslationQuotaError(stableProviderCode(error));
      }
      const actualTokens = result.usage
        ? result.usage.inputTokens + result.usage.outputTokens
        : -1;
      if (
        !Number.isSafeInteger(actualTokens) ||
        actualTokens < 0 ||
        actualTokens > tokens
      ) {
        await release(input.quota, input.userId, month, reservationId, input.uuid(), at);
        throw new EdgeOneTranslationQuotaError("PROVIDER_RESPONSE_INVALID");
      }
      try {
        await input.quota.appendEvent(input.userId, month, {
          type: "TOKENS_COMMITTED", id: input.uuid(), reservationId,
          actualTokens, at,
        });
      } catch {
        throw new EdgeOneTranslationQuotaError("USAGE_LEDGER_UNAVAILABLE");
      }
      return result;
    },
  };
}

async function release(
  quota: QuotaService,
  userId: string,
  month: string,
  reservationId: string,
  id: string,
  at: string,
) {
  try {
    await quota.appendEvent(userId, month, {
      type: "TOKENS_RELEASED", id, reservationId, at,
    });
  } catch {
    throw new EdgeOneTranslationQuotaError("USAGE_LEDGER_UNAVAILABLE");
  }
}

function stableProviderCode(error: unknown): EdgeOneTranslationQuotaError["code"] {
  if (typeof error !== "object" || error === null || !("code" in error)) return "TRANSLATION_FAILED";
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" && [
    "FREE_MODEL_UNAVAILABLE", "WEB_LOOKUP_UNAVAILABLE", "PROVIDER_RATE_LIMITED",
    "PROVIDER_TIMEOUT", "PROVIDER_RESPONSE_INVALID", "TRANSLATION_FAILED",
  ].includes(code)
    ? code as EdgeOneTranslationQuotaError["code"]
    : "TRANSLATION_FAILED";
}
