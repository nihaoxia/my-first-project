import { cookies } from "next/headers";
import { getMockUserRole, mockOtpCode, type UserRole } from "@/lib/auth/mock-policy";

export { mockOtpCode };

export const mockSessionCookieName = "stray_pages_mock_session";

export type MockSession = {
  phone: string;
  role: UserRole;
};

export async function setMockSession(phone: string) {
  const cookieStore = await cookies();
  const role = getMockUserRole(phone);
  const session: MockSession = { phone, role };

  cookieStore.set(mockSessionCookieName, JSON.stringify(session), {
    httpOnly: true,
    sameSite: "lax",
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

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as MockSession;
  } catch {
    return null;
  }
}

export function parseMockSession(raw: string | undefined): MockSession | null {
  if (!raw) {
    return null;
  }

  try {
    const session = JSON.parse(decodeURIComponent(raw)) as Partial<MockSession>;

    if (!session.phone || (session.role !== "USER" && session.role !== "ADMIN")) {
      return null;
    }

    return {
      phone: session.phone,
      role: session.role,
    };
  } catch {
    return null;
  }
}
