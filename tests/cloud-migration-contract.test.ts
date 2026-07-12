import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const schemaPath = "prisma/schema.prisma";
const migrationPath =
  "supabase/migrations/202607110001_cloud_foundation.sql";

const prismaModels = [
  "UserProfile",
  "AccountBalance",
  "BalanceLedger",
  "BalanceHold",
  "OriginalBook",
  "Chapter",
  "TranslatedBook",
  "TranslatedChapter",
  "TranslationTask",
  "TranslationBatchReceipt",
  "TranslationRetryReceipt",
  "Term",
  "VocabularyItem",
  "SentenceItem",
  "AiRateLimit",
  "StudyNote",
  "ReadingState",
  "StorageCleanupTask",
] as const;

const prismaEnums = [
  "UserRole",
  "BookFormat",
  "BookLanguage",
  "TranslationStatus",
  "ChapterStatus",
  "TaskStatus",
  "LedgerType",
  "TermType",
] as const;

function readMigration() {
  return readFileSync(migrationPath, "utf8");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractFunction(sql: string, functionName: string) {
  const marker = `CREATE OR REPLACE FUNCTION public.${functionName}()`;
  const start = sql.indexOf(marker);
  assert.notEqual(start, -1, `missing function ${functionName}`);
  const asStart = sql.indexOf("AS $$", start);
  assert.notEqual(asStart, -1, `missing AS $$ for ${functionName}`);
  const bodyStart = asStart + "AS $$".length;
  const end = sql.indexOf("$$;", bodyStart);
  assert.notEqual(end, -1, `missing closing $$ for ${functionName}`);
  return {
    definition: sql.slice(start, end + 3),
    body: sql.slice(bodyStart, end),
  };
}

function assertSecurityDefinerFunction(sql: string, functionName: string) {
  const { definition } = extractFunction(sql, functionName);
  assert.match(definition, /SECURITY DEFINER/i, `${functionName} security`);
  assert.match(definition, /SET search_path = ''/i, `${functionName} search_path`);
  assert.ok(
    sql.includes(`ALTER FUNCTION public.${functionName}() OWNER TO postgres;`),
    `${functionName} owner`,
  );
  assert.ok(
    sql.includes(
      `REVOKE ALL ON FUNCTION public.${functionName}() FROM PUBLIC, anon, authenticated;`,
    ),
    `${functionName} execute grants`,
  );
}

function assertActiveUserPolicyGuards(sql: string) {
  for (const table of prismaModels) {
    const policy = sql.match(
      new RegExp(
        `CREATE POLICY\\s+"[^"]+"\\s+ON\\s+"public"\\."${escapeRegExp(table)}"\\s+FOR SELECT\\s+TO authenticated[\\s\\S]*?;`,
        "i",
      ),
    )?.[0];
    assert.ok(policy, `${table} SELECT policy exists`);
    assert.match(policy, /private\.is_active_user\(\)/i, `${table} active-user guard`);
  }

  for (const operation of ["SELECT", "INSERT", "UPDATE", "DELETE"]) {
    const policy = sql.match(
      new RegExp(
        `CREATE POLICY\\s+"original-books [^"]+"\\s+ON storage\\.objects\\s+FOR ${operation}\\s+TO authenticated[\\s\\S]*?;`,
        "i",
      ),
    )?.[0];
    assert.ok(policy, `Storage ${operation} policy exists`);
    assert.match(policy, /private\.is_active_user\(\)/i, `Storage ${operation} active-user guard`);
    if (operation === "UPDATE") {
      assert.equal(
        (policy.match(/private\.is_active_user\(\)/gi) ?? []).length,
        2,
        "Storage UPDATE must guard both USING and WITH CHECK",
      );
    }
  }
}

const immutableAssociationFields = {
  AccountBalance: ["userId"],
  BalanceLedger: ["userId", "taskId", "holdId"],
  BalanceHold: ["userId", "taskId", "attemptId"],
  OriginalBook: ["userId"],
  Chapter: ["originalBookId"],
  TranslatedBook: ["userId", "originalBookId"],
  TranslatedChapter: ["translatedBookId", "chapterId"],
  TranslationTask: ["translatedBookId", "chapterId"],
  TranslationBatchReceipt: ["userId", "taskId", "attemptId"],
  TranslationRetryReceipt: ["userId", "taskId"],
  Term: ["originalBookId", "translatedBookId"],
  VocabularyItem: ["userId", "originalBookId", "chapterId"],
  SentenceItem: ["userId", "originalBookId", "chapterId"],
  AiRateLimit: ["userId", "scope", "windowKey"],
  StudyNote: ["userId", "targetType", "originalBookId", "chapterId", "translatedBookId"],
  ReadingState: ["userId", "originalBookId", "translatedBookId"],
  StorageCleanupTask: ["userId", "bucket", "objectPath"],
} as const;

test("translation batch receipts are owner-bound, immutable, and outcome constrained", () => {
  const migration = readMigration();
  assert.match(migration, /CREATE TABLE "public"\."TranslationBatchReceipt"/);
  assert.match(migration, /CONSTRAINT "TranslationBatchReceipt_pkey" PRIMARY KEY \("executionId"\)/);
  assert.match(migration, /TranslationBatchReceipt_range_check[\s\S]*?"startSegmentIndex" >= 0[\s\S]*?"endSegmentIndex" >= "startSegmentIndex"/);
  assert.match(migration, /TranslationBatchReceipt_outcome_check[\s\S]*?'CHECKPOINTED'[\s\S]*?'COMPLETED'[\s\S]*?'FAILED'/);
  assert.match(migration, /enforce_translation_batch_receipt_integrity[\s\S]*?tb\."userId" = NEW\."userId"/);
  assert.match(migration, /prevent_translation_batch_receipt_mutation[\s\S]*?BEFORE UPDATE OR DELETE ON public\."TranslationBatchReceipt"/);
  assert.match(migration, /prevent_translation_batch_receipt_truncate[\s\S]*?BEFORE TRUNCATE ON public\."TranslationBatchReceipt"[\s\S]*?FOR EACH STATEMENT/);
  assertSecurityDefinerFunction(migration, "prevent_translation_batch_receipt_truncate");
  assert.match(migration, /CREATE POLICY "users read own translation batch receipts"[\s\S]*?private\.is_active_user\(\)[\s\S]*?auth\.uid\(\)[\s\S]*?"userId"/);
  assert.match(migration, /GRANT SELECT ON TABLE[\s\S]*?public\."TranslationBatchReceipt"[\s\S]*?TO authenticated/);
  const withoutTruncateGuard = migration.replace(/CREATE TRIGGER prevent_translation_batch_receipt_truncate[\s\S]*?;/, "");
  assert.throws(() => assert.match(withoutTruncateGuard, /CREATE TRIGGER prevent_translation_batch_receipt_truncate/));
});

test("translation retry receipts are durable owner-bound immutable audit records", () => {
  const migration = readMigration();
  assert.match(migration, /CREATE TABLE "public"\."TranslationRetryReceipt"/);
  assert.match(migration, /CONSTRAINT "TranslationRetryReceipt_pkey" PRIMARY KEY \("retryExecutionId"\)/);
  assert.match(migration, /TranslationRetryReceipt_count_check[\s\S]*?"fromRetryCount" >= 0[\s\S]*?"toRetryCount" = "fromRetryCount" \+ 1/);
  assert.match(migration, /enforce_translation_retry_receipt_integrity[\s\S]*?tb\."userId" = NEW\."userId"/);
  assert.match(migration, /prevent_translation_retry_receipt_mutation[\s\S]*?BEFORE UPDATE OR DELETE ON public\."TranslationRetryReceipt"/);
  assert.match(migration, /prevent_translation_retry_receipt_truncate[\s\S]*?BEFORE TRUNCATE ON public\."TranslationRetryReceipt"[\s\S]*?FOR EACH STATEMENT/);
  assertSecurityDefinerFunction(migration, "enforce_translation_retry_receipt_integrity");
  assertSecurityDefinerFunction(migration, "prevent_translation_retry_receipt_mutation");
  assertSecurityDefinerFunction(migration, "prevent_translation_retry_receipt_truncate");
  assert.match(migration, /CREATE POLICY "users read own translation retry receipts"[\s\S]*?private\.is_active_user\(\)[\s\S]*?auth\.uid\(\)[\s\S]*?"userId"/);
  assert.match(migration, /GRANT SELECT ON TABLE[\s\S]*?public\."TranslationRetryReceipt"[\s\S]*?TO authenticated/);
});

test("web lookup stays disabled in both Prisma and the authoritative database", () => {
  const schema = readFileSync(schemaPath, "utf8");
  const migration = readMigration();
  assert.match(schema, /webSearchTerms\s+Boolean\s+@default\(false\)/);
  assert.match(migration, /"webSearchTerms" BOOLEAN NOT NULL DEFAULT false/);
  assert.match(migration, /TranslatedBook_web_search_disabled_check[\s\S]*?CHECK \("webSearchTerms" = false\)/);
  const controlledDefect = migration.replace(/CHECK \("webSearchTerms" = false\)/, "CHECK (true)");
  assert.throws(() => assert.match(controlledDefect, /CHECK \("webSearchTerms" = false\)/));
});

const detachableAssociationFields = {
  BalanceLedger: ["taskId", "holdId"],
  BalanceHold: ["taskId"],
  VocabularyItem: ["chapterId"],
  SentenceItem: ["chapterId"],
} as const;

function assertImmutableAssociationGuards(sql: string) {
  const functionName = "prevent_immutable_association_update";
  assertSecurityDefinerFunction(sql, functionName);
  const { body } = extractFunction(sql, functionName);
  assert.match(body, /FOREACH column_name IN ARRAY TG_ARGV LOOP/i);
  assert.match(body, /old_value := to_jsonb\(OLD\) -> column_name/i);
  assert.match(body, /new_value := to_jsonb\(NEW\) -> column_name/i);
  assert.match(body, /RAISE EXCEPTION/i);
  assert.match(body, /RETURN NEW/i);
  assert.match(body, /old_value IS DISTINCT FROM new_value/i);
  assert.match(body, /old_value <> 'null'::jsonb/i);
  assert.match(body, /new_value = 'null'::jsonb/i);

  for (const [table, fields] of Object.entries(detachableAssociationFields)) {
    for (const field of fields) {
      assert.ok(
        body.includes(`('${table}', '${field}')`),
        `${table}.${field} must be declared detachable in the guard body`,
      );
    }
  }

  for (const [table, fields] of Object.entries(immutableAssociationFields)) {
    const marker = `CREATE TRIGGER prevent_${table}_identity_change`;
    const start = sql.indexOf(marker);
    assert.notEqual(start, -1, `missing immutable trigger for ${table}`);
    const end = sql.indexOf(";", start);
    assert.notEqual(end, -1, `unterminated immutable trigger for ${table}`);
    const trigger = sql.slice(start, end + 1);
    assert.match(trigger, /BEFORE UPDATE OF/i, `${table} timing`);
    assert.ok(
      trigger.includes(`ON public."${table}"`),
      `${table} target table`,
    );
    assert.ok(
      trigger.includes(`EXECUTE FUNCTION public.${functionName}(`),
      `${table} guard function`,
    );
    const updateMatch = trigger.match(
      new RegExp(
        `BEFORE UPDATE OF\\s+([\\s\\S]*?)\\s+ON public\\."${table}"`,
        "i",
      ),
    );
    assert.ok(updateMatch, `${table} UPDATE OF clause`);
    const updateFields = [...updateMatch[1].matchAll(/"([^"]+)"/g)].map(
      (match) => match[1],
    );
    const argumentsMatch = trigger.match(
      new RegExp(
        `EXECUTE FUNCTION public\\.${functionName}\\(([\\s\\S]*?)\\)`,
        "i",
      ),
    );
    assert.ok(argumentsMatch, `${table} immutable guard call`);
    const argumentFields = [
      ...argumentsMatch[1].matchAll(/'([^']+)'/g),
    ].map((match) => match[1]);
    assert.deepEqual(
      updateFields,
      [...fields],
      `${table} immutable UPDATE OF fields`,
    );
    assert.deepEqual(
      argumentFields,
      [...fields],
      `${table} immutable guard arguments`,
    );
    assert.deepEqual(
      updateFields,
      argumentFields,
      `${table} UPDATE OF fields and guard arguments`,
    );
  }
}

