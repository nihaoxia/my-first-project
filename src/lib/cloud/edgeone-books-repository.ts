import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";

import type { AuthoritativeBlobStore } from "../edgeone/blob-store-core.ts";
import {
  collectIndexedResourceIds,
  type IndexEvent,
} from "../edgeone/index-events-core.ts";
import {
  resolveRevisionState,
  type Revision,
} from "../edgeone/revisions-core.ts";
import {
  type CloudBookRecord,
  type CloudBooksRepository,
  type CloudBooksTransaction,
  type CreateBookPersistence,
} from "./books-core.ts";
import { isUuid } from "./storage-core.ts";

type StoredBook = Omit<CloudBookRecord, "uploadedAt" | "lastOpenedAt"> & {
  uploadedAt: string;
  lastOpenedAt?: string | null;
};

type CleanupEvent = {
  id: string;
  action: "upsert" | "resolve";
  userId: string;
  bucket: string;
  objectPath: string;
  reason?: string;
  createdAt: string;
};

export class EdgeOneBooksRepositoryError extends Error {
  readonly code: "BOOK_CONFLICT" | "BOOK_LEDGER_INVALID" | "BOOK_WRITE_FAILED";

  constructor(code: "BOOK_CONFLICT" | "BOOK_LEDGER_INVALID" | "BOOK_WRITE_FAILED") {
    super(code);
    this.code = code;
    this.name = "EdgeOneBooksRepositoryError";
  }
}

function stored(record: CloudBookRecord): StoredBook {
  const { uploadedAt, lastOpenedAt, ...rest } = record;
  const storedLastOpenedAt: string | null | undefined = lastOpenedAt instanceof Date
    ? lastOpenedAt.toISOString()
    : lastOpenedAt;
  return {
    ...rest,
    uploadedAt: uploadedAt.toISOString(),
    lastOpenedAt: storedLastOpenedAt,
  };
}

function hydrated(record: StoredBook): CloudBookRecord {
  const { uploadedAt: storedUploadedAt, lastOpenedAt: storedLastOpenedAt, ...rest } = record;
  const uploadedAt = new Date(storedUploadedAt);
  const lastOpenedAt: Date | null | undefined = typeof storedLastOpenedAt === "string"
    ? new Date(storedLastOpenedAt)
    : storedLastOpenedAt;
  if (Number.isNaN(uploadedAt.getTime()) || (lastOpenedAt && Number.isNaN(lastOpenedAt.getTime()))) {
    throw new EdgeOneBooksRepositoryError("BOOK_LEDGER_INVALID");
  }
  return { ...rest, uploadedAt, lastOpenedAt };
}

function assertIdentity(userId: string, bookId?: string): void {
  if (!isUuid(userId) || (bookId !== undefined && !isUuid(bookId))) {
    throw new EdgeOneBooksRepositoryError("BOOK_LEDGER_INVALID");
  }
}

function cleanupId(bucket: string, objectPath: string): string {
  return bytesToHex(sha256(utf8ToBytes(`${bucket}\u0000${objectPath}`)));
}

