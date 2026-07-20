import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createAuthoritativeBlobStore } from "../src/lib/edgeone/blob-store-core.ts";

let subject: typeof import("../src/lib/cloud/edgeone-translations-repository.ts") | undefined;
try { subject = await import("../src/lib/cloud/edgeone-translations-repository.ts"); } catch { /* red */ }
function api() { if (!subject) assert.fail("EdgeOne translations repository must be implemented"); return subject; }

const USER = "11111111-1111-4111-8111-111111111111";
const BOOK = "22222222-2222-4222-8222-222222222222";
const CHAPTER = "33333333-3333-4333-8333-333333333333";
const TRANSLATION = "44444444-4444-4444-8444-444444444444";
const TASK = "55555555-5555-4555-8555-555555555555";
const ATTEMPT = "66666666-6666-4666-8666-666666666666";
const EXECUTION = "77777777-7777-4777-8777-777777777777";
const OTHER_USER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_CHAPTER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function harness(options: { sourceLanguage?: "ENGLISH" | "CHINESE"; chapterStatus?: string; isSkipped?: boolean } = {}) {
  const data = new Map<string, unknown>();
  const blob = createAuthoritativeBlobStore({
    async set(key, value, options) { if (options?.onlyIfNew && data.has(key)) throw Object.assign(new Error("exists"), { code: "PreconditionFailed" }); data.set(key, value); },
    async setJSON(key, value, options) { if (options?.onlyIfNew && data.has(key)) throw Object.assign(new Error("exists"), { code: "PreconditionFailed" }); data.set(key, structuredClone(value)); },
    async get(key) { return data.has(key) ? structuredClone(data.get(key)) : null; }, async getWithHeaders() { return null; }, async delete(key) { data.delete(key); },
    async list(options) { return { blobs: [...data.keys()].filter((key) => key.startsWith(options.prefix ?? "")).sort().map((key) => ({ key, etag: key })) }; },
  });
  let id = 1;
  return api().createEdgeOneTranslationsRepository({
    blob, now: () => new Date("2026-07-12T00:00:00.000Z"),
    uuid: () => `90000000-0000-4000-8000-${String(id++).padStart(12, "0")}`,
    async findBook(userId: string, bookId: string) {
      return userId === USER && bookId === BOOK ? { id: BOOK, title: "Book", sourceLanguage: options.sourceLanguage ?? "ENGLISH" as const,
        chapters: [{ id: CHAPTER, index: 1, title: "Chapter", content: "hello", wordCount: 5,
          status: options.chapterStatus ?? "ACTIVE", isSkipped: options.isSkipped ?? false }] } : null;
    },
  });
}

async function executingTask() {
  const repo = harness();
  await repo.createTranslation({ id: TRANSLATION, userId: USER, originalBookId: BOOK, title: "译本", targetLanguage: "CHINESE", webSearchTerms: false,
    tasks: [{ id: TASK, chapterId: CHAPTER, estimatedCostCents: 50 }] });
  const now = new Date("2026-07-12T00:00:00.000Z");
  await repo.claimTask({ userId: USER, translationId: TRANSLATION, taskId: TASK, attemptId: ATTEMPT, now, expiresAt: new Date(now.getTime() + 600_000) });
  await repo.acquireBatchExecution({ userId: USER, translationId: TRANSLATION, taskId: TASK, attemptId: ATTEMPT, expectedNextSegmentIndex: 0,
    executionId: EXECUTION, now, executionExpiresAt: new Date(now.getTime() + 300_000), attemptExpiresAt: new Date(now.getTime() + 600_000) });
  return { repo, now };
}

test("translation and task revisions enforce leases and stale checkpoint CAS", async () => {
  const repo = harness();
  assert.equal((await repo.findBook(USER, BOOK))?.title, "Book");
  await repo.createTranslation({ id: TRANSLATION, userId: USER, originalBookId: BOOK, title: "译本", targetLanguage: "CHINESE", webSearchTerms: false,
    tasks: [{ id: TASK, chapterId: CHAPTER, estimatedCostCents: 50 }] });
  assert.equal((await repo.listTranslations(USER))[0].status, "QUEUED");
  const now = new Date("2026-07-12T00:00:00.000Z");
  const claimed = await repo.claimTask({ userId: USER, translationId: TRANSLATION, taskId: TASK, attemptId: ATTEMPT, now, expiresAt: new Date(now.getTime() + 600_000) });
  assert.equal(claimed?.status, "TRANSLATING");
  const executing = await repo.acquireBatchExecution({ userId: USER, translationId: TRANSLATION, taskId: TASK, attemptId: ATTEMPT,
    expectedNextSegmentIndex: 0, executionId: EXECUTION, now, executionExpiresAt: new Date(now.getTime() + 300_000), attemptExpiresAt: new Date(now.getTime() + 600_000) });
  assert.equal(executing?.batchExecutionId, EXECUTION);
  const checkpoint = { userId: USER, translationId: TRANSLATION, taskId: TASK, attemptId: ATTEMPT, executionId: EXECUTION,
    expectedNextSegmentIndex: 0, now, expiresAt: new Date(now.getTime() + 600_000),
    segments: [{ segmentId: `${CHAPTER}-segment-1`, index: 0, translatedText: "你好" }], providerName: "free", model: "free", inputTokens: 10, outputTokens: 20, final: true, chapterTitle: "章节" };
  assert.equal(await repo.checkpointTask(checkpoint), "COMPLETED");
  assert.equal(await repo.checkpointTask(checkpoint), null);
  assert.equal((await repo.listTasks(USER, TRANSLATION))?.[0].status, "COMPLETED");
  assert.equal((await repo.getReader(USER, TRANSLATION))?.chapters[0].content, "你好");
});