test("Prisma schema defines cloud notes, reading state, cleanup tasks, and user relations", () => {
  const schema = readFileSync(schemaPath, "utf8");

  assert.match(
    schema,
    /model StudyNote \{[\s\S]*?userId\s+String\s+@db\.Uuid[\s\S]*?title\s+String[\s\S]*?content\s+String[\s\S]*?createdAt\s+DateTime\s+@default\(now\(\)\)[\s\S]*?updatedAt\s+DateTime\s+@updatedAt[\s\S]*?user\s+UserProfile\s+@relation\(fields: \[userId\], references: \[id\], onDelete: Cascade\)[\s\S]*?\}/,
  );
  assert.match(
    schema,
    /model ReadingState \{[\s\S]*?userId\s+String\s+@db\.Uuid[\s\S]*?originalBookId\s+String\?\s+@db\.Uuid[\s\S]*?translatedBookId\s+String\?\s+@db\.Uuid[\s\S]*?chapterId\s+String\?\s+@db\.Uuid[\s\S]*?paragraphIndex\s+Int\s+@default\(0\)[\s\S]*?settings\s+Json\?[\s\S]*?updatedAt\s+DateTime\s+@updatedAt[\s\S]*?@@index\(\[userId, originalBookId\]\)[\s\S]*?@@index\(\[userId, translatedBookId\]\)[\s\S]*?\}/,
  );
  const readingStateModel =
    schema.match(/model ReadingState \{[\s\S]*?\n\}/)?.[0] ?? "";
  assert.doesNotMatch(readingStateModel, /@@unique/);
  assert.match(
    readingStateModel,
    /\/\/\/ Supabase migration enforces XOR and partial uniqueness for originalBookId and translatedBookId\.[\s\S]*?originalBookId/,
  );
  assert.match(
    readingStateModel,
    /\/\/\/ Supabase migration enforces XOR and partial uniqueness for originalBookId and translatedBookId\.[\s\S]*?translatedBookId/,
  );
  assert.match(
    readingStateModel,
    /\/\/\/ Supabase migration enforces paragraphIndex >= 0; do not replace its raw constraints with Prisma-generated migrations\.[\s\S]*?paragraphIndex/,
  );
  assert.match(
    schema,
    /model StorageCleanupTask \{[\s\S]*?userId\s+String\s+@db\.Uuid[\s\S]*?bucket\s+String[\s\S]*?objectPath\s+String[\s\S]*?reason\s+String[\s\S]*?attempts\s+Int\s+@default\(0\)[\s\S]*?nextAttemptAt\s+DateTime\?[\s\S]*?createdAt\s+DateTime\s+@default\(now\(\)\)[\s\S]*?updatedAt\s+DateTime\s+@updatedAt[\s\S]*?@@unique\(\[bucket, objectPath\]\)[\s\S]*?\}/,
  );

  assert.match(schema, /studyNotes\s+StudyNote\[\]/);
  assert.match(schema, /readingStates\s+ReadingState\[\]/);
  assert.match(schema, /storageCleanupTasks\s+StorageCleanupTask\[\]/);
});

