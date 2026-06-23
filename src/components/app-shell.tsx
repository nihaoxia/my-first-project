import {
  BookOpen,
  CircleUserRound,
  Coins,
  Library,
  LogOut,
  Settings,
  ShieldCheck,
  Upload,
  WalletCards,
} from "lucide-react";
import { shouldShowAdminNavigation } from "@/lib/auth/access-policy";
import { buildMockUserProfile } from "@/lib/auth/mock-user-profile";
import { getMockSession } from "@/lib/auth/mock-session";
import { logoutMockSession } from "@/app/login/actions";
import { Button } from "@/components/ui/button";
import { routes } from "@/lib/routes";

const navItems = [
  { href: routes.library, label: "书架", icon: Library },
  { href: routes.upload, label: "上传", icon: Upload },
  { href: routes.reader, label: "阅读器", icon: BookOpen },
  { href: routes.vocabulary, label: "学习", icon: WalletCards },
  { href: routes.admin, label: "后台", icon: ShieldCheck, adminOnly: true },
];

export async function AppShell({ children }: { children: React.ReactNode }) {
  const session = await getMockSession();
  const profile = buildMockUserProfile(session);
  const visibleNavItems = navItems.filter((item) => !item.adminOnly || shouldShowAdminNavigation(session));

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <header className="border-b border-[var(--border)] bg-[var(--surface)]">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-6">
          <a className="shrink-0 text-base font-semibold" href={routes.home}>
            Stray Pages
          </a>
          <nav className="flex min-w-0 items-center gap-1 overflow-x-auto">
            {visibleNavItems.map((item) => {
              const Icon = item.icon;
              return (
                <Button key={item.href} href={item.href} variant="ghost">
                  <Icon aria-hidden="true" size={17} />
                  {item.label}
                </Button>
              );
            })}
          </nav>
          {profile ? (
            <div className="flex shrink-0 items-center gap-3">
              <div className="hidden min-w-0 rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 lg:block">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <CircleUserRound aria-hidden="true" size={16} />
                  <span>{profile.maskedPhone}</span>
                  <span className="rounded-sm bg-[var(--primary)] px-1.5 py-0.5 text-xs text-[var(--primary-foreground)]">
                    {profile.roleLabel}
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-3 text-xs text-[var(--muted-foreground)]">
                  <span className="inline-flex items-center gap-1">
                    <Coins aria-hidden="true" size={13} />
                    余额 ¥{profile.balanceYuan}
                  </span>
                  <span>冻结 ¥{profile.frozenYuan}</span>
                  <span>免费 {profile.freeChaptersLeft} 章</span>
                </div>
              </div>
              <span className="rounded-sm border border-[var(--border)] px-2 py-1 text-xs text-[var(--muted-foreground)] lg:hidden">
                {profile.roleLabel}
              </span>
              <form action={logoutMockSession}>
                <Button variant="secondary">
                  <LogOut aria-hidden="true" size={17} />
                  退出
                </Button>
              </form>
            </div>
          ) : (
            <Button className="shrink-0" href={routes.login} variant="secondary">
              <Settings aria-hidden="true" size={17} />
              登录
            </Button>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
    </div>
  );
}
