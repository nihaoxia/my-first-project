export type ReadingSaveDraft = { paragraphIndex: number; settings: Record<string, unknown> };
export type ReadingSaveConflict = { version: number };
type QueuedReadingSave = { sequence: number; draft: ReadingSaveDraft };
type ReadingSaveResult =
  | { ok: true; version: number }
  | { ok: false; conflict?: ReadingSaveConflict };

export function createReadingSaveQueue(input: {
  initialVersion: number;
  send(value: ReadingSaveDraft & { expectedVersion: number }): Promise<ReadingSaveResult>;
  onConflict?(conflict: ReadingSaveConflict): void;
}) {
  let version = input.initialVersion;
  let sequence = 0;
  let latest: QueuedReadingSave | null = null;
  let failed: QueuedReadingSave | null = null;
  let conflict = false;
  let running: Promise<void> | null = null;

  const pump = async () => {
    while (latest) {
      const current = latest;
      latest = null;
      let result: ReadingSaveResult;
      try { result = await input.send({ ...current.draft, expectedVersion: version }); }
      catch { result = { ok: false }; }
      if (result.ok) {
        version = result.version;
        failed = null;
        conflict = false;
        continue;
      }
      if (result.conflict) {
        version = result.conflict.version;
        failed = null;
        conflict = true;
        input.onConflict?.(result.conflict);
        continue;
      }
      const pending = latest as QueuedReadingSave | null;
      if (!pending || pending.sequence <= current.sequence) {
        failed = current;
        return;
      }
    }
  };

  const start = () => {
    if (running) return;
    running = pump().finally(() => {
      running = null;
      if (latest) start();
    });
  };

  return {
    save(draft: ReadingSaveDraft) {
      sequence += 1;
      latest = { sequence, draft };
      failed = null;
      conflict = false;
      start();
    },
    retry() {
      if (running || latest || !failed || failed.sequence !== sequence) return;
      latest = failed;
      failed = null;
      start();
    },
    async flush() {
      while (running) await running;
    },
    status() {
      return { failed: Boolean(failed), conflict, version, latestSequence: sequence };
    },
  };
}
