import assert from "node:assert/strict";
import test from "node:test";

import {
  runProductionSmoke,
  type ProductionSmokeConfig,
  type ProductionSmokeFetch,
} from "../src/lib/deployment/production-smoke-core.ts";

const secret = "secret-that-must-never-appear-123456";
const validConfig: ProductionSmokeConfig = {
  appUrl: "https://app.example.com",
  mcpUrl: "https://mcp.example.com/mcp",
  supabaseUrl: "https://project.supabase.co",
  supabaseAnonKey: secret,
  mcpSecret: secret,
  timeoutMs: 100,
};

test("smoke summary reports every public capability without echoing credentials", async () => {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  const fakeFetch: ProductionSmokeFetch = async (input, init) => {
    const url = String(input);
    calls.push({ url, init });
    if (url === "https://mcp.example.com/mcp") {
      return new Response('{"error":"Unauthorized"}', { status: 401 });
    }
    if (url === "https://mcp.example.com/health") {
      return Response.json({ status: "ok", configured: true });
    }
    return new Response("ok", { status: 200 });
  };

  const result = await runProductionSmoke(validConfig, fakeFetch);

  assert.equal(result.ok, true);
  assert.deepEqual(result.checks.map((check) => check.name), [
    "app-home",
    "mcp-health",
    "mcp-unauthorized",
    "supabase-auth",
    "supabase-rest",
    "supabase-storage",
  ]);
  assert.equal(JSON.stringify(result).includes(secret), false);
  assert.equal(calls.some((call) => call.url.includes(secret)), false);
  assert.equal(
    calls.find((call) => call.url.endsWith("/mcp"))?.init?.headers instanceof Headers,
    true,
  );
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
    if (url.includes("/health")) {
      throw new DOMException("provider secret leaked", "AbortError");
    }
    if (url.includes("/rest/v1/")) throw new Error("private upstream detail");
    return url.endsWith("/mcp")
      ? new Response("private body", { status: 500 })
      : new Response("ok", { status: 200 });
  };

  const result = await runProductionSmoke(validConfig, fakeFetch);
  const byName = new Map(result.checks.map((check) => [check.name, check]));

  assert.equal(result.ok, false);
  assert.equal(byName.get("mcp-health")?.code, "TIMEOUT");
  assert.equal(byName.get("supabase-rest")?.code, "NETWORK");
  assert.deepEqual(byName.get("mcp-unauthorized"), {
    name: "mcp-unauthorized",
    ok: false,
    status: 500,
    code: "UNEXPECTED_STATUS",
  });
  assert.equal(JSON.stringify(result).includes("private"), false);
});

test("health JSON must report configured readiness", async () => {
  const fakeFetch: ProductionSmokeFetch = async (input) => {
    const url = String(input);
    if (url.endsWith("/health")) return Response.json({ status: "ok", configured: false });
    if (url.endsWith("/mcp")) return new Response("", { status: 401 });
    return new Response("ok", { status: 200 });
  };

  const result = await runProductionSmoke(validConfig, fakeFetch);

  assert.deepEqual(result.checks.find((check) => check.name === "mcp-health"), {
    name: "mcp-health",
    ok: false,
    status: 200,
    code: "UNEXPECTED_STATUS",
  });
});
