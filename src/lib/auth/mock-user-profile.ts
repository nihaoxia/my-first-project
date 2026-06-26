import { buildMockAccountSummary } from "../account/mock-account-summary.ts";

type MockUserRole = "USER" | "ADMIN";

export type MockUserProfileSession = {
  phone: string;
  role: MockUserRole;
};

export type MockUserProfile = {
  phone: string;
  maskedPhone: string;
  role: MockUserRole;
  roleLabel: string;
  isAdmin: boolean;
  balanceYuan: string;
  freeChaptersLeft: number;
};

export function buildMockUserProfile(session: MockUserProfileSession | null): MockUserProfile | null {
  if (!session) {
    return null;
  }

  const isAdmin = session.role === "ADMIN";
  const accountSummary = buildMockAccountSummary();

  return {
    phone: session.phone,
    maskedPhone: maskPhoneNumber(session.phone),
    role: session.role,
    roleLabel: isAdmin ? "管理员" : "普通用户",
    isAdmin,
    balanceYuan: accountSummary.balanceYuan,
    freeChaptersLeft: accountSummary.freeChaptersLeft,
  };
}

export function maskPhoneNumber(phone: string) {
  const normalized = phone.trim();

  if (!/^1\d{10}$/.test(normalized)) {
    return normalized;
  }

  return `${normalized.slice(0, 3)}****${normalized.slice(7)}`;
}