test("foundation migration creates every Prisma enum and table from an empty database", () => {
  const migration = readMigration();

  for (const enumName of prismaEnums) {
    assert.match(
      migration,
      new RegExp(`CREATE TYPE\\s+"public"\\."${escapeRegExp(enumName)}"\\s+AS ENUM`, "i"),
      `missing enum ${enumName}`,
    );
  }

  for (const model of prismaModels) {
    assert.match(
      migration,
      new RegExp(`CREATE TABLE\\s+"public"\\."${escapeRegExp(model)}"`, "i"),
      `missing table ${model}`,
    );
  }
});

test("foundation migration preserves key unique constraints, indexes, and foreign keys", () => {
  const migration = readMigration();

  for (const requiredFragment of [
    'CREATE UNIQUE INDEX "UserProfile_phone_key" ON "public"."UserProfile"("phone")',
    'CREATE UNIQUE INDEX "Chapter_originalBookId_index_key" ON "public"."Chapter"("originalBookId", "index")',
    'CREATE UNIQUE INDEX "TranslatedChapter_translatedBookId_chapterId_key" ON "public"."TranslatedChapter"("translatedBookId", "chapterId")',
    'CREATE UNIQUE INDEX "TranslationTask_translatedBookId_chapterId_key" ON "public"."TranslationTask"("translatedBookId", "chapterId")',
    'CREATE UNIQUE INDEX "StorageCleanupTask_bucket_objectPath_key" ON "public"."StorageCleanupTask"("bucket", "objectPath")',
    'ALTER TABLE "public"."UserProfile" ADD CONSTRAINT "UserProfile_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE',
    'ALTER TABLE "public"."StudyNote" ADD CONSTRAINT "StudyNote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."UserProfile"("id") ON DELETE CASCADE',
    'ALTER TABLE "public"."ReadingState" ADD CONSTRAINT "ReadingState_originalBookId_fkey" FOREIGN KEY ("originalBookId") REFERENCES "public"."OriginalBook"("id") ON DELETE CASCADE',
    'ALTER TABLE "public"."StorageCleanupTask" ADD CONSTRAINT "StorageCleanupTask_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."UserProfile"("id") ON DELETE RESTRICT',
  ]) {
    assert.ok(
      migration.includes(requiredFragment),
      `missing migration contract: ${requiredFragment}`,
    );
  }
});

