import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";
import type { AuthoritativeBlobStore } from "../edgeone/blob-store-core.ts";
import { collectIndexedResourceIds, type IndexEvent } from "../edgeone/index-events-core.ts";
import { resolveRevisionState, type Revision } from "../edgeone/revisions-core.ts";
import type {
  CloudStudyKind, CloudStudyRecord, CloudStudyRepository,
  OriginalSource, TranslatedSource,
} from "./study-core.ts";

type StoredStudy = Omit<CloudStudyRecord, "createdAt" | "updatedAt"> & {
  createdAt?: string;
  updatedAt: string;
};

export class EdgeOneStudyRepositoryError extends Error {
  readonly code = "STUDY_CONFLICT" as const;
  constructor() { super("STUDY_CONFLICT"); this.name = "EdgeOneStudyRepositoryError"; }
}

function store(value: CloudStudyRecord): StoredStudy {
  const { createdAt, updatedAt, ...rest } = value;
  return { ...rest, ...(createdAt ? { createdAt: createdAt.toISOString() } : {}), updatedAt: updatedAt.toISOString() };
}

function hydrate(value: StoredStudy): CloudStudyRecord {
  const { createdAt, updatedAt, ...rest } = value;
  const output = { ...rest, ...(createdAt ? { createdAt: new Date(createdAt) } : {}), updatedAt: new Date(updatedAt) };
  if (Number.isNaN(output.updatedAt.getTime()) || (output.createdAt && Number.isNaN(output.createdAt.getTime()))) throw new EdgeOneStudyRepositoryError();
  return output as CloudStudyRecord;
}

