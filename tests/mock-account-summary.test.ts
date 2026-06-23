import test from "node:test";
import assert from "node:assert/strict";

import {
  buildMockAccountSummary,
  formatYuanFromCents,
} from "../src/lib/account/mock-account-summary.ts";

test("formats integer cents as yuan strings", () => {
  assert.equal(formatYuanFromCents(1230), "12.30");
  assert.equal(formatYuanFromCents(5), "0.05");
});

test("builds the default development account summary", () => {
  assert.deepEqual(buildMockAccountSummary(), {
    balanceYuan: "12.30",
    frozenYuan: "0.40",
    availableYuan: "11.90",
    freeChaptersLeft: 12,
  });
});

test("does not show negative available balance when frozen amount is larger than balance", () => {
  assert.equal(
    buildMockAccountSummary({
      balanceCents: 30,
      frozenCents: 40,
      freeChaptersLeft: 0,
    }).availableYuan,
    "0.00",
  );
});
