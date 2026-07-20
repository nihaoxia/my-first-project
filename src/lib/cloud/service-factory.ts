import "server-only";

import { randomBytes } from "@noble/hashes/utils.js";

import { createEdgeOneAccountService } from "../auth/edgeone-account-service-core";
import { getAuthoritativeBlobStore } from "../edgeone/blob-store";
import { createWriteGatedAuthoritativeBlobStore } from "../edgeone/blob-store-core";
import { createEdgeOneQuotaService } from "../edgeone/quota-service-core";
import type { EdgeOneRuntimeConfig } from "../edgeone/runtime-config-core";
import { createCloudBooksService } from "./books-core";
import { createEdgeOneBooksRepository } from "./edgeone-books-repository";
import { createEdgeOneImportRepository } from "./edgeone-import-repository";
import { createEdgeOneModelsTranslationProvider } from "./edgeone-models-translation-provider";
import { createEdgeOneStorageProvider } from "./edgeone-storage-provider";
import { createEdgeOneStudyRepository } from "./edgeone-study-repository";
import {
  createFreeQuotaTranslationProvider,
  EDGEONE_MODEL_QUOTA_LEDGER_ID,
} from "./edgeone-translation-quota-core";
import { createEdgeOneTranslationsRepository } from "./edgeone-translations-repository";
import { createCloudImportService, type PreparedImportItem } from "./import-core";
import { createProductionCloudServices } from "./service-factory-core";
import {
  createCloudStorageService,
  parseOriginalBookObjectPath,
} from "./storage-core";
import { createCloudStudyService } from "./study-core";
import {
  createCloudTranslationsService,
  type CloudBookLanguage,
} from "./translations-core";

function createEdgeOneServices(config: EdgeOneRuntimeConfig) {
  const blob = createWriteGatedAuthoritativeBlobStore(
    getAuthoritativeBlobStore(config.blobStore),
    config.freeBlobConfirmed,
  );
  const quota = createEdgeOneQuotaService(blob);
  const now = () => new Date();
  const uuid = () => crypto.randomUUID();
  const booksRepository = createEdgeOneBooksRepository({ blob, now, uuid });

  const providerForPath = (path: string) => {
    const parsed = parseOriginalBookObjectPath(path);
    if (!parsed) throw Object.assign(new Error("INVALID_OBJECT_PATH"), { code: "INVALID_OBJECT_PATH" });
    return createEdgeOneStorageProvider({
      blob,
      quota,
      userId: parsed.userId,
      now,
      uuid,
      randomBytes,
      downloadSecret: config.sessionSecret,
    });
  };
  const storage = createCloudStorageService({
    bucket: config.blobStore,
    provider: {
      async upload(path, bytes) { return providerForPath(path).upload(path, bytes); },
      async remove(path) { return providerForPath(path).remove(path); },
      async createSignedUrl(path, expiresInSeconds) {
        return providerForPath(path).createSignedUrl(path, expiresInSeconds);
      },
    },
  });

  const translationsRepository = createEdgeOneTranslationsRepository({
    blob,
    now,
    uuid,
    async findBook(userId, bookId) {
      const book = await booksRepository.find(userId, bookId);
      if (!book?.chapters || book.chapters.some((chapter) => !chapter.id)) return null;
      return {
        id: book.id,
        title: book.title,
        sourceLanguage: asCloudBookLanguage(book.sourceLanguage),
        chapters: book.chapters.map((chapter) => ({
          id: chapter.id!,
          index: chapter.index,
          title: chapter.title,
          content: chapter.content,
          wordCount: chapter.wordCount,
          status: chapter.status,
          isSkipped: chapter.isSkipped,
        })),
      };
    },
  });

  const resolveOriginalSource = async (
    userId: string,
    originalBookId: string,
    chapterId: string | null,
  ) => {
    const book = await booksRepository.find(userId, originalBookId);
    const chapter = chapterId
      ? book?.chapters?.find((value) => value.id === chapterId)
      : null;
    if (!book || (chapterId && !chapter)) return null;
    return {
      originalBookId: book.id,
      bookTitle: book.title,
      chapterId: chapter?.id ?? null,
      chapterTitle: chapter?.title ?? null,
    };
  };
  const studyRepository = createEdgeOneStudyRepository({
    blob,
    now,
    uuid,
    resolveOriginalSource,
    async resolveTranslatedSource(userId, translatedBookId, chapterId) {
      const translated = await translationsRepository.getReader(userId, translatedBookId);
      const chapter = chapterId
        ? translated?.chapters.find((value) => value.id === chapterId || value.chapterId === chapterId)
        : null;
      if (!translated || (chapterId && !chapter)) return null;
      return {
        translatedBookId: translated.id,
        title: translated.title,
        originalBookId: translated.originalBookId,
        chapterId: chapter?.id ?? null,
        chapterTitle: chapter?.title ?? null,
      };
    },
  });

  const importsRepository = createEdgeOneImportRepository({
    blob,
    uuid,
    createTarget: (item) => createImportTarget(item, {
      books: booksRepository,
      study: studyRepository,
      now,
      uuid,
    }),
  });

  const modelsKey = process.env.MAKERS_MODELS_KEY?.trim();
  const models = createEdgeOneModelsTranslationProvider({ apiKey: modelsKey });
  const translations = createCloudTranslationsService({
    repository: translationsRepository,
    provider: models,
    providerForUser: () => createFreeQuotaTranslationProvider({
      provider: models,
      quota,
      userId: EDGEONE_MODEL_QUOTA_LEDGER_ID,
      freeModelConfirmed: config.freeModelConfirmed && Boolean(modelsKey),
      now,
      uuid,
    }),
    now,
    uuid,
  });

  return {
    auth: createEdgeOneAccountService({
      blob,
      usernamePepper: config.sessionSecret,
      now,
      uuid,
      randomBytes,
    }),
    books: createCloudBooksService({ repository: booksRepository, storage, uuid }),
    study: createCloudStudyService({ repository: studyRepository, now, uuid }),
    imports: createCloudImportService({ repository: importsRepository, now, uuid }),
    translations,
    storage,
    quota,
  };
}

