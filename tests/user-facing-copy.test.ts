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

test("login inputs expose username, password and recovery autofill metadata", () => {
  const loginSource = ["src/app/login/page.tsx", "src/app/login/account-forms.tsx"]
    .map((path) => readFileSync(path, "utf8")).join("\n");

  assert.equal(loginSource.includes('autoComplete="username"'), true);
  assert.equal(loginSource.includes('autoComplete="current-password"'), true);
  assert.equal(loginSource.includes('autoComplete="new-password"'), true);
  assert.equal(loginSource.includes('name="recoveryCode"'), true);
  assert.equal(/手机号|短信|验证码/.test(loginSource), false);
});

test("local translation pricing is labeled as non-billing demonstration data", () => {
  const panelSource = readFileSync(
    "src/components/translation/translation-create-panel.tsx",
    "utf8",
  );

  assert.equal(panelSource.includes("不会真实冻结、扣款或消耗生产额度"), true);
  assert.equal(panelSource.includes("演示账户余额"), true);
});

test("reader and notes advertise real text downloads without placeholder wording", () => {
  const readerSource = readFileSync("src/components/reader/reader-workspace.tsx", "utf8");
  const notesSource = readFileSync("src/components/study/notes-workspace.tsx", "utf8");
  const combined = `${readerSource}\n${notesSource}`;

  assert.equal(readerSource.includes("下载完整译本 TXT"), true);
  assert.equal(notesSource.includes("导出 Markdown"), true);
  assert.equal(combined.includes("下载尚未接入"), false);
});
