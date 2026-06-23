import assert from "node:assert/strict";
import test from "node:test";

import {
  assessGlossaryTermUsage,
  confirmBookGlossaryTerm,
  getRelevantGlossaryTermsForText,
  upsertTerminologyCandidatesIntoGlossary,
  type BookGlossaryTerm,
} from "../src/lib/translation/terminology-glossary.ts";

const baseTerm: BookGlossaryTerm = {
  bookId: "book-1",
  sourceLanguage: "中文",
  targetLanguage: "英文",
  sourceTerm: "雾守",
  targetTerm: "mistwarden",
  status: "confirmed",
  confidence: 0.9,
  occurrences: 2,
  firstSeenChapterId: "chapter-1",
  lastSeenChapterId: "chapter-1",
  contexts: ["雾守第一次举起灯。"],
};

test("adds new terminology candidates as pending book glossary terms", () => {
  const glossary = upsertTerminologyCandidatesIntoGlossary({
    bookId: "book-1",
    sourceLanguage: "中文",
    targetLanguage: "英文",
    chapterId: "chapter-2",
    existingTerms: [],
    candidates: [
      {
        term: "《雾灯协议》",
        sourceLanguage: "中文",
        count: 2,
        contexts: ["《雾灯协议》第一次被提起。"],
      },
    ],
  });

  assert.deepEqual(glossary, [
    {
      bookId: "book-1",
      sourceLanguage: "中文",
      targetLanguage: "英文",
      sourceTerm: "《雾灯协议》",
      targetTerm: undefined,
      status: "pending",
      confidence: 0.6,
      occurrences: 2,
      firstSeenChapterId: "chapter-2",
      lastSeenChapterId: "chapter-2",
      contexts: ["《雾灯协议》第一次被提起。"],
    },
  ]);
});

test("upserts repeated candidates without losing confirmed translations", () => {
  const glossary = upsertTerminologyCandidatesIntoGlossary({
    bookId: "book-1",
    sourceLanguage: "中文",
    targetLanguage: "英文",
    chapterId: "chapter-3",
    existingTerms: [baseTerm],
    candidates: [
      {
        term: "雾守",
        sourceLanguage: "中文",
        count: 3,
        contexts: ["雾守再次出现。"],
      },
    ],
  });

  assert.equal(glossary[0].status, "confirmed");
  assert.equal(glossary[0].targetTerm, "mistwarden");
  assert.equal(glossary[0].occurrences, 5);
  assert.equal(glossary[0].lastSeenChapterId, "chapter-3");
});

test("confirms a pending term for later local reuse", () => {
  const confirmed = confirmBookGlossaryTerm(
    {
      ...baseTerm,
      sourceTerm: "黑桥",
      targetTerm: undefined,
      status: "pending",
      confidence: 0.6,
    },
    {
      targetTerm: "Black Bridge",
      confidence: 0.88,
    },
  );

  assert.equal(confirmed.status, "confirmed");
  assert.equal(confirmed.targetTerm, "Black Bridge");
  assert.equal(confirmed.confidence, 0.88);
});

test("returns only confirmed terms that appear in the current chapter text", () => {
  const glossaryTerms = getRelevantGlossaryTermsForText({
    text: "雾守走过黑桥。",
    glossary: [
      baseTerm,
      {
        ...baseTerm,
        sourceTerm: "黑桥",
        targetTerm: "Black Bridge",
        status: "confirmed",
      },
      {
        ...baseTerm,
        sourceTerm: "旧地图",
        targetTerm: "old map",
        status: "confirmed",
      },
      {
        ...baseTerm,
        sourceTerm: "未确认术语",
        targetTerm: "unconfirmed term",
        status: "pending",
      },
    ],
  });

  assert.deepEqual(glossaryTerms, [
    {
      sourceTerm: "雾守",
      targetTerm: "mistwarden",
      note: "内部术语本",
    },
    {
      sourceTerm: "黑桥",
      targetTerm: "Black Bridge",
      note: "内部术语本",
    },
  ]);
});

test("flags translated text that ignores confirmed book glossary terms", () => {
  const result = assessGlossaryTermUsage({
    sourceText: "雾守走过黑桥。",
    translatedText: "The mistwarden crossed the dark bridge.",
    glossary: [
      baseTerm,
      {
        ...baseTerm,
        sourceTerm: "黑桥",
        targetTerm: "Black Bridge",
        status: "confirmed",
      },
    ],
  });

  assert.deepEqual(result, [
    {
      sourceTerm: "黑桥",
      expectedTargetTerm: "Black Bridge",
      message: "原文出现术语“黑桥”，但译文未使用内部术语本译法“Black Bridge”。",
    },
  ]);
});
