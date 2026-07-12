import test from "node:test";
import assert from "node:assert/strict";

import {
  getMockUserRole,
  getSafeRedirectPath,
  isMockAuthEnabled,
  parseMockSessionValue,
  validateMockLoginInput,
} from "../src/lib/auth/mock-policy.ts";

const developmentMockEnvironment = {
  NODE_ENV: "development",
  MOCK_AUTH_ENABLED: "true",
};

test("mock login accepts the development OTP and derives normal user role", () => {
  const result = validateMockLoginInput("13811112222", "123456", developmentMockEnvironment);

  assert.deepEqual(result, {
    ok: true,
    phone: "13811112222",
    role: "USER",
  });
});

test("mock login marks phone numbers ending in 0000 as administrators", () => {
  assert.equal(getMockUserRole("13800000000"), "ADMIN");
});

test("mock login rejects invalid phone numbers before checking access", () => {
  assert.deepEqual(validateMockLoginInput("12345", "123456", developmentMockEnvironment), {
    ok: false,
    reason: "phone",
  });
});

test("mock login rejects non-development OTP codes", () => {
  assert.deepEqual(validateMockLoginInput("13811112222", "000000", developmentMockEnvironment), {
    ok: false,
    reason: "code",
  });
});

test("mock auth is unconditionally disabled in production", () => {
  assert.equal(isMockAuthEnabled({ NODE_ENV: "production", MOCK_AUTH_ENABLED: undefined }), false);
  assert.equal(isMockAuthEnabled({ NODE_ENV: "production", MOCK_AUTH_ENABLED: "false" }), false);
  assert.equal(isMockAuthEnabled({ NODE_ENV: "production", MOCK_AUTH_ENABLED: "true" }), false);
  assert.equal(isMockAuthEnabled({ NODE_ENV: "development", MOCK_AUTH_ENABLED: undefined }), false);
  assert.equal(isMockAuthEnabled({ NODE_ENV: "development", MOCK_AUTH_ENABLED: "" }), false);
  assert.equal(isMockAuthEnabled({ NODE_ENV: "development", MOCK_AUTH_ENABLED: "false" }), false);
  assert.equal(isMockAuthEnabled({ NODE_ENV: "development", MOCK_AUTH_ENABLED: "TRUE" }), false);
  assert.equal(isMockAuthEnabled({ NODE_ENV: "development", MOCK_AUTH_ENABLED: "true" }), true);
});

test("safe redirect accepts internal application paths", () => {
  assert.equal(getSafeRedirectPath("/upload?step=chapters"), "/upload?step=chapters");
});

test("safe redirect rejects external URLs and protocol-relative URLs", () => {
  assert.equal(getSafeRedirectPath("https://example.com/phishing"), "/library");
  assert.equal(getSafeRedirectPath("//example.com/phishing"), "/library");
});

test("safe redirect rejects browser-normalized backslash origins", () => {
  assert.equal(getSafeRedirectPath("/\\\\evil.example/path"), "/library");
  assert.equal(getSafeRedirectPath("/%5c%5cevil.example/path"), "/library");
  assert.equal(getSafeRedirectPath("/%255c%255cevil.example/path"), "/library");
});

test("mock session cookies are ignored when mock auth is disabled", () => {
  const raw = encodeURIComponent(JSON.stringify({ phone: "13800000000", role: "ADMIN" }));

  assert.equal(
    parseMockSessionValue(raw, { NODE_ENV: "production", MOCK_AUTH_ENABLED: undefined }),
    null,
  );
});

test("mock session roles are derived from a validated phone instead of trusting cookie JSON", () => {
  const raw = encodeURIComponent(JSON.stringify({ phone: "13811112222", role: "ADMIN" }));

  assert.deepEqual(
    parseMockSessionValue(raw, { NODE_ENV: "development", MOCK_AUTH_ENABLED: "true" }),
    { phone: "13811112222", role: "USER" },
  );
});
