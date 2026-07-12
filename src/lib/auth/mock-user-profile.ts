import { buildMockAccountSummary } from "../account/mock-account-summary.ts";

type UserRole = "USER" | "ADMIN";

export type MockUserProfileSession = {
  accountLabel: string;
  role: UserRole;
};

export type MockUserProfile = {
  accountLabel: string;
  role: UserRole;
  roleLabel: string;
  isAdmin: boolean;
  balanceYuan: string;
  freeChaptersLeft: number;
};

export function buildMockUserProfile(
  session: MockUserProfileSession | null,
): MockUserProfile | null {
  if (!session) return null;
  const isAdmin = session.role === "ADMIN";
  const accountSummary = buildMockAccountSummary();
  return {
    accountLabel: session.accountLabel,
    role: session.role,
    roleLabel: isAdmin ? "管理员" : "普通用户",
    isAdmin,
    balanceYuan: accountSummary.balanceYuan,
    freeChaptersLeft: accountSummary.freeChaptersLeft,
  };
}
