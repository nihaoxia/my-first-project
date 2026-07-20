import "server-only";

import { deriveMockUserId } from "./app-session-core";
import { validateMockLoginInput } from "./mock-policy";
import { clearMockSession, setMockSession } from "./mock-session";
import { getCloudServices } from "../cloud/service-factory";

export function getEdgeOneAuthService() {
  if (
    process.env.AUTH_MODE === "mock" &&
    process.env.NODE_ENV !== "production" &&
    process.env.MOCK_AUTH_ENABLED === "true"
  ) {
    return {
      async register() { throw Object.assign(new Error("AUTH_MODE_FORBIDDEN"), { code: "AUTH_MODE_FORBIDDEN" }); },
      async login(phone: string, password: string) {
        const result = validateMockLoginInput(phone, password, process.env);
        if (!result.ok) throw Object.assign(new Error("INVALID_CREDENTIALS"), { code: "INVALID_CREDENTIALS" });
        await setMockSession(result.phone);
        return {
          userId: deriveMockUserId(result.phone),
          accountLabel: `本地用户 ${result.phone.slice(-4)}`,
          sessionToken: "m".repeat(43),
        };
      },
      async recover() { throw Object.assign(new Error("AUTH_MODE_FORBIDDEN"), { code: "AUTH_MODE_FORBIDDEN" }); },
      async validateSession() { return null; },
      async logout() { await clearMockSession(); },
    };
  }
  if (process.env.AUTH_MODE !== "edgeone") {
    throw Object.assign(new Error("AUTH_MODE_FORBIDDEN"), {
      code: "AUTH_MODE_FORBIDDEN",
    });
  }
  return getCloudServices().auth;
}