test("failed tasks retry idempotently and active batches block cancellation", async () => {
  const repo = harness();
  await repo.createTranslation({ id: TRANSLATION, userId: USER, originalBookId: BOOK, title: "译本", targetLanguage: "CHINESE", webSearchTerms: false,
    tasks: [{ id: TASK, chapterId: CHAPTER, estimatedCostCents: 50 }] });
  const now = new Date("2026-07-12T00:00:00.000Z");
  await repo.claimTask({ userId: USER, translationId: TRANSLATION, taskId: TASK, attemptId: ATTEMPT, now, expiresAt: new Date(now.getTime() + 600_000) });
  await repo.acquireBatchExecution({ userId: USER, translationId: TRANSLATION, taskId: TASK, attemptId: ATTEMPT, expectedNextSegmentIndex: 0,
    executionId: EXECUTION, now, executionExpiresAt: new Date(now.getTime() + 300_000), attemptExpiresAt: new Date(now.getTime() + 600_000) });
  assert.equal(await repo.cancelTask({ userId: USER, translationId: TRANSLATION, taskId: TASK, attemptId: ATTEMPT, now }), "BUSY");
  assert.equal(await repo.failTask({ userId: USER, translationId: TRANSLATION, taskId: TASK, attemptId: ATTEMPT, executionId: EXECUTION, now, errorCode: "PROVIDER_TIMEOUT", errorMessage: "Timed out" }), true);
  const retryId = "88888888-8888-4888-8888-888888888888";
  assert.equal((await repo.retryTask({ userId: USER, translationId: TRANSLATION, taskId: TASK, retryExecutionId: retryId, maxRetries: 3, now }))?.retryCount, 1);
  assert.equal((await repo.retryTask({ userId: USER, translationId: TRANSLATION, taskId: TASK, retryExecutionId: retryId, maxRetries: 3, now }))?.retryCount, 1);
});

test("checkpoint rejects stale attempt, execution, segment index and expired leases", async () => {
  const checkpoint = { userId: USER, translationId: TRANSLATION, taskId: TASK, attemptId: ATTEMPT, executionId: EXECUTION,
    expectedNextSegmentIndex: 0, now: new Date("2026-07-12T00:00:01.000Z"), expiresAt: new Date("2026-07-12T00:10:00.000Z"),
    segments: [{ segmentId: `${CHAPTER}-segment-1`, index: 0, translatedText: "你好" }], providerName: "free", model: "free",
    inputTokens: 10, outputTokens: 20, final: false, chapterTitle: "章节" };
  for (const stale of [
    { attemptId: OTHER_USER },
    { executionId: OTHER_USER },
    { expectedNextSegmentIndex: 1 },
    { now: new Date("2026-07-12T00:10:00.000Z") },
  ]) {
    const { repo } = await executingTask();
    assert.equal(await repo.checkpointTask({ ...checkpoint, ...stale }), null);
  }
});

test("expired leases cannot acquire, checkpoint or fail a task", async () => {
  const repo = harness();
  await repo.createTranslation({ id: TRANSLATION, userId: USER, originalBookId: BOOK, title: "译本", targetLanguage: "CHINESE", webSearchTerms: false,
    tasks: [{ id: TASK, chapterId: CHAPTER, estimatedCostCents: 50 }] });
  const started = new Date("2026-07-12T00:00:00.000Z");
  await repo.claimTask({ userId: USER, translationId: TRANSLATION, taskId: TASK, attemptId: ATTEMPT, now: started, expiresAt: new Date(started.getTime() + 60_000) });
  const expired = new Date(started.getTime() + 60_000);
  assert.equal(await repo.acquireBatchExecution({ userId: USER, translationId: TRANSLATION, taskId: TASK, attemptId: ATTEMPT,
    expectedNextSegmentIndex: 0, executionId: EXECUTION, now: expired, executionExpiresAt: new Date(expired.getTime() + 60_000), attemptExpiresAt: new Date(expired.getTime() + 60_000) }), null);
  assert.equal(await repo.failTask({ userId: USER, translationId: TRANSLATION, taskId: TASK, attemptId: ATTEMPT,
    executionId: EXECUTION, now: expired, errorCode: "PROVIDER_TIMEOUT", errorMessage: "redacted" }), false);
});

