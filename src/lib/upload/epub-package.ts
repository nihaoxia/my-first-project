import { EpubParseError, resolveEpubPath } from "./epub-archive.ts";
import {
  elementsByLocalName,
  normalizedElementText,
  type EpubXmlDocument,
  type EpubXmlElement,
} from "./epub-xml.ts";

export type EpubNavigation = { kind: "nav" | "ncx"; path: string };
export type EpubSpineItem = { id: string; path: string; mediaType: string };
export type EpubPackage = {
  metadata: { title: string | null; author: string | null; language: string | null };
  spine: EpubSpineItem[];
  navigation: EpubNavigation | null;
};

type ManifestItem = EpubSpineItem & { properties: ReadonlySet<string> };

export function parseContainerDocument(document: EpubXmlDocument) {
  const rootfiles = elementsByLocalName(document, "rootfile")
    .map((element) => element.getAttribute("full-path")?.trim() ?? "")
    .filter(Boolean);
  if (rootfiles.length > 1) {
    throw new EpubParseError("EPUB_MULTIPLE_RENDITIONS_UNSUPPORTED");
  }
  if (rootfiles.length !== 1) throw new EpubParseError("EPUB_INVALID_ARCHIVE");
  return resolveEpubPath("root.opf", rootfiles[0]);
}

export function assertNoEncryptedContent(document: EpubXmlDocument | null | undefined) {
  if (document && elementsByLocalName(document, "EncryptedData").length > 0) {
    throw new EpubParseError("EPUB_DRM_UNSUPPORTED");
  }
}

export function parsePackageDocument(document: EpubXmlDocument, packagePath: string): EpubPackage {
  assertReflowable(document);
  const metadataElement = elementsByLocalName(document, "metadata")[0];
  const metadata = {
    title: firstText(metadataElement, "title"),
    author: firstText(metadataElement, "creator"),
    language: firstText(metadataElement, "language"),
  };

  const manifest = new Map<string, ManifestItem>();
  for (const element of elementsByLocalName(document, "item")) {
    const id = element.getAttribute("id")?.trim() ?? "";
    const href = element.getAttribute("href")?.trim() ?? "";
    const mediaType = element.getAttribute("media-type")?.trim().toLowerCase() ?? "";
    if (!id || !href || !mediaType || manifest.has(id)) {
      throw new EpubParseError("EPUB_INVALID_ARCHIVE");
    }
    manifest.set(id, {
      id,
      path: resolveEpubPath(packagePath, href),
      mediaType,
      properties: new Set((element.getAttribute("properties") ?? "").split(/\s+/u).filter(Boolean)),
    });
  }

  const spineElement = elementsByLocalName(document, "spine")[0];
  if (!spineElement) throw new EpubParseError("EPUB_INVALID_ARCHIVE");
  const spine: EpubSpineItem[] = [];
  const seen = new Set<string>();
  for (const itemref of elementsByLocalName(spineElement, "itemref")) {
    const idref = itemref.getAttribute("idref")?.trim() ?? "";
    const item = manifest.get(idref);
    if (!idref || !item || seen.has(idref)) throw new EpubParseError("EPUB_INVALID_ARCHIVE");
    seen.add(idref);
    if ((itemref.getAttribute("linear") ?? "").trim().toLowerCase() === "no") continue;
    if (item.mediaType !== "application/xhtml+xml" && item.mediaType !== "text/html") {
      throw new EpubParseError("EPUB_INVALID_ARCHIVE");
    }
    spine.push({ id: item.id, path: item.path, mediaType: item.mediaType });
    if (spine.length > 2_000) throw new EpubParseError("EPUB_EXPANDED_TOO_LARGE");
  }

  const navItem = [...manifest.values()].find((item) => item.properties.has("nav"));
  const tocId = spineElement.getAttribute("toc")?.trim() ?? "";
  const ncxItem = tocId ? manifest.get(tocId) : undefined;
  const navigation = navItem
    ? { kind: "nav" as const, path: navItem.path }
    : ncxItem?.mediaType === "application/x-dtbncx+xml"
      ? { kind: "ncx" as const, path: ncxItem.path }
      : null;

  return { metadata, spine, navigation };
}

export function parseNavigationTitles(document: EpubXmlDocument, navigation: EpubNavigation) {
  const titles = new Map<string, string>();
  if (navigation.kind === "nav") {
    const navs = elementsByLocalName(document, "nav");
    const toc = navs.find((element) => {
      const type = element.getAttribute("epub:type") ?? element.getAttribute("type") ?? "";
      const role = element.getAttribute("role") ?? "";
      return type.split(/\s+/u).includes("toc") || role.split(/\s+/u).includes("doc-toc");
    }) ?? navs[0];
    if (!toc) return titles;
    for (const anchor of elementsByLocalName(toc, "a")) {
      addNavigationTitle(titles, navigation.path, anchor.getAttribute("href"), normalizedElementText(anchor));
    }
    return titles;
  }

  for (const navPoint of elementsByLocalName(document, "navPoint")) {
    const content = elementsByLocalName(navPoint, "content")[0];
    const label = elementsByLocalName(navPoint, "navLabel")[0];
    addNavigationTitle(titles, navigation.path, content?.getAttribute("src"), normalizedElementText(label));
  }
  return titles;
}

function addNavigationTitle(
  titles: Map<string, string>,
  navigationPath: string,
  href: string | null | undefined,
  title: string,
) {
  if (!href?.trim() || !title || title.length > 200) return;
  const path = resolveEpubPath(navigationPath, href.trim());
  if (!titles.has(path)) titles.set(path, title);
}

function firstText(root: EpubXmlElement | undefined, localName: string) {
  const value = normalizedElementText(root ? elementsByLocalName(root, localName)[0] : undefined);
  return value || null;
}

function assertReflowable(document: EpubXmlDocument) {
  for (const meta of elementsByLocalName(document, "meta")) {
    const property = meta.getAttribute("property")?.trim().toLowerCase();
    const name = meta.getAttribute("name")?.trim().toLowerCase();
    const value = (normalizedElementText(meta) || meta.getAttribute("content") || "").trim().toLowerCase();
    if (
      (property === "rendition:layout" && value === "pre-paginated") ||
      (name === "fixed-layout" && (value === "true" || value === "yes" || value === "pre-paginated"))
    ) {
      throw new EpubParseError("EPUB_FIXED_LAYOUT_UNSUPPORTED");
    }
  }
}
