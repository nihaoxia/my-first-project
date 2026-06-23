import test from "node:test";
import assert from "node:assert/strict";

import {
  estimateChapterTranslationCost,
  estimateTranslationSelectionCost,
  getStandardChapterCharacterLimit,
} from "../src/lib/translation/translation-pricing.ts";

test("uses 3000 characters as one standard chapter for Chinese source text", () => {
  assert.equal(getStandardChapterCharacterLimit("中文"), 3000);
  assert.deepEqual(
    estimateChapterTranslationCost({
      id: "chapter-1",
      title: "第一章 雾起",
      characterCount: 3180,
      sourceLanguage: "中文",
    }),
    {
      id: "chapter-1",
      title: "第一章 雾起",
      characterCount: 3180,
      standardUnits: 2,
      baseCostCents: 20,
    },
  );
});

test("uses 6000 characters as one standard chapter for non-CJK source text", () => {
  assert.equal(getStandardChapterCharacterLimit("英文"), 6000);
  assert.deepEqual(
    estimateChapterTranslationCost({
      id: "chapter-2",
      title: "Chapter 2",
      characterCount: 6100,
      sourceLanguage: "英文",
    }),
    {
      id: "chapter-2",
      title: "Chapter 2",
      characterCount: 6100,
      standardUnits: 2,
      baseCostCents: 20,
    },
  );
});

test("charges one standard chapter for short non-empty chapters", () => {
  const estimate = estimateChapterTranslationCost({
    id: "short",
    title: "短章",
    characterCount: 12,
    sourceLanguage: "中文",
  });

  assert.equal(estimate.standardUnits, 1);
  assert.equal(estimate.baseCostCents, 10);
});

test("applies free standard chapter quota before calculating payable cost", () => {
  const summary = estimateTranslationSelectionCost({
    sourceLanguage: "中文",
    freeChaptersLeft: 3,
    selectedChapterIds: ["chapter-1", "chapter-2", "chapter-3"],
    chapters: [
      { id: "chapter-1", title: "第一章", characterCount: 3180 },
      { id: "chapter-2", title: "第二章", characterCount: 2760 },
      { id: "chapter-3", title: "第三章", characterCount: 6120 },
      { id: "chapter-4", title: "目录", characterCount: 420, skipped: true },
    ],
  });

  assert.equal(summary.selectedChapterCount, 3);
  assert.equal(summary.totalStandardUnits, 6);
  assert.equal(summary.freeUnitsApplied, 3);
  assert.equal(summary.payableStandardUnits, 3);
  assert.equal(summary.baseCostCents, 60);
  assert.equal(summary.payableCostCents, 30);
  assert.equal(summary.skippedChapterCount, 1);
});

test("returns zero totals when no chapters are selected", () => {
  const summary = estimateTranslationSelectionCost({
    sourceLanguage: "中文",
    freeChaptersLeft: 12,
    selectedChapterIds: [],
    chapters: [{ id: "chapter-1", title: "第一章", characterCount: 3180 }],
  });

  assert.equal(summary.selectedChapterCount, 0);
  assert.equal(summary.totalStandardUnits, 0);
  assert.equal(summary.payableCostCents, 0);
});
