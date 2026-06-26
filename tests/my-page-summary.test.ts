import assert from "node:assert/strict";
import test from "node:test";

import { buildMyPageSummary } from "../src/lib/account/my-page-summary.ts";

test("builds a user-facing account summary without internal concepts", () => {
  const summary = buildMyPageSummary({
    balanceYuan: "128.00",
    freeChaptersLeft: 5,
    translatedBookCount: 2,
    originalBookCount: 1,
    recentTaskCount: 3,
  });

  assert.equal(summary.accountItems.length, 3);
  assert.match(summary.accountItems.map((item) => item.label).join("\n"), /账户余额/);
  assert.match(summary.accountItems.map((item) => item.label).join("\n"), /免费标准章/);
  assert.equal(summary.libraryItems.length, 3);
  assert.doesNotMatch(JSON.stringify(summary), /冻结|可用|token|模型|API|Provider|成本|术语本/);
});
