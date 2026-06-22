import { NextResponse, type NextRequest } from "next/server";
import { mockSessionCookieName, parseMockSession } from "@/lib/auth/mock-session";

const protectedPrefixes = [
  "/library",
  "/upload",
  "/books",
  "/translations",
  "/reader",
  "/study",
];

function isProtectedPath(pathname: string) {
  return protectedPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const rawSession = request.cookies.get(mockSessionCookieName)?.value;
  const session = parseMockSession(rawSession);

  if (pathname === "/login" && session) {
    return NextResponse.redirect(new URL("/library", request.url));
  }

  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    if (!session) {
      return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(pathname)}`, request.url));
    }

    if (session.role !== "ADMIN") {
      return NextResponse.redirect(new URL("/library?error=admin", request.url));
    }
  }

  if (isProtectedPath(pathname) && !session) {
    return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(pathname)}`, request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/login",
    "/library/:path*",
    "/upload/:path*",
    "/books/:path*",
    "/translations/:path*",
    "/reader/:path*",
    "/study/:path*",
    "/admin/:path*",
  ],
};
