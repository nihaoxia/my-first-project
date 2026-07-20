import assert from "node:assert/strict";
import test from "node:test";
import { strToU8 } from "fflate";

import { EpubParseError } from "../src/lib/upload/epub-archive.ts";
import { elementsByLocalName, parseEpubXml } from "../src/lib/upload/epub-xml.ts";

const invalidXml = (error: unknown) =>
  error instanceof EpubParseError && error.code === "EPUB_INVALID_XML";

test("parses UTF-8 XML independently of namespace prefixes", () => {
  const document = parseEpubXml(
    strToU8('\uFEFF<?xml version="1.0"?><opf:package xmlns:opf="urn:o"><opf:metadata /></opf:package>'),
  );
  assert.ok(document.documentElement);
  assert.equal(document.documentElement.localName, "package");
  assert.equal(elementsByLocalName(document, "metadata").length, 1);
});

test("rejects DTDs, entities, malformed XML, and invalid UTF-8", () => {
  for (const bytes of [
    strToU8('<!DOCTYPE package SYSTEM "https://example.com/book.dtd"><package/>'),
    strToU8('<!DOCTYPE package [<!ENTITY x "boom">]><package>&x;</package>'),
    strToU8("<package><metadata></package>"),
    Uint8Array.from([0xc3, 0x28]),
  ]) {
    assert.throws(() => parseEpubXml(bytes), invalidXml);
  }
});

test("enforces configurable lower DOM depth and node budgets", () => {
  assert.throws(
    () => parseEpubXml(strToU8("<a><b><c><d/></c></b></a>"), { maxDepth: 3 }),
    invalidXml,
  );
  assert.throws(
    () => parseEpubXml(strToU8("<a><b/><c/><d/></a>"), { maxNodes: 3 }),
    invalidXml,
  );
});