test("reading state selects exactly one book kind and has null-safe per-kind uniqueness", () => {
  const migration = readMigration();

  assert.match(
    migration,
    /ADD CONSTRAINT "ReadingState_exactly_one_book_check" CHECK \(\("originalBookId" IS NOT NULL\) <> \("translatedBookId" IS NOT NULL\)\)/i,
  );
  assert.match(
    migration,
    /CREATE UNIQUE INDEX "ReadingState_user_original_book_key" ON "public"\."ReadingState"\("userId", "originalBookId"\) WHERE "originalBookId" IS NOT NULL/i,
  );
  assert.match(
    migration,
    /CREATE UNIQUE INDEX "ReadingState_user_translated_book_key" ON "public"\."ReadingState"\("userId", "translatedBookId"\) WHERE "translatedBookId" IS NOT NULL/i,
  );
  assert.doesNotMatch(
    migration,
    /ReadingState_userId_originalBookId_translatedBookId_key/,
  );
  assert.match(
    migration,
    /ADD CONSTRAINT "ReadingState_paragraph_index_nonnegative_check" CHECK \("paragraphIndex" >= 0\)/i,
  );
});

test("migration documents raw SQL extensions and requires a drift gate", () => {
  const migration = readMigration();

  assert.match(
    migration.slice(0, 1_000),
    /authoritative Supabase migration[\s\S]*?raw SQL extensions[\s\S]*?drift gate/i,
  );
});

test("database pins every original book to its fixed owner-bound object path", () => {
  const migration = readMigration();
  const schema = readFileSync(schemaPath, "utf8");
  assert.match(
    migration,
    /CONSTRAINT "OriginalBook_storagePath_owner_book_check" CHECK \("storagePath" = "userId"::text \|\| '\/' \|\| "id"::text \|\| '\/original\.txt'\)/,
  );
  assert.match(schema, /\/\/\/ Supabase migration enforces the fixed owner-bound[\s\S]{0,200}?storagePath\s+String/);
});

test("durable cleanup intents restrict user deletion until cleanup completes", () => {
  const migration = readMigration();
  const schema = readFileSync(schemaPath, "utf8");
  assert.match(migration, /"StorageCleanupTask_userId_fkey"[^;]+ON DELETE RESTRICT/i);
  assert.match(schema, /model StorageCleanupTask[\s\S]*?user\s+UserProfile\s+@relation\(fields: \[userId\], references: \[id\], onDelete: Restrict\)/);
});

test("auth user trigger provisions phone-only USER profiles and balances safely", () => {
  const migration = readMigration();

  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.handle_new_auth_user\(\)/i);
  assert.match(migration, /NEW\.phone IS NULL OR btrim\(NEW\.phone\) = ''/i);
  assert.match(migration, /RAISE EXCEPTION[^;]+phone/i);
  assert.match(
    migration,
    /INSERT INTO public\."UserProfile"\s*\("id", "phone", "role"[^)]*\)[\s\S]*?'USER'::public\."UserRole"/i,
  );
  assert.match(migration, /ON CONFLICT \("id"\) DO UPDATE/i);
  assert.doesNotMatch(migration, /excluded\."role"/i);
  assert.match(migration, /INSERT INTO public\."AccountBalance"\s*\("userId"/i);
  assert.match(migration, /ON CONFLICT \("userId"\) DO NOTHING/i);
  assert.match(
    migration,
    /CREATE TRIGGER on_auth_user_created[\s\S]*?AFTER INSERT OR UPDATE OF phone ON auth\.users[\s\S]*?EXECUTE FUNCTION public\.handle_new_auth_user\(\)/i,
  );
  assert.match(migration, /ALTER FUNCTION public\.handle_new_auth_user\(\) OWNER TO postgres/i);
  assert.match(migration, /SET search_path = ''/i);
});

