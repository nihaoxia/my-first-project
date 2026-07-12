import {
  BookOpen,
  CircleUserRound,
  Library,
  LogOut,
  Settings,
  ShieldCheck,
  Upload,
  WalletCards,
} from "lucide-react";
import { clsx } from "clsx";
import { redirect } from "next/navigation";
import { shouldShowAdminNavigation } from "@/lib/auth/access-policy";
import { buildMockUserProfile } from "@/lib/auth/mock-user-profile";
import { getAppSession } from "@/lib/auth/app-session";
import { logoutSession } from "@/app/login/actions";
import { Button } from "@/components/ui/button";
import { routes } from "@/lib/routes";
import { deriveLocalStorageScope } from "@/lib/storage/local-storage-scope";

const navItems = [
  { href: routes.library, label: "书架", icon: Library },
  { href: routes.upload, label: "上传", icon: Upload },
  { href: routes.reader, label: "阅读器", icon: BookOpen },
  { href: routes.vocabulary, label: "学习", icon: WalletCards },
  { href: routes.me, label: "我的", icon: CircleUserRound },
  { href: routes.admin, label: "后台", icon: ShieldCheck, adminOnly: true },
];

export async function AppShell({
  children,
  wide = false,
  requireAuth = false,
}: {
  children: React.ReactNode;
  wide?: boolean;
  requireAuth?: boolean;
}) {
  const session = await getAppSession();
  const usableSession = session;
  if (requireAuth && !usableSession) redirect("/login");
  const profile = buildMockUserProfile(
    usableSession
      ? { accountLabel: usableSession.user.accountLabel, role: usableSession.role }
      : null,
  );
  const localStorageScope = usableSession ? deriveLocalStorageScope(usableSession.user.id) : undefined;
  const visibleNavItems = navItems.filter((item) => !item.adminOnly || shouldShowAdminNavigation(session));

  return (
    <div
      className="min-h-screen bg-[var(--background)]"
      data-local-storage-scope={localStorageScope}
    >
      <header className="sticky top-0 z-20 border-b border-[var(--border)] bg-[var(--surface)]">
        <div
          className={clsx(
            "mx-auto flex min-h-16 flex-wrap items-center justify-between gap-2 px-5 py-2 sm:h-16 sm:flex-nowrap sm:gap-4 sm:py-0 md:px-6",
            wide ? "max-w-[1760px]" : "max-w-7xl",
          )}
        >
          <a className="shrink-0 text-base font-semibold tracking-normal" href={routes.home}>
            Stray Pages
          </a>
          <nav className="order-3 grid w-full grid-flow-col auto-cols-fr items-center gap-1 sm:order-none sm:flex sm:min-w-0 sm:w-auto">
            {visibleNavItems.map((item) => {
              const Icon = item.icon;
              return (
                <Button
                  key={item.href}
                  className="w-full px-2 sm:w-auto sm:px-4"
                  href={item.href}
                  variant="ghost"
                  aria-label={item.label}
                >
                  <Icon aria-hidden="true" size={17} />
                  <span className="hidden sm:inline">{item.label}</span>
                </Button>
              );
            })}
          </nav>
          {profile ? (
            <div className="flex shrink-0 items-center gap-3">
              <div className="hidden min-w-0 items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 lg:flex">
                <CircleUserRound aria-hidden="true" size={16} />
                <span className="text-sm font-medium">{profile.accountLabel}</span>
                <span className="rounded-sm bg-[var(--primary)] px-1.5 py-0.5 text-xs text-[var(--primary-foreground)]">
                  {profile.roleLabel}
                </span>
              </div>
              <span className="rounded-sm border border-[var(--border)] px-2 py-1 text-xs text-[var(--muted-foreground)] lg:hidden">
                {profile.roleLabel}
              </span>
              <form action={logoutSession}>
                <Button
                  className="px-2 sm:px-4"
                  variant="secondary"
                  aria-label="退出登录"
                >
                  <LogOut aria-hidden="true" size={17} />
                  <span className="hidden sm:inline">退出</span>
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
      <main className={clsx("mx-auto px-5 py-7 md:px-6 md:py-8", wide ? "max-w-none" : "max-w-7xl")}>
        {children}
      </main>
    </div>
  );
}
