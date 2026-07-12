import "server-only";

import { createSupabaseServerClient } from "../supabase/server";
import { createSupabaseAuthService } from "./supabase-auth-service-core";

export type { AuthServiceErrorCode, AuthServiceResult } from "./supabase-auth-service-core";

export async function getSupabaseAuthService() {
  const client = await createSupabaseServerClient();
  return createSupabaseAuthService({
    signInWithOtp: (input) => client.auth.signInWithOtp(input),
    verifyOtp: (input) => client.auth.verifyOtp(input),
    signOut: () => client.auth.signOut(),
  });
}
