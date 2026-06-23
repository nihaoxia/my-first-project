import test from "node:test";
import assert from "node:assert/strict";

import {
  assessTranslationCostHealth,
  buildTranslationCostLedgerEntry,
  getTranslationCostLedgerSummary,
} from "../src/lib/translation/translation-cost-ledger.ts";

const providerPricing = {
  inputCentsPerMillionTokens: 15,
  outputCentsPerMillionTokens: 60,
};

test("builds a cost ledger entry with charged revenue and provider cost", () => {
  const entry = buildTranslationCostLedgerEntry({
    taskId: "task-1",
    chapterId: "chapter-1",
    providerName: "fake-local-provider",
    modelName: "local-cost-model",
    standardUnits: 2,
    freeUnitsApplied: 0,
    chargedCents: 100,
    status: "succeeded",
    tokenUsage: {
      inputTokens: 1200,
      outputTokens: 1800,
    },
    providerPricing,
    retryCount: 1,
    qualityIssueCount: 0,
  });

  assert.deepEqual(entry, {
    taskId: "task-1",
    chapterId: "chapter-1",
    providerName: "fake-local-provider",
    modelName: "local-cost-model",
    status: "succeeded",
    standardUnits: 2,
    freeUnitsApplied: 0,
    chargedCents: 100,
    freeCoverageCents: 0,
    inputTokens: 1200,
    outputTokens: 1800,
    estimatedProviderCostCents: 0.13,
    grossMarginCents: 99.87,
    grossMarginPercent: 99.87,
    retryCount: 1,
    qualityIssueCount: 0,
    lossMaking: false,
  });
});

test("keeps free standard chapters visible as internal delivery cost", () => {
  const entry = buildTranslationCostLedgerEntry({
    taskId: "task-free",
    chapterId: "chapter-free",
    providerName: "fake-local-provider",
    modelName: "local-cost-model",
    standardUnits: 1,
    freeUnitsApplied: 1,
    chargedCents: 0,
    status: "succeeded",
    tokenUsage: {
      inputTokens: 6000,
      outputTokens: 7000,
    },
    providerPricing,
    retryCount: 0,
    qualityIssueCount: 1,
  });

  assert.equal(entry.freeCoverageCents, 50);
  assert.equal(entry.estimatedProviderCostCents, 0.51);
  assert.equal(entry.grossMarginCents, -0.51);
  assert.equal(entry.grossMarginPercent, null);
  assert.equal(entry.lossMaking, true);
});

test("does not count failed task charges as revenue", () => {
  const entry = buildTranslationCostLedgerEntry({
    taskId: "task-failed",
    chapterId: "chapter-failed",
    providerName: "fake-local-provider",
    modelName: "local-cost-model",
    standardUnits: 2,
    freeUnitsApplied: 0,
    chargedCents: 100,
    status: "failed",
    tokenUsage: {
      inputTokens: 1000,
      outputTokens: 1000,
    },
    providerPricing,
    retryCount: 2,
    qualityIssueCount: 1,
  });

  assert.equal(entry.chargedCents, 0);
  assert.equal(entry.grossMarginCents, -0.08);
  assert.equal(entry.lossMaking, true);
});

