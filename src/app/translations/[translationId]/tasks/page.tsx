import { ShieldCheck } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { LocalTranslationTasks } from "@/components/translation/local-translation-tasks";
import { Button } from "@/components/ui/button";
import { MetricCard } from "@/components/ui/metric-card";
import { StatusPill } from "@/components/ui/status-pill";
import {
  stageFiveQueueMonitor,
  stageFiveTranslationTasks,
  stageSixAiPrep,
  translatedBooks,
} from "@/lib/mock-data";
import { routes } from "@/lib/routes";
import { getAppSession } from "@/lib/auth/app-session";
import { CloudTranslationTasks } from "@/components/cloud/cloud-translation-tasks";

export default async function TranslationTasksPage({
  params,
}: {
  params: Promise<{ translationId: string }>;
}) {
  const { translationId } = await params;
  const session = await getAppSession();
  if (!session) redirect(`/login?next=${encodeURIComponent(`/translations/${translationId}/tasks`)}`);
  if (process.env.AUTH_MODE === "edgeone") return <AppShell requireAuth><CloudTranslationTasks translationId={translationId} /></AppShell>;

  if (translationId.startsWith("local-translation-")) {
    return (
      <AppShell requireAuth>
        <LocalTranslationTasks translationId={translationId} />
      </AppShell>
    );
  }

  const translation = translatedBooks.find((item) => item.id === translationId);

  if (!translation) {
    notFound();
  }

  return (
    <AppShell requireAuth>
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div>
          <p className="text-sm text-[var(--muted-foreground)]">翻译进度</p>
          <h1 className="mt-1 text-3xl font-semibold">{translation.title}</h1>
          <p className="mt-2 text-[var(--muted-foreground)]">
            系统会按章翻译、检查质量并处理费用。
          </p>
        </div>
        <Button href={routes.reader}>打开阅读器</Button>
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-4">
        <MetricCard label="翻译进度" value={`${stageFiveQueueMonitor.progressPercent}%`} detail="按章节统计" />
        <MetricCard label="完成章节" value={`${stageFiveQueueMonitor.succeededChapters}`} detail="已完成翻译" />
        <MetricCard label="失败章节" value={`${stageFiveQueueMonitor.failedChapters}`} detail="未收取费用" />
        <MetricCard label="等待章节" value={`${stageFiveQueueMonitor.queuedChapters}`} detail="等待翻译" />
      </div>

      <section className="mt-8 rounded-lg border border-[var(--border)] bg-[var(--surface)]">
        <div className="border-b border-[var(--border)] p-5">
          <h2 className="font-semibold">章节进度</h2>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            这里展示每章的翻译进度，完成后可打开阅读器继续学习。
          </p>
        </div>
        <div className="divide-y divide-[var(--border)]">
          {stageFiveTranslationTasks.map((task) => (
            <div key={task.chapter} className="grid gap-4 p-5 lg:grid-cols-[1fr_140px_140px]">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-medium">{task.chapter}</h3>
                  <StatusPill status={task.status} />
                </div>
                <p className="mt-2 text-sm text-[var(--muted-foreground)]">{task.progress}</p>
              </div>
              <div className="text-sm">
                <p className="text-[var(--muted-foreground)]">更新时间</p>
                <p className="mt-1 font-medium">{task.updatedAt}</p>
              </div>
              <div className="text-sm">
                <p className="text-[var(--muted-foreground)]">余额处理</p>
                <p className="mt-1 font-medium">{task.balanceEffect}</p>
              </div>
              {task.failureReason ? (
                <p className="text-sm text-red-700 lg:col-span-3">{task.failureReason}</p>
              ) : null}
            </div>
          ))}
        </div>
      </section>

      <section className="mt-8 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5">
        <div className="flex gap-3">
          <ShieldCheck className="mt-0.5 text-[var(--primary)]" size={20} aria-hidden="true" />
          <div className="w-full">
            <h2 className="font-semibold">翻译准备</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">
              当前章节已完成翻译前准备。系统会尽量保持人名、地名和专有名词一致，并在完成后标记需要检查的内容。
            </p>
            <div className="mt-4 grid gap-3 text-sm md:grid-cols-3">
              <div className="rounded-md bg-[var(--background)] p-3">
                <p className="text-[var(--muted-foreground)]">专有名词</p>
                <p className="mt-1 font-medium">{stageSixAiPrep.topTerms.join("、")}</p>
              </div>
              <div className="rounded-md bg-[var(--background)] p-3">
                <p className="text-[var(--muted-foreground)]">检查状态</p>
                <p className="mt-1 font-medium">
                  {stageSixAiPrep.qualityStatus} · {stageSixAiPrep.qualityIssueCount} 个问题
                </p>
              </div>
              <div className="rounded-md bg-[var(--background)] p-3">
                <p className="text-[var(--muted-foreground)]">处理范围</p>
                <p className="mt-1 font-medium">{stageSixAiPrep.segmentCount} 个段落</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-8 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5">
        <div className="flex gap-3">
          <ShieldCheck className="mt-0.5 text-[var(--primary)]" size={20} aria-hidden="true" />
          <div>
            <h2 className="font-semibold">扣费规则</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">
              翻译成功后按章节结算。系统失败自动重试不额外扣费；重试仍失败时标记为需检查，并不会收取该章费用。
            </p>
          </div>
        </div>
      </section>
    </AppShell>
  );
}
