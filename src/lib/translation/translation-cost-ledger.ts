import { TRANSLATION_PRICE_PER_STANDARD_UNIT_CENTS } from "./translation-pricing.ts";

export type TranslationCostLedgerStatus = "queued" | "running" | "succeeded" | "failed" | "canceled";

export type TranslationProviderPricing = {
  inputCentsPerMillionTokens: number;
  outputCentsPerMillionTokens: number;
};

export type TranslationTokenUsage = {
  inputTokens: number;
  outputTokens: number;
};

export type TranslationCostLedgerInput = {
  taskId: string;
  chapterId: string;
  providerName: string;
  modelName: string;
  standardUnits: number;
  freeUnitsApplied: number;
  chargedCents: number;
  status: TranslationCostLedgerStatus;
  tokenUsage: TranslationTokenUsage;
  providerPricing: TranslationProviderPricing;
  retryCount: number;
  qualityIssueCount: number;
};

export type TranslationCostLedgerEntry = {
  taskId: string;
  chapterId: string;
  providerName: string;
  modelName: string;
  status: TranslationCostLedgerStatus;
  standardUnits: number;
  freeUnitsApplied: number;
  chargedCents: number;
  freeCoverageCents: number;
  inputTokens: number;
  outputTokens: number;
  estimatedProviderCostCents: number;
  grossMarginCents: number;
  grossMarginPercent: number | null;
  retryCount: number;
  qualityIssueCount: number;
  lossMaking: boolean;
};

export type TranslationCostLedgerSummary = {
  totalTasks: number;
  succeededTasks: number;
  failedTasks: number;
  lossMakingTasks: number;
  totalStandardUnits: number;
  totalFreeUnitsApplied: number;
  totalChargedCents: number;
  totalFreeCoverageCents: number;
  totalProviderCostCents: number;
  totalGrossMarginCents: number;
  grossMarginPercent: number | null;
  totalRetryCount: number;
  totalQualityIssueCount: number;
};

export type TranslationCostHealthStatus = "healthy" | "watch" | "loss";

export type TranslationCostHealthPolicy = {
  minGrossMarginPercent: number;
  maxLossMakingTaskRate: number;
  maxAverageRetryCount: number;
  maxQualityIssueRate: number;
};

export type TranslationCostHealth = {
  status: TranslationCostHealthStatus;
  label: string;
  reasons: string[];
  lossMakingTaskRate: number;
  averageRetryCount: number;
  qualityIssueRate: number;
};

export const DEFAULT_TRANSLATION_COST_HEALTH_POLICY: TranslationCostHealthPolicy = {
  minGrossMarginPercent: 60,
  maxLossMakingTaskRate: 0.2,
  maxAverageRetryCount: 1,
  maxQualityIssueRate: 0.5,
};

export function buildTranslationCostLedgerEntry(
  input: TranslationCostLedgerInput,
): TranslationCostLedgerEntry {
  const standardUnits = Math.max(0, input.standardUnits);
  const freeUnitsApplied = Math.min(Math.max(0, input.freeUnitsApplied), standardUnits);
  const chargedCents = input.status === "succeeded" ? Math.max(0, input.chargedCents) : 0;
  const inputTokens = Math.max(0, input.tokenUsage.inputTokens);
  const outputTokens = Math.max(0, input.tokenUsage.outputTokens);
  const estimatedProviderCostCents = roundMoney(
    (inputTokens / 1_000_000) * Math.max(0, input.providerPricing.inputCentsPerMillionTokens) +
      (outputTokens / 1_000_000) * Math.max(0, input.providerPricing.outputCentsPerMillionTokens),
  );
  const grossMarginCents = roundMoney(chargedCents - estimatedProviderCostCents);

  return {
    taskId: input.taskId,
    chapterId: input.chapterId,
    providerName: input.providerName,
    modelName: input.modelName,
    status: input.status,
    standardUnits,
    freeUnitsApplied,
    chargedCents,
    freeCoverageCents: freeUnitsApplied * TRANSLATION_PRICE_PER_STANDARD_UNIT_CENTS,
    inputTokens,
    outputTokens,
    estimatedProviderCostCents,
    grossMarginCents,
    grossMarginPercent: chargedCents === 0 ? null : roundMoney((grossMarginCents / chargedCents) * 100),
    retryCount: Math.max(0, input.retryCount),
    qualityIssueCount: Math.max(0, input.qualityIssueCount),
    lossMaking: grossMarginCents < 0,
  };
}

