"use server";

import { redirect } from "next/navigation";
import { getSafeRedirectPath, validateMockLoginInput } from "@/lib/auth/mock-policy";
import { clearMockSession, setMockSession } from "@/lib/auth/mock-session";

export async function loginWithMockOtp(formData: FormData) {
  const phone = String(formData.get("phone") ?? "").trim();
  const code = String(formData.get("code") ?? "").trim();
  const nextPath = getSafeRedirectPath(String(formData.get("next") ?? ""));
  const nextQuery = nextPath === "/library" ? "" : `&next=${encodeURIComponent(nextPath)}`;
  const result = validateMockLoginInput(phone, code);

  if (!result.ok) {
    redirect(`/login?error=${result.reason}${nextQuery}`);
  }

  await setMockSession(result.phone);
  redirect(nextPath);
}

export async function logoutMockSession() {
  await clearMockSession();
  redirect("/login");
}
