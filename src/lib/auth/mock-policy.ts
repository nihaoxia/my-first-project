export const mockOtpCode = "123456";
export const mockAdminPhoneSuffix = "0000";

export type UserRole = "USER" | "ADMIN";

type MockLoginFailureReason = "phone" | "code";

export type MockLoginValidationResult =
  | {
      ok: true;
      phone: string;
      role: UserRole;
    }
  | {
      ok: false;
      reason: MockLoginFailureReason;
    };

export function normalizePhoneInput(phone: string) {
  return phone.trim();
}

export function isValidMainlandChinaPhone(phone: string) {
  return /^1\d{10}$/.test(normalizePhoneInput(phone));
}

export function getMockUserRole(phone: string): UserRole {
  return normalizePhoneInput(phone).endsWith(mockAdminPhoneSuffix) ? "ADMIN" : "USER";
}

export function validateMockLoginInput(phoneInput: string, codeInput: string): MockLoginValidationResult {
  const phone = normalizePhoneInput(phoneInput);
  const code = codeInput.trim();

  if (!isValidMainlandChinaPhone(phone)) {
    return { ok: false, reason: "phone" };
  }

  if (code !== mockOtpCode) {
    return { ok: false, reason: "code" };
  }

  return {
    ok: true,
    phone,
    role: getMockUserRole(phone),
  };
}

export function getSafeRedirectPath(nextPath: string | null | undefined, fallback = "/library") {
  if (!nextPath) {
    return fallback;
  }

  const trimmed = nextPath.trim();

  if (!trimmed.startsWith("/") || trimmed.startsWith("//") || trimmed.includes("://")) {
    return fallback;
  }

  return trimmed;
}
