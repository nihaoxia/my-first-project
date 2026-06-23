import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_TRANSLATION_STYLE,
  DEFAULT_WEB_LOOKUP_ENABLED,
  getDefaultTargetLanguage,
  getSupportedTargetLanguages,
  isSupportedTargetLanguage,
} from "../src/lib/translation/translation-options.ts";

test("exposes the first version target language list", () => {
  assert.deepEqual(getSupportedTargetLanguages(), ["中文", "英文", "日文", "韩文", "俄语", "德语", "西班牙语", "法语"]);
});

test("defaults to English when the source language is Chinese", () => {
  assert.equal(getDefaultTargetLanguage("中文"), "英文");
});

test("defaults to Chinese when the source language is already English", () => {
  assert.equal(getDefaultTargetLanguage("英文"), "中文");
});

test("checks target language support", () => {
  assert.equal(isSupportedTargetLanguage("日文"), true);
  assert.equal(isSupportedTargetLanguage("意大利语"), false);
});

test("keeps first version translation defaults explicit", () => {
  assert.equal(DEFAULT_WEB_LOOKUP_ENABLED, true);
  assert.equal(DEFAULT_TRANSLATION_STYLE, "natural-novel");
});