test("all public user-data tables force RLS and expose authenticated read-only policies", () => {
  const migration = readMigration();

  for (const table of prismaModels) {
    const escaped = escapeRegExp(table);
    assert.match(
      migration,
      new RegExp(`ALTER TABLE\\s+"public"\\."${escaped}"\\s+ENABLE ROW LEVEL SECURITY`, "i"),
      `${table} must enable RLS`,
    );
    assert.match(
      migration,
      new RegExp(`ALTER TABLE\\s+"public"\\."${escaped}"\\s+FORCE ROW LEVEL SECURITY`, "i"),
      `${table} must force RLS`,
    );
    assert.match(
      migration,
      new RegExp(`CREATE POLICY\\s+"[^"]+"\\s+ON\\s+"public"\\."${escaped}"\\s+FOR SELECT\\s+TO authenticated`, "i"),
      `${table} must have an authenticated SELECT policy`,
    );
  }

  assert.doesNotMatch(migration, /\bTO\s+anon\b/i);
  assert.doesNotMatch(
    migration,
    /CREATE POLICY[^;]+ON\s+"public"\."[^"]+"\s+FOR\s+(?:ALL|INSERT|UPDATE|DELETE)\s+TO authenticated/is,
  );
  assert.doesNotMatch(
    migration,
    /GRANT[^;]+\b(?:INSERT|UPDATE|DELETE)\b[^;]+TO authenticated/is,
  );
  assert.match(migration, /REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon/i);
  assert.match(migration, /REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon/i);
});

test("banned users are denied by a non-exposed active-user helper on every browser policy", () => {
  const migration = readMigration();
  const localConfig = readFileSync("supabase/config.toml", "utf8");
  const exposedSchemas = localConfig.match(/schemas\s*=\s*\[([^\]]*)\]/)?.[1] ?? "";
  assert.doesNotMatch(exposedSchemas, /["']private["']/i);
  assert.match(migration, /CREATE SCHEMA IF NOT EXISTS private/i);
  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION private\.is_active_user\(\)[\s\S]*?RETURNS boolean[\s\S]*?SECURITY DEFINER[\s\S]*?SET search_path = ''/i,
  );
  assert.match(
    migration,
    /SELECT EXISTS[\s\S]*?FROM public\."UserProfile"[\s\S]*?profile\."id" = \(select auth\.uid\(\)\)[\s\S]*?profile\."role" <> 'BANNED'::public\."UserRole"/i,
  );
  assert.match(migration, /ALTER FUNCTION private\.is_active_user\(\) OWNER TO postgres/i);
  assert.match(migration, /REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated/i);
  assert.match(migration, /GRANT USAGE ON SCHEMA private TO authenticated/i);
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION private\.is_active_user\(\) FROM PUBLIC, anon, authenticated/i,
  );
  assert.match(migration, /GRANT EXECUTE ON FUNCTION private\.is_active_user\(\) TO authenticated/i);
  assertActiveUserPolicyGuards(migration);

  const controlledDefect = migration.replace("private.is_active_user() AND", "TRUE AND");
  assert.throws(
    () => assertActiveUserPolicyGuards(controlledDefect),
    /active-user guard/,
  );
});

test("authenticated users cannot write profile identity or safe-looking profile fields directly", () => {
  const migration = readMigration();

  assert.match(migration, /REVOKE UPDATE ON TABLE public\."UserProfile" FROM authenticated/i);
  assert.doesNotMatch(migration, /GRANT UPDATE[^;]+UserProfile[^;]+authenticated/is);
});

test("database triggers enforce cross-table ownership and same-book invariants", () => {
  const migration = readMigration();

  const integrityTriggers = [
    ["TranslatedChapter", "enforce_translated_chapter_integrity"],
    ["TranslationTask", "enforce_translation_task_integrity"],
    ["Term", "enforce_term_integrity"],
    ["VocabularyItem", "enforce_vocabulary_item_integrity"],
    ["SentenceItem", "enforce_sentence_item_integrity"],
    ["ReadingState", "enforce_reading_state_integrity"],
  ] as const;
  for (const [table, functionName] of integrityTriggers) {
    assert.match(
      migration,
      new RegExp(
        `CREATE OR REPLACE FUNCTION public\\.${functionName}\\(\\)[\\s\\S]*?SECURITY DEFINER[\\s\\S]*?SET search_path = ''`,
        "i",
      ),
      `${table} must have an explicit integrity function`,
    );
    assert.match(
      migration,
      new RegExp(
        `CREATE TRIGGER enforce_${table}_integrity[\\s\\S]*?BEFORE INSERT OR UPDATE ON public\\."${table}"[\\s\\S]*?EXECUTE FUNCTION public\\.${functionName}\\(\\)`,
        "i",
      ),
      `${table} must enforce cross-table integrity on insert and update`,
    );
  }

  assert.match(migration, /tb\."originalBookId" = c\."originalBookId"/i);
  assert.match(migration, /tb\."originalBookId" = NEW\."originalBookId"/i);
  assert.match(migration, /b\."userId" = NEW\."userId"/i);
  assert.match(migration, /c\."originalBookId" = NEW\."originalBookId"/i);
  assert.match(migration, /tb\."userId" = NEW\."userId"/i);
});

