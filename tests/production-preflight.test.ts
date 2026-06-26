import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateProductionPreflight,
  getProductionEnvRequirements,
  getProductionRolloutSteps,
} from "../src/lib/launch/production-preflight.ts";

test("lists production environment requirements without real secret values", () => {
  const requirements = getProductionEnvRequirements();
  const keys = requirements.map((requirement) => requirement.key);

  assert.ok(keys.includes("DATABASE_URL"));
  assert.ok(keys.includes("DIRECT_URL"));
  assert.ok(keys.includes("NEXT_PUBLIC_SUPABASE_URL"));
  assert.ok(keys.includes("NEXT_PUBLIC_SUPABASE_ANON_KEY"));
  assert.ok(keys.includes("SUPABASE_SERVICE_ROLE_KEY"));
  assert.ok(keys.includes("NEXT_PUBLIC_APP_URL"));
  assert.ok(keys.includes("MOCK_AUTH_ENABLED"));
  assert.ok(requirements.some((requirement) => requirement.sensitive));
});

test("flags missing placeholder and unsafe production configuration", () => {
  const result = evaluateProductionPreflight({
    DATABASE_URL: "",
    DIRECT_URL: "postgresql://user:pass@example.com/db",
    NEXT_PUBLIC_SUPABASE_URL: "not-a-url",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "your-anon-key",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-secret",
    MOCK_AUTH_ENABLED: "true",
    NEXT_PUBLIC_APP_URL: "http://localhost:3000",
  });

  assert.equal(result.ready, false);
  assert.match(result.missingKeys.join("\n"), /DATABASE_URL/);
  assert.match(result.placeholderKeys.join("\n"), /NEXT_PUBLIC_SUPABASE_ANON_KEY/);
  assert.match(result.risks.join("\n"), /Supabase URL/);
  assert.match(result.risks.join("\n"), /开发期 mock 登录/);
  assert.match(result.risks.join("\n"), /HTTPS/);
  assert.doesNotMatch(JSON.stringify(result), /service-role-secret/);
});

test("passes local evaluation when required production values are shaped correctly", () => {
  const result = evaluateProductionPreflight({
    DATABASE_URL: "postgresql://user:pass@db.example.com:5432/app",
    DIRECT_URL: "postgresql://user:pass@db.example.com:5432/app",
    NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key-present",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-key-present",
    MOCK_AUTH_ENABLED: "false",
    NEXT_PUBLIC_APP_URL: "https://stray-pages.example.com",
  });

  assert.equal(result.ready, true);
  assert.equal(result.missingKeys.length, 0);
  assert.equal(result.placeholderKeys.length, 0);
  assert.equal(result.risks.length, 0);
  assert.equal(result.requiredCount, result.readyCount);
});

test("keeps real rollout steps explicit", () => {
  const steps = getProductionRolloutSteps();
  const labels = steps.map((step) => step.label).join("\n");

  assert.match(labels, /Vercel/);
  assert.match(labels, /Supabase/);
  assert.match(labels, /mock 登录/);
  assert.match(labels, /短信、支付和 AI Provider/);
  assert.match(labels, /后台队列/);
  assert.match(labels, /截图级视觉验收/);
});
