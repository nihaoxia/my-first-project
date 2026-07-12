import { isValidMainlandChinaPhone, normalizePhoneInput } from "./mock-policy.ts";

export type AppRole = "USER" | "ADMIN" | "BANNED";

export type AppSession = {
  user: {
    id: string;
    accountLabel: string;
  };
  role: "USER" | "ADMIN";
};

type EdgeOneSession = {
  userId: string;
  accountLabel: string;
  role: "USER" | "ADMIN";
};

type MockSession = { phone: string; role: "USER" | "ADMIN" };

export type AppSessionDependencies = {
  validateEdgeOneSession(): Promise<EdgeOneSession | null>;
  getMockSession?(): Promise<MockSession | null>;
};

export class AppSessionConfigurationError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "AppSessionConfigurationError";
    this.code = code;
  }
}

export async function resolveAppSession(
  environment: Record<string, string | undefined>,
  dependencies: AppSessionDependencies,
): Promise<AppSession | null> {
  const production = environment.NODE_ENV?.trim() === "production";
  const authMode = environment.AUTH_MODE?.trim();

  if (authMode === "mock") {
    if (production || environment.MOCK_AUTH_ENABLED?.trim() !== "true") {
      throw new AppSessionConfigurationError("AUTH_MODE_FORBIDDEN");
    }
    const mock = await dependencies.getMockSession?.();
    if (!mock || !isValidMainlandChinaPhone(mock.phone)) return null;
    const phone = normalizePhoneInput(mock.phone);
    return {
      user: {
        id: deriveMockUserId(phone),
        accountLabel: `本地用户 ${phone.slice(-4)}`,
      },
      role: mock.role,
    };
  }

  if (authMode !== "edgeone") {
    throw new AppSessionConfigurationError("AUTH_MODE_FORBIDDEN");
  }

  const session = await dependencies.validateEdgeOneSession();
  if (
    !session ||
    !isUuid(session.userId) ||
    !/^[a-z0-9_]{3,32}$/u.test(session.accountLabel) ||
    (session.role !== "USER" && session.role !== "ADMIN")
  ) return null;

  return {
    user: { id: session.userId, accountLabel: session.accountLabel },
    role: session.role,
  };
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value);
}

export function deriveMockUserId(phone: string): string {
  return `00000000-0000-4000-8000-0${phone}`;
}