test("database triggers prevent cross-user translated books, holds, and ledgers", () => {
  const migration = readMigration();
  const integrityTriggers = [
    ["TranslatedBook", "enforce_translated_book_integrity"],
    ["BalanceHold", "enforce_balance_hold_integrity"],
    ["BalanceLedger", "enforce_balance_ledger_integrity"],
  ] as const;

  for (const [table, functionName] of integrityTriggers) {
    assert.match(
      migration,
      new RegExp(
        `CREATE OR REPLACE FUNCTION public\\.${functionName}\\(\\)[\\s\\S]*?SECURITY DEFINER[\\s\\S]*?SET search_path = ''`,
        "i",
      ),
      `${table} must have an explicit integrity function`,
    );
    assert.match(
      migration,
      new RegExp(
        `CREATE TRIGGER enforce_${table}_integrity[\\s\\S]*?BEFORE INSERT OR UPDATE ON public\\."${table}"[\\s\\S]*?EXECUTE FUNCTION public\\.${functionName}\\(\\)`,
        "i",
      ),
      `${table} must enforce cross-user integrity on insert and update`,
    );
  }

  assert.match(
    migration,
    /b\."id" = NEW\."originalBookId"[\s\S]*?b\."userId" = NEW\."userId"/i,
  );
  assert.match(
    migration,
    /h\."id" = NEW\."holdId"[\s\S]*?h\."userId" = NEW\."userId"/i,
  );
  assert.match(
    migration,
    /h\."taskId" = NEW\."taskId"/i,
  );
});

test("balance ledgers are unique per hold phase and match the hold terminal state", () => {
  const migration = readMigration();
  for (const type of ["HOLD", "CHARGE", "RELEASE"]) {
    assert.match(migration, new RegExp(`CREATE UNIQUE INDEX "BalanceLedger_holdId_${type.toLowerCase()}_key"[\\s\\S]*?WHERE "holdId" IS NOT NULL AND "type" = '${type}'`, "i"));
  }
  const ledger = extractFunction(migration, "enforce_balance_ledger_integrity").body;
  assert.match(ledger, /NEW\."type" IN \('HOLD', 'CHARGE', 'RELEASE'\)[\s\S]*?NEW\."holdId" IS NULL/);
  assert.match(ledger, /NEW\."type" NOT IN \('HOLD', 'CHARGE', 'RELEASE'\)[\s\S]*?NEW\."holdId" IS NOT NULL/);
  assert.match(ledger, /h\."taskId" = NEW\."taskId"/);
  assert.match(ledger, /h\."amount" = NEW\."amount"/);
  assert.match(ledger, /NEW\."type" = 'HOLD'[\s\S]*?h\."chargedAt" IS NULL[\s\S]*?h\."releasedAt" IS NULL/);
  assert.match(ledger, /NEW\."type" = 'CHARGE'[\s\S]*?h\."chargedAt" IS NOT NULL[\s\S]*?h\."releasedAt" IS NULL/);
  assert.match(ledger, /NEW\."type" = 'RELEASE'[\s\S]*?h\."releasedAt" IS NOT NULL[\s\S]*?h\."chargedAt" IS NULL/);
});

test("identity and association fields are immutable or safely detachable after insert", () => {
  const migration = readMigration();
  assertImmutableAssociationGuards(migration);
  assert.doesNotMatch(
    migration,
    /protect_(?:original_book|chapter|translated_book|translation_task|balance_hold)_relationships/i,
  );

  const controlledDefect = migration.replace(
    "'translatedBookId', 'chapterId'",
    "'translatedBookId'",
  );
  assert.throws(
    () => assertImmutableAssociationGuards(controlledDefect),
    /TranslatedChapter immutable guard arguments/,
  );

  const originalBookTriggerMarker =
    "CREATE TRIGGER prevent_OriginalBook_identity_change";
  const originalBookTriggerStart = migration.indexOf(originalBookTriggerMarker);
  const originalBookTriggerEnd = migration.indexOf(
    ";",
    originalBookTriggerStart,
  );
  const originalBookTrigger = migration.slice(
    originalBookTriggerStart,
    originalBookTriggerEnd + 1,
  );
  const extraFreezeDefect = migration.replace(
    originalBookTrigger,
    originalBookTrigger
      .replace(
        'BEFORE UPDATE OF "userId"',
        'BEFORE UPDATE OF "userId", "title"',
      )
      .replace("('userId')", "('userId', 'title')"),
  );
  assert.throws(
    () => assertImmutableAssociationGuards(extraFreezeDefect),
    /OriginalBook immutable UPDATE OF fields/,
  );
});

test("guarded ON DELETE SET NULL foreign keys are explicitly detachable", () => {
  const migration = readMigration();
  const setNullForeignKeys = [
    ...migration.matchAll(
      /ALTER TABLE "public"\."([^"]+)" ADD CONSTRAINT "[^"]+" FOREIGN KEY \("([^"]+)"\)[^;]+ON DELETE SET NULL/gi,
    ),
  ].map((match) => [match[1], match[2]] as const);

  for (const [table, fields] of Object.entries(immutableAssociationFields)) {
    for (const field of fields) {
      const usesSetNull = setNullForeignKeys.some(
        ([fkTable, fkField]) => fkTable === table && fkField === field,
      );
      if (usesSetNull) {
        assert.ok(
          Object.entries(detachableAssociationFields).some(
            ([detachableTable, detachableFields]) =>
              detachableTable === table &&
              (detachableFields as readonly string[]).includes(field),
          ),
          `${table}.${field} uses ON DELETE SET NULL and must be detachable`,
        );
      }
    }
  }

  for (const [table, fields] of Object.entries(detachableAssociationFields)) {
    for (const field of fields) {
      assert.ok(
        setNullForeignKeys.some(
          ([fkTable, fkField]) => fkTable === table && fkField === field,
        ),
        `${table}.${field} may detach only because its FK uses ON DELETE SET NULL`,
      );
    }
  }
});

