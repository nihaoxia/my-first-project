import assert from "node:assert/strict";
import test from "node:test";
import { strToU8 } from "fflate";

import { EpubParseError } from "../src/lib/upload/epub-archive.ts";
import {
  assertNoEncryptedContent,
  parseContainerDocument,
  parseNavigationTitles,
  parsePackageDocument,
} from "../src/lib/upload/epub-package.ts";
import { parseEpubXml } from "../src/lib/upload/epub-xml.ts";

function xml(source: string) {
  return parseEpubXml(strToU8(source));
}

function hasCode(code: EpubParseError["code"]) {
  return (error: unknown) => error instanceof EpubParseError && error.code === code;
}

test("reads one container rootfile and rejects multiple renditions", () => {
  assert.equal(
    parseContainerDocument(xml('<container><rootfiles><rootfile full-path="OPS/package.opf" /></rootfiles></container>')),
    "OPS/package.opf",
  );
  assert.throws(
    () => parseContainerDocument(xml('<container><rootfiles><rootfile full-path="a.opf"/><rootfile full-path="b.opf"/></rootfiles></container>')),
    hasCode("EPUB_MULTIPLE_RENDITIONS_UNSUPPORTED"),
  );
});

test("parses metadata and keeps the OPF spine as authoritative order", () => {
  const parsed = parsePackageDocument(
    xml(`
      <package xmlns="http://www.idpf.org/2007/opf" version="3.0">
        <metadata><title>边境档案</title><creator>林间客</creator><language>zh-CN</language></metadata>
        <manifest>
          <item id="two" href="text/two.xhtml" media-type="application/xhtml+xml"/>
          <item id="one" href="text/one.xhtml" media-type="application/xhtml+xml"/>
          <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
        </manifest>
        <spine><itemref idref="one"/><itemref idref="two"/><itemref idref="nav" linear="no"/></spine>
      </package>`),
    "OPS/package.opf",
  );
  assert.deepEqual(parsed.metadata, { title: "边境档案", author: "林间客", language: "zh-CN" });
  assert.deepEqual(parsed.spine.map((item) => item.path), ["OPS/text/one.xhtml", "OPS/text/two.xhtml"]);
  assert.equal(parsed.navigation?.kind, "nav");
  assert.equal(parsed.navigation?.path, "OPS/nav.xhtml");
});

test("rejects duplicate manifest ids and unknown spine references", () => {
  const templates = [
    '<manifest><item id="x" href="a.xhtml" media-type="application/xhtml+xml"/><item id="x" href="b.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="x"/></spine>',
    '<manifest><item id="x" href="a.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="missing"/></spine>',
  ];
  for (const body of templates) {
    assert.throws(
      () => parsePackageDocument(xml(`<package><metadata/>${body}</package>`), "package.opf"),
      hasCode("EPUB_INVALID_ARCHIVE"),
    );
  }

  assert.throws(
    () => parsePackageDocument(
      xml('<package><metadata/><manifest><item id="x" href="https://example.com/a.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="x"/></spine></package>'),
      "package.opf",
    ),
    hasCode("EPUB_UNSAFE_ARCHIVE"),
  );
});

test("rejects fixed-layout and encrypted EPUB packages", () => {
  assert.throws(
    () => parsePackageDocument(
      xml('<package><metadata><meta property="rendition:layout">pre-paginated</meta></metadata><manifest/><spine/></package>'),
      "package.opf",
    ),
    hasCode("EPUB_FIXED_LAYOUT_UNSUPPORTED"),
  );
  assert.throws(
    () => assertNoEncryptedContent(xml('<encryption><EncryptedData/></encryption>')),
    hasCode("EPUB_DRM_UNSUPPORTED"),
  );
});

test("maps EPUB 3 nav and EPUB 2 NCX labels without changing spine order", () => {
  const nav = parseNavigationTitles(
    xml('<html xmlns:epub="http://www.idpf.org/2007/ops"><body><nav epub:type="toc"><a href="text/two.xhtml#top">第二章</a><a href="text/one.xhtml">第一章</a></nav></body></html>'),
    { kind: "nav", path: "OPS/nav.xhtml" },
  );
  assert.equal(nav.get("OPS/text/one.xhtml"), "第一章");
  assert.equal(nav.get("OPS/text/two.xhtml"), "第二章");

  const ncx = parseNavigationTitles(
    xml('<ncx><navMap><navPoint><navLabel><text>旧版标题</text></navLabel><content src="chapter.xhtml#p1"/></navPoint></navMap></ncx>'),
    { kind: "ncx", path: "OPS/toc.ncx" },
  );
  assert.equal(ncx.get("OPS/chapter.xhtml"), "旧版标题");
});
