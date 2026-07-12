import { AppShell } from "@/components/app-shell";
import { getSafeRedirectPath } from "@/lib/auth/mock-policy";
import { AccountForms } from "./account-forms";

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  const nextPath = getSafeRedirectPath(params?.next, "");
  const mockEnabled = process.env.NODE_ENV !== "production" &&
    process.env.AUTH_MODE === "mock" && process.env.MOCK_AUTH_ENABLED === "true";
  return (
    <AppShell>
      <section className="mx-auto max-w-6xl">
        <h1 className="text-3xl font-semibold">账号登录</h1>
        <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">
          使用用户名和密码登录。注册与恢复成功后，请离线保存只显示一次的新恢复码。
        </p>
        {mockEnabled ? <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">本地开发模式：用户名填写 11 位测试号码，密码填写本地开发口令；注册和恢复不可用。</p> : null}
        {params?.next ? <p className="mt-4 rounded-lg bg-blue-50 p-3 text-sm text-blue-700">需要登录后才能访问该页面。</p> : null}
        <AccountForms nextPath={nextPath} mockEnabled={mockEnabled} />
      </section>
    </AppShell>
  );
}
