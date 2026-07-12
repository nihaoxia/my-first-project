import { cookies } from "next/headers";
import {
  getMockUserRole,
  mockOtpCode,
  parseMockSessionValue,
  type MockAuthEnvironment,
  type MockSessionValue,
} from "@/lib/auth/mock-policy";

export { mockOtpCode };

export const mockSessionCookieName = "stray_pages_mock_session";

export type MockSession = MockSessionValue;

export async function setMockSession(phone: string) {
  const cookieStore = await cookies();
  const role = getMockUserRole(phone);
  const session: MockSession = { phone, role };

  cookieStore.set(mockSessionCookieName, JSON.stringify(session), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function clearMockSession() {
  const cookieStore = await cookies();
  cookieStore.delete(mockSessionCookieName);
}

export async function getMockSession(): Promise<MockSession | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(mockSessionCookieName)?.value;

  return parseMockSession(raw);
}

export function parseMockSession(
  raw: string | undefined,
  env: MockAuthEnvironment = process.env,
): MockSession | null {
  return parseMockSessionValue(raw, env);
}
