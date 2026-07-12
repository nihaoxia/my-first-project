"use client";

import { useEffect, useMemo, useState } from "react";
import { Languages, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/status-pill";
import type { MockAccountInput } from "@/lib/account/mock-account-summary";
import { formatYuanFromCents } from "@/lib/account/mock-account-summary";
import type { TranslationStatus } from "@/lib/mock-data";
import {
  getDefaultTargetLanguage,
  getSupportedTargetLanguages,
} from "@/lib/translation/translation-options";
import {
  buildTranslationOrderDraft,
  type TranslationOrderDraftResult,
} from "@/lib/translation/translation-order-draft";
import { estimateTranslationSelectionCost } from "@/lib/translation/translation-pricing";

type TranslationChapterOption = {
  id: string;
  title: string;
  words: number;
  status: TranslationStatus;
  note: string;
};

type TranslationCreatePanelProps = {
  userId: string;
  originalBookId: string;
  sourceLanguage: string;
  account: MockAccountInput;
  chapters: TranslationChapterOption[];
  onCreateDraft?: (
    orderDraft: Extract<TranslationOrderDraftResult, { ok: true }>,
  ) => { notice: string; tasksHref: string; tone?: "success" | "error" };
};

type McpCapabilityState = {
  status: "checking" | "ready" | "unavailable";
  message: string;
};

export function TranslationCreatePanel({
  userId,
  originalBookId,
  sourceLanguage,
  account,
  chapters,
  onCreateDraft,
}: TranslationCreatePanelProps) {
  const targetLanguages = getSupportedTargetLanguages();
  const [targetLanguage, setTargetLanguage] = useState(getDefaultTargetLanguage(sourceLanguage));
  const [selectedChapterIds, setSelectedChapterIds] = useState(
    chapters.filter((chapter) => chapter.status !== "skipped").map((chapter) => chapter.id),
  );
  const [draftNotice, setDraftNotice] = useState("");
  const [draftNoticeTone, setDraftNoticeTone] = useState<"success" | "error">("success");
  const [tasksHref, setTasksHref] = useState("");
  const [mcpCapability, setMcpCapability] = useState<McpCapabilityState>(() =>
    onCreateDraft
      ? { status: "checking", message: "正在检查翻译 MCP 服务..." }
      : { status: "ready", message: "当前为演示书籍流程。" },
  );

  useEffect(() => {
    if (!onCreateDraft) return;
    let cancelled = false;
    void fetchMcpCapability().then((capability) => {
      if (!cancelled) setMcpCapability(capability);
    });
    return () => {
      cancelled = true;
    };
  }, [onCreateDraft]);

  const pricingChapters = useMemo(
    () =>
      chapters.map((chapter) => ({
        id: chapter.id,
        title: chapter.title,
        characterCount: chapter.words,
        skipped: chapter.status === "skipped",
      })),
    [chapters],
  );

  const costSummary = estimateTranslationSelectionCost({
    chapters: pricingChapters,
    selectedChapterIds,
    sourceLanguage,
    freeChaptersLeft: account.freeChaptersLeft,
  });
  const orderDraft = buildTranslationOrderDraft({
    userId,
    originalBookId,
    sourceLanguage,
    targetLanguage,
    webLookupEnabled: false,
    account,
    chapters: pricingChapters,
    selectedChapterIds,
  });
  const balanceAfterChargeCents = Math.max(0, account.balanceCents - costSummary.payableCostCents);
  const canCreateDraft = orderDraft.ok && (!onCreateDraft || mcpCapability.status === "ready");

  function toggleChapter(chapterId: string) {
    setDraftNotice("");
    setSelectedChapterIds((currentIds) =>
      currentIds.includes(chapterId)
        ? currentIds.filter((currentId) => currentId !== chapterId)
        : [...currentIds, chapterId],
    );
  }

  function handleCreateDraft() {
    if (!orderDraft.ok) {
      setDraftNotice("");
      setDraftNoticeTone("success");
      return;
    }

    const createResult = onCreateDraft?.(orderDraft);

    if (createResult) {
      setDraftNotice(createResult.notice);
      setDraftNoticeTone(createResult.tone ?? "success");
      setTasksHref(createResult.tasksHref);
      return;
    }

    setDraftNotice(`已生成 ${orderDraft.translation.targetLanguage} 译本，已选择 ${orderDraft.tasks.length} 个章节。`);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <section className="space-y-6">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <div className="mb-4 flex items-center gap-2">
            <Languages aria-hidden="true" size={19} className="text-[var(--primary)]" />
            <h2 className="font-semibold">目标语言</h2>
          </div>
          <div className="grid gap-2 sm:grid-cols-4">
            {targetLanguages.map((language) => (
              <label
                key={language}
                className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm"
              >
                <input
                  type="radio"
                  name="language"
                  checked={targetLanguage === language}
                  onChange={() => setTargetLanguage(language)}
                />
                {language}
              </label>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)]">
          <div className="border-b border-[var(--border)] p-5">
            <h2 className="font-semibold">选择章节</h2>
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">已跳过章节不会翻译。</p>
          </div>
          <div className="divide-y divide-[var(--border)]">
            {chapters.map((chapter) => {
              const chapterEstimate = costSummary.chapterEstimates.find((estimate) => estimate.id === chapter.id);
              const baseCostCents = chapterEstimate?.baseCostCents ?? 0;
              const isSkipped = chapter.status === "skipped";

              return (
                <label key={chapter.id} className="grid gap-4 p-5 lg:grid-cols-[28px_1fr_120px_120px]">
                  <input
                    className="mt-1"
                    type="checkbox"
                    checked={selectedChapterIds.includes(chapter.id) && !isSkipped}
                    disabled={isSkipped}
                    onChange={() => toggleChapter(chapter.id)}
                  />
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-medium">{chapter.title}</h3>
                      <StatusPill status={chapter.status} />
                    </div>
                    <p className="mt-1 text-sm text-[var(--muted-foreground)]">{chapter.note}</p>
                  </div>
                  <div className="text-sm">
                    <p className="text-[var(--muted-foreground)]">字数</p>
                    <p className="mt-1 font-medium">{chapter.words.toLocaleString("zh-CN")}</p>
                  </div>
                  <div className="text-sm">
                    <p className="text-[var(--muted-foreground)]">预计费用</p>
                    <p className="mt-1 font-medium">￥ {formatYuanFromCents(baseCostCents)}</p>
                  </div>
                </label>
              );
            })}
          </div>
        </div>
      </section>

      <aside className="space-y-4">
        <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <div className="mb-4 flex items-center gap-2">
            <Wallet aria-hidden="true" size={19} className="text-[var(--primary)]" />
            <h2 className="font-semibold">费用估算（演示）</h2>
          </div>
          <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm leading-6 text-amber-800">
            当前为本地原型，不会真实冻结、扣款或消耗生产额度；下列余额仅用于验证计价界面。
          </p>
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-[var(--muted-foreground)]">已选章节</dt>
              <dd className="font-medium">{costSummary.selectedChapterCount} 章</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[var(--muted-foreground)]">标准章数</dt>
              <dd className="font-medium">{costSummary.totalStandardUnits} 章</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[var(--muted-foreground)]">演示免费额度</dt>
              <dd className="font-medium">{costSummary.freeUnitsApplied} 章</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[var(--muted-foreground)]">预计费用</dt>
              <dd className="font-medium">￥ {formatYuanFromCents(costSummary.payableCostCents)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[var(--muted-foreground)]">演示账户余额</dt>
              <dd className="font-medium">￥ {formatYuanFromCents(account.balanceCents)}</dd>
            </div>
            <div className="flex justify-between border-t border-[var(--border)] pt-3">
              <dt className="text-[var(--muted-foreground)]">演示预计余额</dt>
              <dd className="font-medium">￥ {formatYuanFromCents(balanceAfterChargeCents)}</dd>
            </div>
          </dl>
          {!orderDraft.ok && orderDraft.reason === "insufficient-balance" ? (
            <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              余额不足，无法开始本次翻译。
            </p>
          ) : null}
          {!orderDraft.ok && orderDraft.reason === "no-selected-chapters" ? (
            <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">请至少选择一个章节。</p>
          ) : null}
          {draftNotice ? (
            <p
              className={
                draftNoticeTone === "error"
                  ? "mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"
                  : "mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700"
              }
              role={draftNoticeTone === "error" ? "alert" : undefined}
            >
              {draftNotice}
            </p>
          ) : null}
          {onCreateDraft ? (
            <div
              className={
                mcpCapability.status === "ready"
                  ? "mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700"
                  : "mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800"
              }
              role={mcpCapability.status === "unavailable" ? "alert" : undefined}
            >
              <p>{mcpCapability.message}</p>
              {mcpCapability.status === "unavailable" ? (
                <button
                  className="mt-2 font-medium underline"
                  onClick={() => {
                    setMcpCapability({ status: "checking", message: "正在检查翻译 MCP 服务..." });
                    void fetchMcpCapability().then(setMcpCapability);
                  }}
                  type="button"
                >
                  重新检查
                </button>
              ) : null}
            </div>
          ) : null}
          <Button className="mt-5 w-full" disabled={!canCreateDraft} onClick={handleCreateDraft}>
            {onCreateDraft
              ? mcpCapability.status === "checking"
                ? "正在检查 MCP 服务"
                : "创建并开始 MCP 翻译"
              : "生成演示译本"}
          </Button>
          {tasksHref ? (
            <Button className="mt-2 w-full" href={tasksHref} variant="secondary">
              查看翻译进度
            </Button>
          ) : (
            <Button className="mt-2 w-full" type="button" disabled variant="secondary">
              查看翻译进度
            </Button>
          )}
        </section>

        <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <h2 className="font-semibold">翻译风格</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">
            当前默认采用自然可读的小说翻译风格，适合先顺畅阅读，再结合词汇本和句子本学习。
          </p>
        </section>
      </aside>
    </div>
  );
}

async function fetchMcpCapability(): Promise<McpCapabilityState> {
  try {
    const response = await fetch("/api/translation/capabilities", { cache: "no-store" });
    const payload = (await response.json()) as unknown;
    if (
      response.ok &&
      payload &&
      typeof payload === "object" &&
      "available" in payload &&
      payload.available === true
    ) {
      return { status: "ready", message: "翻译 MCP 服务已就绪。" };
    }
    const message =
      payload && typeof payload === "object" && "message" in payload && typeof payload.message === "string"
        ? payload.message
        : "翻译 MCP 服务当前不可用。";
    return { status: "unavailable", message };
  } catch {
    return { status: "unavailable", message: "无法检查翻译 MCP 服务，请确认服务已启动。" };
  }
}
