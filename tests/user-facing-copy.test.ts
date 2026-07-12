import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("keeps normal user translation task copy free of internal wording", () => {
  const mockDataSource = readFileSync("src/lib/mock-data.ts", "utf8");
  const normalUserTranslationSources = [
    "src/components/translation/translation-create-panel.tsx",
    "src/components/translation/local-translation-tasks.tsx",
    "src/app/translations/[translationId]/tasks/page.tsx",
    "src/app/me/page.tsx",
  ]
    .map((filePath) => readFileSync(filePath, "utf8"))
    .join("\n");

  assert.equal(mockDataSource.includes("模拟质检"), false);
  assert.equal(mockDataSource.includes("队列任务"), false);
  assert.equal(normalUserTranslationSources.includes("翻译任务"), false);
  assert.equal(normalUserTranslationSources.includes("章节任务"), false);
});

test("does not link translation progress to the demo task before a draft exists", () => {
  const panelSource = readFileSync(
    "src/components/translation/translation-create-panel.tsx",
    "utf8",
  );

  assert.equal(panelSource.includes("useState(routes.tasks)"), false);
});

test("login inputs expose labels and mobile-friendly autofill metadata", () => {
  const loginSource = readFileSync("src/app/login/page.tsx", "utf8");

  assert.equal(loginSource.includes('htmlFor="login-phone"'), true);
  assert.equal(loginSource.includes('id="login-phone"'), true);
  assert.equal(loginSource.includes('type="tel"'), true);
  assert.equal(loginSource.includes('autoComplete="tel"'), true);
  assert.equal(loginSource.includes('htmlFor="login-code"'), true);
  assert.equal(loginSource.includes('autoComplete="one-time-code"'), true);
});

test("local translation pricing is labeled as non-billing demonstration data", () => {
  const panelSource = readFileSync(
    "src/components/translation/translation-create-panel.tsx",
    "utf8",
  );

  assert.equal(panelSource.includes("不会真实冻结、扣款或消耗生产额度"), true);
  assert.equal(panelSource.includes("演示账户余额"), true);
});
