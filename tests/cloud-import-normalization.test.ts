import assert from "node:assert/strict";
import test from "node:test";
import { findUniqueOriginalMatchByPages, findUniqueTranslationMatchByPages, normalizeImportLookupText, selectUniqueOriginalMatch, selectUniqueTranslationMatch } from "../src/lib/cloud/import-lookup.ts";
import { validateBoundedJson } from "../src/lib/cloud/bounded-json.ts";

test("lookup normalization handles unicode composition width whitespace and case", () => {
  assert.equal(normalizeImportLookupText("  Ａ Cafe\u0301  Book "), normalizeImportLookupText("a café book"));
});

test("translation lookup requires both normalized original and translation titles and rejects ambiguity", () => {
  const candidates = [{ id: "a", title: "English", originalBook: { title: "Book A" } }, { id: "b", title: "english", originalBook: { title: "Book B" } }];
  assert.equal(selectUniqueTranslationMatch(candidates, " book b ", "ＥＮＧＬＩＳＨ")?.id, "b");
  assert.equal(selectUniqueOriginalMatch([{ id: "1", title: "Café" }, { id: "2", title: "Cafe\u0301" }], "café"), null);
});

test("bounded JSON rejects extreme depth without recursive overflow", () => {
  let value: unknown = "leaf"; for (let index = 0; index < 12_000; index += 1) value = [value];
  assert.equal(validateBoundedJson(value), false);
});

test("canonical original lookup scans stable cursor pages before accepting one match", async () => {
  const rows = Array.from({ length: 205 }, (_, index) => ({ id: String(index + 1).padStart(3, "0"), title: index === 201 ? "Wanted" : `Book ${index}` }));
  const cursors: Array<string | null> = [];
  const match = await findUniqueOriginalMatchByPages(async (cursor, take) => {
    cursors.push(cursor);
    const start = cursor ? rows.findIndex((row) => row.id === cursor) + 1 : 0;
    return rows.slice(start, start + take);
  }, " wanted ");
  assert.equal(match?.id, "202");
  assert.deepEqual(cursors, [null, "100", "200"]);
});

test("canonical lookup rejects a second same-name match beyond row 101", async () => {
  const originals = Array.from({ length: 205 }, (_, index) => ({ id: String(index + 1).padStart(3, "0"), title: index === 2 || index === 150 ? "Duplicate" : `Book ${index}` }));
  const translations = Array.from({ length: 205 }, (_, index) => ({ id: String(index + 1).padStart(3, "0"), title: index === 2 || index === 150 ? "English" : `Translation ${index}`, originalBook: { title: index === 2 || index === 150 ? "Duplicate" : `Book ${index}` } }));
  const page = <T extends { id: string }>(rows: T[]) => async (cursor: string | null, take: number) => {
    const start = cursor ? rows.findIndex((row) => row.id === cursor) + 1 : 0;
    return rows.slice(start, start + take);
  };
  assert.equal(await findUniqueOriginalMatchByPages(page(originals), "duplicate"), null);
  assert.equal(await findUniqueTranslationMatchByPages(page(translations), "duplicate", "english"), null);
});