export function createEdgeOneBooksRepository(input: {
  blob: AuthoritativeBlobStore;
  now: () => Date;
  uuid: () => string;
}): CloudBooksRepository {
  const revisionPrefix = (userId: string, bookId: string) =>
    `books/${userId}/${bookId}/revisions/`;
  const indexPrefix = (userId: string) => `books-index/${userId}/events/`;

  function time(): string {
    const value = input.now();
    if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
      throw new EdgeOneBooksRepositoryError("BOOK_LEDGER_INVALID");
    }
    return value.toISOString();
  }

  async function loadRevisions(userId: string, bookId: string) {
    assertIdentity(userId, bookId);
    const items = await input.blob.listAll(revisionPrefix(userId, bookId));
    const revisions: Revision<StoredBook>[] = [];
    for (const item of items) {
      const revision = await input.blob.getJSON<Revision<StoredBook>>(item.key);
      if (!revision) throw new EdgeOneBooksRepositoryError("BOOK_LEDGER_INVALID");
      if (revision.value.userId !== userId || revision.value.id !== bookId) {
        throw new EdgeOneBooksRepositoryError("BOOK_LEDGER_INVALID");
      }
      revisions.push(revision);
    }
    return revisions;
  }

  async function current(userId: string, bookId: string) {
    const state = resolveRevisionState(await loadRevisions(userId, bookId));
    if (state.kind === "missing") return null;
    if (state.kind === "conflict") throw new EdgeOneBooksRepositoryError("BOOK_CONFLICT");
    return state.revision;
  }

  async function appendIndex(
    userId: string,
    bookId: string,
    revisionId: string,
    action: "upsert" | "delete",
    createdAt: string,
  ) {
    const event: IndexEvent = {
      id: input.uuid(), resourceId: bookId, action, revisionId, createdAt,
    };
    await input.blob.createJSON(`${indexPrefix(userId)}${event.id}.json`, event);
  }

  async function createBook(value: CreateBookPersistence): Promise<CloudBookRecord> {
    assertIdentity(value.userId, value.id);
    const existing = await current(value.userId, value.id);
    if (existing) {
      if (existing.deleted) throw new EdgeOneBooksRepositoryError("BOOK_WRITE_FAILED");
      return hydrated(existing.value);
    }
    const createdAt = time();
    const record: CloudBookRecord = {
      ...value,
      uploadedAt: new Date(createdAt),
      chapters: value.chapters.map((chapter) => ({
        ...chapter,
        id: chapter.id ?? input.uuid(),
      })),
    };
    const revision: Revision<StoredBook> = {
      id: input.uuid(), parentIds: [], operationId: input.uuid(), createdAt,
      deleted: false, value: stored(record),
    };
    try {
      await input.blob.createJSON(
        `${revisionPrefix(value.userId, value.id)}${revision.id}.json`, revision,
      );
      await appendIndex(value.userId, value.id, revision.id, "upsert", createdAt);
      return record;
    } catch (error) {
      if (error instanceof EdgeOneBooksRepositoryError) throw error;
      throw new EdgeOneBooksRepositoryError("BOOK_WRITE_FAILED");
    }
  }

  async function updateBook(
    userId: string,
    bookId: string,
    data: { title?: string; author?: string | null },
  ): Promise<CloudBookRecord | null> {
    const parent = await current(userId, bookId);
    if (!parent || parent.deleted) return null;
    const createdAt = time();
    const value: StoredBook = { ...parent.value, ...data };
    const revision: Revision<StoredBook> = {
      id: input.uuid(), parentIds: [parent.id], operationId: input.uuid(), createdAt,
      deleted: false, value,
    };
    try {
      await input.blob.createJSON(
        `${revisionPrefix(userId, bookId)}${revision.id}.json`, revision,
      );
      await appendIndex(userId, bookId, revision.id, "upsert", createdAt);
      return hydrated(value);
    } catch {
      throw new EdgeOneBooksRepositoryError("BOOK_WRITE_FAILED");
    }
  }

  async function deleteBook(userId: string, bookId: string): Promise<CloudBookRecord | null> {
    const parent = await current(userId, bookId);
    if (!parent || parent.deleted) return null;
    const createdAt = time();
    const revision: Revision<StoredBook> = {
      id: input.uuid(), parentIds: [parent.id], operationId: input.uuid(), createdAt,
      deleted: true, value: parent.value,
    };
    try {
      await input.blob.createJSON(
        `${revisionPrefix(userId, bookId)}${revision.id}.json`, revision,
      );
      await appendIndex(userId, bookId, revision.id, "delete", createdAt);
      return hydrated(parent.value);
    } catch {
      throw new EdgeOneBooksRepositoryError("BOOK_WRITE_FAILED");
    }
  }

  const cleanupPrefix = (bucket: string, objectPath: string) =>
    `cleanup-intents/${cleanupId(bucket, objectPath)}/events/`;

  async function appendCleanup(
    action: "upsert" | "resolve",
    value: { userId: string; bucket: string; objectPath: string; reason?: string },
  ) {
    assertIdentity(value.userId);
    const event: CleanupEvent = {
      id: input.uuid(), action, userId: value.userId, bucket: value.bucket,
      objectPath: value.objectPath, ...(value.reason ? { reason: value.reason } : {}),
      createdAt: time(),
    };
    await input.blob.createJSON(
      `${cleanupPrefix(value.bucket, value.objectPath)}${event.id}.json`, event,
    );
  }

  async function cleanupState(bucket: string, objectPath: string) {
    const items = await input.blob.listAll(cleanupPrefix(bucket, objectPath));
    const events: CleanupEvent[] = [];
    for (const item of items) {
      const event = await input.blob.getJSON<CleanupEvent>(item.key);
      if (!event || event.bucket !== bucket || event.objectPath !== objectPath) {
        throw new EdgeOneBooksRepositoryError("BOOK_LEDGER_INVALID");
      }
      events.push(event);
    }
    events.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.id.localeCompare(b.id));
    return events.at(-1) ?? null;
  }

  const transaction: CloudBooksTransaction = {
    create: createBook,
    async find(userId, bookId) {
      const revision = await current(userId, bookId);
      return revision && !revision.deleted ? hydrated(revision.value) : null;
    },
    delete: deleteBook,
    async upsertCleanupIntent(value) { await appendCleanup("upsert", value); },
    async findCleanupIntent(bucket, objectPath) {
      return (await cleanupState(bucket, objectPath))?.action === "upsert";
    },
    async resolveCleanupIntent(bucket, objectPath) {
      const existing = await cleanupState(bucket, objectPath);
      if (!existing || existing.action === "resolve") return;
      await appendCleanup("resolve", existing);
    },
  };

  return {
    async list(userId) {
      assertIdentity(userId);
      const items = await input.blob.listAll(indexPrefix(userId));
      const events: IndexEvent[] = [];
      for (const item of items) {
        const event = await input.blob.getJSON<IndexEvent>(item.key);
        if (!event) throw new EdgeOneBooksRepositoryError("BOOK_LEDGER_INVALID");
        events.push(event);
      }
      const output: CloudBookRecord[] = [];
      for (const bookId of collectIndexedResourceIds(events)) {
        const revision = await current(userId, bookId);
        if (revision && !revision.deleted) output.push(hydrated(revision.value));
      }
      return output.sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime() || a.id.localeCompare(b.id));
    },
    async find(userId, bookId) {
      const revision = await current(userId, bookId);
      return revision && !revision.deleted ? hydrated(revision.value) : null;
    },
    update: updateBook,
    async transaction<T>(work: (value: CloudBooksTransaction) => Promise<T>) {
      return work(transaction);
    },
    async withObjectLock<T>(
      _bucket: string,
      _objectPath: string,
      work: (value: CloudBooksTransaction) => Promise<T>,
    ) {
      return work(transaction);
    },
    async upsertCleanupIntent(value) { await appendCleanup("upsert", value); },
    async resolveCleanupIntent(bucket, objectPath) {
      return transaction.resolveCleanupIntent(bucket, objectPath);
    },
  };
}
