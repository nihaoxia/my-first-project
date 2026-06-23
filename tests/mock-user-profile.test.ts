import test from "node:test";
import assert from "node:assert/strict";

import {
  buildMockUserProfile,
  maskPhoneNumber,
} from "../src/lib/auth/mock-user-profile.ts";

test("masks valid mainland China phone numbers for display", () => {
  assert.equal(maskPhoneNumber("13811112222"), "138****2222");
});

test("leaves invalid phone numbers unchanged when masking", () => {
  assert.equal(maskPhoneNumber("12345"), "12345");
});

test("builds a normal user profile from a mock session", () => {
  assert.deepEqual(
    buildMockUserProfile({
      phone: "13811112222",
      role: "USER",
    }),
    {
      phone: "13811112222",
      maskedPhone: "138****2222",
      role: "USER",
      roleLabel: "普通用户",
      isAdmin: false,
      balanceYuan: "12.30",
      frozenYuan: "0.40",
      freeChaptersLeft: 5,
    },
  );
});

test("builds an administrator profile from a mock session", () => {
  const profile = buildMockUserProfile({
    phone: "13800000000",
    role: "ADMIN",
  });

  assert.equal(profile?.roleLabel, "管理员");
  assert.equal(profile?.isAdmin, true);
});

test("returns null when there is no session", () => {
  assert.equal(buildMockUserProfile(null), null);
});