test("every relationship trigger function has a local security envelope", () => {
  const migration = readMigration();
  const bodyContracts = {
    enforce_translated_book_integrity: [
      'public."OriginalBook"',
      'b."id" = NEW."originalBookId"',
      'b."userId" = NEW."userId"',
    ],
    enforce_translated_chapter_integrity: [
      'public."TranslatedBook"',
      'public."Chapter"',
      'tb."id" = NEW."translatedBookId"',
      'c."id" = NEW."chapterId"',
      'tb."originalBookId" = c."originalBookId"',
    ],
    enforce_translation_task_integrity: [
      'public."TranslatedBook"',
      'public."Chapter"',
      'tb."id" = NEW."translatedBookId"',
      'c."id" = NEW."chapterId"',
      'tb."originalBookId" = c."originalBookId"',
    ],
    enforce_term_integrity: [
      'public."TranslatedBook"',
      'tb."id" = NEW."translatedBookId"',
      'tb."originalBookId" = NEW."originalBookId"',
    ],
    enforce_vocabulary_item_integrity: [
      'public."OriginalBook"',
      'public."Chapter"',
      'b."userId" = NEW."userId"',
      'c."originalBookId" = NEW."originalBookId"',
    ],
    enforce_sentence_item_integrity: [
      'public."OriginalBook"',
      'public."Chapter"',
      'b."userId" = NEW."userId"',
      'c."originalBookId" = NEW."originalBookId"',
    ],
    enforce_reading_state_integrity: [
      'public."OriginalBook"',
      'public."TranslatedBook"',
      'public."Chapter"',
      'b."userId" = NEW."userId"',
      'tb."userId" = NEW."userId"',
    ],
    enforce_balance_hold_integrity: [
      'public."TranslationTask"',
      'public."TranslatedBook"',
      't."id" = NEW."taskId"',
      'tb."userId" = NEW."userId"',
    ],
    enforce_balance_ledger_integrity: [
      'public."TranslationTask"',
      'public."TranslatedBook"',
      'public."BalanceHold"',
      'h."id" = NEW."holdId"',
      'h."userId" = NEW."userId"',
      'h."taskId" = NEW."taskId"',
    ],
  } as const;

  for (const [functionName, fragments] of Object.entries(bodyContracts)) {
    assertSecurityDefinerFunction(migration, functionName);
    const { body } = extractFunction(migration, functionName);
    for (const fragment of fragments) {
      assert.ok(
        body.includes(fragment),
        `${functionName} body must include ${fragment}`,
      );
    }
  }
});

test("migration provisions a private 2 MiB text bucket with uid-scoped object policies", () => {
  const migration = readMigration();

  assert.match(
    migration,
    /INSERT INTO storage\.buckets\s*\("id", "name", "public", "file_size_limit", "allowed_mime_types"\)[\s\S]*?'original-books'[\s\S]*?false[\s\S]*?2097152[\s\S]*?ARRAY\['text\/plain'\]/i,
  );
  assert.match(migration, /ON CONFLICT \("id"\) DO UPDATE/i);

  for (const operation of ["SELECT", "INSERT", "UPDATE", "DELETE"]) {
    const policy = migration.match(
      new RegExp(
        `CREATE POLICY\\s+"original-books [^"]+"\\s+ON storage\\.objects\\s+FOR ${operation}\\s+TO authenticated[\\s\\S]*?;`,
        "i",
      ),
    )?.[0];
    assert.ok(policy, `missing ${operation} policy`);
    assert.ok(policy.includes("bucket_id = 'original-books'"));
    assert.ok(
      policy.includes(
        "(storage.foldername(name))[1] = (select auth.uid()::text)",
      ),
      `${operation} policy must scope the first path segment to auth.uid`,
    );
  }

  assert.doesNotMatch(migration, /CREATE POLICY[^;]+ON storage\.objects[^;]+TO anon/is);
});

test("migration contains no embedded application secrets", () => {
  const migration = readMigration();

  assert.doesNotMatch(migration, /service_role\s*=|SUPABASE_SERVICE_ROLE_KEY|DATABASE_URL|AI_API_KEY|TRANSLATION_MCP_SECRET/i);
  assert.doesNotMatch(migration, /(?:sk-|sb_secret_)[A-Za-z0-9_-]{12,}/);
});

