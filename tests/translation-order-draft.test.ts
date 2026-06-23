import test from "node:test";
import assert from "node:assert/strict";

import { buildTranslationOrderDraft } from "../src/lib/translation/translation-order-draft.ts";

const baseAccount = {
  balanceCents: 1230,
  frozenCents: 40,
  freeChaptersLeft: 3,
};

const chapters = [
  { id: "chapter-1", title: "第一章", characterCount: 3180 },
  { id: "chapter-2", title: "第二章", characterCount: 2760 },
  { id: "chapter-3", title: "第三章", characterCount: 6120 },
  { id: "chapter-4", title: "目录", characterCount: 420, skipped: true },
];

test("builds a translation order draft with task drafts and hold preview", () => {
  const draft = buildTranslationOrderDraft({
    userId: "user-1",
    originalBookId: "book-1",
    sourceLanguage: "中文",
    targetLanguage: "英文",
    webLookupEnabled: true,
    account: baseAccount,
    chapters,
    selectedChapterIds: ["chapter-1", "chapter-2", "chapter-3"],
  });

  assert.equal(draft.ok, true);
  assert.equal(draft.translation.originalBookId, "book-1");
  assert.equal(draft.translation.targetLanguage, "英文");
  assert.equal(draft.pricing.totalStandardUnits, 6);
  assert.equal(draft.pricing.freeUnitsApplied, 3);
  assert.equal(draft.pricing.payableCostCents, 30);
  assert.deepEqual(
    draft.tasks.map((task) => ({
      chapterId: task.chapterId,
      status: task.status,
      frozenCents: task.frozenCents,
    })),
    [
      { chapterId: "chapter-1", status: "queued", frozenCents: 0 },
      { chapterId: "chapter-2", status: "queued", frozenCents: 0 },
      { chapterId: "chapter-3", status: "queued", frozenCents: 30 },
    ],
  );
  assert.deepEqual(draft.accountAfterHold, {
    balanceCents: 1230,
    frozenCents: 70,
    freeChaptersLeft: 0,
  });
});

test("rejects translation drafts without selected chapters", () => {
  assert.deepEqual(
    buildTranslationOrderDraft({
      userId: "user-1",
      originalBookId: "book-1",
      sourceLanguage: "中文",
      targetLanguage: "英文",
      webLookupEnabled: true,
      account: baseAccount,
      chapters,
      selectedChapterIds: [],
    }),
    {
      ok: false,
      reason: "no-selected-chapters",
    },
  );
});

test("rejects unsupported target languages", () => {
  assert.deepEqual(
    buildTranslationOrderDraft({
      userId: "user-1",
      originalBookId: "book-1",
      sourceLanguage: "中文",
      targetLanguage: "意大利语",
      webLookupEnabled: true,
      account: baseAccount,
      chapters,
      selectedChapterIds: ["chapter-1"],
    }),
    {
      ok: false,
      reason: "unsupported-target-language",
    },
  );
});

test("rejects payable drafts when available balance is not enough", () => {
  const draft = buildTranslationOrderDraft({
    userId: "user-1",
    originalBookId: "book-1",
    sourceLanguage: "中文",
    targetLanguage: "英文",
    webLookupEnabled: true,
    account: {
      balanceCents: 10,
      frozenCents: 0,
      freeChaptersLeft: 0,
    },
    chapters,
    selectedChapterIds: ["chapter-1", "chapter-2", "chapter-3"],
  });

  assert.equal(draft.ok, false);
  assert.equal(draft.reason, "insufficient-balance");
  assert.equal(draft.availableCents, 10);
  assert.equal(draft.requiredCents, 60);
});

test("allows free quota to cover the full draft without freezing balance", () => {
  const draft = buildTranslationOrderDraft({
    userId: "user-1",
    originalBookId: "book-1",
    sourceLanguage: "中文",
    targetLanguage: "英文",
    webLookupEnabled: false,
    account: {
      balanceCents: 0,
      frozenCents: 0,
      freeChaptersLeft: 10,
    },
    chapters,
    selectedChapterIds: ["chapter-1", "chapter-2"],
  });

  assert.equal(draft.ok, true);
  assert.equal(draft.pricing.payableCostCents, 0);
  assert.equal(draft.accountAfterHold.frozenCents, 0);
  assert.equal(draft.accountAfterHold.freeChaptersLeft, 7);
});
