import type { AuthoritativeBlobStore } from "./blob-store-core.ts";
import { foldUsageEvents, type UsageEvent } from "./quota-core.ts";

function assertSegment(value: string): void {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("INVALID_USAGE_KEY");
}

export function createEdgeOneQuotaService(blob: AuthoritativeBlobStore) {
  return {
    async getUsage(userId: string, month: string) {
      assertSegment(userId);
      assertSegment(month);
      const prefix = `usage/${userId}/${month}/events/`;
      const items = await blob.listAll(prefix);
      const events: UsageEvent[] = [];
      for (const item of items) {
        const event = await blob.getJSON<UsageEvent>(item.key);
        if (!event) throw new Error("USAGE_LEDGER_UNAVAILABLE");
        events.push(event);
      }
      return foldUsageEvents(events);
    },
    async appendEvent(userId: string, month: string, event: UsageEvent) {
      assertSegment(userId);
      assertSegment(month);
      await blob.createJSON(
        `usage/${userId}/${month}/events/${event.id}.json`,
        event,
      );
    },
  };
}
