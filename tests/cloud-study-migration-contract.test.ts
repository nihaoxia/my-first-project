import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/migrations/202607110001_cloud_foundation.sql", import.meta.url), "utf8");

test("schema models safe note targets and durable import receipts", () => {
  for (const expected of ["enum NoteTargetType", "enum ImportKind", "model ImportBatch", "model ImportItem", "@@index([userId, manifestId])", "@@unique([userId, kind, sourceId])"]) assert.match(schema, new RegExp(expected.replace(/[()[\]]/g, "\\$&")));
  const note = schema.match(/model StudyNote \{[\s\S]*?\n\}/)?.[0] ?? "";
  for (const field of ["targetType", "originalBookId", "chapterId", "translatedBookId"]) assert.match(note, new RegExp(`\\b${field}\\b`));
});

test("study collection identities are unique per user and book", () => {
  assert.match(schema, /model VocabularyItem[\s\S]*?@@unique\(\[userId, originalBookId, term\]\)/);
  assert.match(schema, /model SentenceItem[\s\S]*?@@unique\(\[userId, originalBookId, originalText\]\)/);
  assert.match(migration, /VocabularyItem_userId_originalBookId_term_key/);
  assert.match(migration, /SentenceItem_userId_originalBookId_originalText_key/);
});

test("reading state has a nonnegative optimistic version", () => {
  assert.match(schema, /model ReadingState[\s\S]*?version\s+Int\s+@default\(0\)/);
  assert.match(migration, /"version" INTEGER NOT NULL DEFAULT 0/);
  assert.match(migration, /ReadingState_version_nonnegative_check[\s\S]*?"version" >= 0/);
});

test("migration enforces note/import ownership, immutable receipts and controlled account erasure", () => {
  for (const expected of [
    "StudyNote_target_shape_check", "enforce_study_note_integrity", "enforce_import_item_integrity",
    "ImportBatch_counts_check", "ImportBatch_userId_manifestId_idx", "ImportItem_identity_check", "ImportItem_userId_kind_sourceId_key",
    "prevent_ImportBatch_update", "prevent_ImportItem_update", "prevent_ImportBatch_delete", "prevent_ImportItem_delete", "prevent_ImportBatch_truncate", "prevent_ImportItem_truncate", "delete_import_receipts_for_user", "delete_import_receipts_before_profile_delete",
  ]) assert.match(migration, new RegExp(expected));
  assert.match(migration, /ImportItem_userId_fkey[\s\S]{0,180}ON DELETE RESTRICT/);
  assert.match(migration, /ImportBatch_userId_fkey[\s\S]{0,180}ON DELETE RESTRICT/);
  assert.match(migration, /private\.import_receipt_delete_user/);
  assert.match(migration, /pg_trigger_depth\(\) < 2/);
  assert.match(migration, /SECURITY DEFINER SET search_path = ''/);
  assert.match(migration, /REVOKE ALL ON FUNCTION private\.delete_import_receipts_for_user\(uuid\) FROM PUBLIC, anon, authenticated/);
  const withoutDeleteAuthority = migration.replaceAll("pg_catalog.pg_trigger_depth() < 2", "FALSE");
  assert.throws(() => assert.match(withoutDeleteAuthority, /pg_trigger_depth\(\) < 2/));
  const withoutItemDeleteGuard = migration.replace(/CREATE TRIGGER prevent_ImportItem_delete[\s\S]*?;/, "");
  assert.throws(() => assert.match(withoutItemDeleteGuard, /CREATE TRIGGER prevent_ImportItem_delete/));
});

