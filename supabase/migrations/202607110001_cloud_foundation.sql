-- This is the authoritative Supabase migration. It contains raw SQL extensions
-- that Prisma cannot represent; CI must run a drift gate before any replacement
-- or automatically generated migration is accepted.
-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";
CREATE SCHEMA IF NOT EXISTS private;

-- CreateEnum
CREATE TYPE "public"."UserRole" AS ENUM ('USER', 'ADMIN', 'BANNED');

-- CreateEnum
CREATE TYPE "public"."BookFormat" AS ENUM ('TXT', 'EPUB', 'MOBI', 'PDF');

-- CreateEnum
CREATE TYPE "public"."BookLanguage" AS ENUM ('CHINESE', 'ENGLISH', 'JAPANESE', 'KOREAN', 'RUSSIAN', 'GERMAN', 'SPANISH', 'FRENCH', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "public"."TranslationStatus" AS ENUM ('DRAFT', 'QUEUED', 'PROCESSING', 'COMPLETED', 'NEEDS_REVIEW', 'FAILED', 'CANCELED');

-- CreateEnum
CREATE TYPE "public"."ChapterStatus" AS ENUM ('ACTIVE', 'SKIPPED', 'TOO_LONG', 'TOO_SHORT', 'SUSPECTED_TOC', 'GARBLED');

-- CreateEnum
CREATE TYPE "public"."TaskStatus" AS ENUM ('PENDING', 'EXTRACTING_TERMS', 'QUEUED', 'TRANSLATING', 'QUALITY_CHECKING', 'COMPLETED', 'NEEDS_REVIEW', 'FAILED', 'CANCELED');

-- CreateEnum
CREATE TYPE "public"."LedgerType" AS ENUM ('GRANT', 'HOLD', 'CHARGE', 'RELEASE', 'MANUAL_ADJUSTMENT', 'REFUND');

-- CreateEnum
CREATE TYPE "public"."TermType" AS ENUM ('PERSON', 'PLACE', 'ORGANIZATION', 'RACE', 'SKILL', 'ITEM', 'TITLE', 'ADDRESS', 'SETTING', 'OTHER');

CREATE TYPE "public"."NoteTargetType" AS ENUM ('FREEFORM', 'ORIGINAL_BOOK', 'CHAPTER', 'TRANSLATED_BOOK');
CREATE TYPE "public"."ImportKind" AS ENUM ('VOCABULARY', 'SENTENCE', 'NOTE', 'READING');
CREATE TYPE "public"."ImportBatchStatus" AS ENUM ('COMPLETED', 'PARTIAL');

-- CreateTable
CREATE TABLE "public"."UserProfile" (
    "id" UUID NOT NULL,
    "phone" TEXT NOT NULL,
    "displayName" TEXT,
    "role" "public"."UserRole" NOT NULL DEFAULT 'USER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastLoginAt" TIMESTAMP(3),

    CONSTRAINT "UserProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AccountBalance" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "available" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "frozen" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "freeChapters" INTEGER NOT NULL DEFAULT 5,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."BalanceLedger" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" "public"."LedgerType" NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "description" TEXT,
    "taskId" UUID,
    "holdId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BalanceLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."BalanceHold" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "taskId" UUID,
    "attemptId" UUID NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "freeUnits" INTEGER NOT NULL DEFAULT 0,
    "releasedAt" TIMESTAMP(3),
    "chargedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BalanceHold_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."OriginalBook" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "author" TEXT,
    "sourceLanguage" "public"."BookLanguage" NOT NULL DEFAULT 'UNKNOWN',
    "format" "public"."BookFormat" NOT NULL,
    "fileSizeBytes" INTEGER NOT NULL,
    "storagePath" TEXT NOT NULL,
    "chapterCount" INTEGER NOT NULL DEFAULT 0,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastOpenedAt" TIMESTAMP(3),
    "readingProgress" TEXT,

    CONSTRAINT "OriginalBook_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "OriginalBook_storagePath_owner_book_check" CHECK ("storagePath" = "userId"::text || '/' || "id"::text || '/original.txt')
);

-- CreateTable
CREATE TABLE "public"."Chapter" (
    "id" UUID NOT NULL,
    "originalBookId" UUID NOT NULL,
    "index" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "wordCount" INTEGER NOT NULL,
    "status" "public"."ChapterStatus" NOT NULL DEFAULT 'ACTIVE',
    "isSkipped" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Chapter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TranslatedBook" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "originalBookId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "targetLanguage" "public"."BookLanguage" NOT NULL,
    "status" "public"."TranslationStatus" NOT NULL DEFAULT 'DRAFT',
    "progressPercent" INTEGER NOT NULL DEFAULT 0,
    "completedChapters" INTEGER NOT NULL DEFAULT 0,
    "failedChapters" INTEGER NOT NULL DEFAULT 0,
    "webSearchTerms" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastReadAt" TIMESTAMP(3),
    "readingProgress" TEXT,

    CONSTRAINT "TranslatedBook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TranslatedChapter" (
    "id" UUID NOT NULL,
    "translatedBookId" UUID NOT NULL,
    "chapterId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "qualityPassed" BOOLEAN NOT NULL DEFAULT false,
    "providerName" TEXT,
    "modelName" TEXT,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "wordCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TranslatedChapter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TranslationTask" (
    "id" UUID NOT NULL,
    "translatedBookId" UUID NOT NULL,
    "chapterId" UUID NOT NULL,
    "status" "public"."TaskStatus" NOT NULL DEFAULT 'PENDING',
    "estimatedCost" DECIMAL(10,2) NOT NULL,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "attemptId" UUID,
    "attemptStartedAt" TIMESTAMP(3),
    "attemptExpiresAt" TIMESTAMP(3),
    "translatedSegments" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "nextSegmentIndex" INTEGER NOT NULL DEFAULT 0,
    "checkpointProvider" TEXT,
    "checkpointModel" TEXT,
    "accumulatedInputTokens" INTEGER NOT NULL DEFAULT 0,
    "accumulatedOutputTokens" INTEGER NOT NULL DEFAULT 0,
    "lastHeartbeatAt" TIMESTAMP(3),
    "batchExecutionId" UUID,
    "batchExecutionExpiresAt" TIMESTAMP(3),
    "batchExecutionIndex" INTEGER,
    "lastBatchExecutionId" UUID,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TranslationTask_pkey" PRIMARY KEY ("id")
);

-- Immutable per-provider-execution audit evidence used to reconcile ambiguous commits.
CREATE TABLE "public"."TranslationBatchReceipt" (
    "executionId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "taskId" UUID NOT NULL,
    "attemptId" UUID NOT NULL,
    "startSegmentIndex" INTEGER NOT NULL,
    "endSegmentIndex" INTEGER NOT NULL,
    "outcome" TEXT NOT NULL,
    "errorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TranslationBatchReceipt_pkey" PRIMARY KEY ("executionId"),
    CONSTRAINT "TranslationBatchReceipt_range_check" CHECK ("startSegmentIndex" >= 0 AND "endSegmentIndex" >= "startSegmentIndex"),
    CONSTRAINT "TranslationBatchReceipt_outcome_check" CHECK (
      ("outcome" IN ('CHECKPOINTED', 'COMPLETED') AND "endSegmentIndex" > "startSegmentIndex" AND "errorCode" IS NULL) OR
      ("outcome" = 'FAILED' AND "endSegmentIndex" = "startSegmentIndex" AND "errorCode" IS NOT NULL)
    )
);

CREATE TABLE "public"."TranslationRetryReceipt" (
    "retryExecutionId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "taskId" UUID NOT NULL,
    "fromRetryCount" INTEGER NOT NULL,
    "toRetryCount" INTEGER NOT NULL,
    "resetCheckpoint" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TranslationRetryReceipt_pkey" PRIMARY KEY ("retryExecutionId"),
    CONSTRAINT "TranslationRetryReceipt_count_check" CHECK ("fromRetryCount" >= 0 AND "toRetryCount" = "fromRetryCount" + 1)
);

-- CreateTable
CREATE TABLE "public"."Term" (
    "id" UUID NOT NULL,
    "originalBookId" UUID NOT NULL,
    "translatedBookId" UUID,
    "type" "public"."TermType" NOT NULL DEFAULT 'OTHER',
    "sourceText" TEXT NOT NULL,
    "translatedText" TEXT NOT NULL,
    "isUserLocked" BOOLEAN NOT NULL DEFAULT false,
    "confidence" INTEGER NOT NULL DEFAULT 0,
    "sourceNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Term_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."VocabularyItem" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "originalBookId" UUID NOT NULL,
    "chapterId" UUID,
    "term" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    "contextualMean" TEXT,
    "sourceSentence" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VocabularyItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SentenceItem" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "originalBookId" UUID NOT NULL,
    "chapterId" UUID,
    "originalText" TEXT NOT NULL,
    "translatedText" TEXT,
    "explanation" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SentenceItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AiRateLimit" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "scope" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "windowKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiRateLimit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."StudyNote" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "targetType" "public"."NoteTargetType" NOT NULL DEFAULT 'FREEFORM',
    "originalBookId" UUID,
    "chapterId" UUID,
    "translatedBookId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudyNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ReadingState" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "originalBookId" UUID,
    "translatedBookId" UUID,
    "chapterId" UUID,
    "paragraphIndex" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,
    "settings" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReadingState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."StorageCleanupTask" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "bucket" TEXT NOT NULL,
    "objectPath" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StorageCleanupTask_pkey" PRIMARY KEY ("id")
);

-- Import batches are user-visible run summaries; item receipts are the durable
-- idempotency authority. Receipts intentionally follow account deletion.
CREATE TABLE "public"."ImportBatch" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "manifestId" UUID NOT NULL,
    "manifestVersion" INTEGER NOT NULL,
    "status" "public"."ImportBatchStatus" NOT NULL,
    "itemCount" INTEGER NOT NULL,
    "createdCount" INTEGER NOT NULL,
    "skippedCount" INTEGER NOT NULL,
    "conflictCount" INTEGER NOT NULL,
    "errorCount" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ImportBatch_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ImportBatch_counts_check" CHECK (
      "manifestVersion" = 1 AND "itemCount" > 0 AND
      "createdCount" >= 0 AND "skippedCount" >= 0 AND "conflictCount" >= 0 AND "errorCount" >= 0 AND
      "createdCount" + "skippedCount" + "conflictCount" + "errorCount" = "itemCount" AND
      "completedAt" >= "startedAt" AND
      (("status" = 'COMPLETED' AND "conflictCount" = 0 AND "errorCount" = 0) OR
       ("status" = 'PARTIAL' AND ("conflictCount" > 0 OR "errorCount" > 0)))
    )
);

CREATE TABLE "public"."ImportItem" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "kind" "public"."ImportKind" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "sourceVersion" INTEGER NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "targetId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ImportItem_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ImportItem_identity_check" CHECK (
      "sourceId" ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$' AND
      "sourceVersion" BETWEEN 1 AND 1000000 AND
      "payloadHash" ~ '^[0-9a-f]{64}$'
    )
);

