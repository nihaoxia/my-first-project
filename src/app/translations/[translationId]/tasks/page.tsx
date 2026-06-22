import { RotateCcw, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { MetricCard } from "@/components/ui/metric-card";
import { StatusPill } from "@/components/ui/status-pill";
import { accountSummary, translatedBooks, translationTasks } from "@/lib/mock-data";
import { routes } from "@/lib/routes";

export default function TranslationTasksPage() {
  const translation = translatedBooks[0];

  return (
    <AppShell>
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div>
          <p className="text-sm text-[var(--muted-foreground)]">翻译队列</p>
          <h1 className="mt-1 text-3xl font-semibold">{translation.title}</h1>
          <p className="mt-2 text-[var(--muted-foreground)]">
            后台会按章执行术语提取、翻译、质量检查和扣费。
          </p>
        </div>
        <Button href={routes.reader}>打开阅读器</Button>
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-4">
        <MetricCard label="翻译进度" value={`${translation.progress}%`} detail="按章节统计" />
        <MetricCard label="完成章节" value={`${translation.completedChapters}`} detail="已正式扣费" />
        <MetricCard label="失败章节" value={`${translation.failedChapters}`} detail="冻结金额已返还" />
        <MetricCard label="冻结金额" value={`¥ ${accountSummary.frozen}`} detail="任务处理中" />
      </div>

      <section className="mt-8 rounded-xl border border-[var(--border)] bg-[var(--surface)]">
        <div className="border-b border-[var(--border)] p-5">
          <h2 className="font-semibold">章节任务</h2>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            静态原型展示任务状态。后续会接入后台任务系统实时更新。
          </p>
        </div>
        <div className="divide-y divide-[var(--border)]">
          {translationTasks.map((task) => (
            <div key={task.chapter} className="grid gap-4 p-5 lg:grid-cols-[1fr_160px_140px_120px]">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-medium">{task.chapter}</h3>
                  <StatusPill status={task.status} />
                </div>
                <p className="mt-2 text-sm text-[var(--muted-foreground)]">{task.progress}</p>
              </div>
              <div className="text-sm">
                <p className="text-[var(--muted-foreground)]">冻结金额</p>
                <p className="mt-1 font-medium">{task.frozen}</p>
              </div>
              <div className="text-sm">
                <p className="text-[var(--muted-foreground)]">更新时间</p>
                <p className="mt-1 font-medium">{task.updatedAt}</p>
              </div>
              <div className="flex items-start gap-2">
                <Button variant="ghost">
                  <RotateCcw aria-hidden="true" size={16} />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-8 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
        <div className="flex gap-3">
          <ShieldCheck className="mt-0.5 text-[var(--primary)]" size={20} aria-hidden="true" />
          <div>
            <h2 className="font-semibold">扣费规则</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">
              任务开始前冻结余额，翻译成功后正式扣费。系统失败自动重试不额外扣费；重试仍失败时标记为需检查，并返还该章冻结金额。
            </p>
          </div>
        </div>
      </section>
    </AppShell>
  );
}
