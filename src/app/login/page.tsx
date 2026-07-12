import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { sendLoginOtp, verifyLoginOtp } from "@/app/login/actions";
import { mockOtpCode } from "@/lib/auth/mock-session";
import { getSafeRedirectPath } from "@/lib/auth/mock-policy";
import { resolveCloudConfig } from "@/lib/cloud/config";

const errorMessages: Record<string, string> = {
  phone: "请输入 11 位中国大陆手机号。",
  code: "验证码不正确。",
  "mock-disabled": "登录服务正在接入中，请稍后再试。",
  INVALID_PHONE: "请输入有效的中国大陆手机号。",
  INVALID_OTP: "请输入 6 位短信验证码。",
  OTP_INVALID: "验证码无效或已过期，请重新获取。",
  OTP_RATE_LIMITED: "操作过于频繁，请稍后再试。",
  OTP_SEND_FAILED: "验证码发送失败，请稍后重试。",
  CLOUD_NOT_CONFIGURED: "登录服务尚未配置，请联系管理员。",
  CLOUD_CONFIG_INVALID: "登录服务配置无效，请联系管理员。",
  AUTH_MODE_FORBIDDEN: "当前登录方式不可用。",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string; next?: string; sent?: string }>;
}) {
  const params = await searchParams;
  const error = params?.error ? errorMessages[params.error] : null;
  const nextPath = getSafeRedirectPath(params?.next, "");
  const config = resolveCloudConfig();
  const mockAuthEnabled = config.ok && config.config.authMode === "mock";
  const loginAvailable = config.ok;

  return (
    <AppShell>
      <section className="mx-auto max-w-md rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
        <h1 className="text-2xl font-semibold">手机号登录</h1>
        <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">
          先获取短信验证码，再验证登录以继续使用书架、翻译和学习功能。
        </p>
        {mockAuthEnabled ? (
            <div className="mt-4 rounded-lg bg-[var(--surface-2)] p-3 text-sm text-[var(--muted-foreground)]">
              本地开发验证码：<span className="font-semibold text-[var(--foreground)]">{mockOtpCode}</span>。
              管理员入口请使用以 <span className="font-semibold text-[var(--foreground)]">0000</span> 结尾的手机号。
            </div>
        ) : null}

        {params?.next ? (
          <p className="mt-4 rounded-lg bg-blue-50 p-3 text-sm text-blue-700">
            需要登录后才能访问该页面。
          </p>
        ) : null}

        {error ? (
          <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>
        ) : null}

        {params?.sent === "1" ? (
          <p className="mt-4 rounded-lg bg-green-50 p-3 text-sm text-green-700">
            验证码已发送，请在下方完成验证。
          </p>
        ) : null}

        <form action={sendLoginOtp} className="mt-6 space-y-3">
          <input type="hidden" name="next" value={nextPath} />
          <label className="block" htmlFor="login-phone">
            <span className="text-sm font-medium">手机号</span>
            <input
              id="login-phone"
              className="mt-2 h-11 w-full rounded-md border border-[var(--border)] bg-white px-3 text-sm"
              name="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="例如：13800000000"
              disabled={!loginAvailable}
              required
            />
          </label>
          <Button className="w-full" disabled={!loginAvailable}>获取验证码</Button>
        </form>

        <form action={verifyLoginOtp} className="mt-6 space-y-3 border-t border-[var(--border)] pt-6">
          <input type="hidden" name="next" value={nextPath} />
          <label className="block" htmlFor="verify-phone">
            <span className="text-sm font-medium">手机号</span>
            <input
              id="verify-phone"
              className="mt-2 h-11 w-full rounded-md border border-[var(--border)] bg-white px-3 text-sm"
              name="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="例如：13800000000"
              disabled={!loginAvailable}
              required
            />
          </label>
          <label className="block" htmlFor="login-code">
            <span className="text-sm font-medium">验证码</span>
            <input
              id="login-code"
              className="mt-2 h-11 w-full rounded-md border border-[var(--border)] bg-white px-3 text-sm"
              name="code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="6 位验证码"
              disabled={!loginAvailable}
              required
            />
          </label>
          <Button className="w-full" disabled={!loginAvailable}>验证并登录</Button>
        </form>
      </section>
    </AppShell>
  );
}
