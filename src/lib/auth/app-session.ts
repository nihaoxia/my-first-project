import "server-only";

import { cookies } from "next/headers";
import { connection } from "next/server";

import { getEdgeOneAuthService } from "./auth-service";
import { readEdgeOneSessionCookie } from "./edgeone-cookie";
import { getMockSession } from "./mock-session";
import {
  resolveAppSession,
  type AppSession,
  type AppSessionDependencies,
} from "./app-session-core";

export type { AppRole, AppSession } from "./app-session-core";

export async function getAppSession(): Promise<AppSession | null> {
  await connection();
  const cookieStore = await cookies();
  const token = readEdgeOneSessionCookie(cookieStore);
  const dependencies: AppSessionDependencies = {
    async validateEdgeOneSession() {
      return token ? getEdgeOneAuthService().validateSession(token) : null;
    },
    getMockSession,
  };
  return resolveAppSession(process.env, dependencies);
}

export async function getRouteSession() {
  const session = await getAppSession();
  return session ? { userId: session.user.id, role: session.role } : null;
}
