import assert from "node:assert/strict";
import test from "node:test";

import { extractTerminologyCandidates } from "../src/lib/translation/terminology.ts";

test("extracts chinese book-title terms and english proper terms", () => {
  const candidates = extractTerminologyCandidates({
    sourceLanguage: "中文",
    texts: [
      "《雾灯协议》第一次被 Mistwarden Lin 提起。",
      "Mistwarden Lin 在黑桥旁再次提到《雾灯协议》。",
    ],
  });

  assert.deepEqual(
    candidates.map((candidate) => ({
      term: candidate.term,
      count: candidate.count,
      sourceLanguage: candidate.sourceLanguage,
    })),
    [
      { term: "《雾灯协议》", count: 2, sourceLanguage: "中文" },
      { term: "Mistwarden Lin", count: 2, sourceLanguage: "中文" },
    ],
  );
});

test("deduplicates candidates and keeps first contexts", () => {
  const candidates = extractTerminologyCandidates({
    sourceLanguage: "英文",
    texts: ["The Silent Archive opens.", "The Silent Archive closes."],
  });

  assert.equal(candidates[0].term, "Silent Archive");
  assert.equal(candidates[0].contexts.length, 2);
});