test("translation attempts, billing holds, and persisted provider results have durable database constraints", () => {
  const schema = readFileSync(schemaPath, "utf8");
  const migration = readMigration();
  for (const field of ["attemptId", "attemptStartedAt", "attemptExpiresAt", "errorCode", "translatedSegments", "nextSegmentIndex", "checkpointProvider", "checkpointModel", "accumulatedInputTokens", "accumulatedOutputTokens", "lastHeartbeatAt"]) {
    assert.match(schema, new RegExp(`${field}\\s+`));
    assert.match(migration, new RegExp(`"${field}"`));
  }
  for (const field of ["providerName", "modelName", "inputTokens", "outputTokens", "wordCount"]) {
    assert.match(schema, new RegExp(`${field}\\s+`));
    assert.match(migration, new RegExp(`"${field}"`));
  }
  assert.match(migration, /TranslationTask_attempt_lease_check/);
  assert.match(migration, /Illegal translation task status transition/);
  assert.match(migration, /TranslatedBook_userId_originalBookId_targetLanguage_key/);
  const assertFinancialChecks = (sql: string) => {
    assert.match(sql, /AccountBalance_nonnegative_check[\s\S]+"available" >= 0[\s\S]+"frozen" >= 0[\s\S]+"freeChapters" >= 0/);
    assert.match(sql, /BalanceLedger_nonnegative_check[\s\S]+"amount" >= 0/);
    assert.match(sql, /BalanceHold_resource_terminal_check[\s\S]+\(\("amount" > 0 AND "freeUnits" = 0\) OR \("amount" = 0 AND "freeUnits" = 1\)\)[\s\S]+NOT \("chargedAt" IS NOT NULL AND "releasedAt" IS NOT NULL\)/);
  };
  assertFinancialChecks(migration);
  assert.throws(() => assertFinancialChecks(migration.replace('"available" >= 0', '"available" >= -1')));
  assert.throws(() => assertFinancialChecks(migration.replace('("amount" > 0 AND "freeUnits" = 0) OR ("amount" = 0 AND "freeUnits" = 1)', '("amount" >= 0)')));
  assert.throws(() => assertFinancialChecks(migration.replace('NOT ("chargedAt" IS NOT NULL AND "releasedAt" IS NOT NULL)', 'true')));
  assert.match(migration, /BalanceHold_taskId_attemptId_key/);
  assert.doesNotMatch(migration, /BalanceHold_taskId_key/);
  assert.match(migration, /jsonb_array_length\("translatedSegments"\) = "nextSegmentIndex"/);
  assert.match(migration, /private\.is_valid_translation_checkpoint\("translatedSegments"\)/);
  assert.match(migration, /item - ARRAY\['segmentId', 'index', 'translatedText'\] <> '\{\}'::jsonb/);
  const assertProviderPayloadChecks = (sql: string) => {
    assert.match(sql, /item \?& ARRAY\['segmentId', 'index', 'translatedText'\]/);
    assert.match(sql, /item - ARRAY\['segmentId', 'index', 'translatedText'\] <> '\{\}'::jsonb/);
    assert.match(sql, /octet_length\(item->>'translatedText'\) > 32768/);
    assert.match(sql, /SUM\(pg_catalog\.octet_length\(item->>'translatedText'\)\)[^;]+GREATEST\(jsonb_array_length\(value\) - 1, 0\) \* 2 <= 5242880 END/);
    assert.match(sql, /TranslatedChapter_metrics_check[\s\S]+octet_length\("content"\) <= 5242880/);
  };
  assertProviderPayloadChecks(migration);
  assert.throws(() => assertProviderPayloadChecks(migration.replace("OR NOT (item ?& ARRAY['segmentId', 'index', 'translatedText'])", "OR false")));
  assert.throws(() => assertProviderPayloadChecks(migration.replace("pg_catalog.octet_length(item->>'translatedText') > 32768", "false")));
  assert.throws(() => assertProviderPayloadChecks(migration.replace("* 2 <= 5242880 END", "* 2 <= 99999999 END")));
  assert.match(migration, /"accumulatedInputTokens" >= 0 AND "accumulatedOutputTokens" >= 0/);
  assert.match(migration, /TranslatedChapter_metrics_check/);
  const assertLeaseChecks = (sql: string) => {
    assert.match(sql, /"attemptStartedAt" <= "lastHeartbeatAt" AND "lastHeartbeatAt" < "attemptExpiresAt"/);
    assert.match(sql, /"batchExecutionId" IS NULL AND "batchExecutionExpiresAt" IS NULL AND "batchExecutionIndex" IS NULL/);
    assert.match(sql, /"batchExecutionIndex" = "nextSegmentIndex"/);
    assert.match(sql, /"lastHeartbeatAt" <= "batchExecutionExpiresAt" AND "batchExecutionExpiresAt" < "attemptExpiresAt"/);
    assert.match(sql, /"lastBatchExecutionId" IS NULL OR "status" = 'FAILED'/);
  };
  assertLeaseChecks(migration);
  assert.throws(() => assertLeaseChecks(migration.replace('"attemptStartedAt" <= "lastHeartbeatAt"', "true")));
  assert.throws(() => assertLeaseChecks(migration.replace('"batchExecutionIndex" = "nextSegmentIndex"', "true")));
  assert.throws(() => assertLeaseChecks(migration.replace('"batchExecutionExpiresAt" < "attemptExpiresAt"', "true")));
  assert.throws(() => assertLeaseChecks(migration.replace('("lastBatchExecutionId" IS NULL OR "status" = \'FAILED\')', "true")));
  const holdIntegrity = extractFunction(migration, "enforce_balance_hold_integrity").body;
  assert.match(holdIntegrity, /NEW\."chargedAt" IS NULL AND NEW\."releasedAt" IS NULL/);
  assert.match(holdIntegrity, /t\."status" = 'TRANSLATING'/);
  assert.match(holdIntegrity, /t\."attemptId" = NEW\."attemptId"/);
  assert.throws(() => {
    const defect = migration.replace('AND t."status" = \'TRANSLATING\'', 'AND true');
    assert.match(extractFunction(defect, "enforce_balance_hold_integrity").body, /t\."status" = 'TRANSLATING'/);
  });
});
