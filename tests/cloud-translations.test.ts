import assert from "node:assert/strict";
import test from "node:test";

import {
  CloudTranslationError,
  createCloudTranslationsService,
  type CloudTranslationRepository,
  type CloudTranslationTaskRecord,
} from "../src/lib/cloud/translations-core.ts";
import { splitChapterIntoTranslationSegments } from "../src/lib/translation/translation-segments.ts";

const now = new Date("2026-07-11T00:00:00.000Z");

function fixture(overrides: Partial<CloudTranslationTaskRecord> = {}): CloudTranslationTaskRecord {
  return {
    id: "20000000-0000-4000-8000-000000000001",
    translatedBookId: "30000000-0000-4000-8000-000000000001",
    userId: "10000000-0000-4000-8000-000000000001",
    chapterId: "40000000-0000-4000-8000-000000000001",
    chapterIndex: 0,
    chapterTitle: "Chapter 1",
    chapterContent: "First paragraph.\n\nSecond paragraph.",
    sourceLanguage: "ENGLISH",
    targetLanguage: "CHINESE",
    webSearchTerms: false,
    status: "PENDING",
    retryCount: 0,
    estimatedCostCents: 50,
    attemptId: null,
    attemptStartedAt: null,
    attemptExpiresAt: null,
    translatedSegments: [],
    nextSegmentIndex: 0,
    checkpointProvider: null,
    checkpointModel: null,
    accumulatedInputTokens: 0,
    accumulatedOutputTokens: 0,
    lastHeartbeatAt: null,
    batchExecutionId: null,
    batchExecutionExpiresAt: null,
    batchExecutionIndex: null,
    lastBatchExecutionId: null,
    ...overrides,
  };
}

