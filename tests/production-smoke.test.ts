import assert from "node:assert/strict";
import test from "node:test";

import {
  runProductionSmoke,
  type ProductionSmokeConfig,
  type ProductionSmokeFetch,
} from "../src/lib/deployment/production-smoke-core.ts";

const validConfig: ProductionSmokeConfig = {
  appUrl: "https://app.example.com",
  supabaseUrl: "https://api.example.com",
  timeoutMs: 100,
};

test("smoke summary reports every public capability without echoing credentials", async () => {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  const fakeFetch: ProductionSmokeFetch = async (input, init) => {
    const url = String(input);
    calls.push({ url, init });
    if (url === "https://app.example.com/api/health") return Response.json({ status: "ok", configured: true });
    return new Response("ok", {
      status: 200,
      headers: {
        "strict-transport-security": "max-age=31536000; includeSubDomains",
        "x-content-type-options": "nosniff",
      },
    });
  };

  const result = await runProductionSmoke(validConfig, fakeFetch);

  assert.equal(result.ok, true);
  assert.deepEqual(result.checks.map((check) => check.name), [
    "app-health",
    "app-home",
    "supabase-auth",
    "supabase-rest",
    "security-headers",
  ]);
  assert.equal(calls.some((call) => call.url.includes("mcp")), false);
  assert.equal(calls.some((call) => call.init?.headers), false);
});

test("invalid or non-HTTPS production URLs fail before making a request", async () => {
  let calls = 0;
  const fakeFetch: ProductionSmokeFetch = async () => {
    calls += 1;
    return new Response("unexpected");
  };

  const result = await runProductionSmoke(
    { ...validConfig, appUrl: "http://app.example.com" },
    fakeFetch,
  );

  assert.equal(result.ok, false);
  assert.deepEqual(result.checks, [
    { name: "configuration", ok: false, status: null, code: "INVALID_CONFIG" },
  ]);
  assert.equal(calls, 0);
});

test("timeouts and network errors are classified without response bodies", async () => {
  const fakeFetch: ProductionSmokeFetch = async (input) => {
    const url = String(input);
    if (url.includes("/api/health")) {
      throw new DOMException("provider secret leaked", "AbortError");
    }
    if (url.includes("/rest/v1/")) throw new Error("private upstream detail");
    return new Response("private body", { status: url === "https://app.example.com/" ? 500 : 200 });
  };

  const result = await runProductionSmoke(validConfig, fakeFetch);
  const byName = new Map(result.checks.map((check) => [check.name, check]));

  assert.equal(result.ok, false);
  assert.equal(byName.get("app-health")?.code, "TIMEOUT");
  assert.equal(byName.get("supabase-rest")?.code, "NETWORK");
  assert.deepEqual(byName.get("app-home"), {
    name: "app-home",
    ok: false,
    status: 500,
    code: "UNEXPECTED_STATUS",
  });
  assert.equal(JSON.stringify(result).includes("private"), false);
});

test("app health JSON must report configured readiness", async () => {
  const fakeFetch: ProductionSmokeFetch = async (input) => {
    const url = String(input);
    if (url.endsWith("/api/health")) return Response.json({ status: "ok", configured: false });
    return new Response("ok", { status: 200, headers: { "strict-transport-security": "max-age=1", "x-content-type-options": "nosniff" } });
  };

  const result = await runProductionSmoke(validConfig, fakeFetch);

  assert.deepEqual(result.checks.find((check) => check.name === "app-health"), {
    name: "app-health",
    ok: false,
    status: 200,
    code: "UNEXPECTED_STATUS",
  });
});
