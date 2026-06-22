import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { loginWithMockOtp } from "@/app/login/actions";
import { mockOtpCode } from "@/lib/auth/mock-session";
import { getSafeRedirectPath } from "@/lib/auth/mock-policy";

const errorMessages: Record<string, string> = {
  phone: "请输入 11 位中国大陆手机号。",
  code: "验证码不正确。开发期固定验证码为 123456。",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string; next?: string }>;
}) {
  const params = await searchParams;
  const error = params?.error ? errorMessages[params.error] : null;
  const nextPath = getSafeRedirectPath(params?.next, "");

  return (
    <AppShell>
      <section className="mx-auto max-w-md rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
        <h1 className="text-2xl font-semibold">手机号登录</h1>
        <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">
          开发阶段使用模拟验证码，后续会替换为真实短信服务或 Supabase Auth 手机号验证。
        </p>

        <div className="mt-4 rounded-lg bg-[var(--surface-2)] p-3 text-sm text-[var(--muted-foreground)]">
          开发期固定验证码：<span className="font-semibold text-[var(--foreground)]">{mockOtpCode}</span>。
          手机号以 <span className="font-semibold text-[var(--foreground)]">0000</span> 结尾时模拟管理员。
        </div>

        {params?.next ? (
          <p className="mt-4 rounded-lg bg-blue-50 p-3 text-sm text-blue-700">
            需要登录后才能访问该页面。
          </p>
        ) : null}

        {error ? (
          <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>
        ) : null}

        <form action={loginWithMockOtp} className="mt-6 space-y-3">
          <input type="hidden" name="next" value={nextPath} />
          <input
            className="h-11 w-full rounded-md border border-[var(--border)] bg-white px-3 text-sm"
            name="phone"
            placeholder="手机号"
          />
          <input
            className="h-11 w-full rounded-md border border-[var(--border)] bg-white px-3 text-sm"
            name="code"
            placeholder="验证码"
          />
          <Button className="w-full">继续</Button>
        </form>
      </section>
    </AppShell>
  );
}
