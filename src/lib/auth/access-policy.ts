import type { MockSession } from "@/lib/auth/mock-session";

export type RouteAccessDecision =
  | {
      type: "allow";
    }
  | {
      type: "redirect";
      destination: string;
    };

const protectedPrefixes = [
  "/library",
  "/upload",
  "/books",
  "/translations",
  "/reader",
  "/study",
];

export function getRouteAccessDecision(pathWithSearch: string, session: MockSession | null): RouteAccessDecision {
  const { pathname, search } = splitPathAndSearch(pathWithSearch);
  const targetPath = `${pathname}${search}`;

  if (pathname === "/login" && session) {
    return {
      type: "redirect",
      destination: "/library",
    };
  }

  if (isAdminPath(pathname)) {
    if (!session) {
      return {
        type: "redirect",
        destination: getLoginRedirectDestination(targetPath),
      };
    }

    if (session.role !== "ADMIN") {
      return {
        type: "redirect",
        destination: "/library?error=admin",
      };
    }
  }

  if (isProtectedPath(pathname) && !session) {
    return {
      type: "redirect",
      destination: getLoginRedirectDestination(targetPath),
    };
  }

  return { type: "allow" };
}

export function shouldShowAdminNavigation(session: MockSession | null) {
  return session?.role === "ADMIN";
}

function isAdminPath(pathname: string) {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

function isProtectedPath(pathname: string) {
  return protectedPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function getLoginRedirectDestination(targetPath: string) {
  return `/login?next=${encodeURIComponent(targetPath)}`;
}

function splitPathAndSearch(pathWithSearch: string) {
  const [pathname = "/", ...searchParts] = pathWithSearch.split("?");
  const search = searchParts.length > 0 ? `?${searchParts.join("?")}` : "";

  return {
    pathname,
    search,
  };
}
