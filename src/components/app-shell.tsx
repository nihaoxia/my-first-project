import { BookOpen, Library, LogOut, Settings, ShieldCheck, Upload, WalletCards } from "lucide-react";
import { getMockSession } from "@/lib/auth/mock-session";
import { logoutMockSession } from "@/app/login/actions";
import { Button } from "@/components/ui/button";
import { routes } from "@/lib/routes";

const navItems = [
  { href: routes.library, label: "书架", icon: Library },
  { href: routes.upload, label: "上传", icon: Upload },
  { href: routes.reader, label: "阅读器", icon: BookOpen },
  { href: routes.vocabulary, label: "学习", icon: WalletCards },
  { href: routes.admin, label: "后台", icon: ShieldCheck },
];

export async function AppShell({ children }: { children: React.ReactNode }) {
  const session = await getMockSession();

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <header className="border-b border-[var(--border)] bg-[var(--surface)]">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-6">
          <a className="shrink-0 text-base font-semibold" href={routes.home}>
            Stray Pages
          </a>
          <nav className="flex min-w-0 items-center gap-1 overflow-x-auto">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <Button key={item.href} href={item.href} variant="ghost">
                  <Icon aria-hidden="true" size={17} />
                  {item.label}
                </Button>
              );
            })}
          </nav>
          {session ? (
            <form action={logoutMockSession} className="shrink-0">
              <Button variant="secondary">
                <LogOut aria-hidden="true" size={17} />
                退出
              </Button>
            </form>
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
