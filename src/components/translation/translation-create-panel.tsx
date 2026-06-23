"use client";

import { useMemo, useState } from "react";
import { Globe2, Languages, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/status-pill";
import type { MockAccountInput } from "@/lib/account/mock-account-summary";
import { formatYuanFromCents } from "@/lib/account/mock-account-summary";
import type { TranslationStatus } from "@/lib/mock-data";
import { routes } from "@/lib/routes";
import {
  DEFAULT_WEB_LOOKUP_ENABLED,
  getDefaultTargetLanguage,
  getSupportedTargetLanguages,
} from "@/lib/translation/translation-options";
import { buildTranslationOrderDraft } from "@/lib/translation/translation-order-draft";
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
};

export function TranslationCreatePanel({
  userId,
  originalBookId,
  sourceLanguage,
  account,
  chapters,
}: TranslationCreatePanelProps) {
  const targetLanguages = getSupportedTargetLanguages();
  const [targetLanguage, setTargetLanguage] = useState(getDefaultTargetLanguage(sourceLanguage));
  const [webLookupEnabled, setWebLookupEnabled] = useState(DEFAULT_WEB_LOOKUP_ENABLED);
  const [selectedChapterIds, setSelectedChapterIds] = useState(
    chapters.filter((chapter) => chapter.status !== "skipped").map((chapter) => chapter.id),
  );
  const [draftNotice, setDraftNotice] = useState("");

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
    webLookupEnabled,
    account,
    chapters: pricingChapters,
    selectedChapterIds,
  });
  const availableCents = Math.max(0, account.balanceCents - account.frozenCents);
  const availableAfterHoldCents = orderDraft.ok
    ? Math.max(0, orderDraft.accountAfterHold.balanceCents - orderDraft.accountAfterHold.frozenCents)
    : availableCents;
  const balanceAfterChargeCents = Math.max(0, account.balanceCents - costSummary.payableCostCents);
  const canCreateDraft = orderDraft.ok;

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
      return;
    }

    setDraftNotice(`已生成 ${orderDraft.translation.targetLanguage} 译本草稿，准备创建 ${orderDraft.tasks.length} 个章节任务。`);
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

        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <div className="mb-4 flex items-center gap-2">
            <Globe2 aria-hidden="true" size={19} className="text-[var(--primary)]" />
            <h2 className="font-semibold">术语联网查证</h2>
          </div>
          <label className="flex items-start gap-3 rounded-lg bg-[var(--surface-2)] p-4">
            <input
              className="mt-1"
              type="checkbox"
              checked={webLookupEnabled}
              onChange={(event) => setWebLookupEnabled(event.target.checked)}
            />
            <span>
              <span className="block font-medium">{webLookupEnabled ? "已开启" : "已关闭"}</span>
              <span className="mt-1 block text-sm leading-6 text-[var(--muted-foreground)]">
                只查证书名、人名、地名、组织名、技能名和术语关键词，不搜索整章或大段正文。
              </span>
            </span>
          </label>
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)]">
          <div className="border-b border-[var(--border)] p-5">
            <h2 className="font-semibold">选择章节</h2>
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">已跳过章节不会进入翻译队列。</p>
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
            <h2 className="font-semibold">费用估算</h2>
          </div>
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
              <dt className="text-[var(--muted-foreground)]">免费额度抵扣</dt>
              <dd className="font-medium">{costSummary.freeUnitsApplied} 章</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[var(--muted-foreground)]">预计冻结</dt>
              <dd className="font-medium">￥ {formatYuanFromCents(costSummary.payableCostCents)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[var(--muted-foreground)]">当前可用余额</dt>
              <dd className="font-medium">￥ {formatYuanFromCents(availableCents)}</dd>
            </div>
            <div className="flex justify-between border-t border-[var(--border)] pt-3">
              <dt className="text-[var(--muted-foreground)]">冻结后可用</dt>
              <dd className="font-medium">￥ {formatYuanFromCents(availableAfterHoldCents)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[var(--muted-foreground)]">翻译后预计余额</dt>
              <dd className="font-medium">￥ {formatYuanFromCents(balanceAfterChargeCents)}</dd>
            </div>
          </dl>
          {!orderDraft.ok && orderDraft.reason === "insufficient-balance" ? (
            <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              可用余额不足，无法创建本次翻译队列。
            </p>
          ) : null}
          {!orderDraft.ok && orderDraft.reason === "no-selected-chapters" ? (
            <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">请至少选择一个章节。</p>
          ) : null}
          {draftNotice ? (
            <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{draftNotice}</p>
          ) : null}
          <Button className="mt-5 w-full" disabled={!canCreateDraft} onClick={handleCreateDraft}>
            生成译本草稿
          </Button>
          <Button className="mt-2 w-full" href={routes.tasks} variant="secondary">
            查看翻译队列
          </Button>
        </section>

        <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <h2 className="font-semibold">翻译风格</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">
            第一版默认采用自然可读的小说翻译风格，后续可扩展直译、文学化和学习对照版。
          </p>
        </section>
      </aside>
    </div>
  );
}