export function deriveEdgeOneReadingId(userId: string, record: CloudStudyRecord): string {
  const source = (record.originalBookId ?? record.translatedBookId) as string;
  const bytes = sha256(utf8ToBytes(`${userId}\u0000${record.originalBookId ? "original" : "translated"}\u0000${source}`));
  const hex = bytesToHex(bytes);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function stableImportArtifactId(value: string): string {
  const hex = bytesToHex(sha256(utf8ToBytes(value)));
  const variant = ((Number.parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export type EdgeOneStudyRepository = CloudStudyRepository & {
  ensureImportTarget(record: CloudStudyRecord): Promise<{ record: CloudStudyRecord; created: boolean }>;
  hasImportTarget(userId: string, kind: CloudStudyKind, id: string): Promise<boolean>;
};

export function createEdgeOneStudyRepository(input: {
  blob: AuthoritativeBlobStore;
  now: () => Date;
  uuid: () => string;
  resolveOriginalSource(userId: string, originalBookId: string, chapterId: string | null): Promise<OriginalSource | null>;
  resolveTranslatedSource(userId: string, translatedBookId: string, chapterId: string | null): Promise<TranslatedSource | null>;
}): EdgeOneStudyRepository {
  const prefix = (userId: string, kind: CloudStudyKind, id: string) => `study/${userId}/${kind}/${id}/revisions/`;
  const indexPrefix = (userId: string, kind: CloudStudyKind) => `study-index/${userId}/${kind}/events/`;

  async function revisions(userId: string, kind: CloudStudyKind, id: string) {
    const items = await input.blob.listAll(prefix(userId, kind, id));
    const output: Revision<StoredStudy>[] = [];
    for (const item of items) {
      const value = await input.blob.getJSON<Revision<StoredStudy>>(item.key);
      if (!value || value.value.userId !== userId || value.value.kind !== kind || value.value.id !== id) throw new EdgeOneStudyRepositoryError();
      output.push(value);
    }
    return output;
  }

  async function current(userId: string, kind: CloudStudyKind, id: string) {
    const state = resolveRevisionState(await revisions(userId, kind, id));
    if (state.kind === "missing") return null;
    if (state.kind === "conflict") throw new EdgeOneStudyRepositoryError();
    return state.revision;
  }

  async function write(value: CloudStudyRecord, parent: Revision<StoredStudy> | null, deleted = false) {
    const createdAt = input.now().toISOString();
    const revision: Revision<StoredStudy> = { id: input.uuid(), parentIds: parent ? [parent.id] : [], operationId: input.uuid(), createdAt, deleted, value: store(value) };
    await input.blob.createJSON(`${prefix(value.userId, value.kind, value.id)}${revision.id}.json`, revision);
    const event: IndexEvent = { id: input.uuid(), resourceId: value.id, action: deleted ? "delete" : "upsert", revisionId: revision.id, createdAt };
    await input.blob.createJSON(`${indexPrefix(value.userId, value.kind)}${event.id}.json`, event);
    return hydrate(revision.value);
  }

  async function ensureImportTarget(record: CloudStudyRecord) {
    const artifact = `${record.userId}\u0000${record.kind}\u0000${record.id}`;
    const createdAt = record.updatedAt.toISOString();
    if (Number.isNaN(record.updatedAt.getTime()) || (record.createdAt && Number.isNaN(record.createdAt.getTime()))) throw new EdgeOneStudyRepositoryError();
    const revision: Revision<StoredStudy> = {
      id: stableImportArtifactId(`${artifact}\u0000revision`),
      parentIds: [],
      operationId: stableImportArtifactId(`${artifact}\u0000operation`),
      createdAt,
      deleted: false,
      value: store(record),
    };
    const revisionKey = `${prefix(record.userId, record.kind, record.id)}${revision.id}.json`;
    let created = false;
    try {
      await input.blob.createJSON(revisionKey, revision);
      created = true;
    } catch (error) {
      if ((error as { code?: string }).code !== "BLOB_ALREADY_EXISTS") throw error;
      const existing = await input.blob.getJSON<unknown>(revisionKey);
      if (!sameJson(existing, revision)) throw new EdgeOneStudyRepositoryError();
    }

    const event: IndexEvent = {
      id: stableImportArtifactId(`${artifact}\u0000index`),
      resourceId: record.id,
      action: "upsert",
      revisionId: revision.id,
      createdAt,
    };
    const eventKey = `${indexPrefix(record.userId, record.kind)}${event.id}.json`;
    try {
      await input.blob.createJSON(eventKey, event);
    } catch (error) {
      if ((error as { code?: string }).code !== "BLOB_ALREADY_EXISTS") throw error;
      const existing = await input.blob.getJSON<unknown>(eventKey);
      if (!sameJson(existing, event)) throw new EdgeOneStudyRepositoryError();
    }
    return { record: hydrate(revision.value), created };
  }

  return {
    resolveOriginalSource: input.resolveOriginalSource,
    resolveTranslatedSource: input.resolveTranslatedSource,
    async list(userId, kind, bookId, page) {
      const items = await input.blob.listAll(indexPrefix(userId, kind));
      const events: IndexEvent[] = [];
      for (const item of items) { const event = await input.blob.getJSON<IndexEvent>(item.key); if (!event) throw new EdgeOneStudyRepositoryError(); events.push(event); }
      const records: CloudStudyRecord[] = [];
      for (const id of collectIndexedResourceIds(events)) {
        const revision = await current(userId, kind, id);
        if (revision && !revision.deleted) {
          const value = hydrate(revision.value);
          if (!bookId || value.originalBookId === bookId || value.translatedBookId === bookId) records.push(value);
        }
      }
      records.sort((a, b) => a.id.localeCompare(b.id));
      const start = page.cursor ? records.findIndex((item) => item.id === page.cursor) + 1 : 0;
      const visible = records.slice(Math.max(start, 0), Math.max(start, 0) + page.limit);
      return { items: visible, nextCursor: start + page.limit < records.length ? visible.at(-1)?.id ?? null : null };
    },
    async create(record) {
      const existing = await current(record.userId, record.kind, record.id);
      if (existing && !existing.deleted) throw new EdgeOneStudyRepositoryError();
      return write(record, null);
    },
    ensureImportTarget,
    async hasImportTarget(userId: string, kind: CloudStudyKind, id: string) {
      const artifact = `${userId}\u0000${kind}\u0000${id}`;
      const revisionId = stableImportArtifactId(`${artifact}\u0000revision`);
      const eventId = stableImportArtifactId(`${artifact}\u0000index`);
      const revision = await input.blob.getJSON<Revision<StoredStudy>>(`${prefix(userId, kind, id)}${revisionId}.json`);
      const event = await input.blob.getJSON<IndexEvent>(`${indexPrefix(userId, kind)}${eventId}.json`);
      if (!revision || !event) return false;
      return revision.id === revisionId && revision.parentIds.length === 0 && !revision.deleted &&
        revision.value.userId === userId && revision.value.kind === kind && revision.value.id === id &&
        event.id === eventId && event.resourceId === id && event.action === "upsert" &&
        event.revisionId === revisionId && event.createdAt === revision.createdAt;
    },
    async update(userId, id, data) {
      const kind = data.kind as CloudStudyKind;
      const parent = await current(userId, kind, id);
      if (!parent || parent.deleted) return null;
      const changes = { ...data }; delete changes.kind;
      return write({ ...hydrate(parent.value), ...changes, updatedAt: input.now() }, parent);
    },
    async delete(userId, id, kind) {
      const parent = await current(userId, kind, id);
      if (!parent || parent.deleted) return false;
      await write(hydrate(parent.value), parent, true);
      return true;
    },
    async upsertReading(record) {
      const id = deriveEdgeOneReadingId(record.userId, record);
      const parent = await current(record.userId, "reading", id);
      const expected = record.expectedVersion as number;
      if (!parent) {
        if (expected !== 0) return null;
        return write({ ...record, id, version: 0 }, null);
      }
      if (parent.deleted || parent.value.version !== expected) return null;
      return write({ ...record, id, version: expected + 1 }, parent);
    },
  };
}