function repository(task = fixture()) {
  let current = structuredClone(task);
  let chapter: unknown = null;
  const repo: CloudTranslationRepository = {
    async listTranslations() { return []; },
    async findBook() { return { id: "book", title: "Book", sourceLanguage: "ENGLISH", chapters: [] }; },
    async createTranslation() { throw new Error("unused"); },
    async listTasks(userId, translationId) {
      return current.userId === userId && current.translatedBookId === translationId ? [structuredClone(current)] : null;
    },
    async claimTask(input) {
      if (current.userId !== input.userId || current.id !== input.taskId || current.translatedBookId !== input.translationId) return null;
      if (current.status === "TRANSLATING" && current.attemptExpiresAt! > input.now) return structuredClone(current);
      const claimable = current.status === "PENDING" || (current.status === "TRANSLATING" && current.attemptExpiresAt! <= input.now);
      if (!claimable) return null;
      current = { ...current, status: "TRANSLATING", attemptId: input.attemptId, attemptStartedAt: input.now, attemptExpiresAt: input.expiresAt, lastHeartbeatAt: input.now, batchExecutionId: null, batchExecutionExpiresAt: null, batchExecutionIndex: null };
      return structuredClone(current);
    },
    async acquireBatchExecution(input) {
      if (current.userId !== input.userId || current.attemptId !== input.attemptId || current.status !== "TRANSLATING" || current.attemptExpiresAt! <= input.now || current.nextSegmentIndex !== input.expectedNextSegmentIndex || (current.batchExecutionId && current.batchExecutionExpiresAt! > input.now)) return null;
      current = { ...current, batchExecutionId: input.executionId, batchExecutionExpiresAt: input.executionExpiresAt, batchExecutionIndex: input.expectedNextSegmentIndex, lastHeartbeatAt: input.now, attemptExpiresAt: input.attemptExpiresAt };
      return structuredClone(current);
    },
    async checkpointTask(input) {
      if (current.userId !== input.userId || current.attemptId !== input.attemptId || current.batchExecutionId !== input.executionId || current.batchExecutionIndex !== input.expectedNextSegmentIndex || current.status !== "TRANSLATING" || current.attemptExpiresAt! <= input.now || current.nextSegmentIndex !== input.expectedNextSegmentIndex) return null;
      const translatedSegments = [...current.translatedSegments, ...input.segments];
      current = { ...current, translatedSegments, nextSegmentIndex: translatedSegments.length, checkpointProvider: input.providerName, checkpointModel: input.model, accumulatedInputTokens: current.accumulatedInputTokens + input.inputTokens, accumulatedOutputTokens: current.accumulatedOutputTokens + input.outputTokens, lastHeartbeatAt: input.now, attemptExpiresAt: input.expiresAt, batchExecutionId: null, batchExecutionExpiresAt: null, batchExecutionIndex: null, lastBatchExecutionId: input.executionId };
      if (!input.final) return "CHECKPOINTED";
      chapter = { content: translatedSegments.map((part) => part.translatedText).join("\n\n"), providerName: input.providerName };
      current = { ...current, status: "COMPLETED", attemptId: null, attemptStartedAt: null, attemptExpiresAt: null, lastHeartbeatAt: null };
      return "COMPLETED";
    },
    async failTask(input) {
      if (current.userId !== input.userId || current.attemptId !== input.attemptId || current.batchExecutionId !== input.executionId || current.status !== "TRANSLATING" || current.attemptExpiresAt! <= input.now) return false;
      current = { ...current, status: "FAILED", errorCode: input.errorCode, errorMessage: input.errorMessage, attemptId: null, attemptStartedAt: null, attemptExpiresAt: null, lastHeartbeatAt: null, batchExecutionId: null, batchExecutionExpiresAt: null, batchExecutionIndex: null };
      return true;
    },
    async retryTask(input) {
      if (current.userId !== input.userId || current.status !== "FAILED" || current.retryCount >= input.maxRetries) return null;
      const resetCheckpoint = current.errorCode === "CHECKPOINT_INVALID";
      current = { ...current, status: "PENDING", retryCount: current.retryCount + 1, errorCode: null, errorMessage: null, attemptId: null, attemptStartedAt: null, attemptExpiresAt: null, translatedSegments: resetCheckpoint ? [] : current.translatedSegments, nextSegmentIndex: resetCheckpoint ? 0 : current.nextSegmentIndex, checkpointProvider: resetCheckpoint ? null : current.checkpointProvider, checkpointModel: resetCheckpoint ? null : current.checkpointModel, accumulatedInputTokens: resetCheckpoint ? 0 : current.accumulatedInputTokens, accumulatedOutputTokens: resetCheckpoint ? 0 : current.accumulatedOutputTokens, lastHeartbeatAt: null, batchExecutionId: null, batchExecutionExpiresAt: null, batchExecutionIndex: null };
      return structuredClone(current);
    },
    async cancelTask(input) { if (current.batchExecutionId && current.batchExecutionExpiresAt! > input.now) return "BUSY"; if (current.status === "TRANSLATING" && current.attemptId !== input.attemptId && current.attemptExpiresAt! > input.now) return null; if (!["PENDING", "FAILED", "TRANSLATING"].includes(current.status)) return null; current = { ...current, status: "CANCELED", attemptId: null, attemptStartedAt: null, attemptExpiresAt: null, lastHeartbeatAt: null, batchExecutionId: null, batchExecutionExpiresAt: null, batchExecutionIndex: null }; return structuredClone(current); },
    async getReader() { return null; },
  };
  return { repo, get task() { return current; }, get chapter() { return chapter; } };
}

test("run claims a lease, validates MCP output, and commits translated chapter with CAS", async () => {
  const memory = repository();
  const service = createCloudTranslationsService({
    repository: memory.repo,
    now: () => now,
    uuid: () => "50000000-0000-4000-8000-000000000001",
    provider: { name: "mcp", async translateSegments(input) {
      return { providerName: "openai-compatible", model: "model-1", usage: { inputTokens: 10, outputTokens: 12 }, translations: input.segments.map((s) => ({ segmentId: s.id, index: s.index, translatedText: `T:${s.text}` })) };
    } },
  });
  const result = await service.run(memory.task.userId, memory.task.translatedBookId, memory.task.id);
  assert.equal(result.status, "COMPLETED");
  assert.match((memory.chapter as { content: string }).content, /^T:First paragraph/);
  assert.equal((memory.chapter as { providerName: string }).providerName, "openai-compatible");
});

