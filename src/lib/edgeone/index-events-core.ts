export type IndexEvent = {
  id: string;
  resourceId: string;
  action: "upsert" | "delete";
  revisionId: string;
  createdAt: string;
};

export class IndexEventError extends Error {
  readonly code = "INVALID_INDEX_EVENTS" as const;

  constructor() {
    super("INVALID_INDEX_EVENTS");
    this.name = "IndexEventError";
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function collectIndexedResourceIds(events: IndexEvent[]): string[] {
  const ids = new Set<string>();
  const resources = new Set<string>();
  for (const event of events) {
    if (
      !event ||
      !UUID.test(event.id) ||
      ids.has(event.id) ||
      !event.resourceId ||
      !event.revisionId ||
      (event.action !== "upsert" && event.action !== "delete") ||
      Number.isNaN(Date.parse(event.createdAt))
    ) {
      throw new IndexEventError();
    }
    ids.add(event.id);
    if (event.action === "upsert") resources.add(event.resourceId);
  }
  return [...resources].sort();
}