async function createImportTarget(
  item: PreparedImportItem,
  input: {
    books: ReturnType<typeof createEdgeOneBooksRepository>;
    study: ReturnType<typeof createEdgeOneStudyRepository>;
    now: () => Date;
    uuid: () => string;
  },
): Promise<
  { ok: true; targetId: string } |
  { ok: false; code: "SOURCE_NOT_FOUND" | "INVALID_TARGET" | "WRITE_FAILED" }
> {
  const timestamp = input.now();
  if (item.kind === "note") {
    const row = await input.study.create({
      id: input.uuid(), userId: item.userId, kind: "note",
      title: item.payload.title, content: item.payload.content,
      targetType: "FREEFORM", originalBookId: null, translatedBookId: null,
      chapterId: null, targetLabel: "", createdAt: timestamp, updatedAt: timestamp,
    });
    return { ok: true, targetId: row.id };
  }
  if (!item.source || item.source.translationTitle) {
    return { ok: false, code: "SOURCE_NOT_FOUND" };
  }
  const normalize = (value: string) => value.normalize("NFKC").trim().toLowerCase();
  const candidates = (await input.books.list(item.userId))
    .filter((book) => normalize(book.title) === normalize(item.source!.bookTitle));
  if (candidates.length !== 1) return { ok: false, code: "SOURCE_NOT_FOUND" };
  const book = candidates[0];
  const chapters = item.source.chapterTitle
    ? book.chapters?.filter((chapter) => normalize(chapter.title) === normalize(item.source!.chapterTitle!)) ?? []
    : [];
  if (item.source.chapterTitle && chapters.length !== 1) {
    return { ok: false, code: "SOURCE_NOT_FOUND" };
  }
  const chapter = chapters[0] ?? null;
  if (item.kind === "reading") {
    if ((await input.study.list(item.userId, "reading", book.id, { limit: 1 })).items.length) {
      return { ok: false, code: "INVALID_TARGET" };
    }
    const row = await input.study.upsertReading({
      id: input.uuid(), userId: item.userId, kind: "reading",
      originalBookId: book.id, translatedBookId: null,
      chapterId: chapter?.id ?? null,
      paragraphIndex: item.payload.paragraphIndex, settings: item.payload.settings,
      expectedVersion: 0, bookTitle: book.title,
      chapterTitle: chapter?.title ?? null, updatedAt: timestamp,
    });
    return row ? { ok: true, targetId: row.id } : { ok: false, code: "INVALID_TARGET" };
  }
  const row = await input.study.create({
    id: input.uuid(), userId: item.userId, kind: item.kind,
    originalBookId: book.id, chapterId: chapter?.id ?? null,
    bookTitle: book.title, chapterTitle: chapter?.title ?? null,
    ...item.payload, createdAt: timestamp, updatedAt: timestamp,
  });
  return { ok: true, targetId: row.id };
}

function asCloudBookLanguage(value: string): CloudBookLanguage {
  const allowed = new Set<CloudBookLanguage>([
    "CHINESE", "ENGLISH", "JAPANESE", "KOREAN", "RUSSIAN",
    "GERMAN", "SPANISH", "FRENCH", "UNKNOWN",
  ]);
  return allowed.has(value as CloudBookLanguage) ? value as CloudBookLanguage : "UNKNOWN";
}

export type CloudServices = ReturnType<typeof createEdgeOneServices>;

let singleton: CloudServices | undefined;

export function getCloudServices(): CloudServices {
  if (singleton) return singleton;
  const forbidden = () => {
    throw Object.assign(new Error("PAID_PROVIDER_FORBIDDEN"), { code: "PAID_PROVIDER_FORBIDDEN" });
  };
  singleton = createProductionCloudServices({
    environment: process.env,
    factories: {
      edgeone: createEdgeOneServices,
      prisma: forbidden,
      supabase: forbidden,
      cos: forbidden,
      sms: forbidden,
      mcp: forbidden,
    },
  });
  return singleton;
}