test("run can resolve a quota-scoped provider for the current user", async () => {
  const memory = repository();
  const resolvedUsers: string[] = [];
  const service = createCloudTranslationsService({
    repository: memory.repo,
    now: () => now,
    uuid: () => "50000000-0000-4000-8000-000000000001",
    provider: { name: "forbidden-static", async translateSegments() { throw new Error("static provider must not run"); } },
    providerForUser(userId: string) {
      resolvedUsers.push(userId);
      return { name: "scoped", async translateSegments(input) {
        return { providerName: "scoped", model: "free", usage: { inputTokens: 3, outputTokens: 4 },
          translations: input.segments.map((segment) => ({ segmentId: segment.id, index: segment.index, translatedText: "ok" })) };
      } };
    },
  });
  await service.run(memory.task.userId, memory.task.translatedBookId, memory.task.id);
  assert.deepEqual(resolvedUsers, [memory.task.userId]);
  assert.equal((memory.chapter as { providerName: string }).providerName, "scoped");
});

test("an expired attempt cannot persist after a newer lease takes over", async () => {
  const memory = repository();
  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  const first = createCloudTranslationsService({ repository: memory.repo, now: () => now, uuid: () => "50000000-0000-4000-8000-000000000001", leaseMs: 1,
    provider: { name: "mcp", async translateSegments(input) { await held; return { providerName: "openai-compatible", model: "m", translations: input.segments.map((s) => ({ segmentId: s.id, index: s.index, translatedText: "old" })) }; } },
  });
  const oldRun = first.run(memory.task.userId, memory.task.translatedBookId, memory.task.id);
  await new Promise((resolve) => setImmediate(resolve));
  const later = new Date(now.getTime() + 2);
  const second = createCloudTranslationsService({ repository: memory.repo, now: () => later, uuid: () => "50000000-0000-4000-8000-000000000002",
    provider: { name: "mcp", async translateSegments(input) { return { providerName: "openai-compatible", model: "m", translations: input.segments.map((s) => ({ segmentId: s.id, index: s.index, translatedText: "new" })) }; } },
  });
  await second.run(memory.task.userId, memory.task.translatedBookId, memory.task.id);
  release();
  await assert.rejects(oldRun, (error: unknown) => error instanceof CloudTranslationError && error.code === "STALE_ATTEMPT");
  assert.equal((memory.chapter as { content: string }).content, "new");
});

test("provider failures are stored as a stable sanitized error and can be retried only within the limit", async () => {
  const memory = repository();
  const service = createCloudTranslationsService({ repository: memory.repo, now: () => now, uuid: () => crypto.randomUUID(), maxRetries: 1,
    provider: { name: "mcp", async translateSegments() { throw new Error("secret-key raw upstream body"); } },
  });
  await assert.rejects(service.run(memory.task.userId, memory.task.translatedBookId, memory.task.id), (error: unknown) => error instanceof CloudTranslationError && error.code === "TRANSLATION_FAILED");
  assert.equal(memory.task.status, "FAILED");
  await service.retry(memory.task.userId, memory.task.translatedBookId, memory.task.id);
  memory.task.status = "FAILED";
  await assert.rejects(service.retry(memory.task.userId, memory.task.translatedBookId, memory.task.id), (error: unknown) => error instanceof CloudTranslationError && error.code === "RETRY_LIMIT_REACHED");
});

test("cross-user task access is indistinguishable from missing data", async () => {
  const memory = repository();
  const service = createCloudTranslationsService({ repository: memory.repo, now: () => now, uuid: () => crypto.randomUUID(), provider: { name: "mcp", async translateSegments() { throw new Error("unused"); } } });
  await assert.rejects(service.listTasks("90000000-0000-4000-8000-000000000001", memory.task.translatedBookId), (error: unknown) => error instanceof CloudTranslationError && error.code === "TRANSLATION_NOT_FOUND");
  await assert.rejects(service.run("90000000-0000-4000-8000-000000000001", memory.task.translatedBookId, memory.task.id), (error: unknown) => error instanceof CloudTranslationError && error.code === "TRANSLATION_NOT_FOUND");
  await assert.rejects(service.retry("90000000-0000-4000-8000-000000000001", memory.task.translatedBookId, memory.task.id), (error: unknown) => error instanceof CloudTranslationError && error.code === "TRANSLATION_NOT_FOUND");
});

