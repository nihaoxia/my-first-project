import assert from "node:assert/strict";
import test from "node:test";

let subject: typeof import("../src/lib/auth/edgeone-auth-rate-limit-core.ts") | undefined;
try { subject = await import("../src/lib/auth/edgeone-auth-rate-limit-core.ts"); } catch { /* red */ }
function api() { if (!subject) assert.fail("auth rate limit core must be implemented"); return subject; }

test("five attempts per username and client are allowed inside fifteen minutes", () => {
  const events = Array.from({ length: 5 }, (_, index) => ({
    id: `10000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    subjectHash: "subject", clientHash: "client", action: "login" as const,
    at: `2026-07-12T00:0${index}:00.000Z`,
  }));
  assert.throws(() => api().assertAuthAttemptAllowed(events, {
    subjectHash: "subject", clientHash: "client", action: "login",
    now: new Date("2026-07-12T00:10:00.000Z"),
  }), { code: "AUTH_RATE_LIMITED" });
  assert.doesNotThrow(() => api().assertAuthAttemptAllowed(events, {
    subjectHash: "subject", clientHash: "another", action: "login",
    now: new Date("2026-07-12T00:10:00.000Z"),
  }));
});

test("attempts outside the window and other actions do not consume the limit", () => {
  const event = { id: "10000000-0000-4000-8000-000000000001", subjectHash: "subject", clientHash: "client", action: "register" as const, at: "2026-07-12T00:00:00.000Z" };
  assert.doesNotThrow(() => api().assertAuthAttemptAllowed([event], {
    subjectHash: "subject", clientHash: "client", action: "login",
    now: new Date("2026-07-12T01:00:00.000Z"),
  }));
});

test("a corrupt or duplicated attempt ledger fails closed", () => {
  const input = {
    subjectHash: "subject", clientHash: "client", action: "login" as const,
    now: new Date("2026-07-12T00:10:00.000Z"),
  };
  const event = {
    id: "10000000-0000-4000-8000-000000000001",
    subjectHash: "subject", clientHash: "client", action: "login" as const,
    at: "2026-07-12T00:00:00.000Z",
  };
  assert.throws(() => api().assertAuthAttemptAllowed([event, event], input), {
    code: "AUTH_RATE_LEDGER_INVALID",
  });
  assert.throws(() => api().assertAuthAttemptAllowed([{ ...event, at: "invalid" }], input), {
    code: "AUTH_RATE_LEDGER_INVALID",
  });
});
