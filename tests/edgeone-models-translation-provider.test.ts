import assert from "node:assert/strict";
import test from "node:test";

let subject: typeof import("../src/lib/cloud/edgeone-models-translation-provider.ts") | undefined;
try { subject = await import("../src/lib/cloud/edgeone-models-translation-provider.ts"); } catch { /* red */ }
function api() { if (!subject) assert.fail("EdgeOne Makers Models provider must be implemented"); return subject; }

const request = {
  sourceLanguage: "英文",
  targetLanguage: "中文",
  style: "自然",
  webLookupEnabled: false,
  glossaryTerms: [],
  segments: [
    { id: "segment-1", index: 0, chapterId: "chapter-1", chapterTitle: "第一章", text: "Hello.", characterCount: 6 },
    { id: "segment-2", index: 1, chapterId: "chapter-1", chapterTitle: "第一章", text: "World.", characterCount: 6 },
  ],
};

test("calls only the fixed EdgeOne built-in model and reports exact usage", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const provider = api().createEdgeOneModelsTranslationProvider({
    apiKey: "makers-test-key",
    uuid: () => "11111111-1111-4111-8111-111111111111",
    async fetchImpl(url, init) {
      calls.push({ url: String(url), init });
      return Response.json({ choices: [{ message: { content: JSON.stringify([
        { segmentId: "segment-1", index: 0, translatedText: "你好。" },
        { segmentId: "segment-2", index: 1, translatedText: "世界。" },
      ]) } }],
        usage: { prompt_tokens: 11, completion_tokens: 7 } });
    },
  });
  const result = await provider.translateSegments(request);
  assert.equal(calls.length, 1);
  assert.ok(calls.every((call) => call.url === "https://ai-gateway.edgeone.link/v1/chat/completions"));
  assert.ok(calls.every((call) => JSON.parse(String(call.init?.body)).model === "@makers/deepseek-v4-flash"));
  assert.ok(calls.every((call) => new Headers(call.init?.headers).get("authorization") === "Bearer makers-test-key"));
  assert.deepEqual(result.translations.map((item) => item.translatedText), ["你好。", "世界。"]);
  assert.deepEqual(result.usage, { inputTokens: 11, outputTokens: 7 });
  assert.equal(result.providerName, "edgeone-makers-models");
});

test("missing keys and upstream failures are fail-closed and redacted", async () => {
  let calls = 0;
  const missing = api().createEdgeOneModelsTranslationProvider({ apiKey: undefined, async fetchImpl() { calls += 1; throw new Error("must not call"); } });
  await assert.rejects(() => missing.translateSegments(request), { code: "FREE_MODEL_UNAVAILABLE", message: "FREE_MODEL_UNAVAILABLE" });
  assert.equal(calls, 0);

  const failed = api().createEdgeOneModelsTranslationProvider({ apiKey: "makers-test-key", async fetchImpl() { calls += 1; throw new Error("raw secret upstream"); } });
  await assert.rejects(() => failed.translateSegments(request), (error: unknown) => {
    assert.equal((error as { code?: string }).code, "TRANSLATION_FAILED");
    assert.doesNotMatch(String((error as Error).message), /raw secret upstream/);
    return true;
  });
  assert.equal(calls, 1);
});
