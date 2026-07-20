import {
  DOMParser,
  type Document,
  type Element,
  type Node,
} from "@xmldom/xmldom";

import { EpubParseError } from "./epub-archive.ts";

export const epubXmlPolicy = {
  maxDepth: 128,
  maxNodes: 200_000,
} as const;

export type EpubXmlParseOptions = {
  maxDepth?: number;
  maxNodes?: number;
};

export type EpubXmlDocument = Document;
export type EpubXmlElement = Element;
export type EpubXmlNode = Node;

export function parseEpubXml(bytes: Uint8Array, options: EpubXmlParseOptions = {}) {
  let source: string;
  try {
    source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new EpubParseError("EPUB_INVALID_XML");
  }

  if (/<!\s*(?:DOCTYPE|ENTITY)\b/iu.test(source)) {
    throw new EpubParseError("EPUB_INVALID_XML");
  }
  const declaredEncoding = source.match(/<\?xml[^>]*\bencoding\s*=\s*["']([^"']+)["']/iu)?.[1];
  if (declaredEncoding && !/^utf-?8$/iu.test(declaredEncoding)) {
    throw new EpubParseError("EPUB_INVALID_XML");
  }

  let document: Document;
  try {
    document = new DOMParser({
      locator: false,
      onError() {
        throw new Error("invalid XML");
      },
    }).parseFromString(source, "application/xml");
  } catch {
    throw new EpubParseError("EPUB_INVALID_XML");
  }
  if (!document.documentElement) throw new EpubParseError("EPUB_INVALID_XML");

  enforceDomBudget(document, {
    maxDepth: boundedLimit(options.maxDepth, epubXmlPolicy.maxDepth),
    maxNodes: boundedLimit(options.maxNodes, epubXmlPolicy.maxNodes),
  });
  return document;
}

export function elementsByLocalName(root: Document | Element, localName: string) {
  const matches: Element[] = [];
  const stack: Node[] = [root];
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) continue;
    if (node.nodeType === 1 && (node as Element).localName === localName) matches.push(node as Element);
    for (let index = node.childNodes.length - 1; index >= 0; index -= 1) {
      const child = node.childNodes.item(index);
      if (child) stack.push(child);
    }
  }
  return matches;
}

export function normalizedElementText(element: Element | null | undefined) {
  if (!element) return "";
  const chunks: string[] = [];
  const stack: Node[] = [element];
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) continue;
    if (node.nodeType === 3 || node.nodeType === 4) chunks.push(node.nodeValue ?? "");
    for (let index = node.childNodes.length - 1; index >= 0; index -= 1) {
      const child = node.childNodes.item(index);
      if (child) stack.push(child);
    }
  }
  return chunks.join(" ").replace(/\s+/gu, " ").trim();
}

function enforceDomBudget(document: Document, limits: { maxDepth: number; maxNodes: number }) {
  const stack: Array<{ node: Node; depth: number }> = [{ node: document, depth: 0 }];
  let nodes = 0;
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    nodes += 1;
    if (nodes > limits.maxNodes || current.depth > limits.maxDepth) {
      throw new EpubParseError("EPUB_INVALID_XML");
    }
    for (let index = current.node.childNodes.length - 1; index >= 0; index -= 1) {
      const child = current.node.childNodes.item(index);
      if (child) stack.push({ node: child, depth: current.depth + (child.nodeType === 1 ? 1 : 0) });
    }
  }
}

function boundedLimit(requested: number | undefined, maximum: number) {
  if (requested === undefined) return maximum;
  if (!Number.isSafeInteger(requested) || requested < 1) throw new EpubParseError("EPUB_INVALID_XML");
  return Math.min(requested, maximum);
}
