import assert from "node:assert/strict";
import test from "node:test";
import { createReadingSaveQueue } from "../src/lib/cloud/reading-save-queue.ts";
import { readingStateLockKey } from "../src/lib/cloud/reading-state-lock.ts";

test("canonical reading lock keys separate book kinds and are shared deterministic values", () => {
  assert.equal(readingStateLockKey("u", "translated", "b"), "reading-state\u0000u\u0000translated\u0000b");
  assert.notEqual(readingStateLockKey("u", "translated", "b"), readingStateLockKey("u", "original", "b"));
});

test("reading save queue serializes writes and coalesces to the latest paragraph/settings", async () => {
  const calls: Array<{ expectedVersion: number; paragraphIndex: number }> = [];
  let release!: () => void;
  const first = new Promise<void>((resolve) => { release = resolve; });
  const queue = createReadingSaveQueue({ initialVersion: 2, send: async (state) => { calls.push({ expectedVersion: state.expectedVersion, paragraphIndex: state.paragraphIndex }); if (calls.length === 1) await first; return { ok: true, version: state.expectedVersion + 1 }; } });
  queue.save({ paragraphIndex: 3, settings: { theme: "light" } });
  queue.save({ paragraphIndex: 4, settings: { theme: "dark" } });
  queue.save({ paragraphIndex: 9, settings: { theme: "sepia" } });
  release(); await queue.flush();
  assert.deepEqual(calls, [{ expectedVersion: 2, paragraphIndex: 3 }, { expectedVersion: 3, paragraphIndex: 9 }]);
});

test("reading save queue exposes failure and retries the latest state", async () => {
  let fail = true; const calls: number[] = [];
  const queue = createReadingSaveQueue({ initialVersion: 0, send: async (state) => { calls.push(state.paragraphIndex); return fail ? { ok: false } : { ok: true, version: 1 }; } });
  queue.save({ paragraphIndex: 5, settings: {} }); await queue.flush(); assert.equal(queue.status().failed, true);
  fail = false; queue.retry(); await queue.flush(); assert.deepEqual(calls, [5, 5]); assert.equal(queue.status().failed, false);
});

test("a newer save invalidates an older failed retry intent", async () => {
  const calls: number[] = [];
  let releaseFirst!: () => void;
  const first = new Promise<void>((resolve) => { releaseFirst = resolve; });
  const queue = createReadingSaveQueue({
    initialVersion: 0,
    send: async (state) => {
      calls.push(state.paragraphIndex);
      if (state.paragraphIndex === 5) { await first; return { ok: false as const }; }
      return { ok: true as const, version: 1 };
    },
  });

  queue.save({ paragraphIndex: 5, settings: {} });
  queue.save({ paragraphIndex: 9, settings: {} });
  queue.retry();
  releaseFirst();
  await queue.flush();

  assert.deepEqual(calls, [5, 9]);
  assert.deepEqual(queue.status(), { failed: false, conflict: false, version: 1, latestSequence: 2 });
});

test("a stale conflict adopts the authoritative version without replaying the old draft", async () => {
  const calls: Array<{ paragraphIndex: number; expectedVersion: number }> = [];
  const conflicts: number[] = [];
  const queue = createReadingSaveQueue({
    initialVersion: 3,
    send: async (state) => {
      calls.push({ paragraphIndex: state.paragraphIndex, expectedVersion: state.expectedVersion });
      return { ok: false as const, conflict: { version: 7 } };
    },
    onConflict: (conflict) => { conflicts.push(conflict.version); },
  });

  queue.save({ paragraphIndex: 5, settings: {} });
  await queue.flush();
  queue.retry();
  await queue.flush();

  assert.deepEqual(calls, [{ paragraphIndex: 5, expectedVersion: 3 }]);
  assert.deepEqual(conflicts, [7]);
  assert.deepEqual(queue.status(), { failed: false, conflict: true, version: 7, latestSequence: 1 });
});
