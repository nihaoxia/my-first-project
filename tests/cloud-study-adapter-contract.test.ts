import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const study = readFileSync(new URL("../src/lib/cloud/study.ts", import.meta.url), "utf8");
const imported = readFileSync(new URL("../src/lib/cloud/import.ts", import.meta.url), "utf8");

test("study and import adapters share canonical reading locks and serializable retries", () => {
  for (const text of [study, imported]) { assert.match(text, /readingStateLockKey\(/); assert.match(text, /withSerializableRetry\(/); assert.match(text, /isolationLevel: "Serializable"/); }
  assert.match(study, /version: expectedVersion/);
  assert.match(study, /version: \{ increment: 1 \}/);
});

test("import mapping canonicalizes bounded owner candidates and binds translations to original titles", () => {
  assert.doesNotMatch(imported, /take: 101/);
  assert.match(imported, /take: LOOKUP_PAGE_SIZE/);
  assert.match(imported, /orderBy: \{ id: "asc" \}/);
  assert.match(imported, /cursor \? \{ cursor: \{ id: cursor \}, skip: 1 \} : \{\}/);
  assert.match(imported, /findUniqueTranslationMatchByPages\(/);
  assert.match(imported, /findUniqueOriginalMatchByPages\(/);
  assert.match(imported, /Prisma\.DbNull/);
  assert.match(imported, /if \(current\) return \{ outcome: "error" as const, code: "INVALID_TARGET" as const \}/);
});

test("note create list and patch share relation-aware target label mapping", () => {
  assert.match(study, /function mapNoteRow/);
  assert.match(study, /studyNote\.findUnique\(\{ where: \{ id \}, include: \{ originalBook:/);
  assert.match(study, /chapter: \{ select: \{ title: true \} \}/);
  assert.match(study, /translatedBook: \{ select: \{ title: true \} \}/);
  assert.match(study, /finishPage\(rows, page\.limit, mapNoteRow\)/);
  assert.equal((study.match(/mapNoteRow\(/g) ?? []).length >= 2, true);
  assert.doesNotMatch(study, /kind: "note", targetLabel: ""/);
});

test("study repository lists through stable bounded id cursor pages", () => {
  assert.match(study, /take: page\.limit \+ 1/);
  assert.match(study, /orderBy: \{ id: "asc"(?: as const)?\s*\}/);
  assert.match(study, /page\.cursor \? \{ cursor: \{ id: page\.cursor \}, skip: 1 \} : \{\}/);
  assert.match(study, /nextCursor/);
  assert.doesNotMatch(study, /findMany\(\{ where:[^\n]+orderBy: \{ (createdAt|updatedAt):/);
});