test("deleting an imported study target removes only its receipt through a controlled trigger", () => {
  for (const expected of [
    "delete_import_receipts_for_target", "delete_import_receipt_before_target_delete",
    "delete_VocabularyItem_import_receipt", "delete_SentenceItem_import_receipt",
    "delete_StudyNote_import_receipt", "delete_ReadingState_import_receipt",
    "private.import_receipt_delete_target",
  ]) assert.match(migration, new RegExp(expected));
  assert.match(migration, /DELETE FROM public\."ImportItem"[\s\S]*?"userId" = target_user_id[\s\S]*?"kind" = target_kind[\s\S]*?"targetId" = target_id/);
  assert.match(migration, /REVOKE ALL ON FUNCTION private\.delete_import_receipts_for_target\(uuid, public\."ImportKind", uuid\) FROM PUBLIC, anon, authenticated/);
  assert.match(migration, /BEFORE DELETE ON public\."VocabularyItem"[\s\S]*?EXECUTE FUNCTION public\.delete_import_receipt_before_target_delete\('VOCABULARY'\)/);
  assert.match(migration, /BEFORE DELETE ON public\."ReadingState"[\s\S]*?EXECUTE FUNCTION public\.delete_import_receipt_before_target_delete\('READING'\)/);
  const deleteGuard = migration.match(/CREATE OR REPLACE FUNCTION public\.prevent_import_item_delete\(\)[\s\S]*?\n\$\$;/)?.[0] ?? "";
  assert.match(deleteGuard, /private\.import_receipt_delete_target[\s\S]*?OLD\."targetId"/);
  const withoutTargetMarker = deleteGuard.replace(/pg_catalog\.current_setting\('private\.import_receipt_delete_target'[\s\S]*?OLD\."targetId"::text/, "FALSE");
  assert.throws(() => assert.match(withoutTargetMarker, /private\.import_receipt_delete_target[\s\S]*?OLD\."targetId"/));
  const withoutVocabularyTrigger = migration.replace(/CREATE TRIGGER delete_VocabularyItem_import_receipt[\s\S]*?;/, "");
  assert.throws(() => assert.match(withoutVocabularyTrigger, /CREATE TRIGGER delete_VocabularyItem_import_receipt/));
});

test("batch and item receipt deletion use table-specific fail-closed guards", () => {
  const batchGuard = migration.match(/CREATE OR REPLACE FUNCTION public\.prevent_import_batch_delete\(\)[\s\S]*?\n\$\$;/)?.[0] ?? "";
  const itemGuard = migration.match(/CREATE OR REPLACE FUNCTION public\.prevent_import_item_delete\(\)[\s\S]*?\n\$\$;/)?.[0] ?? "";
  assert.match(batchGuard, /private\.import_receipt_delete_user[\s\S]*?OLD\."userId"/);
  assert.doesNotMatch(batchGuard, /targetId|OLD\."kind"|import_receipt_delete_target/);
  assert.match(itemGuard, /private\.import_receipt_delete_user[\s\S]*?OLD\."userId"/);
  assert.match(itemGuard, /private\.import_receipt_delete_target[\s\S]*?OLD\."kind"[\s\S]*?OLD\."targetId"/);
  assert.match(migration, /CREATE TRIGGER prevent_ImportBatch_delete[\s\S]*?EXECUTE FUNCTION public\.prevent_import_batch_delete\(\)/);
  assert.match(migration, /CREATE TRIGGER prevent_ImportItem_delete[\s\S]*?EXECUTE FUNCTION public\.prevent_import_item_delete\(\)/);
  for (const name of ["prevent_import_batch_delete", "prevent_import_item_delete"]) {
    assert.match(migration, new RegExp(`ALTER FUNCTION public\\.${name}\\(\\) OWNER TO postgres`));
    assert.match(migration, new RegExp(`REVOKE ALL ON FUNCTION public\\.${name}\\(\\) FROM PUBLIC, anon, authenticated`));
  }
  const batchWithoutAccountCapability = batchGuard.replace(/pg_catalog\.current_setting\('private\.import_receipt_delete_user'[\s\S]*?OLD\."userId"::text/, "FALSE");
  assert.throws(() => assert.match(batchWithoutAccountCapability, /private\.import_receipt_delete_user[\s\S]*?OLD\."userId"/));
  const itemWithoutTargetCapability = itemGuard.replace(/pg_catalog\.current_setting\('private\.import_receipt_delete_target'[\s\S]*?OLD\."targetId"::text/, "FALSE");
  assert.throws(() => assert.match(itemWithoutTargetCapability, /private\.import_receipt_delete_target[\s\S]*?OLD\."targetId"/));
});

test("import tables are FORCE RLS, active-user read-only, and receive no browser writes", () => {
  for (const table of ["ImportBatch", "ImportItem"]) {
    assert.match(migration, new RegExp(`ALTER TABLE "public"\\."${table}" FORCE ROW LEVEL SECURITY`));
    assert.match(migration, new RegExp(`CREATE POLICY "users read own import`));
  }
  assert.doesNotMatch(migration, /CREATE POLICY[^\n]*import[^\n]*FOR (INSERT|UPDATE|DELETE)/i);
  assert.match(migration, /REVOKE ALL ON ALL TABLES IN SCHEMA public FROM authenticated/);
});
