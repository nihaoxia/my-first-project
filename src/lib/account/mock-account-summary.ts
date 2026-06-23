export type MockAccountInput = {
  balanceCents: number;
  frozenCents: number;
  freeChaptersLeft: number;
};

export type MockAccountSummary = {
  balanceYuan: string;
  frozenYuan: string;
  availableYuan: string;
  freeChaptersLeft: number;
};

const defaultMockAccount: MockAccountInput = {
  balanceCents: 1230,
  frozenCents: 40,
  freeChaptersLeft: 12,
};

export function buildMockAccountSummary(input: MockAccountInput = defaultMockAccount): MockAccountSummary {
  const availableCents = Math.max(0, input.balanceCents - input.frozenCents);

  return {
    balanceYuan: formatYuanFromCents(input.balanceCents),
    frozenYuan: formatYuanFromCents(input.frozenCents),
    availableYuan: formatYuanFromCents(availableCents),
    freeChaptersLeft: input.freeChaptersLeft,
  };
}

export function formatYuanFromCents(cents: number) {
  return (cents / 100).toFixed(2);
}
