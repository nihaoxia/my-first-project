import { Ban, Database, Download, ListChecks, ShieldCheck, Wallet } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { MetricCard } from "@/components/ui/metric-card";
import {
  adminMetrics,
  balanceRecords,
  failedTasks,
  stageElevenAdminAuditRecords,
  stageElevenAdminAuditSummary,
  stageElevenDataRetentionPolicies,
  stageElevenDataRetentionSummary,
  stageEightAdminSummary,
  stageFiveQueueMonitor,
  stageNineLaunchChecklist,
  stageNineRateLimitPolicies,
  stageSixAiPrep,
  stageTenProductionPreflight,
  stageTenProductionPreflightItems,
  stageTenProductionRolloutSteps,
  translationCostMonitor,
} from "@/lib/mock-data";

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
          <Button type="button" variant="secondary" disabled>
            <Wallet aria-hidden="true" size={17} />
            手动加余额
          </Button>
          <Button type="button" variant="secondary" disabled>
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
              <Download aria-hidden="true" size={18} className="text-[var(--primary)]" />
              <h2 className="font-semibold">导出与运营摘要</h2>
            </div>
            <dl className="space-y-3 text-sm">
              {stageEightAdminSummary.items.map((item) => (
                <div key={item.label} className="flex justify-between gap-4">
                  <dt className="text-[var(--muted-foreground)]">{item.label}</dt>
                  <dd className="font-medium">{item.value}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-4 space-y-2">
              {stageEightAdminSummary.exportFiles.map((file) => (
                <div
                  key={file.fileName}
                  className="rounded-lg bg-[var(--surface-2)] p-3 text-sm"
                >
                  <p className="font-medium">{file.format}</p>
                  <p className="mt-1 break-all text-[var(--muted-foreground)]">{file.fileName}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
            <div className="mb-4 flex items-center gap-2">
              <ListChecks aria-hidden="true" size={18} className="text-[var(--primary)]" />
              <h2 className="font-semibold">上线准备</h2>
            </div>
            <div className="space-y-2 text-sm">
              {stageNineLaunchChecklist.localItems.map((item) => (
                <p key={item.label} className="rounded-lg bg-[var(--surface-2)] px-3 py-2">
                  {item.label}
                </p>
              ))}
            </div>
            <div className="mt-4 border-t border-[var(--border)] pt-4">
              <p className="text-sm font-medium">后续阻塞项</p>
              <ul className="mt-3 space-y-2 text-sm text-[var(--muted-foreground)]">
                {stageNineLaunchChecklist.externalBlockers.map((blocker) => (
                  <li key={blocker}>{blocker}</li>
                ))}
              </ul>
            </div>
          </section>

          <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
            <div className="mb-4 flex items-center gap-2">
              <Database aria-hidden="true" size={18} className="text-[var(--primary)]" />
              <h2 className="font-semibold">生产体检</h2>
            </div>
            <dl className="space-y-3 text-sm">
              {stageTenProductionPreflightItems.map((item) => (
                <div key={item.label} className="flex justify-between gap-4">
                  <dt className="text-[var(--muted-foreground)]">{item.label}</dt>
                  <dd className="font-medium">{item.value}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-4 space-y-2 border-t border-[var(--border)] pt-4 text-sm">
              {stageTenProductionPreflight.missingKeys.slice(0, 3).map((key) => (
                <p key={key} className="rounded-lg bg-[var(--surface-2)] px-3 py-2">
                  待配置：{key}
                </p>
              ))}
              {stageTenProductionPreflight.risks.slice(0, 2).map((risk) => (
                <p key={risk} className="rounded-lg bg-[var(--surface-2)] px-3 py-2">
                  {risk}
                </p>
              ))}
            </div>
            <div className="mt-4 border-t border-[var(--border)] pt-4">
              <p className="text-sm font-medium">接入顺序</p>
              <ol className="mt-3 space-y-2 text-sm text-[var(--muted-foreground)]">
                {stageTenProductionRolloutSteps.slice(0, 4).map((step) => (
                  <li key={step.label}>{step.label}</li>
                ))}
              </ol>
            </div>
          </section>

          <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
            <div className="mb-4 flex items-center gap-2">
              <ShieldCheck aria-hidden="true" size={18} className="text-[var(--primary)]" />
              <h2 className="font-semibold">限频策略</h2>
            </div>
            <dl className="space-y-3 text-sm">
              {stageNineRateLimitPolicies.map((policy) => (
                <div key={policy.action} className="flex justify-between gap-4">
                  <dt className="text-[var(--muted-foreground)]">{policy.actionLabel}</dt>
                  <dd className="font-medium">
                    {policy.windowLabel} {policy.maxCount} 次
                  </dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
            <div className="mb-4 flex items-center gap-2">
              <ListChecks aria-hidden="true" size={18} className="text-[var(--primary)]" />
              <h2 className="font-semibold">操作审计</h2>
            </div>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-[var(--muted-foreground)]">审计记录</dt>
                <dd className="font-medium">{stageElevenAdminAuditSummary.totalRecords}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[var(--muted-foreground)]">高风险操作</dt>
                <dd className="font-medium">{stageElevenAdminAuditSummary.highRiskRecords}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[var(--muted-foreground)]">缺少原因</dt>
                <dd className="font-medium">{stageElevenAdminAuditSummary.missingReasonRecords}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[var(--muted-foreground)]">最近操作</dt>
                <dd className="font-medium">{stageElevenAdminAuditSummary.latestRecordLabel}</dd>
              </div>
            </dl>
            <div className="mt-4 space-y-2 border-t border-[var(--border)] pt-4 text-sm">
              {stageElevenAdminAuditRecords.slice(0, 2).map((record) => (
                <div key={`${record.action}-${record.createdAt}`} className="rounded-lg bg-[var(--surface-2)] p-3">
                  <p className="font-medium">{record.actionLabel}</p>
                  <p className="mt-1 text-[var(--muted-foreground)]">{record.summary}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
            <div className="mb-4 flex items-center gap-2">
              <ShieldCheck aria-hidden="true" size={18} className="text-[var(--primary)]" />
              <h2 className="font-semibold">数据安全</h2>
            </div>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-[var(--muted-foreground)]">保留策略</dt>
                <dd className="font-medium">{stageElevenDataRetentionSummary.policyCount}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[var(--muted-foreground)]">需前台提示</dt>
                <dd className="font-medium">{stageElevenDataRetentionSummary.noticeRequiredCount}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[var(--muted-foreground)]">最长保留</dt>
                <dd className="font-medium">{stageElevenDataRetentionSummary.longestRetentionLabel}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[var(--muted-foreground)]">最短保留</dt>
                <dd className="font-medium">{stageElevenDataRetentionSummary.shortestRetentionLabel}</dd>
              </div>
            </dl>
            <div className="mt-4 space-y-2 border-t border-[var(--border)] pt-4 text-sm">
              {stageElevenDataRetentionPolicies.slice(0, 3).map((policy) => (
                <div key={policy.key} className="flex justify-between gap-4 rounded-lg bg-[var(--surface-2)] px-3 py-2">
                  <span>{policy.label}</span>
                  <span className="font-medium">{policy.retentionDays} 天</span>
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
                <dd className="font-medium">{stageFiveQueueMonitor.runningTasks}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[var(--muted-foreground)]">排队中章节</dt>
                <dd className="font-medium">{stageFiveQueueMonitor.queuedChapters}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[var(--muted-foreground)]">完成章节</dt>
                <dd className="font-medium">{stageFiveQueueMonitor.succeededChapters}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[var(--muted-foreground)]">返还金额</dt>
                <dd className="font-medium">¥ {stageFiveQueueMonitor.releasedYuan}</dd>
              </div>
            </dl>
          </section>

          <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
            <div className="mb-4 flex items-center gap-2">
              <Wallet aria-hidden="true" size={18} className="text-[var(--primary)]" />
              <h2 className="font-semibold">成本监控</h2>
            </div>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-[var(--muted-foreground)]">健康状态</dt>
                <dd className="font-medium">{translationCostMonitor.healthLabel}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[var(--muted-foreground)]">确认收入</dt>
                <dd className="font-medium">¥ {translationCostMonitor.chargedYuan}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[var(--muted-foreground)]">免费履约</dt>
                <dd className="font-medium">¥ {translationCostMonitor.freeCoverageYuan}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[var(--muted-foreground)]">内部成本</dt>
                <dd className="font-medium">¥ {translationCostMonitor.providerCostYuan}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[var(--muted-foreground)]">毛利</dt>
                <dd className="font-medium">¥ {translationCostMonitor.grossMarginYuan}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[var(--muted-foreground)]">毛利率</dt>
                <dd className="font-medium">{translationCostMonitor.grossMarginPercent}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[var(--muted-foreground)]">需关注任务</dt>
                <dd className="font-medium">{translationCostMonitor.lossMakingTasks}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[var(--muted-foreground)]">风险原因</dt>
                <dd className="font-medium">{translationCostMonitor.healthReasonCount}</dd>
              </div>
            </dl>
          </section>

          <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
            <div className="mb-4 flex items-center gap-2">
              <ListChecks aria-hidden="true" size={18} className="text-[var(--primary)]" />
              <h2 className="font-semibold">AI 准备状态</h2>
            </div>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-[var(--muted-foreground)]">分段数量</dt>
                <dd className="font-medium">{stageSixAiPrep.segmentCount}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[var(--muted-foreground)]">术语候选</dt>
                <dd className="font-medium">{stageSixAiPrep.terminologyCount}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[var(--muted-foreground)]">内部术语本</dt>
                <dd className="font-medium">
                  {stageSixAiPrep.glossaryConfirmed}/{stageSixAiPrep.glossaryTotal} 已确认
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[var(--muted-foreground)]">本章匹配术语</dt>
                <dd className="font-medium">{stageSixAiPrep.relevantGlossaryTerms.length}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[var(--muted-foreground)]">术语一致性问题</dt>
                <dd className="font-medium">{stageSixAiPrep.glossaryIssueCount}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[var(--muted-foreground)]">质检结果</dt>
                <dd className="font-medium">{stageSixAiPrep.qualityStatus}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[var(--muted-foreground)]">Provider</dt>
                <dd className="font-medium">{stageSixAiPrep.providerStatus}</dd>
              </div>
            </dl>
          </section>
        </aside>
      </div>
    </AppShell>
  );
}
