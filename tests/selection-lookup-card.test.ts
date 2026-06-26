import assert from "node:assert/strict";
import test from "node:test";

import { buildSelectionLookupCard } from "../src/lib/reader/selection-lookup-card.ts";

test("builds a compact lookup card for selected reader text", () => {
  const card = buildSelectionLookupCard({
    selectedText: "threshold",
    addedToVocabulary: false,
  });

  assert.equal(card.term, "threshold");
  assert.equal(card.phonetic, "/ˈθreʃ.hoʊld/");
  assert.equal(card.explanation, "门槛；临界点；也可表示进入某个状态前的边界。");
  assert.equal(card.pronunciationLabel, "播放读音");
  assert.equal(card.vocabularyActionLabel, "加入词汇本");
});

test("keeps selected phrases readable and switches vocabulary action state", () => {
  const card = buildSelectionLookupCard({
    selectedText: "raised the lamp higher",
    addedToVocabulary: true,
  });

  assert.equal(card.term, "raised the lamp higher");
  assert.equal(card.phonetic, "短语");
  assert.equal(card.explanation, "选中的短语可先看核心动词和前后搭配，再结合上下文理解。");
  assert.equal(card.vocabularyActionLabel, "已加入词汇本");
});
