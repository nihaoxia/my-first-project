import { getSafeRedirectPath } from "./mock-policy.ts";

type AccountService = {
  register(username: string, password: string): Promise<{
    accountLabel: string;
    recoveryCode: string;
    sessionToken: string;
  }>;
  login(username: string, password: string): Promise<{ sessionToken: string }>;
  recover(username: string, recoveryCode: string, newPassword: string): Promise<{
    accountLabel: string;
    recoveryCode: string;
    sessionToken: string;
  }>;
  logout(sessionToken: string): Promise<void>;
};

type Dependencies = {
  service: AccountService;
  setSession(token: string): void | Promise<void>;
  clearSession(): void | Promise<void>;
};

type Failure = { ok: false; error: string };

function stableError(error: unknown, action: "register" | "login" | "recover"): string {
  const code = error && typeof error === "object"
    ? (error as { code?: unknown }).code
    : undefined;
  if (action === "register" && code === "USERNAME_UNAVAILABLE") return code;
  if (code === "INVALID_USERNAME" || code === "INVALID_PASSWORD") return code;
  return action === "register" ? "ACCOUNT_SERVICE_UNAVAILABLE" : "INVALID_CREDENTIALS";
}

export function createAccountActionOrchestrator(dependencies: Dependencies) {
  return {
    async register(input: { username: string; password: string; next?: string }) {
      try {
        const result = await dependencies.service.register(input.username, input.password);
        await dependencies.setSession(result.sessionToken);
        return {
          ok: true as const,
          destination: getSafeRedirectPath(input.next),
          recoveryCode: result.recoveryCode,
          accountLabel: result.accountLabel,
        };
      } catch (error) {
        return { ok: false as const, error: stableError(error, "register") } satisfies Failure;
      }
    },
    async login(input: { username: string; password: string; next?: string }) {
      try {
        const result = await dependencies.service.login(input.username, input.password);
        await dependencies.setSession(result.sessionToken);
        return { ok: true as const, destination: getSafeRedirectPath(input.next) };
      } catch (error) {
        return { ok: false as const, error: stableError(error, "login") } satisfies Failure;
      }
    },
    async recover(input: {
      username: string;
      recoveryCode: string;
      newPassword: string;
      next?: string;
    }) {
      try {
        const result = await dependencies.service.recover(
          input.username,
          input.recoveryCode,
          input.newPassword,
        );
        await dependencies.setSession(result.sessionToken);
        return {
          ok: true as const,
          destination: getSafeRedirectPath(input.next),
          recoveryCode: result.recoveryCode,
          accountLabel: result.accountLabel,
        };
      } catch (error) {
        return { ok: false as const, error: stableError(error, "recover") } satisfies Failure;
      }
    },
    async logout(sessionToken: string | null) {
      if (sessionToken) await dependencies.service.logout(sessionToken);
      await dependencies.clearSession();
      return { ok: true as const, destination: "/login" };
    },
  };
}
