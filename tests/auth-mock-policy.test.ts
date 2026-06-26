import test from "node:test";
import assert from "node:assert/strict";

import {
  getMockUserRole,
  getSafeRedirectPath,
  isMockAuthEnabled,
  validateMockLoginInput,
} from "../src/lib/auth/mock-policy.ts";

test("mock login accepts the development OTP and derives normal user role", () => {
  const result = validateMockLoginInput("13811112222", "123456");

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
  assert.deepEqual(validateMockLoginInput("12345", "123456"), {
    ok: false,
    reason: "phone",
  });
});

test("mock login rejects non-development OTP codes", () => {
  assert.deepEqual(validateMockLoginInput("13811112222", "000000"), {
    ok: false,
    reason: "code",
  });
});

test("mock auth is disabled by default in production-like environments", () => {
  assert.equal(isMockAuthEnabled({ NODE_ENV: "production", MOCK_AUTH_ENABLED: undefined }), false);
  assert.equal(isMockAuthEnabled({ NODE_ENV: "production", MOCK_AUTH_ENABLED: "false" }), false);
  assert.equal(isMockAuthEnabled({ NODE_ENV: "production", MOCK_AUTH_ENABLED: "true" }), true);
  assert.equal(isMockAuthEnabled({ NODE_ENV: "development", MOCK_AUTH_ENABLED: undefined }), true);
});

test("safe redirect accepts internal application paths", () => {
  assert.equal(getSafeRedirectPath("/upload?step=chapters"), "/upload?step=chapters");
});

test("safe redirect rejects external URLs and protocol-relative URLs", () => {
  assert.equal(getSafeRedirectPath("https://example.com/phishing"), "/library");
  assert.equal(getSafeRedirectPath("//example.com/phishing"), "/library");
});