test("cloud creation rejects unavailable web lookup before reading or writing books", async () => {
  let reads = 0;
  let writes = 0;
  const memory = repository();
  memory.repo.findBook = async () => { reads += 1; return null; };
  memory.repo.createTranslation = async () => { writes += 1; throw new Error("must not persist"); };
  const service = createCloudTranslationsService({ repository: memory.repo, now: () => now, provider: { name: "mcp", async translateSegments() { throw new Error("unused"); } } });
  await assert.rejects(service.create(memory.task.userId, { originalBookId: "10000000-0000-4000-8000-000000000002", targetLanguage: "CHINESE", webSearchTerms: true }), (error: unknown) => error instanceof CloudTranslationError && error.code === "WEB_LOOKUP_UNAVAILABLE");
  assert.equal(reads, 0);
  assert.equal(writes, 0);
});

test("known provider failure codes are preserved but raw provider messages are discarded", async () => {
  const memory = repository();
  const service = createCloudTranslationsService({ repository: memory.repo, now: () => now, uuid: () => crypto.randomUUID(), provider: { name: "mcp", async translateSegments() { throw Object.assign(new Error("Bearer super-secret upstream payload"), { code: "PROVIDER_RATE_LIMITED" }); } } });
  await assert.rejects(service.run(memory.task.userId, memory.task.translatedBookId, memory.task.id), (error: unknown) => error instanceof CloudTranslationError && error.code === "PROVIDER_RATE_LIMITED" && !error.message.includes("secret"));
  assert.equal(memory.task.errorCode, "PROVIDER_RATE_LIMITED");
  assert.equal(memory.task.errorMessage?.includes("secret"), false);
});

test("free-model and quota failures remain actionable without leaking causes", async () => {
  for (const code of ["FREE_MODEL_UNAVAILABLE", "FREE_QUOTA_EXHAUSTED", "USAGE_LEDGER_UNAVAILABLE"] as const) {
    const memory = repository();
    const service = createCloudTranslationsService({ repository: memory.repo, now: () => now, uuid: () => crypto.randomUUID(),
      provider: { name: "edgeone", async translateSegments() { throw Object.assign(new Error("raw provider secret"), { code }); } },
    });
    await assert.rejects(service.run(memory.task.userId, memory.task.translatedBookId, memory.task.id),
      (error: unknown) => error instanceof CloudTranslationError && error.code === code && !error.message.includes("secret"));
    assert.equal(memory.task.errorCode, code);
    assert.equal(memory.task.errorMessage?.includes("secret"), false);
  }
});

test("one run persists at most ten segments and a later run resumes the checkpoint", async () => {
  const content = Array.from({ length: 12 }, (_, index) => `${index}`.padEnd(1_200, "x")).join("\n\n");
  const memory = repository(fixture({ chapterContent: content, webSearchTerms: false }));
  const batches: number[] = [];
  const service = createCloudTranslationsService({ repository: memory.repo, now: () => now, uuid: () => crypto.randomUUID(), provider: { name: "mcp", async translateSegments(input) { batches.push(input.segments.length); assert.equal(input.webLookupEnabled, false); return { providerName: "openai-compatible", model: "m", usage: { inputTokens: 2, outputTokens: 3 }, translations: input.segments.map((segment) => ({ segmentId: segment.id, index: segment.index, translatedText: `T${segment.index}` })) }; } } });
  const first = await service.run(memory.task.userId, memory.task.translatedBookId, memory.task.id);
  assert.deepEqual(first, { status: "TRANSLATING", progressPercent: 83, canContinue: true });
  assert.equal(memory.task.nextSegmentIndex, 10);
  assert.equal(memory.task.status, "TRANSLATING");
  const second = await service.run(memory.task.userId, memory.task.translatedBookId, memory.task.id);
  assert.equal(second.status, "COMPLETED");
  assert.deepEqual(batches, [10, 2]);
  assert.match((memory.chapter as { content: string }).content, /^T0/);
});

