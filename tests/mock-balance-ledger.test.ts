import test from "node:test";
import assert from "node:assert/strict";

import {
  buildMockBalanceRecords,
  formatSignedYuanFromCents,
  getLedgerTypeLabel,
} from "../src/lib/account/mock-balance-ledger.ts";

test("formats signed ledger amounts from cents", () => {
  assert.equal(formatSignedYuanFromCents(500), "+5.00");
  assert.equal(formatSignedYuanFromCents(-40), "-0.40");
  assert.equal(formatSignedYuanFromCents(0), "0.00");
});

test("maps ledger types to Chinese display labels", () => {
  assert.equal(getLedgerTypeLabel("HOLD"), "冻结");
  assert.equal(getLedgerTypeLabel("RELEASE"), "失败返还");
  assert.equal(getLedgerTypeLabel("MANUAL_ADJUSTMENT"), "手动加余额");
});

test("builds display records for the admin balance panel", () => {
  assert.deepEqual(buildMockBalanceRecords(), [
    {
      user: "138****1024",
      type: "冻结",
      amount: "-0.40",
      time: "17:31",
    },
    {
      user: "138****1024",
      type: "失败返还",
      amount: "+0.30",
      time: "17:42",
    },
    {
      user: "186****7731",
      type: "手动加余额",
      amount: "+5.00",
      time: "15:12",
    },
  ]);
});
