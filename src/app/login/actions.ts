"use server";

import { redirect } from "next/navigation";

import { createLoginActionOrchestrator } from "@/lib/auth/login-action-core";
import { clearMockSession, setMockSession } from "@/lib/auth/mock-session";
import { getSupabaseAuthService } from "@/lib/auth/supabase-auth-service";

const orchestrator = createLoginActionOrchestrator({
  getSupabaseService: getSupabaseAuthService,
  setMockSession,
  clearMockSession,
});

export async function sendLoginOtp(formData: FormData) {
  const outcome = await orchestrator.send(
    {
      phone: String(formData.get("phone") ?? ""),
      next: String(formData.get("next") ?? ""),
    },
    process.env,
  );
  redirect(outcome.destination);
}

export async function verifyLoginOtp(formData: FormData) {
  const outcome = await orchestrator.verify(
    {
      phone: String(formData.get("phone") ?? ""),
      token: String(formData.get("code") ?? ""),
      next: String(formData.get("next") ?? ""),
    },
    process.env,
  );
  redirect(outcome.destination);
}

export async function logoutSession() {
  const outcome = await orchestrator.logout(process.env);
  redirect(outcome.destination);
}
