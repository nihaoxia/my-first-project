export type AuthProviderError = { message?: string; status?: number; code?: string };

export type SupabaseAuthProvider = {
  signInWithOtp(input: { phone: string }): Promise<{ error: AuthProviderError | null }>;
  verifyOtp(input: {
    phone: string;
    token: string;
    type: "sms";
  }): Promise<{ error: AuthProviderError | null }>;
  signOut(): Promise<{ error: AuthProviderError | null }>;
};

export type AuthServiceErrorCode =
  | "INVALID_PHONE"
  | "INVALID_OTP"
  | "OTP_RATE_LIMITED"
  | "OTP_SEND_FAILED"
  | "OTP_INVALID"
  | "SIGN_OUT_FAILED";

export type AuthServiceResult =
  | { ok: true }
  | {
      ok: false;
      error: {
        code: AuthServiceErrorCode;
        message: string;
        retryable: boolean;
      };
    };

export function normalizePhoneForSupabase(input: string): string | null {
  const compact = input.trim().replace(/[\s()-]/g, "");
  const mainland = compact.startsWith("+86") ? compact.slice(3) : compact;
  return /^1\d{10}$/.test(mainland) ? `+86${mainland}` : null;
}

export function createSupabaseAuthService(provider: SupabaseAuthProvider) {
  return {
    async sendOtp(phoneInput: string): Promise<AuthServiceResult> {
      const phone = normalizePhoneForSupabase(phoneInput);
      if (!phone) return failure("INVALID_PHONE", "请输入有效的中国大陆手机号。", false);
      let error: AuthProviderError | null;
      try {
        ({ error } = await provider.signInWithOtp({ phone }));
      } catch {
        return failure("OTP_SEND_FAILED", "验证码发送失败，请稍后重试。", true);
      }
      if (!error) return { ok: true };
      if (isRateLimited(error)) {
        return failure("OTP_RATE_LIMITED", "验证码发送过于频繁，请稍后再试。", true);
      }
      return failure("OTP_SEND_FAILED", "验证码发送失败，请稍后重试。", true);
    },

    async verifyOtp(phoneInput: string, tokenInput: string): Promise<AuthServiceResult> {
      const phone = normalizePhoneForSupabase(phoneInput);
      if (!phone) return failure("INVALID_PHONE", "请输入有效的中国大陆手机号。", false);
      const token = tokenInput.trim();
      if (!/^\d{6}$/.test(token)) {
        return failure("INVALID_OTP", "请输入 6 位短信验证码。", false);
      }
      let error: AuthProviderError | null;
      try {
        ({ error } = await provider.verifyOtp({ phone, token, type: "sms" }));
      } catch {
        return failure("OTP_INVALID", "验证码验证失败，请稍后重试。", true);
      }
      if (!error) return { ok: true };
      if (isRateLimited(error)) {
        return failure("OTP_RATE_LIMITED", "验证尝试过于频繁，请稍后再试。", true);
      }
      return failure("OTP_INVALID", "验证码无效或已过期，请重新获取。", false);
    },

    async signOut(): Promise<AuthServiceResult> {
      let error: AuthProviderError | null;
      try {
        ({ error } = await provider.signOut());
      } catch {
        return failure("SIGN_OUT_FAILED", "退出登录失败，请稍后重试。", true);
      }
      return error
        ? failure("SIGN_OUT_FAILED", "退出登录失败，请稍后重试。", true)
        : { ok: true };
    },
  };
}

function isRateLimited(error: AuthProviderError) {
  return error.status === 429 || error.code === "over_request_rate_limit";
}

function failure(
  code: AuthServiceErrorCode,
  message: string,
  retryable: boolean,
): AuthServiceResult {
  return { ok: false, error: { code, message, retryable } };
}