test("retry preserves a valid checkpoint and resumes provider work at nextSegmentIndex", async () => {
  const content = Array.from({ length: 12 }, (_, index) => `${index}`.padEnd(1_200, "x")).join("\n\n");
  const memory = repository(fixture({ chapterContent: content }));
  const starts: number[] = [];
  let calls = 0;
  const service = createCloudTranslationsService({
    repository: memory.repo,
    now: () => now,
    uuid: () => crypto.randomUUID(),
    provider: { name: "mcp", async translateSegments(input) {
      calls += 1;
      starts.push(input.segments[0].index);
      if (calls === 2) throw Object.assign(new Error("upstream failed"), { code: "PROVIDER_TIMEOUT" });
      return {
        providerName: "openai-compatible",
        model: "m",
        usage: { inputTokens: 2, outputTokens: 3 },
        translations: input.segments.map((segment) => ({ segmentId: segment.id, index: segment.index, translatedText: `T${segment.index}` })),
      };
    } },
  });
  await service.run(memory.task.userId, memory.task.translatedBookId, memory.task.id);
  await assert.rejects(service.run(memory.task.userId, memory.task.translatedBookId, memory.task.id), (error: unknown) => error instanceof CloudTranslationError && error.code === "PROVIDER_TIMEOUT");
  assert.equal(memory.task.nextSegmentIndex, 10);
  assert.deepEqual(memory.task.translatedSegments.map((segment) => segment.index), Array.from({ length: 10 }, (_, index) => index));
  assert.equal(memory.task.accumulatedInputTokens, 2);
  assert.equal(memory.task.accumulatedOutputTokens, 3);
  await service.retry(memory.task.userId, memory.task.translatedBookId, memory.task.id);
  assert.equal(memory.task.nextSegmentIndex, 10);
  assert.equal(memory.task.checkpointProvider, "openai-compatible");
  assert.equal(memory.task.checkpointModel, "m");
  assert.equal((await service.run(memory.task.userId, memory.task.translatedBookId, memory.task.id)).status, "COMPLETED");
  assert.deepEqual(starts, [0, 10, 10]);
});

test("running tasks can be canceled and DTO progress does not expose checkpoint internals", async () => {
  const memory = repository(fixture({ status: "TRANSLATING", attemptId: "50000000-0000-4000-8000-000000000001", attemptStartedAt: now, attemptExpiresAt: new Date(now.getTime() + 60_000), lastHeartbeatAt: now }));
  const service = createCloudTranslationsService({ repository: memory.repo, now: () => now, uuid: () => crypto.randomUUID(), provider: { name: "mcp", async translateSegments() { throw new Error("unused"); } } });
  const [dto] = await service.listTasks(memory.task.userId, memory.task.translatedBookId);
  assert.equal(dto.canContinue, true);
  assert.equal("attemptId" in dto, false);
  assert.equal("translatedSegments" in dto, false);
  const canceled = await service.cancel(memory.task.userId, memory.task.translatedBookId, memory.task.id);
  assert.equal(canceled.status, "CANCELED");
});

test("concurrent run requests acquire one batch token and call the provider at most once", async () => {
  const memory = repository();
  let calls = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const service = createCloudTranslationsService({ repository: memory.repo, now: () => now, uuid: () => crypto.randomUUID(), provider: { name: "mcp", async translateSegments(input) { calls += 1; if (calls === 1) await gate; return { providerName: "openai-compatible", model: "m", translations: input.segments.map((segment) => ({ segmentId: segment.id, index: segment.index, translatedText: "ok" })) }; } } });
  const first = service.run(memory.task.userId, memory.task.translatedBookId, memory.task.id);
  await new Promise((resolve) => setImmediate(resolve));
  await assert.rejects(service.run(memory.task.userId, memory.task.translatedBookId, memory.task.id), (error: unknown) => error instanceof CloudTranslationError && error.code === "TASK_BUSY");
  assert.equal(calls, 1);
  release();
  await first;
});

