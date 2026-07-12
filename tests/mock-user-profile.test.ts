import test from "node:test";
import assert from "node:assert/strict";

import { buildMockUserProfile } from "../src/lib/auth/mock-user-profile.ts";

test("builds account-label profiles without a phone field", () => {
  assert.deepEqual(buildMockUserProfile({ accountLabel: "reader_01", role: "USER" }), {
    accountLabel: "reader_01",
    role: "USER",
    roleLabel: "普通用户",
    isAdmin: false,
    balanceYuan: "12.30",
    freeChaptersLeft: 5,
  });
  assert.equal(buildMockUserProfile({ accountLabel: "admin", role: "ADMIN" })?.roleLabel, "管理员");
  assert.equal(buildMockUserProfile(null), null);
});
