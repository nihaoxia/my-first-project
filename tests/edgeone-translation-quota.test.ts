import assert from "node:assert/strict";
import test from "node:test";
import type { UsageEvent } from "../src/lib/edgeone/quota-core.ts";

let subject: typeof import("../src/lib/cloud/edgeone-translation-quota-core.ts") | undefined;
try { subject = await import("../src/lib/cloud/edgeone-translation-quota-core.ts"); } catch { /* red */ }
function api() { if (!subject) assert.fail("EdgeOne translation quota gate must be implemented"); return subject; }

const USER = "11111111-1111-4111-8111-111111111111";
const segment = { id: "segment-1", index: 0, chapterId: "chapter", chapterTitle: "Chapter", text: "hello world", characterCount: 11 };

function harness(options: { confirmed?: boolean; committed?: number; unavailable?: boolean; providerFails?: boolean } = {}) {
  let calls = 0;
  const events: UsageEvent[] = [];
  let id = 1;
  const provider = api().createFreeQuotaTranslationProvider({
    provider: { name: "free-model", async translateSegments(input) { calls += 1; if (options.providerFails) throw new Error("raw provider secret"); return { providerName: "free-model", model: "free", usage: { inputTokens: 100, outputTokens: 200 }, translations: input.segments.map((item) => ({ segmentId: item.id, index: item.index, translatedText: "你好" })) }; } },
    quota: {
      async getUsage() { return options.unavailable ? { state: "unavailable" as const } : { state: "ready" as const, committed: 0, reserved: 0, tokensCommitted: options.committed ?? 0, tokensReserved: 0 }; },
      async appendEvent(_user: string, _month: string, event: UsageEvent) { events.push(event); },
    },
    userId: USER, freeModelConfirmed: options.confirmed ?? true,
    now: () => new Date("2026-07-12T00:00:00.000Z"),
    uuid: () => `80000000-0000-4000-8000-${String(id++).padStart(12, "0")}`,
  });
  return { provider, events, get calls() { return calls; } };
}

const input = { targetLanguage: "中文", style: "自然", webLookupEnabled: false, glossaryTerms: [], segments: [segment] };

test("all production users share one platform-wide model quota ledger", () => {
  assert.equal(api().EDGEONE_MODEL_QUOTA_LEDGER_ID, "translation-model-global");
});

test("reserves worst-case tokens before provider work and commits actual usage", async () => {
  const h = harness();
  await h.provider.translateSegments(input);
  assert.equal(h.calls, 1);
  assert.deepEqual(h.events.map((event) => event.type), ["TOKENS_RESERVED", "TOKENS_COMMITTED"]);
  assert.ok(h.events[0].type === "TOKENS_RESERVED" && h.events[0].tokens >= 300);
  assert.equal(h.events[0].type === "TOKENS_RESERVED" && h.events[0].month, "2026-07");
});

test("unknown free-model status, unavailable ledger and exhausted quota never call provider", async () => {
  for (const options of [
    { confirmed: false },
    { unavailable: true },
    { committed: 449_999 },
  ]) {
    const h = harness(options);
    await assert.rejects(() => h.provider.translateSegments(input));
    assert.equal(h.calls, 0);
  }
});

test("provider failure releases the reservation and redacts the cause", async () => {
  const h = harness({ providerFails: true });
  await assert.rejects(() => h.provider.translateSegments(input),
    (error: unknown) => error instanceof Error && !error.message.includes("secret"));
  assert.deepEqual(h.events.map((event) => event.type), ["TOKENS_RESERVED", "TOKENS_RELEASED"]);
});