test("cancel cannot refund an attempt while its provider batch token is active", async () => {
  const memory = repository();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const service = createCloudTranslationsService({ repository: memory.repo, now: () => now, uuid: () => crypto.randomUUID(), provider: { name: "mcp", async translateSegments(input) { await gate; return { providerName: "openai-compatible", model: "m", translations: input.segments.map((segment) => ({ segmentId: segment.id, index: segment.index, translatedText: "ok" })) }; } } });
  const running = service.run(memory.task.userId, memory.task.translatedBookId, memory.task.id);
  await new Promise((resolve) => setImmediate(resolve));
  await assert.rejects(service.cancel(memory.task.userId, memory.task.translatedBookId, memory.task.id), (error: unknown) => error instanceof CloudTranslationError && error.code === "TASK_BUSY");
  assert.equal(memory.task.status, "TRANSLATING");
  release();
  await running;
});

test("rejects a provider batch that would push persisted UTF-8 content over five MiB", async () => {
  const chapterContent = Array.from({ length: 160 }, (_, index) => String(index).padEnd(1_200, "x")).join("\n\n");
  const source = splitChapterIntoTranslationSegments({
    chapterId: fixture().chapterId,
    chapterTitle: fixture().chapterTitle,
    text: chapterContent,
  });
  assert.equal(source.length, 160);
  const attemptId = "50000000-0000-4000-8000-000000000001";
  const memory = repository(fixture({
    chapterContent,
    status: "TRANSLATING",
    attemptId,
    attemptStartedAt: now,
    attemptExpiresAt: new Date(now.getTime() + 60_000),
    lastHeartbeatAt: now,
    translatedSegments: source.slice(0, 159).map((segment) => ({
      segmentId: segment.id,
      index: segment.index,
      translatedText: "a".repeat(32_767),
    })),
    nextSegmentIndex: 159,
    checkpointProvider: "openai-compatible",
    checkpointModel: "m",
    lastBatchExecutionId: "60000000-0000-4000-8000-000000000001",
  }));
  const service = createCloudTranslationsService({
    repository: memory.repo,
    now: () => now,
    uuid: () => "70000000-0000-4000-8000-000000000001",
    provider: { name: "mcp", async translateSegments(input) {
      return {
        providerName: "openai-compatible",
        model: "m",
        translations: input.segments.map((segment) => ({
          segmentId: segment.id,
          index: segment.index,
          translatedText: "b".repeat(32_768),
        })),
      };
    } },
  });
  await assert.rejects(
    service.run(memory.task.userId, memory.task.translatedBookId, memory.task.id),
    (error: unknown) => error instanceof CloudTranslationError && error.code === "PROVIDER_RESPONSE_INVALID",
  );
  assert.equal(memory.task.status, "FAILED");
});

test("invalid persisted checkpoints fail and release the claimed attempt before provider execution", async () => {
  const memory = repository(fixture({
    translatedSegments: [{ segmentId: "wrong-segment", index: 0, translatedText: "old" }],
    nextSegmentIndex: 1,
    checkpointProvider: "openai-compatible",
    checkpointModel: "m",
    lastBatchExecutionId: "60000000-0000-4000-8000-000000000001",
  }));
  let providerCalls = 0;
  const service = createCloudTranslationsService({
    repository: memory.repo,
    now: () => now,
    uuid: () => "70000000-0000-4000-8000-000000000001",
    provider: { name: "mcp", async translateSegments() {
      providerCalls += 1;
      throw new Error("must not run");
    } },
  });
  await assert.rejects(
    service.run(memory.task.userId, memory.task.translatedBookId, memory.task.id),
    (error: unknown) => error instanceof CloudTranslationError && error.code === "CHECKPOINT_INVALID",
  );
  assert.equal(providerCalls, 0);
  assert.equal(memory.task.status, "FAILED");
  assert.equal(memory.task.attemptId, null);
});
