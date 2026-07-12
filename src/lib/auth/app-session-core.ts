import {
  resolveCloudConfig,
  type CloudConfigEnvironment,
} from "../cloud/config.ts";
import { isValidMainlandChinaPhone, normalizePhoneInput } from "./mock-policy.ts";

export type AppRole = "USER" | "ADMIN" | "BANNED";

export type AppSession = {
  userId: string;
  phone: string;
  role: AppRole;
  authMode: "supabase" | "mock";
};

type AuthenticatedUser = { id: string; [key: string]: unknown };
type UserProfile = { phone: unknown; role: unknown };
type MockSession = { phone: string; role: "USER" | "ADMIN" };

export type AppSessionDependencies = {
  getUser(): Promise<AuthenticatedUser | null>;
  getProfile(userId: string): Promise<UserProfile | null>;
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
  environment: CloudConfigEnvironment,
  dependencies: AppSessionDependencies,
): Promise<AppSession | null> {
  const configResult = resolveCloudConfig(environment);
  if (!configResult.ok) {
    throw new AppSessionConfigurationError(configResult.error.code);
  }

  if (configResult.config.authMode === "mock") {
    const mockSession = await dependencies.getMockSession?.();
    if (!mockSession || !isValidMainlandChinaPhone(mockSession.phone)) return null;
    const phone = normalizePhoneInput(mockSession.phone);
    return {
      userId: deriveMockUserId(phone),
      phone,
      role: mockSession.role,
      authMode: "mock",
    };
  }

  if (!configResult.config.configured) {
    throw new AppSessionConfigurationError("CLOUD_NOT_CONFIGURED");
  }

  const user = await dependencies.getUser();
  if (!user || !isUuid(user.id)) return null;
  const profile = await dependencies.getProfile(user.id);
  const phone = profile && typeof profile.phone === "string"
    ? normalizeProfilePhone(profile.phone)
    : null;
  if (!profile || !phone) {
    return null;
  }
  if (profile.role !== "USER" && profile.role !== "ADMIN" && profile.role !== "BANNED") {
    return null;
  }
  if (profile.role === "BANNED") return null;

  return {
    userId: user.id,
    phone,
    role: profile.role,
    authMode: "supabase",
  };
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function deriveMockUserId(phone: string) {
  return `00000000-0000-4000-8000-0${phone}`;
}

function normalizeProfilePhone(value: string) {
  const normalized = normalizePhoneInput(value).replace(/[\s()-]/g, "");
  const mainland = normalized.startsWith("+86") ? normalized.slice(3) : normalized;
  return isValidMainlandChinaPhone(mainland) ? mainland : null;
}
