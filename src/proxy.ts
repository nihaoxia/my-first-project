import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getRouteAccessDecision } from "@/lib/auth/access-policy";
import { mockSessionCookieName, parseMockSession } from "@/lib/auth/mock-session";
import { resolveCloudConfig } from "@/lib/cloud/config";

export async function proxy(request: NextRequest) {
  const configResult = resolveCloudConfig();
  let response = NextResponse.next({ request });
  let session: { role: "USER" | "ADMIN" | "BANNED" | null } | null = null;

  if (configResult.ok && configResult.config.authMode === "mock") {
    const rawSession = request.cookies.get(mockSessionCookieName)?.value;
    session = parseMockSession(rawSession);
  } else if (configResult.ok && configResult.config.configured) {
    const supabase = createServerClient(
      configResult.config.supabaseUrl,
      configResult.config.supabaseAnonKey,
      {
        cookies: {
          getAll: () => request.cookies.getAll(),
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
            response = NextResponse.next({ request });
            cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
          },
        },
      },
    );
    const { data, error } = await supabase.auth.getUser();
    if (!error && data.user) {
      const { data: profile, error: profileError } = await supabase
        .from("UserProfile")
        .select("role")
        .eq("id", data.user.id)
        .maybeSingle();
      const role = profile?.role;
      session = !profileError && (role === "USER" || role === "ADMIN" || role === "BANNED")
        ? { role }
        : null;
    }
  }

  const decision = getRouteAccessDecision(`${request.nextUrl.pathname}${request.nextUrl.search}`, session);

  if (decision.type === "redirect") {
    const redirectResponse = NextResponse.redirect(new URL(decision.destination, request.url));
    response.cookies.getAll().forEach((cookie) => redirectResponse.cookies.set(cookie));
    return redirectResponse;
  }

  return response;
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
    "/me/:path*",
    "/admin/:path*",
  ],
};