test("cancel supports pending, failed and translating tasks after the batch lease expires", async () => {
  const pending = harness();
  await pending.createTranslation({ id: TRANSLATION, userId: USER, originalBookId: BOOK, title: "译本", targetLanguage: "CHINESE", webSearchTerms: false,
    tasks: [{ id: TASK, chapterId: CHAPTER, estimatedCostCents: 50 }] });
  const now = new Date("2026-07-12T00:00:00.000Z");
  const pendingCanceled = await pending.cancelTask({ userId: USER, translationId: TRANSLATION, taskId: TASK, attemptId: null, now });
  if (!pendingCanceled || pendingCanceled === "BUSY") assert.fail("pending task must be canceled");
  assert.equal(pendingCanceled.status, "CANCELED");

  const failed = await executingTask();
  assert.equal(await failed.repo.failTask({ userId: USER, translationId: TRANSLATION, taskId: TASK, attemptId: ATTEMPT,
    executionId: EXECUTION, now, errorCode: "PROVIDER_TIMEOUT", errorMessage: "redacted" }), true);
  const failedCanceled = await failed.repo.cancelTask({ userId: USER, translationId: TRANSLATION, taskId: TASK, attemptId: null, now });
  if (!failedCanceled || failedCanceled === "BUSY") assert.fail("failed task must be canceled");
  assert.equal(failedCanceled.status, "CANCELED");

  const translating = await executingTask();
  const afterBatch = new Date(now.getTime() + 300_000);
  const translatingCanceled = await translating.repo.cancelTask({ userId: USER, translationId: TRANSLATION, taskId: TASK, attemptId: ATTEMPT, now: afterBatch });
  if (!translatingCanceled || translatingCanceled === "BUSY") assert.fail("expired translating task must be canceled");
  assert.equal(translatingCanceled.status, "CANCELED");
});

test("retry limit and ownership checks fail closed", async () => {
  const { repo, now } = await executingTask();
  await repo.failTask({ userId: USER, translationId: TRANSLATION, taskId: TASK, attemptId: ATTEMPT,
    executionId: EXECUTION, now, errorCode: "PROVIDER_TIMEOUT", errorMessage: "redacted" });
  assert.equal(await repo.retryTask({ userId: USER, translationId: TRANSLATION, taskId: TASK,
    retryExecutionId: OTHER_USER, maxRetries: 0, now }), null);
  assert.equal(await repo.listTasks(OTHER_USER, TRANSLATION), null);
  assert.equal(await repo.getReader(OTHER_USER, TRANSLATION), null);
  assert.deepEqual(await repo.listTranslations(OTHER_USER), []);
});

test("invalid selected chapters never leave a partial translation", async () => {
  const repo = harness();
  await assert.rejects(() => repo.createTranslation({ id: TRANSLATION, userId: USER, originalBookId: BOOK, title: "译本",
    targetLanguage: "CHINESE", webSearchTerms: false, tasks: [{ id: TASK, chapterId: OTHER_CHAPTER, estimatedCostCents: 50 }] }),
  { code: "TRANSLATION_CONFLICT" });
  assert.deepEqual(await repo.listTranslations(USER), []);
});

test("strong create validation rejects skipped, inactive and same-language chapters before writes", async () => {
  for (const repo of [
    harness({ isSkipped: true }),
    harness({ chapterStatus: "SKIPPED" }),
    harness({ sourceLanguage: "CHINESE" }),
  ]) {
    await assert.rejects(() => repo.createTranslation({ id: TRANSLATION, userId: USER, originalBookId: BOOK, title: "译本",
      targetLanguage: "CHINESE", webSearchTerms: false, tasks: [{ id: TASK, chapterId: CHAPTER, estimatedCostCents: 50 }] }),
    { code: "TRANSLATION_CONFLICT" });
    assert.deepEqual(await repo.listTranslations(USER), []);
  }
});

test("production composes EdgeOne revisions and free-quota Models before Prisma", async () => {
  const source = await readFile(new URL("../src/lib/cloud/translations.ts", import.meta.url), "utf8");
  const factory = await readFile(new URL("../src/lib/cloud/service-factory.ts", import.meta.url), "utf8");
  const edgeOneBranch = source.indexOf('CLOUD_DATA_PROVIDER === "edgeone"');
  const prismaCreation = source.indexOf("createPrismaCloudTranslationRepository()");
  const edgeOneBranchEnd = source.indexOf("\n  }\n  const provider", edgeOneBranch);
  assert.ok(edgeOneBranch >= 0 && prismaCreation > edgeOneBranch);
  assert.ok(edgeOneBranchEnd > edgeOneBranch);
  const production = source.slice(edgeOneBranch, edgeOneBranchEnd);
  assert.match(production, /getCloudServices\(\)\.translations/);
  assert.match(factory, /createEdgeOneTranslationsRepository/);
  assert.match(factory, /createEdgeOneModelsTranslationProvider/);
  assert.match(factory, /createFreeQuotaTranslationProvider/);
  assert.match(factory, /createEdgeOneQuotaService/);
  assert.match(factory, /userId: EDGEONE_MODEL_QUOTA_LEDGER_ID/);
  assert.doesNotMatch(production, /resolveProvider|createMcpTranslationProvider|reserveBalance|accountBalance|balanceHold/);
});
