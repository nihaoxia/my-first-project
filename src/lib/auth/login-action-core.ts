import { resolveCloudConfig, type CloudConfigEnvironment } from "../cloud/config.ts";
import {
  getSafeRedirectPath,
  isValidMainlandChinaPhone,
  validateMockLoginInput,
} from "./mock-policy.ts";
import type { AuthServiceResult } from "./supabase-auth-service-core.ts";

type AuthService = {
  sendOtp(phone: string): Promise<AuthServiceResult>;
  verifyOtp(phone: string, token: string): Promise<AuthServiceResult>;
  signOut(): Promise<AuthServiceResult>;
};

export type LoginActionDependencies = {
  getSupabaseService(): Promise<AuthService>;
  setMockSession(phone: string): Promise<void>;
  clearMockSession(): Promise<void>;
};

export type LoginActionOutcome = { destination: string };

export function createLoginActionOrchestrator(dependencies: LoginActionDependencies) {
  return {
    async send(
      input: { phone: string; next?: string },
      environment: CloudConfigEnvironment,
    ): Promise<LoginActionOutcome> {
      const nextPath = getSafeRedirectPath(input.next);
      const configResult = resolveCloudConfig(environment);
      if (!configResult.ok) return loginFailure(configResult.error.code, nextPath);

      if (configResult.config.authMode === "mock") {
        if (!isValidMainlandChinaPhone(input.phone)) return loginFailure("INVALID_PHONE", nextPath);
      } else {
        try {
          const result = await (await dependencies.getSupabaseService()).sendOtp(input.phone);
          if (!result.ok) return loginFailure(result.error.code, nextPath);
        } catch {
          return loginFailure("OTP_SEND_FAILED", nextPath);
        }
      }

      return { destination: withNext("/login?sent=1", nextPath) };
    },

    async verify(
      input: { phone: string; token: string; next?: string },
      environment: CloudConfigEnvironment,
    ): Promise<LoginActionOutcome> {
      const nextPath = getSafeRedirectPath(input.next);
      const configResult = resolveCloudConfig(environment);
      if (!configResult.ok) return loginFailure(configResult.error.code, nextPath);

      if (configResult.config.authMode === "mock") {
        const result = validateMockLoginInput(input.phone, input.token, environment);
        if (!result.ok) return loginFailure(result.reason, nextPath);
        try {
          await dependencies.setMockSession(result.phone);
        } catch {
          return loginFailure("SESSION_WRITE_FAILED", nextPath);
        }
      } else {
        try {
          const result = await (await dependencies.getSupabaseService()).verifyOtp(
            input.phone,
            input.token,
          );
          if (!result.ok) return loginFailure(result.error.code, nextPath);
        } catch {
          return loginFailure("OTP_INVALID", nextPath);
        }
      }

      return { destination: nextPath };
    },

    async logout(environment: CloudConfigEnvironment): Promise<LoginActionOutcome> {
      const configResult = resolveCloudConfig(environment);
      if (!configResult.ok) return logoutFailure(configResult.error.code);

      try {
        if (configResult.config.authMode === "mock") {
          await dependencies.clearMockSession();
        } else {
          const result = await (await dependencies.getSupabaseService()).signOut();
          if (!result.ok) return logoutFailure(result.error.code);
        }
      } catch {
        return logoutFailure("SIGN_OUT_FAILED");
      }

      return { destination: "/login" };
    },
  };
}

function loginFailure(code: string, nextPath: string): LoginActionOutcome {
  return { destination: withNext(`/login?error=${encodeURIComponent(code)}`, nextPath) };
}

function logoutFailure(code: string): LoginActionOutcome {
  const safeCode = code === "SIGN_OUT_FAILED" ? code : "SIGN_OUT_FAILED";
  return { destination: `/me?authError=${safeCode}` };
}

function withNext(base: string, nextPath: string) {
  return nextPath === "/library"
    ? base
    : `${base}&next=${encodeURIComponent(nextPath)}`;
}
