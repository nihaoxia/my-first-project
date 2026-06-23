import test from "node:test";
import assert from "node:assert/strict";

import { getLibraryAccessNotice } from "../src/lib/auth/access-notice.ts";

test("returns a clear notice when a normal user is redirected away from admin pages", () => {
  assert.deepEqual(getLibraryAccessNotice("admin"), {
    tone: "warning",
    title: "需要管理员权限",
    message: "当前账号没有后台访问权限，已返回私人书架。",
  });
});

test("returns null for unknown library access errors", () => {
  assert.equal(getLibraryAccessNotice("other"), null);
});

test("returns null when there is no library access error", () => {
  assert.equal(getLibraryAccessNotice(undefined), null);
});
