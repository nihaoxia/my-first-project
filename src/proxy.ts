import { NextResponse, type NextRequest } from "next/server";
import { getRouteAccessDecision } from "@/lib/auth/access-policy";
import { mockSessionCookieName, parseMockSession } from "@/lib/auth/mock-session";

export function proxy(request: NextRequest) {
  const rawSession = request.cookies.get(mockSessionCookieName)?.value;
  const session = parseMockSession(rawSession);
  const decision = getRouteAccessDecision(`${request.nextUrl.pathname}${request.nextUrl.search}`, session);

  if (decision.type === "redirect") {
    return NextResponse.redirect(new URL(decision.destination, request.url));
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