test("summarizes cost ledger entries for admin margin monitoring", () => {
  const entries = [
    buildTranslationCostLedgerEntry({
      taskId: "task-1",
      chapterId: "chapter-1",
      providerName: "fake-local-provider",
      modelName: "local-cost-model",
      standardUnits: 2,
      freeUnitsApplied: 0,
      chargedCents: 100,
      status: "succeeded",
      tokenUsage: { inputTokens: 1200, outputTokens: 1800 },
      providerPricing,
      retryCount: 1,
      qualityIssueCount: 0,
    }),
    buildTranslationCostLedgerEntry({
      taskId: "task-free",
      chapterId: "chapter-free",
      providerName: "fake-local-provider",
      modelName: "local-cost-model",
      standardUnits: 1,
      freeUnitsApplied: 1,
      chargedCents: 0,
      status: "succeeded",
      tokenUsage: { inputTokens: 6000, outputTokens: 7000 },
      providerPricing,
      retryCount: 0,
      qualityIssueCount: 1,
    }),
    buildTranslationCostLedgerEntry({
      taskId: "task-failed",
      chapterId: "chapter-failed",
      providerName: "fake-local-provider",
      modelName: "local-cost-model",
      standardUnits: 2,
      freeUnitsApplied: 0,
      chargedCents: 100,
      status: "failed",
      tokenUsage: { inputTokens: 1000, outputTokens: 1000 },
      providerPricing,
      retryCount: 2,
      qualityIssueCount: 1,
    }),
  ];

  assert.deepEqual(getTranslationCostLedgerSummary(entries), {
    totalTasks: 3,
    succeededTasks: 2,
    failedTasks: 1,
    lossMakingTasks: 2,
    totalStandardUnits: 5,
    totalFreeUnitsApplied: 1,
    totalChargedCents: 100,
    totalFreeCoverageCents: 50,
    totalProviderCostCents: 0.72,
    totalGrossMarginCents: 99.28,
    grossMarginPercent: 99.28,
    totalRetryCount: 3,
    totalQualityIssueCount: 2,
  });
});

test("marks cost health as healthy when margin and task quality are within policy", () => {
  const health = assessTranslationCostHealth({
    totalTasks: 10,
    succeededTasks: 10,
    failedTasks: 0,
    lossMakingTasks: 0,
    totalStandardUnits: 20,
    totalFreeUnitsApplied: 2,
    totalChargedCents: 900,
    totalFreeCoverageCents: 100,
    totalProviderCostCents: 180,
    totalGrossMarginCents: 720,
    grossMarginPercent: 80,
    totalRetryCount: 2,
    totalQualityIssueCount: 1,
  });

  assert.deepEqual(health, {
    status: "healthy",
    label: "健康",
    reasons: [],
    lossMakingTaskRate: 0,
    averageRetryCount: 0.2,
    qualityIssueRate: 0.1,
  });
});

test("marks cost health as watch when margin is low or risky tasks increase", () => {
  const health = assessTranslationCostHealth({
    totalTasks: 10,
    succeededTasks: 8,
    failedTasks: 2,
    lossMakingTasks: 3,
    totalStandardUnits: 20,
    totalFreeUnitsApplied: 3,
    totalChargedCents: 850,
    totalFreeCoverageCents: 150,
    totalProviderCostCents: 420,
    totalGrossMarginCents: 430,
    grossMarginPercent: 50.59,
    totalRetryCount: 14,
    totalQualityIssueCount: 6,
  });

  assert.equal(health.status, "watch");
  assert.equal(health.label, "需关注");
  assert.deepEqual(health.reasons, [
    "毛利率低于 60%",
    "亏损任务占比高于 20%",
    "平均重试次数高于 1",
    "质检问题占比高于 50%",
  ]);
  assert.equal(health.lossMakingTaskRate, 0.3);
  assert.equal(health.averageRetryCount, 1.4);
  assert.equal(health.qualityIssueRate, 0.6);
});

test("marks cost health as loss when total gross margin is negative", () => {
  const health = assessTranslationCostHealth({
    totalTasks: 2,
    succeededTasks: 1,
    failedTasks: 1,
    lossMakingTasks: 2,
    totalStandardUnits: 2,
    totalFreeUnitsApplied: 1,
    totalChargedCents: 50,
    totalFreeCoverageCents: 50,
    totalProviderCostCents: 80,
    totalGrossMarginCents: -30,
    grossMarginPercent: -60,
    totalRetryCount: 3,
    totalQualityIssueCount: 2,
  });

  assert.equal(health.status, "loss");
  assert.equal(health.label, "亏损");
  assert.equal(health.reasons[0], "总毛利为负");
});
