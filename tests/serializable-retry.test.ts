import assert from "node:assert/strict";
import test from "node:test";
import { withSerializableReconciliation, withSerializableRetry } from "../src/lib/cloud/serializable-retry.ts";

test("serializable retry opens a fresh attempt for retryable conflicts", async () => {
  let calls = 0;
  const value = await withSerializableRetry(async () => {
    calls += 1;
    if (calls < 3) throw Object.assign(new Error("serialization"), { code: "P2034" });
    return "ok";
  }, { sleep: async () => undefined, random: () => 0, maxAttempts: 3 });
  assert.equal(value, "ok");
  assert.equal(calls, 3);
});

test("commit-then-throw is reconciled before a retry can duplicate side effects", async () => {
  let operations = 0;
  let committed = false;
  const value = await withSerializableReconciliation(async () => {
    operations += 1;
    committed = true;
    throw Object.assign(new Error("ambiguous commit"), { code: "P2034" });
  }, async () => committed ? { confirmed: true, value: "committed" } : { confirmed: false }, { sleep: async () => undefined });
  assert.equal(value, "committed");
  assert.equal(operations, 1);
});

test("an immutable execution receipt reconciles after later batches advance mutable task state", async () => {
  let operations = 0;
  let providerCalls = 0;
  let ledgerWrites = 0;
  let mutableLastExecutionId = "first";
  const receipts = new Set<string>();
  const value = await withSerializableReconciliation(async () => {
    operations += 1;
    providerCalls += 1;
    ledgerWrites += 1;
    receipts.add("first");
    mutableLastExecutionId = "later-batch";
    throw Object.assign(new Error("ambiguous commit"), { code: "P2034" });
  }, async () => receipts.has("first") ? { confirmed: true, value: "committed" } : { confirmed: false }, { sleep: async () => undefined });
  assert.equal(value, "committed");
  assert.equal(mutableLastExecutionId, "later-batch");
  assert.equal(operations, 1);
  assert.equal(providerCalls, 1);
  assert.equal(ledgerWrites, 1);
});

test("an immutable retry receipt survives two later failures and prevents old work from running again", async () => {
  type RetryReceipt = { userId: string; taskId: string; fromRetryCount: number; toRetryCount: number; resetCheckpoint: boolean };
  const receipts = new Map<string, RetryReceipt>();
  const state = { status: "FAILED", retryCount: 0, errorCode: "PROVIDER_TIMEOUT", nextSegmentIndex: 10 };
  let aWork = 0;
  const applyRetry = (executionId: string) => {
    const existing = receipts.get(executionId);
    if (existing) return;
    const from = state.retryCount;
    const resetCheckpoint = state.errorCode === "CHECKPOINT_INVALID";
    state.retryCount += 1;
    state.status = "PENDING";
    state.errorCode = "";
    if (resetCheckpoint) state.nextSegmentIndex = 0;
    receipts.set(executionId, { userId: "user", taskId: "task", fromRetryCount: from, toRetryCount: from + 1, resetCheckpoint });
  };
  const failAgain = () => { state.status = "FAILED"; state.errorCode = "PROVIDER_TIMEOUT"; };

  const result = await withSerializableReconciliation(async () => {
    aWork += 1;
    applyRetry("retry-a");
    failAgain();
    applyRetry("retry-b");
    failAgain();
    throw Object.assign(new Error("commit acknowledgement lost"), { code: "P2034" });
  }, async () => {
    const receipt = receipts.get("retry-a");
    return receipt?.userId === "user" && receipt.taskId === "task" && receipt.fromRetryCount === 0 && receipt.toRetryCount === 1
      ? { confirmed: true, value: "retry-a-committed" }
      : { confirmed: false };
  }, { sleep: async () => undefined });

  assert.equal(result, "retry-a-committed");
  assert.equal(aWork, 1);
  assert.equal(state.retryCount, 2);
  assert.equal(state.nextSegmentIndex, 10);
});

test("duplicate retry execution ids are idempotent and cannot increment retry state twice", () => {
  const receipts = new Set<string>();
  let retryCount = 0;
  const retry = (executionId: string) => {
    if (receipts.has(executionId)) return;
    retryCount += 1;
    receipts.add(executionId);
  };
  retry("same-execution");
  retry("same-execution");
  assert.equal(retryCount, 1);
  assert.equal(receipts.size, 1);
});

test("serializable retry exhausts its bound and never retries unrelated errors", async () => {
  let retryableCalls = 0;
  await assert.rejects(withSerializableRetry(async () => { retryableCalls += 1; throw Object.assign(new Error("deadlock"), { code: "40P01" }); }, { sleep: async () => undefined, maxAttempts: 3 }), /deadlock/);
  assert.equal(retryableCalls, 3);
  let ordinaryCalls = 0;
  await assert.rejects(withSerializableRetry(async () => { ordinaryCalls += 1; throw Object.assign(new Error("unique"), { code: "P2002" }); }, { sleep: async () => undefined }), /unique/);
  assert.equal(ordinaryCalls, 1);
});
