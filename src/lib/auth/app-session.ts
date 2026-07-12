import "server-only";

import { connection } from "next/server";

import { getMockSession } from "./mock-session";
import {
  resolveAppSession,
  type AppSession,
  type AppSessionDependencies,
} from "./app-session-core";
import { createSupabaseServerClient } from "../supabase/server";

export type { AppRole, AppSession } from "./app-session-core";

export async function getAppSession(): Promise<AppSession | null> {
  await connection();
  let clientPromise: ReturnType<typeof createSupabaseServerClient> | undefined;
  const getClient = () => (clientPromise ??= createSupabaseServerClient());
  const dependencies: AppSessionDependencies = {
    async getUser() {
      const client = await getClient();
      const { data, error } = await client.auth.getUser();
      return error || !data.user ? null : { id: data.user.id };
    },
    async getProfile(userId) {
      const client = await getClient();
      const { data, error } = await client
        .from("UserProfile")
        .select("phone, role")
        .eq("id", userId)
        .maybeSingle();
      return error || !data ? null : data;
    },
    getMockSession,
  };

  return resolveAppSession(process.env, dependencies);
}
