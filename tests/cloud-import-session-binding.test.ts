import assert from "node:assert/strict";
import test from "node:test";

import {
  createCloudImportSessionBinding,
  verifyCloudImportSessionBinding,
} from "../src/lib/cloud/import-session-binding-core.ts";

const secret = "s".repeat(64);
const userA = "11111111-1111-4111-8111-111111111111";
const userB = "22222222-2222-4222-8222-222222222222";
const issuedAt = new Date("2026-07-21T10:00:00.000Z");

test("cloud import binding is opaque, purpose-bound, and accepted only for its issuing session", () => {
  const token = createCloudImportSessionBinding({ userId: userA, secret, now: issuedAt });
  assert.doesNotMatch(token, new RegExp(userA, "i"));
  assert.equal(verifyCloudImportSessionBinding({ token, userId: userA, secret, now: issuedAt }), true);
  assert.equal(verifyCloudImportSessionBinding({ token, userId: userB, secret, now: issuedAt }), false);
});

test("cloud import binding rejects expiry, tampering, malformed values, and a different secret", () => {
  const token = createCloudImportSessionBinding({ userId: userA, secret, now: issuedAt });
  const expiresAt = new Date(issuedAt.getTime() + 30 * 60 * 1_000 + 1);
  assert.equal(verifyCloudImportSessionBinding({ token, userId: userA, secret, now: expiresAt }), false);
  assert.equal(verifyCloudImportSessionBinding({ token: `${token.slice(0, -1)}x`, userId: userA, secret, now: issuedAt }), false);
  assert.equal(verifyCloudImportSessionBinding({ token: "not-a-token", userId: userA, secret, now: issuedAt }), false);
  assert.equal(verifyCloudImportSessionBinding({ token, userId: userA, secret: "x".repeat(64), now: issuedAt }), false);
});
