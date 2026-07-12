"use client";

import { useActionState } from "react";

import {
  loginAccount,
  recoverAccount,
  registerAccount,
  type AccountActionState,
} from "./actions";
import { Button } from "@/components/ui/button";

const initialState: AccountActionState = { ok: false };

const messages: Record<string, string> = {
  INVALID_CREDENTIALS: "用户名、密码或恢复码不正确。",
  USERNAME_UNAVAILABLE: "该用户名不可用，请换一个再试。",
  INVALID_USERNAME: "用户名须为 3–32 位小写字母、数字或下划线。",
  INVALID_PASSWORD: "密码须为 12–128 个字符。",
  ACCOUNT_SERVICE_UNAVAILABLE: "账号服务暂时不可用，请稍后再试。",
};

function ErrorMessage({ state }: { state: AccountActionState }) {
  return state.error ? (
    <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
      {messages[state.error] ?? messages.ACCOUNT_SERVICE_UNAVAILABLE}
    </p>
  ) : null;
}

function RecoveryResult({ state }: { state: AccountActionState }) {
  if (!state.ok || !state.recoveryCode) return null;
  return (
    <div className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
      <p className="font-semibold">恢复码只显示这一次，请立即离线保存。</p>
      <code className="block break-all rounded bg-white p-3 select-all">{state.recoveryCode}</code>
      <p>保存后可前往 <a className="underline" href={state.destination ?? "/library"}>继续使用</a>。</p>
    </div>
  );
}

function UsernameField({ id }: { id: string }) {
  return (
    <label className="block" htmlFor={id}>
      <span className="text-sm font-medium">用户名</span>
      <input id={id} name="username" autoComplete="username" required
        pattern="[a-z0-9_]{3,32}" minLength={3} maxLength={32}
        className="mt-2 h-11 w-full rounded-md border border-[var(--border)] bg-white px-3 text-sm"
        placeholder="例如：reader_01" />
    </label>
  );
}

export function AccountForms({ nextPath, mockEnabled = false }: { nextPath: string; mockEnabled?: boolean }) {
  const [loginState, loginAction, loginPending] = useActionState(loginAccount, initialState);
  const [registerState, registerAction, registerPending] = useActionState(registerAccount, initialState);
  const [recoverState, recoverAction, recoverPending] = useActionState(recoverAccount, initialState);
  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-3">
      <form action={loginAction} className="space-y-4 rounded-xl border border-[var(--border)] p-5">
        <h2 className="text-lg font-semibold">登录</h2>
        <input type="hidden" name="next" value={nextPath} />
        <UsernameField id="login-username" />
        <label className="block" htmlFor="login-password"><span className="text-sm font-medium">密码</span>
          <input id="login-password" name="password" type="password" autoComplete="current-password" required minLength={mockEnabled ? 6 : 12} maxLength={128}
            className="mt-2 h-11 w-full rounded-md border border-[var(--border)] bg-white px-3 text-sm" />
        </label>
        <ErrorMessage state={loginState} />
        <Button className="w-full" disabled={loginPending}>登录</Button>
      </form>

      <form action={registerAction} className="space-y-4 rounded-xl border border-[var(--border)] p-5">
        <h2 className="text-lg font-semibold">首次注册</h2>
        <input type="hidden" name="next" value={nextPath} />
        <UsernameField id="register-username" />
        <label className="block" htmlFor="register-password"><span className="text-sm font-medium">设置密码</span>
          <input id="register-password" name="password" type="password" autoComplete="new-password" required minLength={12} maxLength={128}
            className="mt-2 h-11 w-full rounded-md border border-[var(--border)] bg-white px-3 text-sm" />
        </label>
        <ErrorMessage state={registerState} />
        <RecoveryResult state={registerState} />
        <Button className="w-full" disabled={registerPending || mockEnabled}>创建账号</Button>
      </form>

      <form action={recoverAction} className="space-y-4 rounded-xl border border-[var(--border)] p-5">
        <h2 className="text-lg font-semibold">恢复账号</h2>
        <input type="hidden" name="next" value={nextPath} />
        <UsernameField id="recover-username" />
        <label className="block" htmlFor="recovery-code"><span className="text-sm font-medium">恢复码</span>
          <input id="recovery-code" name="recoveryCode" type="password" autoComplete="off" required maxLength={64}
            className="mt-2 h-11 w-full rounded-md border border-[var(--border)] bg-white px-3 text-sm" />
        </label>
        <label className="block" htmlFor="new-password"><span className="text-sm font-medium">新密码</span>
          <input id="new-password" name="newPassword" type="password" autoComplete="new-password" required minLength={12} maxLength={128}
            className="mt-2 h-11 w-full rounded-md border border-[var(--border)] bg-white px-3 text-sm" />
        </label>
        <ErrorMessage state={recoverState} />
        <RecoveryResult state={recoverState} />
        <Button className="w-full" disabled={recoverPending || mockEnabled}>重置密码</Button>
      </form>
    </div>
  );
}
