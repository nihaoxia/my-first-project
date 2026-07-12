export const mockOtpCode = "123456";
export const mockAdminPhoneSuffix = "0000";

export type UserRole = "USER" | "ADMIN";

export type MockSessionValue = {
  phone: string;
  role: UserRole;
};

type MockLoginFailureReason = "phone" | "code" | "mock-disabled";

export type MockAuthEnvironment = {
  NODE_ENV?: string;
  MOCK_AUTH_ENABLED?: string;
};

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

export function validateMockLoginInput(
  phoneInput: string,
  codeInput: string,
  env: MockAuthEnvironment = process.env,
): MockLoginValidationResult {
  if (!isMockAuthEnabled(env)) {
    return { ok: false, reason: "mock-disabled" };
  }

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

  if (!trimmed.startsWith("/") || hasUnsafeRedirectSyntax(trimmed)) {
    return fallback;
  }

  try {
    const applicationOrigin = "https://stray-pages.local";
    const resolved = new URL(trimmed, applicationOrigin);

    return resolved.origin === applicationOrigin ? trimmed : fallback;
  } catch {
    return fallback;
  }
}

export function isMockAuthEnabled(env: MockAuthEnvironment = process.env) {
  if (env.NODE_ENV === "production") {
    return false;
  }

  return env.MOCK_AUTH_ENABLED === "true";
}

export function parseMockSessionValue(
  raw: string | undefined,
  env: MockAuthEnvironment = process.env,
): MockSessionValue | null {
  if (!raw || !isMockAuthEnabled(env)) {
    return null;
  }

  let candidate = raw;

  for (let decodeAttempt = 0; decodeAttempt < 3; decodeAttempt += 1) {
    try {
      const session = JSON.parse(candidate) as Partial<MockSessionValue>;

      if (typeof session.phone !== "string" || !isValidMainlandChinaPhone(session.phone)) {
        return null;
      }

      const phone = normalizePhoneInput(session.phone);

      return {
        phone,
        role: getMockUserRole(phone),
      };
    } catch {
      try {
        const decoded = decodeURIComponent(candidate);

        if (decoded === candidate) {
          return null;
        }

        candidate = decoded;
      } catch {
        return null;
      }
    }
  }

  return null;
}

function hasUnsafeRedirectSyntax(value: string) {
  let candidate = value;

  for (let decodeAttempt = 0; decodeAttempt < 4; decodeAttempt += 1) {
    if (
      candidate.startsWith("//") ||
      candidate.includes("\\") ||
      candidate.includes("://") ||
      /[\u0000-\u001f\u007f]/.test(candidate)
    ) {
      return true;
    }

    try {
      const decoded = decodeURIComponent(candidate);

      if (decoded === candidate) {
        return false;
      }

      candidate = decoded;
    } catch {
      return true;
    }
  }

  return true;
}
