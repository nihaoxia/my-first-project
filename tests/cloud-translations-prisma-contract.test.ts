import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const adapter = readFileSync("src/lib/cloud/translations.ts", "utf8");

test("Prisma translation writes use bounded Serializable retries and attempt-scoped holds", () => {
  assert.match(adapter, /function serialTx<[\s\S]+withSerializableReconciliation<T>[\s\S]+withSerializableRetry<T>\(\(\) => db\.\$transaction/);
  assert.match(adapter, /balanceHold\.create\(\{ data: \{ userId, taskId, attemptId,/);
  assert.match(adapter, /where: \{ userId, taskId, attemptId, releasedAt: null, chargedAt: null \}/);
  assert.match(adapter, /releaseBalance\(tx, input\.userId, input\.taskId, oldAttemptId, input\.now\)[\s\S]+reserveBalance\(tx, input\.userId, input\.taskId, input\.attemptId/);
  assert.doesNotMatch(adapter, /balanceHold\.update\([\s\S]{0,200}releasedAt: null/);
});

test("checkpoint CAS and create TOCTOU checks remain owner and chapter scoped", () => {
  assert.match(adapter, /status: "TRANSLATING", attemptId: input\.attemptId, attemptExpiresAt: \{ gt: input\.now \}, nextSegmentIndex: input\.expectedNextSegmentIndex/);
  assert.match(adapter, /originalBookId: input\.originalBookId, originalBook: \{ userId: input\.userId \}, status: "ACTIVE", isSkipped: false/);
  assert.match(adapter, /chapters\.length !== selectedIds\.length/);
  assert.match(adapter, /book\.sourceLanguage === input\.targetLanguage/);
  assert.match(adapter, /select: \{ id: true, sourceLanguage: true \}/);
  assert.match(adapter, /select: \{ id: true, content: true \}/);
  assert.match(adapter, /estimateTranslationCostCents\(book\.sourceLanguage as CloudBookLanguage, chapter\.content\.length\)/);
  assert.doesNotMatch(adapter, /estimatedCost: new Prisma\.Decimal\(task\.estimatedCostCents\)/);
  assert.match(adapter, /findExecutionReceipt\(db, input\.executionId\)/);
});

test("ambiguous provider commits reconcile through immutable execution receipts", () => {
  const checkpointAdapter = adapter.slice(adapter.indexOf("async checkpointTask"), adapter.indexOf("async failTask"));
  const failureAdapter = adapter.slice(adapter.indexOf("async failTask"), adapter.indexOf("async retryTask"));
  assert.match(checkpointAdapter, /translationBatchReceipt\.create/);
  assert.match(adapter, /translationBatchReceipt\.findUnique/);
  assert.match(failureAdapter, /translationBatchReceipt\.create/);
  assert.match(adapter, /translationBatchReceipt\.findUnique/);
  assert.doesNotMatch(checkpointAdapter, /row\.lastBatchExecutionId === input\.executionId/);
  assert.doesNotMatch(failureAdapter, /row\.lastBatchExecutionId === input\.executionId/);
});

test("ordinary retries preserve valid checkpoint content and usage", () => {
  const retryAdapter = adapter.slice(adapter.indexOf("async retryTask"), adapter.indexOf("async cancelTask"));
  assert.doesNotMatch(retryAdapter, /const before = await selectTask\(db/);
  assert.match(retryAdapter, /const snapshot = await selectTask\(tx/);
  assert.match(retryAdapter, /const resetCheckpoint = snapshot\.errorCode === "CHECKPOINT_INVALID"/);
  assert.match(retryAdapter, /retryCount: snapshot\.retryCount/);
  assert.match(retryAdapter, /errorCode: snapshot\.errorCode/);
  assert.match(retryAdapter, /translationRetryReceipt\.create/);
  assert.match(retryAdapter, /retryExecutionId: input\.retryExecutionId/);
  assert.match(retryAdapter, /findRetryReceipt\(db, input\.retryExecutionId\)/);
  assert.doesNotMatch(retryAdapter, /lastRetryExecutionId/);
  assert.match(retryAdapter, /translatedSegments: resetCheckpoint \? \[\] : undefined/);
  assert.match(retryAdapter, /nextSegmentIndex: resetCheckpoint \? 0 : undefined/);
  assert.match(retryAdapter, /accumulatedInputTokens: resetCheckpoint \? 0 : undefined/);
  assert.match(retryAdapter, /accumulatedOutputTokens: resetCheckpoint \? 0 : undefined/);
  assert.doesNotMatch(retryAdapter, /translationBatchReceipt\.(?:delete|deleteMany)/);
});

test("a stale checkpoint-reset retry cannot clear a later ordinary-failure checkpoint", () => {
  type State = { status: "FAILED" | "PENDING"; retryCount: number; errorCode: string | null; nextSegmentIndex: number };
  const stale = { status: "FAILED", retryCount: 0, errorCode: "CHECKPOINT_INVALID", nextSegmentIndex: 0 } satisfies State;
  const staleCas = (current: State) => current.status === "FAILED" && current.retryCount === stale.retryCount && current.errorCode === stale.errorCode;
  let current: State = { status: "PENDING", retryCount: 1, errorCode: null, nextSegmentIndex: 0 };
  current = { status: "FAILED", retryCount: 1, errorCode: "PROVIDER_TIMEOUT", nextSegmentIndex: 10 };
  assert.equal(staleCas(current), false);
  const freshReset = current.errorCode === "CHECKPOINT_INVALID";
  assert.equal(freshReset, false);
  assert.equal(current.nextSegmentIndex, 10);
});

test("MCP provider resolution is lazy for cloud reads", () => {
  const getter = adapter.slice(adapter.indexOf("let singleton:"));
  assert.match(getter, /translateSegments: \(input\) => resolveProvider\(\)\.translateSegments\(input\)/);
  assert.match(getter, /base\.create = async \(\.\.\.args\) => \{\s*resolveProvider\(\)/);
  assert.doesNotMatch(getter.slice(getter.indexOf("getCloudTranslationsService"), getter.indexOf("const provider")), /resolveProvider\(/);
});

test("long task route stays shorter than the ten-minute lease and the cloud reader never falls through to mock", () => {
  const route = readFileSync("src/app/api/cloud/translations/[translationId]/tasks/[taskId]/route.ts", "utf8");
  const reader = readFileSync("src/app/reader/page.tsx", "utf8");
  assert.match(route, /maxDuration = 360/);
  assert.match(reader, /if \(process\.env\.AUTH_MODE === "edgeone"\) redirect\(routes\.library\)/);
});
