export type MockLedgerType = "HOLD" | "RELEASE" | "MANUAL_ADJUSTMENT";

export type MockBalanceLedgerEntry = {
  user: string;
  type: MockLedgerType;
  amountCents: number;
  time: string;
};

export type MockBalanceRecord = {
  user: string;
  type: string;
  amount: string;
  time: string;
};

const defaultLedgerEntries: MockBalanceLedgerEntry[] = [
  { user: "138****1024", type: "HOLD", amountCents: -40, time: "17:31" },
  { user: "138****1024", type: "RELEASE", amountCents: 30, time: "17:42" },
  { user: "186****7731", type: "MANUAL_ADJUSTMENT", amountCents: 500, time: "15:12" },
];

const ledgerTypeLabels: Record<MockLedgerType, string> = {
  HOLD: "冻结",
  RELEASE: "失败返还",
  MANUAL_ADJUSTMENT: "手动加余额",
};

export function buildMockBalanceRecords(entries = defaultLedgerEntries): MockBalanceRecord[] {
  return entries.map((entry) => ({
    user: entry.user,
    type: getLedgerTypeLabel(entry.type),
    amount: formatSignedYuanFromCents(entry.amountCents),
    time: entry.time,
  }));
}

export function getLedgerTypeLabel(type: MockLedgerType) {
  return ledgerTypeLabels[type];
}

export function formatSignedYuanFromCents(cents: number) {
  if (cents === 0) {
    return "0.00";
  }

  const sign = cents > 0 ? "+" : "-";
  return `${sign}${(Math.abs(cents) / 100).toFixed(2)}`;
}
