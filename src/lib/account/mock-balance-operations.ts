import type { MockAccountInput } from "./mock-account-summary.ts";

export type MockBalanceHoldDecision =
  | {
      ok: true;
      availableCents: number;
    }
  | {
      ok: false;
      reason: "insufficient-balance";
      availableCents: number;
    };

export function canCreateMockBalanceHold(
  account: MockAccountInput,
  estimatedCostCents: number,
): MockBalanceHoldDecision {
  const availableCents = getAvailableCents(account);

  if (availableCents < estimatedCostCents) {
    return {
      ok: false,
      reason: "insufficient-balance",
      availableCents,
    };
  }

  return {
    ok: true,
    availableCents,
  };
}

export function applyMockBalanceHold(account: MockAccountInput, amountCents: number): MockAccountInput {
  return {
    ...account,
    frozenCents: account.frozenCents + amountCents,
  };
}

export function applyMockBalanceRelease(account: MockAccountInput, amountCents: number): MockAccountInput {
  return {
    ...account,
    frozenCents: Math.max(0, account.frozenCents - amountCents),
  };
}

export function applyMockBalanceCharge(account: MockAccountInput, amountCents: number): MockAccountInput {
  const chargedCents = Math.min(account.frozenCents, amountCents);

  return {
    ...account,
    balanceCents: Math.max(0, account.balanceCents - chargedCents),
    frozenCents: Math.max(0, account.frozenCents - chargedCents),
  };
}

function getAvailableCents(account: MockAccountInput) {
  return Math.max(0, account.balanceCents - account.frozenCents);
}
