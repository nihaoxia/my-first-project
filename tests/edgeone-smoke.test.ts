import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

type SmokeFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
type SmokeResult = {
  ok: boolean;
  checks: Array<{ name: string; ok: boolean; status: number | null; code: string }>;
};
type SmokeModule = {
  runEdgeOneSmoke?: (
    input: { origin: string; timeoutMs?: number; maxResponseBytes?: number },
    fetchImpl?: SmokeFetch,
  ) => Promise<SmokeResult>;
};

async function loadSmokeModule(): Promise<SmokeModule> {
  let source = "";
  try {
    source = await readFile(new URL("../scripts/edgeone-smoke.mjs", import.meta.url), "utf8");
  } catch {
    // The red TDD phase intentionally loads an empty module.
  }
  const url = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
  return import(url) as Promise<SmokeModule>;
}

test("EdgeOne smoke checks only home, stable health and one unauthenticated private API", async () => {
  const smokeApi = await loadSmokeModule();
  assert.equal(typeof smokeApi.runEdgeOneSmoke, "function");
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchImpl: SmokeFetch = async (input, init) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.endsWith("/api/health")) {
      return Response.json({
        status: "ok",
        configured: true,
        capabilities: { web: true, auth: true, blob: true, quota: true },
      });
    }
    if (url.endsWith("/api/cloud/books")) return new Response("private", { status: 401 });
    return new Response("home", { status: 200 });
  };

  const result = await smokeApi.runEdgeOneSmoke!(
    { origin: "https://stray-pages.edgeone.app", timeoutMs: 100, maxResponseBytes: 4096 },
    fetchImpl,
  );

  assert.equal(result.ok, true);
  assert.deepEqual(result.checks.map((check) => check.name), ["home", "health", "private-api"]);
  assert.deepEqual(calls.map((call) => call.url), [
    "https://stray-pages.edgeone.app/",
    "https://stray-pages.edgeone.app/api/health",
    "https://stray-pages.edgeone.app/api/cloud/books",
  ]);
  for (const call of calls) {
    assert.equal(call.init?.redirect, "manual");
    assert.equal(call.init?.credentials, "omit");
    assert.ok(call.init?.signal instanceof AbortSignal);
  }
  assert.equal(JSON.stringify(result).includes("private"), true, "check name is public");
  assert.equal(JSON.stringify(result).includes('"private"'), false, "response body must not be returned");
});

test("invalid production origins fail before any network request", async (context) => {
  const smokeApi = await loadSmokeModule();
  assert.equal(typeof smokeApi.runEdgeOneSmoke, "function");
  for (const origin of [
    "",
    "http://example.com",
    "https://localhost",
    "https://127.0.0.1",
    "https://[::1]",
    "https://example.com",
    "https://edgeone.app",
    "https://stray-pages.edgeone.app.evil.example",
    "https://user:password@example.com",
    "https://example.com/path",
    "https://example.com?secret=value",
  ]) {
    await context.test(origin || "empty", async () => {
      let calls = 0;
      const result = await smokeApi.runEdgeOneSmoke!({ origin }, async () => {
        calls += 1;
        return new Response("unexpected");
      });
      assert.equal(result.ok, false);
      assert.deepEqual(result.checks, [
        { name: "configuration", ok: false, status: null, code: "INVALID_CONFIG" },
      ]);
      assert.equal(calls, 0);
    });
  }
});

test("redirects, oversized responses and extra health fields fail closed without body disclosure", async (context) => {
  const smokeApi = await loadSmokeModule();
  assert.equal(typeof smokeApi.runEdgeOneSmoke, "function");
  const origin = "https://stray-pages.edgeone.app";

  await context.test("redirect", async () => {
    const result = await smokeApi.runEdgeOneSmoke!({ origin }, async () =>
      new Response("do-not-leak", { status: 302, headers: { location: "https://evil.example" } }));
    assert.equal(result.ok, false);
    assert.equal(result.checks[0]?.code, "REDIRECT_FORBIDDEN");
    assert.equal(JSON.stringify(result).includes("do-not-leak"), false);
  });

  await context.test("oversized", async () => {
    const result = await smokeApi.runEdgeOneSmoke!({ origin, maxResponseBytes: 8 }, async (input) => {
      if (String(input).endsWith("/api/health")) {
        return Response.json({
          status: "ok",
          configured: true,
          capabilities: { web: true, auth: true, blob: true, quota: true },
        });
      }
      if (String(input).endsWith("/api/cloud/books")) return new Response(null, { status: 401 });
      return new Response("123456789", { status: 200 });
    });
    assert.equal(result.ok, false);
    assert.equal(result.checks[0]?.code, "RESPONSE_TOO_LARGE");
  });

  await context.test("extra health field", async () => {
    const result = await smokeApi.runEdgeOneSmoke!({ origin }, async (input) => {
      if (String(input).endsWith("/api/health")) {
        return Response.json({
          status: "ok",
          configured: true,
          capabilities: { web: true, auth: true, blob: true, quota: true },
          store: "must-not-be-exposed",
        });
      }
      if (String(input).endsWith("/api/cloud/books")) return new Response(null, { status: 401 });
      return new Response(null, { status: 200 });
    });
    assert.equal(result.ok, false);
    assert.equal(result.checks.find((check) => check.name === "health")?.code, "INVALID_HEALTH");
    assert.equal(JSON.stringify(result).includes("must-not-be-exposed"), false);
  });
});