export function getTranslationCostLedgerSummary(
  entries: TranslationCostLedgerEntry[],
): TranslationCostLedgerSummary {
  const summary = entries.reduce(
    (totals, entry) => ({
      totalTasks: totals.totalTasks + 1,
      succeededTasks: totals.succeededTasks + (entry.status === "succeeded" ? 1 : 0),
      failedTasks: totals.failedTasks + (entry.status === "failed" ? 1 : 0),
      lossMakingTasks: totals.lossMakingTasks + (entry.lossMaking ? 1 : 0),
      totalStandardUnits: totals.totalStandardUnits + entry.standardUnits,
      totalFreeUnitsApplied: totals.totalFreeUnitsApplied + entry.freeUnitsApplied,
      totalChargedCents: totals.totalChargedCents + entry.chargedCents,
      totalFreeCoverageCents: totals.totalFreeCoverageCents + entry.freeCoverageCents,
      totalProviderCostCents: totals.totalProviderCostCents + entry.estimatedProviderCostCents,
      totalGrossMarginCents: totals.totalGrossMarginCents + entry.grossMarginCents,
      totalRetryCount: totals.totalRetryCount + entry.retryCount,
      totalQualityIssueCount: totals.totalQualityIssueCount + entry.qualityIssueCount,
    }),
    {
      totalTasks: 0,
      succeededTasks: 0,
      failedTasks: 0,
      lossMakingTasks: 0,
      totalStandardUnits: 0,
      totalFreeUnitsApplied: 0,
      totalChargedCents: 0,
      totalFreeCoverageCents: 0,
      totalProviderCostCents: 0,
      totalGrossMarginCents: 0,
      totalRetryCount: 0,
      totalQualityIssueCount: 0,
    },
  );

  const totalGrossMarginCents = roundMoney(summary.totalGrossMarginCents);
  const totalChargedCents = roundMoney(summary.totalChargedCents);

  return {
    ...summary,
    totalChargedCents,
    totalFreeCoverageCents: roundMoney(summary.totalFreeCoverageCents),
    totalProviderCostCents: roundMoney(summary.totalProviderCostCents),
    totalGrossMarginCents,
    grossMarginPercent:
      totalChargedCents === 0 ? null : roundMoney((totalGrossMarginCents / totalChargedCents) * 100),
  };
}

export function assessTranslationCostHealth(
  summary: TranslationCostLedgerSummary,
  policy: TranslationCostHealthPolicy = DEFAULT_TRANSLATION_COST_HEALTH_POLICY,
): TranslationCostHealth {
  const totalTasks = Math.max(0, summary.totalTasks);
  const lossMakingTaskRate = totalTasks === 0 ? 0 : roundRatio(summary.lossMakingTasks / totalTasks);
  const averageRetryCount = totalTasks === 0 ? 0 : roundRatio(summary.totalRetryCount / totalTasks);
  const qualityIssueRate = totalTasks === 0 ? 0 : roundRatio(summary.totalQualityIssueCount / totalTasks);
  const reasons: string[] = [];

  if (summary.totalGrossMarginCents < 0) {
    reasons.push("总毛利为负");
    return {
      status: "loss",
      label: "亏损",
      reasons,
      lossMakingTaskRate,
      averageRetryCount,
      qualityIssueRate,
    };
  }

  if (
    summary.grossMarginPercent !== null &&
    summary.grossMarginPercent < policy.minGrossMarginPercent
  ) {
    reasons.push(`毛利率低于 ${policy.minGrossMarginPercent}%`);
  }

  if (lossMakingTaskRate > policy.maxLossMakingTaskRate) {
    reasons.push(`亏损任务占比高于 ${formatPercentPolicy(policy.maxLossMakingTaskRate)}`);
  }

  if (averageRetryCount > policy.maxAverageRetryCount) {
    reasons.push(`平均重试次数高于 ${policy.maxAverageRetryCount}`);
  }

  if (qualityIssueRate > policy.maxQualityIssueRate) {
    reasons.push(`质检问题占比高于 ${formatPercentPolicy(policy.maxQualityIssueRate)}`);
  }

  return {
    status: reasons.length > 0 ? "watch" : "healthy",
    label: reasons.length > 0 ? "需关注" : "健康",
    reasons,
    lossMakingTaskRate,
    averageRetryCount,
    qualityIssueRate,
  };
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function roundRatio(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function formatPercentPolicy(value: number) {
  return `${Math.round(value * 100)}%`;
}
