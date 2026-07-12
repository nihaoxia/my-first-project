export const EDGEONE_SESSION_COOKIE = "stray_pages_session";

type CookieOptions = {
  httpOnly: true;
  secure: true;
  sameSite: "lax";
  path: "/";
  maxAge: number;
};

type ReadableCookieStore = {
  get(name: string): { value: string } | undefined;
};

type WritableCookieStore = {
  set(name: string, value: string, options: CookieOptions): unknown;
};

const BASE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: "lax",
  path: "/",
} as const;

export function readEdgeOneSessionCookie(store: ReadableCookieStore): string | null {
  const value = store.get(EDGEONE_SESSION_COOKIE)?.value;
  return value && /^[A-Za-z0-9_-]{43}$/u.test(value) ? value : null;
}

export function setEdgeOneSessionCookie(
  store: WritableCookieStore,
  sessionToken: string,
): void {
  if (!/^[A-Za-z0-9_-]{43}$/u.test(sessionToken)) {
    throw Object.assign(new Error("INVALID_SESSION_TOKEN"), {
      code: "INVALID_SESSION_TOKEN",
    });
  }
  store.set(EDGEONE_SESSION_COOKIE, sessionToken, {
    ...BASE_OPTIONS,
    maxAge: 30 * 24 * 60 * 60,
  });
}

export function clearEdgeOneSessionCookie(store: WritableCookieStore): void {
  store.set(EDGEONE_SESSION_COOKIE, "", {
    ...BASE_OPTIONS,
    maxAge: 0,
  });
}

