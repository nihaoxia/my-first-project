"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { createAccountActionOrchestrator } from "@/lib/auth/account-action-core";
import { getEdgeOneAuthService } from "@/lib/auth/auth-service";
import {
  clearEdgeOneSessionCookie,
  readEdgeOneSessionCookie,
  setEdgeOneSessionCookie,
} from "@/lib/auth/edgeone-cookie";

export type AccountActionState = {
  ok: boolean;
  error?: string;
  recoveryCode?: string;
  accountLabel?: string;
  destination?: string;
};

async function getOrchestrator() {
  const cookieStore = await cookies();
  return {
    cookieStore,
    orchestrator: createAccountActionOrchestrator({
      service: getEdgeOneAuthService(),
      setSession(token) { setEdgeOneSessionCookie(cookieStore, token); },
      clearSession() { clearEdgeOneSessionCookie(cookieStore); },
    }),
  };
}

export async function registerAccount(
  _previous: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  const { orchestrator } = await getOrchestrator();
  return orchestrator.register({
    username: String(formData.get("username") ?? ""),
    password: String(formData.get("password") ?? ""),
    next: String(formData.get("next") ?? ""),
  });
}

export async function loginAccount(
  _previous: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  const { orchestrator } = await getOrchestrator();
  const result = await orchestrator.login({
    username: String(formData.get("username") ?? ""),
    password: String(formData.get("password") ?? ""),
    next: String(formData.get("next") ?? ""),
  });
  if (result.ok) redirect(result.destination);
  return result;
}

export async function recoverAccount(
  _previous: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  const { orchestrator } = await getOrchestrator();
  return orchestrator.recover({
    username: String(formData.get("username") ?? ""),
    recoveryCode: String(formData.get("recoveryCode") ?? ""),
    newPassword: String(formData.get("newPassword") ?? ""),
    next: String(formData.get("next") ?? ""),
  });
}

export async function logoutSession(): Promise<void> {
  const { cookieStore, orchestrator } = await getOrchestrator();
  const token = readEdgeOneSessionCookie(cookieStore);
  const result = await orchestrator.logout(token);
  redirect(result.destination);
}
