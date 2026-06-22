import { Ban, Database, ListChecks, Wallet } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { MetricCard } from "@/components/ui/metric-card";
import { adminMetrics, balanceRecords, failedTasks } from "@/lib/mock-data";

export default function AdminPage() {
  return (
    <AppShell>
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div>
          <h1 className="text-3xl font-semibold">基础后台</h1>
          <p className="mt-2 max-w-2xl text-[var(--muted-foreground)]">
            公开体验版后台需要能看用户、余额、翻译任务、失败任务、文件和模型用量。
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary">
            <Wallet aria-hidden="true" size={17} />
            手动加余额
          </Button>
          <Button variant="secondary">
            <Ban aria-hidden="true" size={17} />
            封禁账号
          </Button>
        </div>
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        {adminMetrics.map((metric) => (
          <MetricCard
            key={metric.label}
            label={metric.label}
            value={metric.value}
            detail={metric.detail}
          />
        ))}
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-[1fr_420px]">
        <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)]">
          <div className="flex items-center gap-2 border-b border-[var(--border)] p-5">
            <ListChecks aria-hidden="true" size={18} className="text-[var(--primary)]" />
            <h2 className="font-semibold">最近失败任务</h2>
          </div>
          <div className="divide-y divide-[var(--border)]">
            {failedTasks.map((task) => (
              <div
                key={`${task.user}-${task.chapter}`}
                className="grid gap-4 p-5 lg:grid-cols-[140px_1fr_150px]"
              >
                <div>
                  <p className="text-sm text-[var(--muted-foreground)]">用户</p>
                  <p className="mt-1 font-medium">{task.user}</p>
                </div>
                <div>
                  <p className="font-medium">
                    《{task.book}》 · {task.chapter}
                  </p>
                  <p className="mt-1 text-sm leading-6 text-[var(--muted-foreground)]">
                    {task.reason}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-[var(--muted-foreground)]">时间</p>
                  <p className="mt-1 font-medium">{task.time}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <aside className="space-y-6">
          <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)]">
            <div className="flex items-center gap-2 border-b border-[var(--border)] p-5">
              <Wallet aria-hidden="true" size={18} className="text-[var(--primary)]" />
              <h2 className="font-semibold">余额记录</h2>
            </div>
            <div className="divide-y divide-[var(--border)]">
              {balanceRecords.map((record) => (
                <div key={`${record.user}-${record.time}`} className="flex justify-between gap-4 p-4">
                  <div>
                    <p className="font-medium">{record.user}</p>
                    <p className="mt-1 text-sm text-[var(--muted-foreground)]">{record.type}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">{record.amount}</p>
                    <p className="mt-1 text-sm text-[var(--muted-foreground)]">{record.time}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
            <div className="mb-4 flex items-center gap-2">
              <Database aria-hidden="true" size={18} className="text-[var(--primary)]" />
              <h2 className="font-semibold">队列监控</h2>
            </div>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-[var(--muted-foreground)]">运行中任务</dt>
                <dd className="font-medium">23</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[var(--muted-foreground)]">排队中章节</dt>
                <dd className="font-medium">146</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[var(--muted-foreground)]">平均质检耗时</dt>
                <dd className="font-medium">18 秒</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[var(--muted-foreground)]">今日自动重试</dt>
                <dd className="font-medium">31 次</dd>
              </div>
            </dl>
          </section>
        </aside>
      </div>
    </AppShell>
  );
}
