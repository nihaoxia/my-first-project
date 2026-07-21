import { BookOpen, Clock, Library, WalletCards } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { LocalDataBackupPanel } from "@/components/account/local-data-backup-panel";
import { CloudLocalImportPanel } from "@/components/cloud/cloud-local-import-panel";
import { Button } from "@/components/ui/button";
import { MetricCard } from "@/components/ui/metric-card";
import { StatusPill } from "@/components/ui/status-pill";
import { resolveCloudPersistenceMode } from "@/lib/cloud/persistence-mode";
import { getCloudServerConfig } from "@/lib/cloud/server-config";
import { balanceRecords, myPageSummary, translationTasks } from "@/lib/mock-data";
import { routes } from "@/lib/routes";

const quickActions = [
  { label: "打开书架", href: routes.library, icon: Library },
  { label: "继续阅读", href: routes.reader, icon: BookOpen },
  { label: "学习资料", href: routes.vocabulary, icon: WalletCards },
];

export default async function MePage({
  searchParams,
}: {
  searchParams?: Promise<{ authError?: string }>;
}) {
  const persistence = resolveCloudPersistenceMode(getCloudServerConfig());
  const params = await searchParams;
  const authError = params?.authError === "SIGN_OUT_FAILED"
    ? "退出登录失败，你仍处于登录状态。请稍后重试。"
    : null;
  return (
    <AppShell requireAuth>
      {authError ? (
        <p className="mb-6 rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">
          {authError}
        </p>
      ) : null}
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div>
          <p className="text-sm font-medium text-[var(--primary)]">我的</p>
          <h1 className="mt-2 text-3xl font-semibold">余额、免费标准章和最近进度</h1>
          <p className="mt-3 max-w-2xl leading-7 text-[var(--muted-foreground)]">
            这里集中展示你的账户余额、免费标准章、翻译进度和最近记录。创建译本时会优先使用免费标准章，再按人民币余额结算。
          </p>
        </div>
      </div>

      <section className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {myPageSummary.accountItems.map((item) => (
          <MetricCard key={item.label} label={item.label} value={item.value} detail={item.detail} />
        ))}
      </section>

      <div className="mt-8 grid gap-6 xl:grid-cols-[1fr_380px]">
        <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5">
          <div className="mb-5 flex items-center gap-2">
            <Clock aria-hidden="true" size={18} className="text-[var(--primary)]" />
            <h2 className="text-xl font-semibold">最近翻译</h2>
          </div>
          <div className="divide-y divide-[var(--border)]">
            {translationTasks.slice(0, 5).map((task) => (
              <div key={task.chapter} className="flex flex-wrap items-center justify-between gap-3 py-4">
                <div>
                  <p className="font-medium">{task.chapter}</p>
                  <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                    {task.progress} · 更新于 {task.updatedAt}
                  </p>
                </div>
                <StatusPill status={task.status} />
              </div>
            ))}
          </div>
        </section>

        <aside className="space-y-6">
          <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5">
            <div className="mb-4 flex items-center gap-2">
              <Library aria-hidden="true" size={18} className="text-[var(--primary)]" />
              <h2 className="font-semibold">书架概览</h2>
            </div>
            <dl className="space-y-3 text-sm">
              {myPageSummary.libraryItems.map((item) => (
                <div key={item.label} className="flex justify-between gap-4">
                  <dt className="text-[var(--muted-foreground)]">{item.label}</dt>
                  <dd className="font-medium">{item.value}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5">
            <div className="mb-4 flex items-center gap-2">
              <WalletCards aria-hidden="true" size={18} className="text-[var(--primary)]" />
              <h2 className="font-semibold">快捷入口</h2>
            </div>
            <div className="grid gap-2">
              {quickActions.map((action) => {
                const Icon = action.icon;
                return (
                  <Button key={action.href} href={action.href} variant="secondary" className="justify-start">
                    <Icon aria-hidden="true" size={16} />
                    {action.label}
                  </Button>
                );
              })}
            </div>
          </section>

          <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5">
            <h2 className="font-semibold">最近余额记录</h2>
            <div className="mt-4 space-y-3 text-sm">
              {balanceRecords.slice(0, 3).map((record) => (
                <div key={`${record.user}-${record.time}`} className="rounded-md bg-[var(--surface-2)] p-3">
                  <div className="flex justify-between gap-3">
                    <span className="font-medium">{record.type}</span>
                    <span className="font-semibold">{record.amount}</span>
                  </div>
                  <p className="mt-1 text-[var(--muted-foreground)]">{record.time}</p>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>

      {persistence === "cloud" ? (
        <section className="mt-8">
          <CloudLocalImportPanel />
        </section>
      ) : null}

      <section className="mt-8">
        <LocalDataBackupPanel />
      </section>
    </AppShell>
  );
}
