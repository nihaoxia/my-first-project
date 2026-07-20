import assert from "node:assert/strict";
import test from "node:test";

import {
  EpubParseError,
  inspectEpubArchive,
  readEpubEntries,
  resolveEpubPath,
} from "../src/lib/upload/epub-archive.ts";
import {
  makeEpubZip,
  makeZipWithFirstEntry,
  mutateZipEntry,
  renameZipEntry,
} from "./epub-fixtures.ts";

function hasCode(code: EpubParseError["code"]) {
  return (error: unknown) => error instanceof EpubParseError && error.code === code;
}

test("validates the EPUB marker and selectively expands requested text entries", async () => {
  const bytes = makeEpubZip({
    "META-INF/container.xml": "<container />",
    "OPS/chapter.xhtml": "<html><body><p>正文</p></body></html>",
    "OPS/cover.jpg": new Uint8Array([1, 2, 3, 4]),
  });
  const archive = inspectEpubArchive(bytes);

  assert.equal(archive.entries.has("mimetype"), true);
  assert.equal(archive.entries.has("OPS/cover.jpg"), true);

  const expanded = await readEpubEntries(
    archive,
    new Set(["META-INF/container.xml", "OPS/chapter.xhtml"]),
  );
  assert.deepEqual([...expanded.keys()], ["META-INF/container.xml", "OPS/chapter.xhtml"]);
  assert.equal(new TextDecoder().decode(expanded.get("OPS/chapter.xhtml")), "<html><body><p>正文</p></body></html>");
  assert.equal(expanded.has("OPS/cover.jpg"), false);
});

test("requires an uncompressed exact mimetype as the first local entry", () => {
  assert.throws(
    () => inspectEpubArchive(makeZipWithFirstEntry("first.txt", "not the marker")),
    hasCode("EPUB_INVALID_ARCHIVE"),
  );
  assert.throws(
    () => inspectEpubArchive(makeEpubZip({ mimetype: "application/epub+zip ", "OPS/a.xhtml": "x" })),
    hasCode("EPUB_INVALID_ARCHIVE"),
  );
});

test("rejects corrupt, encrypted, ZIP64, and unsupported compression archives", () => {
  const valid = makeEpubZip({ "OPS/a.xhtml": "content" });
  const corrupt = valid.slice();
  corrupt[corrupt.length - 22] = 0;
  assert.throws(() => inspectEpubArchive(corrupt), hasCode("EPUB_INVALID_ARCHIVE"));

  const encrypted = mutateZipEntry(valid, "OPS/a.xhtml", (view, central, local) => {
    view.setUint16(central + 8, view.getUint16(central + 8, true) | 1, true);
    view.setUint16(local + 6, view.getUint16(local + 6, true) | 1, true);
  });
  assert.throws(() => inspectEpubArchive(encrypted), hasCode("EPUB_UNSAFE_ARCHIVE"));

  const zip64 = mutateZipEntry(valid, "OPS/a.xhtml", (view, central) => {
    view.setUint32(central + 24, 0xffffffff, true);
  });
  assert.throws(() => inspectEpubArchive(zip64), hasCode("EPUB_UNSAFE_ARCHIVE"));

  const unsupported = mutateZipEntry(valid, "OPS/a.xhtml", (view, central, local) => {
    view.setUint16(central + 10, 99, true);
    view.setUint16(local + 8, 99, true);
  });
  assert.throws(() => inspectEpubArchive(unsupported), hasCode("EPUB_UNSAFE_ARCHIVE"));
});

test("rejects unsafe and duplicate normalized entry paths", () => {
  for (const path of ["../evil.xhtml", "OPS\\evil.xhtml", "/evil.xhtml", "C:/evil.xhtml", "OPS//evil.xhtml", "OPS/./evil.xhtml"]) {
    assert.throws(
      () => inspectEpubArchive(makeEpubZip({ [path]: "x" })),
      hasCode("EPUB_UNSAFE_ARCHIVE"),
      path,
    );
  }

  const duplicate = renameZipEntry(
    makeEpubZip({ "OPS/a.xhtml": "a", "OPS/b.xhtml": "b" }),
    "OPS/b.xhtml",
    "OPS/a.xhtml",
  );
  assert.throws(() => inspectEpubArchive(duplicate), hasCode("EPUB_UNSAFE_ARCHIVE"));
});

test("rejects excessive compression before expanding any entry", () => {
  const compressedBomb = makeEpubZip({ "OPS/bomb.xhtml": "x".repeat(100_000) });
  assert.throws(() => inspectEpubArchive(compressedBomb), hasCode("EPUB_EXPANDED_TOO_LARGE"));
});

test("resolves safe package-relative hrefs without allowing external or escaping paths", () => {
  assert.equal(
    resolveEpubPath("OPS/package.opf", "text/chapter%201.xhtml#top"),
    "OPS/text/chapter 1.xhtml",
  );
  for (const href of ["https://example.com/a.xhtml", "//example.com/a.xhtml", "../outside.xhtml", "a.xhtml?raw=1", "a%2Fb.xhtml"]) {
    assert.throws(() => resolveEpubPath("package.opf", href), hasCode("EPUB_UNSAFE_ARCHIVE"), href);
  }
});

test("fails closed when a requested entry is missing", async () => {
  const archive = inspectEpubArchive(makeEpubZip({ "OPS/a.xhtml": "content" }));
  await assert.rejects(
    readEpubEntries(archive, new Set(["OPS/missing.xhtml"])),
    hasCode("EPUB_INVALID_ARCHIVE"),
  );
});
