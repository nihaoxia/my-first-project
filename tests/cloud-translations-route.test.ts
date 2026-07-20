import assert from "node:assert/strict";
import test from "node:test";
import { handleCloudTranslationTaskAction, handleCloudTranslationsCollection } from "../src/lib/cloud/translations-route-core.ts";

const session = { userId: "10000000-0000-4000-8000-000000000001", role: "USER" as const };
const service = {
  async list() { return []; }, async create(_userId: string, body: unknown) { return body; }, async listTasks() { return []; }, async run() { return { status: "COMPLETED" }; }, async retry() { return {}; }, async cancel() { return {}; }, async getReader() { return {}; },
};

test("task run accepts only an action and derives identity/attempt/content from server state", async () => {
  const good = await handleCloudTranslationTaskAction(new Request("http://app/api", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "run" }) }), "30000000-0000-4000-8000-000000000001", "20000000-0000-4000-8000-000000000001", { getSession: async () => session, service });
  assert.equal(good.status, 200);
  for (const field of ["attemptId", "userId", "content", "cost"]) {
    const response = await handleCloudTranslationTaskAction(new Request("http://app/api", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "run", [field]: "unsafe" }) }), "30000000-0000-4000-8000-000000000001", "20000000-0000-4000-8000-000000000001", { getSession: async () => session, service });
    assert.equal(response.status, 400);
  }
  for (const action of [null, 1, [], {}, true]) {
    const response = await handleCloudTranslationTaskAction(new Request("http://app/api", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action }) }), "30000000-0000-4000-8000-000000000001", "20000000-0000-4000-8000-000000000001", { getSession: async () => session, service });
    assert.equal(response.status, 400);
  }
});

test("collection rejects oversized JSON before parsing", async () => {
  const response = await handleCloudTranslationsCollection(new Request("http://app/api", { method: "POST", headers: { "content-type": "application/json", "content-length": "20000" }, body: "{}" }), { getSession: async () => session, service });
  assert.equal(response.status, 413);
});

test("banned and missing sessions receive the same 401 response", async () => {
  for (const value of [null, { ...session, role: "BANNED" as const }]) {
    const response = await handleCloudTranslationsCollection(new Request("http://app/api"), { getSession: async () => value, service });
    assert.equal(response.status, 401);
    assert.equal((await response.json()).error.code, "AUTH_REQUIRED");
  }
});

test("cloud configuration failures are not mislabeled as guest sessions", async () => {
  const response = await handleCloudTranslationsCollection(new Request("http://app/api"), { getSession: async () => { throw Object.assign(new Error("secret database detail"), { code: "CLOUD_NOT_CONFIGURED" }); }, service });
  assert.equal(response.status, 500);
  assert.equal((await response.json()).error.code, "CLOUD_NOT_CONFIGURED");
});

test("provider-token and cancel conflicts map TASK_BUSY to a stable HTTP 409", async () => {
  for (const action of ["run", "cancel"] as const) {
    const busyService = {
      ...service,
      async run() { throw Object.assign(new Error("provider token held"), { code: "TASK_BUSY" }); },
      async cancel() { throw Object.assign(new Error("active provider call"), { code: "TASK_BUSY" }); },
    };
    const response = await handleCloudTranslationTaskAction(
      new Request("http://app/api", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action }) }),
      "30000000-0000-4000-8000-000000000001",
      "20000000-0000-4000-8000-000000000001",
      { getSession: async () => session, service: busyService },
    );
    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), {
      error: { code: "TASK_BUSY", message: "A translation batch is already running. Refresh and try again." },
    });
  }
});

test("cloud translation creation maps unavailable web lookup to a stable conflict", async () => {
  const response = await handleCloudTranslationsCollection(
    new Request("http://app/api", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ originalBookId: "10000000-0000-4000-8000-000000000002", targetLanguage: "CHINESE", webSearchTerms: true }),
    }),
    {
      getSession: async () => session,
      service: { ...service, async create() { throw Object.assign(new Error("not available"), { code: "WEB_LOOKUP_UNAVAILABLE" }); } },
    },
  );
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), {
    error: { code: "WEB_LOOKUP_UNAVAILABLE", message: "Web lookup is not available." },
  });
});

test("free model and quota gates return actionable stable responses", async () => {
  const expected = {
    FREE_MODEL_UNAVAILABLE: [503, "Free cloud translation is unavailable. Local translation or manual import remains available."],
    FREE_QUOTA_EXHAUSTED: [429, "The free monthly translation quota is exhausted. Existing data remains available."],
    USAGE_LEDGER_UNAVAILABLE: [503, "Translation usage cannot be verified, so new model calls are paused."],
  } as const;
  for (const [code, [status, message]] of Object.entries(expected)) {
    const response = await handleCloudTranslationTaskAction(
      new Request("http://app/api", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "run" }) }),
      "30000000-0000-4000-8000-000000000001",
      "20000000-0000-4000-8000-000000000001",
      { getSession: async () => session, service: { ...service, async run() { throw Object.assign(new Error("raw secret"), { code }); } } },
    );
    assert.equal(response.status, status);
    assert.deepEqual(await response.json(), { error: { code, message } });
  }
});
