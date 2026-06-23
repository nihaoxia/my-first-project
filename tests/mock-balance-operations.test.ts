import test from "node:test";
import assert from "node:assert/strict";

import {
  applyMockBalanceCharge,
  applyMockBalanceHold,
  applyMockBalanceRelease,
  canCreateMockBalanceHold,
} from "../src/lib/account/mock-balance-operations.ts";

const baseAccount = {
  balanceCents: 1230,
  frozenCents: 40,
  freeChaptersLeft: 12,
};

test("allows a hold when available balance covers the estimated cost", () => {
  assert.deepEqual(canCreateMockBalanceHold(baseAccount, 300), {
    ok: true,
    availableCents: 1190,
  });
});

test("rejects a hold when available balance is lower than the estimated cost", () => {
  assert.deepEqual(canCreateMockBalanceHold(baseAccount, 1300), {
    ok: false,
    reason: "insufficient-balance",
    availableCents: 1190,
  });
});

test("moves available balance into frozen balance when creating a hold", () => {
  assert.deepEqual(applyMockBalanceHold(baseAccount, 300), {
    balanceCents: 1230,
    frozenCents: 340,
    freeChaptersLeft: 12,
  });
});

test("releases frozen balance after a failed task", () => {
  assert.deepEqual(applyMockBalanceRelease(baseAccount, 30), {
    balanceCents: 1230,
    frozenCents: 10,
    freeChaptersLeft: 12,
  });
});

test("does not release more than the frozen balance", () => {
  assert.deepEqual(applyMockBalanceRelease(baseAccount, 100), {
    balanceCents: 1230,
    frozenCents: 0,
    freeChaptersLeft: 12,
  });
});

test("charges frozen balance after a completed task", () => {
  assert.deepEqual(applyMockBalanceCharge(baseAccount, 30), {
    balanceCents: 1200,
    frozenCents: 10,
    freeChaptersLeft: 12,
  });
});