-- Native invariants not expressible by Prisma. This SQL migration remains the
-- deployment authority; keep these checks in migration drift tests.
CREATE OR REPLACE FUNCTION private.is_valid_translation_checkpoint(value jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = '' AS $$
  SELECT CASE WHEN jsonb_typeof(value) IS DISTINCT FROM 'array' THEN false ELSE NOT EXISTS (
    SELECT 1 FROM pg_catalog.jsonb_array_elements(value) AS item
    WHERE jsonb_typeof(item) IS DISTINCT FROM 'object'
      OR NOT (item ?& ARRAY['segmentId', 'index', 'translatedText'])
      OR item - ARRAY['segmentId', 'index', 'translatedText'] <> '{}'::jsonb
      OR jsonb_typeof(item->'segmentId') IS DISTINCT FROM 'string'
      OR pg_catalog.length(item->>'segmentId') NOT BETWEEN 1 AND 128
      OR jsonb_typeof(item->'index') IS DISTINCT FROM 'number'
      OR (item->>'index') !~ '^[0-9]+$'
      OR (item->>'index')::numeric > 10000
      OR jsonb_typeof(item->'translatedText') IS DISTINCT FROM 'string'
      OR pg_catalog.length(pg_catalog.btrim(item->>'translatedText')) < 1
      OR pg_catalog.octet_length(item->>'translatedText') > 32768
  ) AND COALESCE((SELECT SUM(pg_catalog.octet_length(item->>'translatedText')) FROM pg_catalog.jsonb_array_elements(value) AS item), 0)
      + GREATEST(jsonb_array_length(value) - 1, 0) * 2 <= 5242880 END;
$$;
ALTER FUNCTION private.is_valid_translation_checkpoint(jsonb) OWNER TO postgres;
ALTER TABLE public."AccountBalance" ADD CONSTRAINT "AccountBalance_nonnegative_check"
  CHECK ("available" >= 0 AND "frozen" >= 0 AND "freeChapters" >= 0);
ALTER TABLE public."BalanceLedger" ADD CONSTRAINT "BalanceLedger_nonnegative_check"
  CHECK ("amount" >= 0);
ALTER TABLE public."BalanceHold" ADD CONSTRAINT "BalanceHold_resource_terminal_check"
  CHECK (
    "amount" >= 0 AND "freeUnits" >= 0 AND
    (("amount" > 0 AND "freeUnits" = 0) OR ("amount" = 0 AND "freeUnits" = 1)) AND
    NOT ("chargedAt" IS NOT NULL AND "releasedAt" IS NOT NULL) AND
    ("taskId" IS NOT NULL OR "chargedAt" IS NOT NULL OR "releasedAt" IS NOT NULL)
  );
ALTER TABLE public."TranslatedBook" ADD CONSTRAINT "TranslatedBook_web_search_disabled_check"
  CHECK ("webSearchTerms" = false);
ALTER TABLE public."TranslatedChapter" ADD CONSTRAINT "TranslatedChapter_metrics_check"
  CHECK ("wordCount" >= 0 AND ("inputTokens" IS NULL OR "inputTokens" >= 0) AND ("outputTokens" IS NULL OR "outputTokens" >= 0) AND octet_length("content") <= 5242880);
ALTER TABLE public."TranslationTask" ADD CONSTRAINT "TranslationTask_attempt_lease_check"
  CHECK (
    "retryCount" >= 0 AND "estimatedCost" >= 0 AND "nextSegmentIndex" BETWEEN 0 AND 2000 AND
    "accumulatedInputTokens" >= 0 AND "accumulatedOutputTokens" >= 0 AND
    private.is_valid_translation_checkpoint("translatedSegments") AND jsonb_array_length("translatedSegments") = "nextSegmentIndex" AND
    (("nextSegmentIndex" = 0 AND "checkpointProvider" IS NULL AND "checkpointModel" IS NULL AND ("lastBatchExecutionId" IS NULL OR "status" = 'FAILED')) OR
     ("nextSegmentIndex" > 0 AND "checkpointProvider" IS NOT NULL AND "checkpointModel" IS NOT NULL AND "lastBatchExecutionId" IS NOT NULL)) AND
    (("status" = 'TRANSLATING' AND "attemptId" IS NOT NULL AND "attemptStartedAt" IS NOT NULL AND "attemptExpiresAt" IS NOT NULL AND "lastHeartbeatAt" IS NOT NULL AND "attemptStartedAt" <= "lastHeartbeatAt" AND "lastHeartbeatAt" < "attemptExpiresAt") OR
     ("status" <> 'TRANSLATING' AND "attemptId" IS NULL AND "attemptStartedAt" IS NULL AND "attemptExpiresAt" IS NULL AND "lastHeartbeatAt" IS NULL)) AND
    (("batchExecutionId" IS NULL AND "batchExecutionExpiresAt" IS NULL AND "batchExecutionIndex" IS NULL) OR
     ("status" = 'TRANSLATING' AND "batchExecutionId" IS NOT NULL AND "batchExecutionExpiresAt" IS NOT NULL AND "batchExecutionIndex" = "nextSegmentIndex" AND "lastHeartbeatAt" <= "batchExecutionExpiresAt" AND "batchExecutionExpiresAt" < "attemptExpiresAt"))
  );

-- CreateIndex
CREATE UNIQUE INDEX "UserProfile_phone_key" ON "public"."UserProfile"("phone");

-- CreateIndex
CREATE INDEX "UserProfile_role_idx" ON "public"."UserProfile"("role");

-- CreateIndex
CREATE UNIQUE INDEX "AccountBalance_userId_key" ON "public"."AccountBalance"("userId");

-- CreateIndex
CREATE INDEX "BalanceLedger_userId_createdAt_idx" ON "public"."BalanceLedger"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "BalanceLedger_type_idx" ON "public"."BalanceLedger"("type");

CREATE UNIQUE INDEX "BalanceLedger_holdId_hold_key" ON "public"."BalanceLedger"("holdId") WHERE "holdId" IS NOT NULL AND "type" = 'HOLD';
CREATE UNIQUE INDEX "BalanceLedger_holdId_charge_key" ON "public"."BalanceLedger"("holdId") WHERE "holdId" IS NOT NULL AND "type" = 'CHARGE';
CREATE UNIQUE INDEX "BalanceLedger_holdId_release_key" ON "public"."BalanceLedger"("holdId") WHERE "holdId" IS NOT NULL AND "type" = 'RELEASE';

-- CreateIndex
CREATE UNIQUE INDEX "BalanceHold_taskId_attemptId_key" ON "public"."BalanceHold"("taskId", "attemptId");

-- CreateIndex
CREATE INDEX "BalanceHold_userId_createdAt_idx" ON "public"."BalanceHold"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "OriginalBook_userId_uploadedAt_idx" ON "public"."OriginalBook"("userId", "uploadedAt");

-- CreateIndex
CREATE INDEX "Chapter_originalBookId_status_idx" ON "public"."Chapter"("originalBookId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Chapter_originalBookId_index_key" ON "public"."Chapter"("originalBookId", "index");

-- CreateIndex
CREATE INDEX "TranslatedBook_userId_createdAt_idx" ON "public"."TranslatedBook"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "TranslatedBook_originalBookId_targetLanguage_idx" ON "public"."TranslatedBook"("originalBookId", "targetLanguage");

-- CreateIndex
CREATE UNIQUE INDEX "TranslatedBook_userId_originalBookId_targetLanguage_key" ON "public"."TranslatedBook"("userId", "originalBookId", "targetLanguage");

-- CreateIndex
CREATE INDEX "TranslatedChapter_translatedBookId_idx" ON "public"."TranslatedChapter"("translatedBookId");

-- CreateIndex
CREATE UNIQUE INDEX "TranslatedChapter_translatedBookId_chapterId_key" ON "public"."TranslatedChapter"("translatedBookId", "chapterId");

-- CreateIndex
CREATE INDEX "TranslationTask_translatedBookId_status_idx" ON "public"."TranslationTask"("translatedBookId", "status");

-- CreateIndex
CREATE INDEX "TranslationTask_status_attemptExpiresAt_idx" ON "public"."TranslationTask"("status", "attemptExpiresAt");

-- CreateIndex
CREATE INDEX "TranslationTask_chapterId_idx" ON "public"."TranslationTask"("chapterId");

-- CreateIndex
CREATE INDEX "TranslationTask_createdAt_idx" ON "public"."TranslationTask"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TranslationTask_translatedBookId_chapterId_key" ON "public"."TranslationTask"("translatedBookId", "chapterId");

CREATE INDEX "TranslationBatchReceipt_userId_createdAt_idx" ON "public"."TranslationBatchReceipt"("userId", "createdAt");
CREATE INDEX "TranslationBatchReceipt_taskId_createdAt_idx" ON "public"."TranslationBatchReceipt"("taskId", "createdAt");

CREATE INDEX "TranslationRetryReceipt_userId_createdAt_idx" ON "public"."TranslationRetryReceipt"("userId", "createdAt");
CREATE INDEX "TranslationRetryReceipt_taskId_createdAt_idx" ON "public"."TranslationRetryReceipt"("taskId", "createdAt");

-- CreateIndex
CREATE INDEX "Term_originalBookId_type_idx" ON "public"."Term"("originalBookId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "Term_originalBookId_translatedBookId_sourceText_key" ON "public"."Term"("originalBookId", "translatedBookId", "sourceText");

-- CreateIndex
CREATE INDEX "VocabularyItem_userId_createdAt_idx" ON "public"."VocabularyItem"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "VocabularyItem_originalBookId_idx" ON "public"."VocabularyItem"("originalBookId");
CREATE UNIQUE INDEX "VocabularyItem_userId_originalBookId_term_key" ON "public"."VocabularyItem"("userId", "originalBookId", "term");

-- CreateIndex
CREATE INDEX "SentenceItem_userId_createdAt_idx" ON "public"."SentenceItem"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "SentenceItem_originalBookId_idx" ON "public"."SentenceItem"("originalBookId");
CREATE UNIQUE INDEX "SentenceItem_userId_originalBookId_originalText_key" ON "public"."SentenceItem"("userId", "originalBookId", "originalText");

-- CreateIndex
CREATE INDEX "AiRateLimit_userId_updatedAt_idx" ON "public"."AiRateLimit"("userId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AiRateLimit_userId_scope_windowKey_key" ON "public"."AiRateLimit"("userId", "scope", "windowKey");

-- CreateIndex
CREATE INDEX "StudyNote_userId_updatedAt_idx" ON "public"."StudyNote"("userId", "updatedAt");
CREATE INDEX "StudyNote_originalBookId_idx" ON "public"."StudyNote"("originalBookId");
CREATE INDEX "StudyNote_chapterId_idx" ON "public"."StudyNote"("chapterId");
CREATE INDEX "StudyNote_translatedBookId_idx" ON "public"."StudyNote"("translatedBookId");
ALTER TABLE "public"."StudyNote" ADD CONSTRAINT "StudyNote_target_shape_check" CHECK (
  ("targetType" = 'FREEFORM' AND "originalBookId" IS NULL AND "chapterId" IS NULL AND "translatedBookId" IS NULL) OR
  ("targetType" = 'ORIGINAL_BOOK' AND "originalBookId" IS NOT NULL AND "chapterId" IS NULL AND "translatedBookId" IS NULL) OR
  ("targetType" = 'CHAPTER' AND "originalBookId" IS NOT NULL AND "chapterId" IS NOT NULL AND "translatedBookId" IS NULL) OR
  ("targetType" = 'TRANSLATED_BOOK' AND "originalBookId" IS NULL AND "chapterId" IS NULL AND "translatedBookId" IS NOT NULL)
);

-- CreateIndex
CREATE INDEX "ReadingState_userId_updatedAt_idx" ON "public"."ReadingState"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "ReadingState_chapterId_idx" ON "public"."ReadingState"("chapterId");

-- CreateIndex
CREATE INDEX "ReadingState_userId_originalBookId_idx" ON "public"."ReadingState"("userId", "originalBookId");

-- CreateIndex
CREATE INDEX "ReadingState_userId_translatedBookId_idx" ON "public"."ReadingState"("userId", "translatedBookId");

-- Nullable book references need partial unique indexes; a regular composite
-- unique index treats NULL values as distinct and would allow duplicates.
ALTER TABLE "public"."ReadingState" ADD CONSTRAINT "ReadingState_exactly_one_book_check" CHECK (("originalBookId" IS NOT NULL) <> ("translatedBookId" IS NOT NULL));
ALTER TABLE "public"."ReadingState" ADD CONSTRAINT "ReadingState_paragraph_index_nonnegative_check" CHECK ("paragraphIndex" >= 0);
ALTER TABLE "public"."ReadingState" ADD CONSTRAINT "ReadingState_version_nonnegative_check" CHECK ("version" >= 0);
CREATE UNIQUE INDEX "ReadingState_user_original_book_key" ON "public"."ReadingState"("userId", "originalBookId") WHERE "originalBookId" IS NOT NULL;
CREATE UNIQUE INDEX "ReadingState_user_translated_book_key" ON "public"."ReadingState"("userId", "translatedBookId") WHERE "translatedBookId" IS NOT NULL;

-- CreateIndex
CREATE INDEX "StorageCleanupTask_userId_nextAttemptAt_idx" ON "public"."StorageCleanupTask"("userId", "nextAttemptAt");

-- CreateIndex
CREATE UNIQUE INDEX "StorageCleanupTask_bucket_objectPath_key" ON "public"."StorageCleanupTask"("bucket", "objectPath");

CREATE INDEX "ImportBatch_userId_manifestId_idx" ON "public"."ImportBatch"("userId", "manifestId");
CREATE INDEX "ImportBatch_userId_completedAt_idx" ON "public"."ImportBatch"("userId", "completedAt");
CREATE UNIQUE INDEX "ImportItem_userId_kind_sourceId_key" ON "public"."ImportItem"("userId", "kind", "sourceId");
CREATE INDEX "ImportItem_userId_createdAt_idx" ON "public"."ImportItem"("userId", "createdAt");
CREATE INDEX "ImportItem_kind_targetId_idx" ON "public"."ImportItem"("kind", "targetId");

-- AddForeignKey
ALTER TABLE "public"."AccountBalance" ADD CONSTRAINT "AccountBalance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BalanceLedger" ADD CONSTRAINT "BalanceLedger_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BalanceLedger" ADD CONSTRAINT "BalanceLedger_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "public"."TranslationTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BalanceLedger" ADD CONSTRAINT "BalanceLedger_holdId_fkey" FOREIGN KEY ("holdId") REFERENCES "public"."BalanceHold"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BalanceHold" ADD CONSTRAINT "BalanceHold_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BalanceHold" ADD CONSTRAINT "BalanceHold_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "public"."TranslationTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "public"."TranslationBatchReceipt" ADD CONSTRAINT "TranslationBatchReceipt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."UserProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."TranslationBatchReceipt" ADD CONSTRAINT "TranslationBatchReceipt_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "public"."TranslationTask"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."TranslationRetryReceipt" ADD CONSTRAINT "TranslationRetryReceipt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."UserProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."TranslationRetryReceipt" ADD CONSTRAINT "TranslationRetryReceipt_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "public"."TranslationTask"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."OriginalBook" ADD CONSTRAINT "OriginalBook_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Chapter" ADD CONSTRAINT "Chapter_originalBookId_fkey" FOREIGN KEY ("originalBookId") REFERENCES "public"."OriginalBook"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TranslatedBook" ADD CONSTRAINT "TranslatedBook_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TranslatedBook" ADD CONSTRAINT "TranslatedBook_originalBookId_fkey" FOREIGN KEY ("originalBookId") REFERENCES "public"."OriginalBook"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TranslatedChapter" ADD CONSTRAINT "TranslatedChapter_translatedBookId_fkey" FOREIGN KEY ("translatedBookId") REFERENCES "public"."TranslatedBook"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TranslatedChapter" ADD CONSTRAINT "TranslatedChapter_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "public"."Chapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TranslationTask" ADD CONSTRAINT "TranslationTask_translatedBookId_fkey" FOREIGN KEY ("translatedBookId") REFERENCES "public"."TranslatedBook"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TranslationTask" ADD CONSTRAINT "TranslationTask_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "public"."Chapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Term" ADD CONSTRAINT "Term_originalBookId_fkey" FOREIGN KEY ("originalBookId") REFERENCES "public"."OriginalBook"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Term" ADD CONSTRAINT "Term_translatedBookId_fkey" FOREIGN KEY ("translatedBookId") REFERENCES "public"."TranslatedBook"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."VocabularyItem" ADD CONSTRAINT "VocabularyItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."VocabularyItem" ADD CONSTRAINT "VocabularyItem_originalBookId_fkey" FOREIGN KEY ("originalBookId") REFERENCES "public"."OriginalBook"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."VocabularyItem" ADD CONSTRAINT "VocabularyItem_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "public"."Chapter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SentenceItem" ADD CONSTRAINT "SentenceItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SentenceItem" ADD CONSTRAINT "SentenceItem_originalBookId_fkey" FOREIGN KEY ("originalBookId") REFERENCES "public"."OriginalBook"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SentenceItem" ADD CONSTRAINT "SentenceItem_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "public"."Chapter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AiRateLimit" ADD CONSTRAINT "AiRateLimit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StudyNote" ADD CONSTRAINT "StudyNote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."StudyNote" ADD CONSTRAINT "StudyNote_originalBookId_fkey" FOREIGN KEY ("originalBookId") REFERENCES "public"."OriginalBook"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."StudyNote" ADD CONSTRAINT "StudyNote_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "public"."Chapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."StudyNote" ADD CONSTRAINT "StudyNote_translatedBookId_fkey" FOREIGN KEY ("translatedBookId") REFERENCES "public"."TranslatedBook"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ReadingState" ADD CONSTRAINT "ReadingState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ReadingState" ADD CONSTRAINT "ReadingState_originalBookId_fkey" FOREIGN KEY ("originalBookId") REFERENCES "public"."OriginalBook"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ReadingState" ADD CONSTRAINT "ReadingState_translatedBookId_fkey" FOREIGN KEY ("translatedBookId") REFERENCES "public"."TranslatedBook"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ReadingState" ADD CONSTRAINT "ReadingState_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "public"."Chapter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StorageCleanupTask" ADD CONSTRAINT "StorageCleanupTask_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."UserProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."ImportBatch" ADD CONSTRAINT "ImportBatch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."UserProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."ImportItem" ADD CONSTRAINT "ImportItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."UserProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Bind application identities to Supabase Auth. A profile cannot outlive its
-- auth identity, and application code cannot create an orphaned profile.
ALTER TABLE "public"."UserProfile" ADD CONSTRAINT "UserProfile_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;

-- Auth provisioning is deliberately phone-only. Missing phone identities fail
-- closed instead of creating a partially authorized application account.
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.phone IS NULL OR btrim(NEW.phone) = '' THEN
    RAISE EXCEPTION 'A verified phone number is required for an application account.';
  END IF;

  INSERT INTO public."UserProfile"
    ("id", "phone", "role", "createdAt", "updatedAt", "lastLoginAt")
  VALUES
    (NEW.id, NEW.phone, 'USER'::public."UserRole", now(), now(), now())
  ON CONFLICT ("id") DO UPDATE
    SET "phone" = EXCLUDED."phone",
        "updatedAt" = now(),
        "lastLoginAt" = now();

  INSERT INTO public."AccountBalance"
    ("userId", "id", "available", "frozen", "freeChapters", "createdAt", "updatedAt")
  VALUES
    (NEW.id, gen_random_uuid(), 0, 0, 5, now(), now())
  ON CONFLICT ("userId") DO NOTHING;

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.handle_new_auth_user() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.handle_new_auth_user() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT OR UPDATE OF phone ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- Column grants are the primary restriction; this trigger is defense in depth
-- for clients that attempt to change identity-bearing columns directly.
CREATE OR REPLACE FUNCTION public.protect_user_profile_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() = OLD."id" AND (
    NEW."id" IS DISTINCT FROM OLD."id" OR
    NEW."phone" IS DISTINCT FROM OLD."phone" OR
    NEW."role" IS DISTINCT FROM OLD."role"
  ) THEN
    RAISE EXCEPTION 'Profile identity and role are managed by the server.';
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.protect_user_profile_identity() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.protect_user_profile_identity() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS protect_user_profile_identity ON public."UserProfile";
CREATE TRIGGER protect_user_profile_identity
  BEFORE UPDATE ON public."UserProfile"
  FOR EACH ROW EXECUTE FUNCTION public.protect_user_profile_identity();

-- RLS only controls who may address a row. These triggers independently
-- enforce that all related rows describe the same user's same book, including
-- writes made by trusted server roles that bypass RLS.
CREATE OR REPLACE FUNCTION public.enforce_translated_chapter_integrity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM 1 FROM public."TranslatedBook" tb
  JOIN public."Chapter" c ON c."id" = NEW."chapterId"
  WHERE tb."id" = NEW."translatedBookId"
    AND tb."originalBookId" = c."originalBookId";
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Translated chapter must reference a chapter from its translated book.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_translation_task_integrity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM 1 FROM public."TranslatedBook" tb
  JOIN public."Chapter" c ON c."id" = NEW."chapterId"
  WHERE tb."id" = NEW."translatedBookId"
    AND tb."originalBookId" = c."originalBookId";
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Translation task must reference a chapter from its translated book.';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW."status" IS DISTINCT FROM OLD."status" AND NOT (
    (OLD."status" = 'PENDING' AND NEW."status" IN ('TRANSLATING', 'CANCELED')) OR
    (OLD."status" = 'TRANSLATING' AND NEW."status" IN ('COMPLETED', 'FAILED', 'CANCELED')) OR
    (OLD."status" = 'FAILED' AND NEW."status" IN ('PENDING', 'CANCELED')) OR
    (OLD."status" = 'EXTRACTING_TERMS' AND NEW."status" IN ('QUEUED', 'FAILED', 'CANCELED')) OR
    (OLD."status" = 'QUEUED' AND NEW."status" IN ('TRANSLATING', 'FAILED', 'CANCELED')) OR
    (OLD."status" = 'QUALITY_CHECKING' AND NEW."status" IN ('COMPLETED', 'NEEDS_REVIEW', 'FAILED')) OR
    (OLD."status" = 'NEEDS_REVIEW' AND NEW."status" IN ('PENDING', 'CANCELED'))
  ) THEN
    RAISE EXCEPTION 'Illegal translation task status transition.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_term_integrity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW."translatedBookId" IS NOT NULL THEN
    PERFORM 1 FROM public."TranslatedBook" tb
    WHERE tb."id" = NEW."translatedBookId"
      AND tb."originalBookId" = NEW."originalBookId";
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Term translated book must match its original book.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_vocabulary_item_integrity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM 1 FROM public."OriginalBook" b
  WHERE b."id" = NEW."originalBookId" AND b."userId" = NEW."userId"
    AND (NEW."chapterId" IS NULL OR EXISTS (
      SELECT 1 FROM public."Chapter" c
      WHERE c."id" = NEW."chapterId" AND c."originalBookId" = NEW."originalBookId"
    ));
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vocabulary item must reference the user''s own book and a matching chapter.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_sentence_item_integrity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM 1 FROM public."OriginalBook" b
  WHERE b."id" = NEW."originalBookId" AND b."userId" = NEW."userId"
    AND (NEW."chapterId" IS NULL OR EXISTS (
      SELECT 1 FROM public."Chapter" c
      WHERE c."id" = NEW."chapterId" AND c."originalBookId" = NEW."originalBookId"
    ));
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sentence item must reference the user''s own book and a matching chapter.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_reading_state_integrity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW."originalBookId" IS NOT NULL AND NEW."translatedBookId" IS NULL THEN
    PERFORM 1 FROM public."OriginalBook" b
    WHERE b."id" = NEW."originalBookId" AND b."userId" = NEW."userId"
      AND (NEW."chapterId" IS NULL OR EXISTS (
        SELECT 1 FROM public."Chapter" c
        WHERE c."id" = NEW."chapterId" AND c."originalBookId" = NEW."originalBookId"
      ));
  ELSIF NEW."translatedBookId" IS NOT NULL AND NEW."originalBookId" IS NULL THEN
    PERFORM 1 FROM public."TranslatedBook" tb
    WHERE tb."id" = NEW."translatedBookId" AND tb."userId" = NEW."userId"
      AND (NEW."chapterId" IS NULL OR EXISTS (
        SELECT 1 FROM public."Chapter" c
        WHERE c."id" = NEW."chapterId" AND c."originalBookId" = tb."originalBookId"
      ));
  ELSE
    RAISE EXCEPTION 'Reading state must reference exactly one book kind.';
  END IF;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reading state must reference the user''s own book and a matching chapter.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_study_note_integrity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW."targetType" = 'FREEFORM' THEN
    RETURN NEW;
  ELSIF NEW."targetType" = 'ORIGINAL_BOOK' THEN
    PERFORM 1 FROM public."OriginalBook" b
      WHERE b."id" = NEW."originalBookId" AND b."userId" = NEW."userId";
  ELSIF NEW."targetType" = 'CHAPTER' THEN
    PERFORM 1 FROM public."OriginalBook" b
      JOIN public."Chapter" c ON c."originalBookId" = b."id"
      WHERE b."id" = NEW."originalBookId" AND b."userId" = NEW."userId" AND c."id" = NEW."chapterId";
  ELSIF NEW."targetType" = 'TRANSLATED_BOOK' THEN
    PERFORM 1 FROM public."TranslatedBook" b
      WHERE b."id" = NEW."translatedBookId" AND b."userId" = NEW."userId";
  END IF;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Study note target must belong to the same user.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_import_item_integrity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW."kind" = 'VOCABULARY' THEN
    PERFORM 1 FROM public."VocabularyItem" i WHERE i."id" = NEW."targetId" AND i."userId" = NEW."userId";
  ELSIF NEW."kind" = 'SENTENCE' THEN
    PERFORM 1 FROM public."SentenceItem" i WHERE i."id" = NEW."targetId" AND i."userId" = NEW."userId";
  ELSIF NEW."kind" = 'NOTE' THEN
    PERFORM 1 FROM public."StudyNote" i WHERE i."id" = NEW."targetId" AND i."userId" = NEW."userId";
  ELSIF NEW."kind" = 'READING' THEN
    PERFORM 1 FROM public."ReadingState" i WHERE i."id" = NEW."targetId" AND i."userId" = NEW."userId";
  END IF;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Import receipt target must belong to the same user and kind.';
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.enforce_translated_chapter_integrity() OWNER TO postgres;
ALTER FUNCTION public.enforce_translation_task_integrity() OWNER TO postgres;
ALTER FUNCTION public.enforce_term_integrity() OWNER TO postgres;
ALTER FUNCTION public.enforce_vocabulary_item_integrity() OWNER TO postgres;
ALTER FUNCTION public.enforce_sentence_item_integrity() OWNER TO postgres;
ALTER FUNCTION public.enforce_reading_state_integrity() OWNER TO postgres;
ALTER FUNCTION public.enforce_study_note_integrity() OWNER TO postgres;
ALTER FUNCTION public.enforce_import_item_integrity() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.enforce_translated_chapter_integrity() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_translation_task_integrity() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_term_integrity() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_vocabulary_item_integrity() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_sentence_item_integrity() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_reading_state_integrity() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_study_note_integrity() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_import_item_integrity() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER enforce_TranslatedChapter_integrity
  BEFORE INSERT OR UPDATE ON public."TranslatedChapter"
  FOR EACH ROW EXECUTE FUNCTION public.enforce_translated_chapter_integrity();
CREATE TRIGGER enforce_TranslationTask_integrity
  BEFORE INSERT OR UPDATE ON public."TranslationTask"
  FOR EACH ROW EXECUTE FUNCTION public.enforce_translation_task_integrity();
CREATE TRIGGER enforce_Term_integrity
  BEFORE INSERT OR UPDATE ON public."Term"
  FOR EACH ROW EXECUTE FUNCTION public.enforce_term_integrity();
CREATE TRIGGER enforce_VocabularyItem_integrity
  BEFORE INSERT OR UPDATE ON public."VocabularyItem"
  FOR EACH ROW EXECUTE FUNCTION public.enforce_vocabulary_item_integrity();
CREATE TRIGGER enforce_SentenceItem_integrity
  BEFORE INSERT OR UPDATE ON public."SentenceItem"
  FOR EACH ROW EXECUTE FUNCTION public.enforce_sentence_item_integrity();
CREATE TRIGGER enforce_ReadingState_integrity
  BEFORE INSERT OR UPDATE ON public."ReadingState"
  FOR EACH ROW EXECUTE FUNCTION public.enforce_reading_state_integrity();
CREATE TRIGGER enforce_StudyNote_integrity
  BEFORE INSERT OR UPDATE ON public."StudyNote"
  FOR EACH ROW EXECUTE FUNCTION public.enforce_study_note_integrity();
CREATE TRIGGER enforce_ImportItem_integrity
  BEFORE INSERT OR UPDATE ON public."ImportItem"
  FOR EACH ROW EXECUTE FUNCTION public.enforce_import_item_integrity();

CREATE OR REPLACE FUNCTION public.enforce_translated_book_integrity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM 1 FROM public."OriginalBook" b
  WHERE b."id" = NEW."originalBookId" AND b."userId" = NEW."userId";
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Translated book must reference the user''s own original book.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_balance_hold_integrity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW."taskId" IS NOT NULL THEN
    IF NEW."chargedAt" IS NULL AND NEW."releasedAt" IS NULL THEN
      PERFORM 1 FROM public."TranslationTask" t
      JOIN public."TranslatedBook" tb ON tb."id" = t."translatedBookId"
      WHERE t."id" = NEW."taskId" AND tb."userId" = NEW."userId"
        AND t."status" = 'TRANSLATING' AND t."attemptId" = NEW."attemptId";
    ELSE
      PERFORM 1 FROM public."TranslationTask" t
      JOIN public."TranslatedBook" tb ON tb."id" = t."translatedBookId"
      WHERE t."id" = NEW."taskId" AND tb."userId" = NEW."userId";
    END IF;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Balance hold must belong to the same user and active attempt.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_balance_ledger_integrity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW."type" IN ('HOLD', 'CHARGE', 'RELEASE') AND NEW."holdId" IS NULL THEN
    RAISE EXCEPTION 'Hold lifecycle ledgers require a hold.';
  END IF;
  IF NEW."type" NOT IN ('HOLD', 'CHARGE', 'RELEASE') AND NEW."holdId" IS NOT NULL THEN
    RAISE EXCEPTION 'Non-hold ledgers cannot reference a hold.';
  END IF;
  IF NEW."taskId" IS NOT NULL THEN
    PERFORM 1 FROM public."TranslationTask" t
    JOIN public."TranslatedBook" tb ON tb."id" = t."translatedBookId"
    WHERE t."id" = NEW."taskId" AND tb."userId" = NEW."userId";
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Balance ledger task must belong to the same user.';
    END IF;
  END IF;
  IF NEW."holdId" IS NOT NULL THEN
    PERFORM 1 FROM public."BalanceHold" h
    WHERE h."id" = NEW."holdId"
      AND h."userId" = NEW."userId"
      AND h."taskId" = NEW."taskId"
      AND h."amount" = NEW."amount"
      AND (
        (NEW."type" = 'HOLD' AND h."chargedAt" IS NULL AND h."releasedAt" IS NULL) OR
        (NEW."type" = 'CHARGE' AND h."chargedAt" IS NOT NULL AND h."releasedAt" IS NULL) OR
        (NEW."type" = 'RELEASE' AND h."releasedAt" IS NOT NULL AND h."chargedAt" IS NULL)
      );
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Balance ledger must match the hold owner, task, amount, and terminal state.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.enforce_translated_book_integrity() OWNER TO postgres;
ALTER FUNCTION public.enforce_balance_hold_integrity() OWNER TO postgres;
ALTER FUNCTION public.enforce_balance_ledger_integrity() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.enforce_translated_book_integrity() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_balance_hold_integrity() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_balance_ledger_integrity() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER enforce_TranslatedBook_integrity
  BEFORE INSERT OR UPDATE ON public."TranslatedBook"
  FOR EACH ROW EXECUTE FUNCTION public.enforce_translated_book_integrity();
CREATE TRIGGER enforce_BalanceHold_integrity
  BEFORE INSERT OR UPDATE ON public."BalanceHold"
  FOR EACH ROW EXECUTE FUNCTION public.enforce_balance_hold_integrity();
CREATE TRIGGER enforce_BalanceLedger_integrity
  BEFORE INSERT OR UPDATE ON public."BalanceLedger"
  FOR EACH ROW EXECUTE FUNCTION public.enforce_balance_ledger_integrity();

CREATE OR REPLACE FUNCTION public.enforce_translation_batch_receipt_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public."TranslationTask" task
    JOIN public."TranslatedBook" tb ON tb."id" = task."translatedBookId"
    WHERE task."id" = NEW."taskId"
      AND tb."userId" = NEW."userId"
  ) THEN
    RAISE EXCEPTION 'Translation batch receipt must belong to the task owner.';
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.enforce_translation_batch_receipt_integrity() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.enforce_translation_batch_receipt_integrity() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER enforce_TranslationBatchReceipt_integrity
  BEFORE INSERT ON public."TranslationBatchReceipt"
  FOR EACH ROW EXECUTE FUNCTION public.enforce_translation_batch_receipt_integrity();

CREATE OR REPLACE FUNCTION public.prevent_translation_batch_receipt_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'Translation batch receipts are immutable.';
END;
$$;

ALTER FUNCTION public.prevent_translation_batch_receipt_mutation() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.prevent_translation_batch_receipt_mutation() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER prevent_translation_batch_receipt_mutation
  BEFORE UPDATE OR DELETE ON public."TranslationBatchReceipt"
  FOR EACH ROW EXECUTE FUNCTION public.prevent_translation_batch_receipt_mutation();

CREATE OR REPLACE FUNCTION public.prevent_translation_batch_receipt_truncate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'Translation batch receipts cannot be truncated.';
END;
$$;

ALTER FUNCTION public.prevent_translation_batch_receipt_truncate() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.prevent_translation_batch_receipt_truncate() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER prevent_translation_batch_receipt_truncate
  BEFORE TRUNCATE ON public."TranslationBatchReceipt"
  FOR EACH STATEMENT EXECUTE FUNCTION public.prevent_translation_batch_receipt_truncate();

CREATE OR REPLACE FUNCTION public.enforce_translation_retry_receipt_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public."TranslationTask" task
    JOIN public."TranslatedBook" tb ON tb."id" = task."translatedBookId"
    WHERE task."id" = NEW."taskId"
      AND tb."userId" = NEW."userId"
  ) THEN
    RAISE EXCEPTION 'Translation retry receipt must belong to the task owner.';
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.enforce_translation_retry_receipt_integrity() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.enforce_translation_retry_receipt_integrity() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER enforce_TranslationRetryReceipt_integrity
  BEFORE INSERT ON public."TranslationRetryReceipt"
  FOR EACH ROW EXECUTE FUNCTION public.enforce_translation_retry_receipt_integrity();

CREATE OR REPLACE FUNCTION public.prevent_translation_retry_receipt_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'Translation retry receipts are immutable.';
END;
$$;

ALTER FUNCTION public.prevent_translation_retry_receipt_mutation() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.prevent_translation_retry_receipt_mutation() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER prevent_translation_retry_receipt_mutation
  BEFORE UPDATE OR DELETE ON public."TranslationRetryReceipt"
  FOR EACH ROW EXECUTE FUNCTION public.prevent_translation_retry_receipt_mutation();

CREATE OR REPLACE FUNCTION public.prevent_translation_retry_receipt_truncate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'Translation retry receipts cannot be truncated.';
END;
$$;

ALTER FUNCTION public.prevent_translation_retry_receipt_truncate() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.prevent_translation_retry_receipt_truncate() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER prevent_translation_retry_receipt_truncate
  BEFORE TRUNCATE ON public."TranslationRetryReceipt"
  FOR EACH STATEMENT EXECUTE FUNCTION public.prevent_translation_retry_receipt_truncate();

-- Identity and association columns are creation-time facts. Non-nullable
-- identities are immutable; nullable FKs using ON DELETE SET NULL are
-- write-once/detachable (non-null to null only). This closes the
-- parent-update/child-insert race while preserving FK deletion semantics.
CREATE OR REPLACE FUNCTION public.prevent_immutable_association_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  column_name text;
  old_value jsonb;
  new_value jsonb;
  detachable boolean;
BEGIN
  FOREACH column_name IN ARRAY TG_ARGV LOOP
    old_value := to_jsonb(OLD) -> column_name;
    new_value := to_jsonb(NEW) -> column_name;
    detachable := (TG_TABLE_NAME, column_name) IN (
      ('BalanceLedger', 'taskId'),
      ('BalanceLedger', 'holdId'),
      ('BalanceHold', 'taskId'),
      ('VocabularyItem', 'chapterId'),
      ('SentenceItem', 'chapterId')
    );

    IF old_value IS DISTINCT FROM new_value AND NOT (
      detachable AND old_value <> 'null'::jsonb AND new_value = 'null'::jsonb
    ) THEN
      RAISE EXCEPTION 'Column % is write-once after insert on table %; only configured nullable foreign keys may detach to null.', column_name, TG_TABLE_NAME;
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.prevent_immutable_association_update() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.prevent_immutable_association_update() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER prevent_AccountBalance_identity_change
  BEFORE UPDATE OF "userId" ON public."AccountBalance"
  FOR EACH ROW EXECUTE FUNCTION public.prevent_immutable_association_update('userId');
CREATE TRIGGER prevent_BalanceLedger_identity_change
  BEFORE UPDATE OF "userId", "taskId", "holdId" ON public."BalanceLedger"
  FOR EACH ROW EXECUTE FUNCTION public.prevent_immutable_association_update('userId', 'taskId', 'holdId');
CREATE TRIGGER prevent_BalanceHold_identity_change
  BEFORE UPDATE OF "userId", "taskId", "attemptId" ON public."BalanceHold"
  FOR EACH ROW EXECUTE FUNCTION public.prevent_immutable_association_update('userId', 'taskId', 'attemptId');
CREATE TRIGGER prevent_OriginalBook_identity_change
  BEFORE UPDATE OF "userId" ON public."OriginalBook"
  FOR EACH ROW EXECUTE FUNCTION public.prevent_immutable_association_update('userId');
CREATE TRIGGER prevent_Chapter_identity_change
  BEFORE UPDATE OF "originalBookId" ON public."Chapter"
  FOR EACH ROW EXECUTE FUNCTION public.prevent_immutable_association_update('originalBookId');
CREATE TRIGGER prevent_TranslatedBook_identity_change
  BEFORE UPDATE OF "userId", "originalBookId" ON public."TranslatedBook"
  FOR EACH ROW EXECUTE FUNCTION public.prevent_immutable_association_update('userId', 'originalBookId');
CREATE TRIGGER prevent_TranslatedChapter_identity_change
  BEFORE UPDATE OF "translatedBookId", "chapterId" ON public."TranslatedChapter"
  FOR EACH ROW EXECUTE FUNCTION public.prevent_immutable_association_update('translatedBookId', 'chapterId');
CREATE TRIGGER prevent_TranslationTask_identity_change
  BEFORE UPDATE OF "translatedBookId", "chapterId" ON public."TranslationTask"
  FOR EACH ROW EXECUTE FUNCTION public.prevent_immutable_association_update('translatedBookId', 'chapterId');
CREATE TRIGGER prevent_TranslationBatchReceipt_identity_change
  BEFORE UPDATE OF "userId", "taskId", "attemptId" ON public."TranslationBatchReceipt"
  FOR EACH ROW EXECUTE FUNCTION public.prevent_immutable_association_update('userId', 'taskId', 'attemptId');
CREATE TRIGGER prevent_TranslationRetryReceipt_identity_change
  BEFORE UPDATE OF "userId", "taskId" ON public."TranslationRetryReceipt"
  FOR EACH ROW EXECUTE FUNCTION public.prevent_immutable_association_update('userId', 'taskId');
CREATE TRIGGER prevent_Term_identity_change
  BEFORE UPDATE OF "originalBookId", "translatedBookId" ON public."Term"
  FOR EACH ROW EXECUTE FUNCTION public.prevent_immutable_association_update('originalBookId', 'translatedBookId');
CREATE TRIGGER prevent_VocabularyItem_identity_change
  BEFORE UPDATE OF "userId", "originalBookId", "chapterId" ON public."VocabularyItem"
  FOR EACH ROW EXECUTE FUNCTION public.prevent_immutable_association_update('userId', 'originalBookId', 'chapterId');
CREATE TRIGGER prevent_SentenceItem_identity_change
  BEFORE UPDATE OF "userId", "originalBookId", "chapterId" ON public."SentenceItem"
  FOR EACH ROW EXECUTE FUNCTION public.prevent_immutable_association_update('userId', 'originalBookId', 'chapterId');
CREATE TRIGGER prevent_AiRateLimit_identity_change
  BEFORE UPDATE OF "userId", "scope", "windowKey" ON public."AiRateLimit"
  FOR EACH ROW EXECUTE FUNCTION public.prevent_immutable_association_update('userId', 'scope', 'windowKey');
CREATE TRIGGER prevent_StudyNote_identity_change
  BEFORE UPDATE OF "userId", "targetType", "originalBookId", "chapterId", "translatedBookId" ON public."StudyNote"
  FOR EACH ROW EXECUTE FUNCTION public.prevent_immutable_association_update('userId', 'targetType', 'originalBookId', 'chapterId', 'translatedBookId');
CREATE TRIGGER prevent_ReadingState_identity_change
  BEFORE UPDATE OF "userId", "originalBookId", "translatedBookId" ON public."ReadingState"
  FOR EACH ROW EXECUTE FUNCTION public.prevent_immutable_association_update('userId', 'originalBookId', 'translatedBookId');
CREATE TRIGGER prevent_StorageCleanupTask_identity_change
  BEFORE UPDATE OF "userId", "bucket", "objectPath" ON public."StorageCleanupTask"
  FOR EACH ROW EXECUTE FUNCTION public.prevent_immutable_association_update('userId', 'bucket', 'objectPath');

-- Import evidence is immutable while its target exists. DELETE is accepted
-- only while a nested target-lifecycle or UserProfile account-erasure trigger
-- holds an exact transaction-local authorization marker; browser and ordinary
-- service-role receipt deletes fail closed.
CREATE OR REPLACE FUNCTION public.prevent_import_receipt_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION 'Import receipts are immutable.';
END;
$$;
ALTER FUNCTION public.prevent_import_receipt_update() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.prevent_import_receipt_update() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER prevent_ImportBatch_update
  BEFORE UPDATE ON public."ImportBatch"
  FOR EACH ROW EXECUTE FUNCTION public.prevent_import_receipt_update();
CREATE TRIGGER prevent_ImportItem_update
  BEFORE UPDATE ON public."ImportItem"
  FOR EACH ROW EXECUTE FUNCTION public.prevent_import_receipt_update();

CREATE OR REPLACE FUNCTION public.prevent_import_receipt_truncate()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION 'Import receipt tables cannot be truncated.';
END;
$$;
ALTER FUNCTION public.prevent_import_receipt_truncate() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.prevent_import_receipt_truncate() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER prevent_ImportBatch_truncate BEFORE TRUNCATE ON public."ImportBatch"
  FOR EACH STATEMENT EXECUTE FUNCTION public.prevent_import_receipt_truncate();
CREATE TRIGGER prevent_ImportItem_truncate BEFORE TRUNCATE ON public."ImportItem"
  FOR EACH STATEMENT EXECUTE FUNCTION public.prevent_import_receipt_truncate();

CREATE OR REPLACE FUNCTION public.prevent_import_batch_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF pg_catalog.pg_trigger_depth() < 2 OR
    pg_catalog.current_setting('private.import_receipt_delete_user', true) IS DISTINCT FROM OLD."userId"::text THEN
    RAISE EXCEPTION 'Import batch receipts may only be deleted during controlled account cleanup.';
  END IF;
  RETURN OLD;
END;
$$;
ALTER FUNCTION public.prevent_import_batch_delete() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.prevent_import_batch_delete() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.prevent_import_item_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF pg_catalog.pg_trigger_depth() < 2 OR NOT (
    pg_catalog.current_setting('private.import_receipt_delete_user', true) IS NOT DISTINCT FROM OLD."userId"::text OR
    pg_catalog.current_setting('private.import_receipt_delete_target', true) IS NOT DISTINCT FROM
      OLD."userId"::text || ':' || OLD."kind"::text || ':' || OLD."targetId"::text
  ) THEN
    RAISE EXCEPTION 'Import receipts may only be deleted during controlled target or account cleanup.';
  END IF;
  RETURN OLD;
END;
$$;
ALTER FUNCTION public.prevent_import_item_delete() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.prevent_import_item_delete() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER prevent_ImportBatch_delete BEFORE DELETE ON public."ImportBatch"
  FOR EACH ROW EXECUTE FUNCTION public.prevent_import_batch_delete();
CREATE TRIGGER prevent_ImportItem_delete BEFORE DELETE ON public."ImportItem"
  FOR EACH ROW EXECUTE FUNCTION public.prevent_import_item_delete();

-- Imported targets may be removed by normal owner-scoped study operations or
-- by a parent-book cascade. The target BEFORE DELETE trigger opens a
-- transaction-local, exact user/kind/target capability for only the matching
-- ImportItem. Direct service-role receipt deletion remains rejected.
CREATE OR REPLACE FUNCTION private.delete_import_receipts_for_target(
  target_user_id uuid,
  target_kind public."ImportKind",
  target_id uuid
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM pg_catalog.set_config(
    'private.import_receipt_delete_target',
    target_user_id::text || ':' || target_kind::text || ':' || target_id::text,
    true
  );
  DELETE FROM public."ImportItem"
    WHERE "userId" = target_user_id
      AND "kind" = target_kind
      AND "targetId" = target_id;
  PERFORM pg_catalog.set_config('private.import_receipt_delete_target', '', true);
END;
$$;
ALTER FUNCTION private.delete_import_receipts_for_target(uuid, public."ImportKind", uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION private.delete_import_receipts_for_target(uuid, public."ImportKind", uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.delete_import_receipt_before_target_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM private.delete_import_receipts_for_target(OLD."userId", TG_ARGV[0]::public."ImportKind", OLD."id");
  RETURN OLD;
END;
$$;
ALTER FUNCTION public.delete_import_receipt_before_target_delete() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.delete_import_receipt_before_target_delete() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER delete_VocabularyItem_import_receipt
  BEFORE DELETE ON public."VocabularyItem"
  FOR EACH ROW EXECUTE FUNCTION public.delete_import_receipt_before_target_delete('VOCABULARY');
CREATE TRIGGER delete_SentenceItem_import_receipt
  BEFORE DELETE ON public."SentenceItem"
  FOR EACH ROW EXECUTE FUNCTION public.delete_import_receipt_before_target_delete('SENTENCE');
CREATE TRIGGER delete_StudyNote_import_receipt
  BEFORE DELETE ON public."StudyNote"
  FOR EACH ROW EXECUTE FUNCTION public.delete_import_receipt_before_target_delete('NOTE');
CREATE TRIGGER delete_ReadingState_import_receipt
  BEFORE DELETE ON public."ReadingState"
  FOR EACH ROW EXECUTE FUNCTION public.delete_import_receipt_before_target_delete('READING');

CREATE OR REPLACE FUNCTION private.delete_import_receipts_for_user(target_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM pg_catalog.set_config('private.import_receipt_delete_user', target_user_id::text, true);
  DELETE FROM public."ImportItem" WHERE "userId" = target_user_id;
  DELETE FROM public."ImportBatch" WHERE "userId" = target_user_id;
  PERFORM pg_catalog.set_config('private.import_receipt_delete_user', '', true);
END;
$$;
ALTER FUNCTION private.delete_import_receipts_for_user(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION private.delete_import_receipts_for_user(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.delete_import_receipts_before_profile_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM private.delete_import_receipts_for_user(OLD."id");
  RETURN OLD;
END;
$$;
ALTER FUNCTION public.delete_import_receipts_before_profile_delete() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.delete_import_receipts_before_profile_delete() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER delete_import_receipts_before_profile_delete
  BEFORE DELETE ON public."UserProfile"
  FOR EACH ROW EXECUTE FUNCTION public.delete_import_receipts_before_profile_delete();

-- BANNED remains an Auth identity state, but it has no browser data-plane
-- access. This helper has no user-id argument, lives outside the exposed API
-- schema, and can answer only for the current auth.uid(). SECURITY DEFINER
-- avoids recursive UserProfile RLS evaluation.
CREATE OR REPLACE FUNCTION private.is_active_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public."UserProfile" profile
    WHERE profile."id" = (select auth.uid())
      AND profile."role" <> 'BANNED'::public."UserRole"
  );
$$;

ALTER FUNCTION private.is_active_user() OWNER TO postgres;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private TO authenticated;
REVOKE ALL ON FUNCTION private.is_active_user() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.is_active_user() TO authenticated;

-- Every application table is protected even for its owner. Service roles keep
-- their normal BYPASSRLS behavior for server-side transactions.
ALTER TABLE "public"."UserProfile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."UserProfile" FORCE ROW LEVEL SECURITY;
ALTER TABLE "public"."AccountBalance" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."AccountBalance" FORCE ROW LEVEL SECURITY;
ALTER TABLE "public"."BalanceLedger" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."BalanceLedger" FORCE ROW LEVEL SECURITY;
ALTER TABLE "public"."BalanceHold" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."BalanceHold" FORCE ROW LEVEL SECURITY;
ALTER TABLE "public"."OriginalBook" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."OriginalBook" FORCE ROW LEVEL SECURITY;
ALTER TABLE "public"."Chapter" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Chapter" FORCE ROW LEVEL SECURITY;
ALTER TABLE "public"."TranslatedBook" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."TranslatedBook" FORCE ROW LEVEL SECURITY;
ALTER TABLE "public"."TranslatedChapter" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."TranslatedChapter" FORCE ROW LEVEL SECURITY;
ALTER TABLE "public"."TranslationTask" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."TranslationTask" FORCE ROW LEVEL SECURITY;
ALTER TABLE "public"."TranslationBatchReceipt" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."TranslationBatchReceipt" FORCE ROW LEVEL SECURITY;
ALTER TABLE "public"."TranslationRetryReceipt" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."TranslationRetryReceipt" FORCE ROW LEVEL SECURITY;
ALTER TABLE "public"."Term" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Term" FORCE ROW LEVEL SECURITY;
ALTER TABLE "public"."VocabularyItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."VocabularyItem" FORCE ROW LEVEL SECURITY;
ALTER TABLE "public"."SentenceItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."SentenceItem" FORCE ROW LEVEL SECURITY;
ALTER TABLE "public"."AiRateLimit" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."AiRateLimit" FORCE ROW LEVEL SECURITY;
ALTER TABLE "public"."StudyNote" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."StudyNote" FORCE ROW LEVEL SECURITY;
ALTER TABLE "public"."ReadingState" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."ReadingState" FORCE ROW LEVEL SECURITY;
ALTER TABLE "public"."StorageCleanupTask" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."StorageCleanupTask" FORCE ROW LEVEL SECURITY;
ALTER TABLE "public"."ImportBatch" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."ImportBatch" FORCE ROW LEVEL SECURITY;
ALTER TABLE "public"."ImportItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."ImportItem" FORCE ROW LEVEL SECURITY;

CREATE POLICY "users read own profile" ON "public"."UserProfile"
  FOR SELECT TO authenticated USING (private.is_active_user() AND (select auth.uid()) = "id");
CREATE POLICY "users read own balance" ON "public"."AccountBalance"
  FOR SELECT TO authenticated USING (private.is_active_user() AND (select auth.uid()) = "userId");
CREATE POLICY "users read own ledger" ON "public"."BalanceLedger"
  FOR SELECT TO authenticated USING (private.is_active_user() AND (select auth.uid()) = "userId");
CREATE POLICY "users read own holds" ON "public"."BalanceHold"
  FOR SELECT TO authenticated USING (private.is_active_user() AND (select auth.uid()) = "userId");
CREATE POLICY "users read own books" ON "public"."OriginalBook"
  FOR SELECT TO authenticated USING (private.is_active_user() AND (select auth.uid()) = "userId");
CREATE POLICY "users read chapters of own books" ON "public"."Chapter"
  FOR SELECT TO authenticated
  USING (private.is_active_user() AND EXISTS (SELECT 1 FROM public."OriginalBook" b WHERE b."id" = "originalBookId" AND b."userId" = (select auth.uid())));
CREATE POLICY "users read own translated books" ON "public"."TranslatedBook"
  FOR SELECT TO authenticated USING (private.is_active_user() AND (select auth.uid()) = "userId");
CREATE POLICY "users read translated chapters of own books" ON "public"."TranslatedChapter"
  FOR SELECT TO authenticated
  USING (private.is_active_user() AND EXISTS (SELECT 1 FROM public."TranslatedBook" b WHERE b."id" = "translatedBookId" AND b."userId" = (select auth.uid())));
CREATE POLICY "users read translation tasks of own books" ON "public"."TranslationTask"
  FOR SELECT TO authenticated
  USING (private.is_active_user() AND EXISTS (SELECT 1 FROM public."TranslatedBook" b WHERE b."id" = "translatedBookId" AND b."userId" = (select auth.uid())));
CREATE POLICY "users read own translation batch receipts" ON "public"."TranslationBatchReceipt"
  FOR SELECT TO authenticated USING (private.is_active_user() AND (select auth.uid()) = "userId");
CREATE POLICY "users read own translation retry receipts" ON "public"."TranslationRetryReceipt"
  FOR SELECT TO authenticated USING (private.is_active_user() AND (select auth.uid()) = "userId");
CREATE POLICY "users read terms of own books" ON "public"."Term"
  FOR SELECT TO authenticated
  USING (private.is_active_user() AND EXISTS (SELECT 1 FROM public."OriginalBook" b WHERE b."id" = "originalBookId" AND b."userId" = (select auth.uid())));
CREATE POLICY "users read own vocabulary" ON "public"."VocabularyItem"
  FOR SELECT TO authenticated USING (private.is_active_user() AND (select auth.uid()) = "userId");
CREATE POLICY "users read own sentences" ON "public"."SentenceItem"
  FOR SELECT TO authenticated USING (private.is_active_user() AND (select auth.uid()) = "userId");
CREATE POLICY "users read own rate limits" ON "public"."AiRateLimit"
  FOR SELECT TO authenticated USING (private.is_active_user() AND (select auth.uid()) = "userId");
CREATE POLICY "users read own notes" ON "public"."StudyNote"
  FOR SELECT TO authenticated USING (private.is_active_user() AND (select auth.uid()) = "userId");
CREATE POLICY "users read own reading state" ON "public"."ReadingState"
  FOR SELECT TO authenticated USING (private.is_active_user() AND (select auth.uid()) = "userId");
CREATE POLICY "users read own cleanup tasks" ON "public"."StorageCleanupTask"
  FOR SELECT TO authenticated USING (private.is_active_user() AND (select auth.uid()) = "userId");
CREATE POLICY "users read own import batches" ON "public"."ImportBatch"
  FOR SELECT TO authenticated USING (private.is_active_user() AND (select auth.uid()) = "userId");
CREATE POLICY "users read own import receipts" ON "public"."ImportItem"
  FOR SELECT TO authenticated USING (private.is_active_user() AND (select auth.uid()) = "userId");

-- Start from no direct client access and grant only operations needed by the
-- browser-facing authenticated role. RLS remains mandatory for every grant.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM authenticated;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT ON TABLE
  public."UserProfile", public."AccountBalance", public."BalanceLedger",
  public."BalanceHold", public."AiRateLimit", public."StorageCleanupTask",
  public."OriginalBook", public."Chapter", public."TranslatedBook",
  public."TranslatedChapter", public."TranslationTask", public."TranslationBatchReceipt", public."TranslationRetryReceipt", public."Term",
  public."VocabularyItem", public."SentenceItem", public."StudyNote",
  public."ReadingState", public."ImportBatch", public."ImportItem"
TO authenticated;
REVOKE UPDATE ON TABLE public."UserProfile" FROM authenticated;

-- Supabase Storage is private by default. Limits are repeated here so remote
-- projects receive the same guarantees as local config.toml.
INSERT INTO storage.buckets
  ("id", "name", "public", "file_size_limit", "allowed_mime_types")
VALUES
  ('original-books', 'original-books', false, 2097152, ARRAY['text/plain'])
ON CONFLICT ("id") DO UPDATE
  SET "name" = EXCLUDED."name",
      "public" = false,
      "file_size_limit" = 2097152,
      "allowed_mime_types" = ARRAY['text/plain'];

DROP POLICY IF EXISTS "original-books select own objects" ON storage.objects;
CREATE POLICY "original-books select own objects" ON storage.objects
  FOR SELECT TO authenticated
  USING (private.is_active_user() AND bucket_id = 'original-books' AND (storage.foldername(name))[1] = (select auth.uid()::text));
DROP POLICY IF EXISTS "original-books insert own objects" ON storage.objects;
CREATE POLICY "original-books insert own objects" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (private.is_active_user() AND bucket_id = 'original-books' AND (storage.foldername(name))[1] = (select auth.uid()::text));
DROP POLICY IF EXISTS "original-books update own objects" ON storage.objects;
CREATE POLICY "original-books update own objects" ON storage.objects
  FOR UPDATE TO authenticated
  USING (private.is_active_user() AND bucket_id = 'original-books' AND (storage.foldername(name))[1] = (select auth.uid()::text))
  WITH CHECK (private.is_active_user() AND bucket_id = 'original-books' AND (storage.foldername(name))[1] = (select auth.uid()::text));
DROP POLICY IF EXISTS "original-books delete own objects" ON storage.objects;
CREATE POLICY "original-books delete own objects" ON storage.objects
  FOR DELETE TO authenticated
  USING (private.is_active_user() AND bucket_id = 'original-books' AND (storage.foldername(name))[1] = (select auth.uid()::text));
