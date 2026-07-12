import assert from "node:assert/strict";
import test from "node:test";

let subject: typeof import("../src/lib/auth/edgeone-cookie.ts") | undefined;
try { subject = await import("../src/lib/auth/edgeone-cookie.ts"); } catch { /* red */ }
function api() { if (!subject) assert.fail("edgeone-cookie must be implemented"); return subject; }

test("session cookies are HttpOnly, Secure, SameSite Lax and root scoped", () => {
  const calls: unknown[] = [];
  const store = {
    set(...args: unknown[]) { calls.push(args); },
  };
  api().setEdgeOneSessionCookie(store, "a".repeat(43));
  assert.deepEqual(calls, [["stray_pages_session", "a".repeat(43), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 24 * 60 * 60,
  }]]);
});

test("session cookies can be read and cleared without exposing the token elsewhere", () => {
  const calls: unknown[] = [];
  const store = {
    get(name: string) { return name === "stray_pages_session" ? { value: "b".repeat(43) } : undefined; },
    set(...args: unknown[]) { calls.push(args); },
  };
  assert.equal(api().readEdgeOneSessionCookie(store), "b".repeat(43));
  api().clearEdgeOneSessionCookie(store);
  assert.deepEqual(calls, [["stray_pages_session", "", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  }]]);
});

