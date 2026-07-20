import {
  elementsByLocalName,
  normalizedElementText,
  type EpubXmlDocument,
  type EpubXmlElement,
  type EpubXmlNode,
} from "./epub-xml.ts";

export type EpubDocumentText = {
  heading: string | null;
  documentTitle: string | null;
  content: string;
};

const ignoredElements = new Set([
  "script",
  "style",
  "noscript",
  "svg",
  "math",
  "nav",
  "aside",
  "object",
  "embed",
  "iframe",
  "audio",
  "video",
]);
const blockElements = new Set([
  "address",
  "article",
  "blockquote",
  "dd",
  "div",
  "dl",
  "dt",
  "figcaption",
  "figure",
  "footer",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "li",
  "main",
  "ol",
  "p",
  "pre",
  "section",
  "ul",
]);

export function extractEpubDocumentText(document: EpubXmlDocument): EpubDocumentText {
  const headingElement = ["h1", "h2", "h3", "h4", "h5", "h6"]
    .flatMap((name) => elementsByLocalName(document, name))
    .sort(compareDocumentOrder)[0];
  const heading = cleanInlineText(headingElement ? visibleText(headingElement) : "") || null;
  const documentTitle = cleanInlineText(
    normalizedElementText(elementsByLocalName(document, "title")[0]),
  ) || null;
  const root = elementsByLocalName(document, "body")[0] ?? document.documentElement;
  return { heading, documentTitle, content: extractVisibleBlocks(root) };
}

function extractVisibleBlocks(root: EpubXmlElement) {
  const chunks: string[] = [];
  const stack: Array<{ node: EpubXmlNode; closing: boolean }> = [{ node: root, closing: false }];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    const { node, closing } = current;
    if (node.nodeType === 3 || node.nodeType === 4) {
      chunks.push(node.nodeValue ?? "");
      continue;
    }
    if (node.nodeType !== 1) continue;
    const element = node as EpubXmlElement;
    const name = (element.localName ?? element.nodeName).toLowerCase();
    if (ignoredElements.has(name)) continue;
    if (closing) {
      if (blockElements.has(name)) chunks.push("\n\n");
      continue;
    }
    if (name === "br") {
      chunks.push("\n\n");
      continue;
    }
    if (blockElements.has(name)) chunks.push("\n\n");
    stack.push({ node, closing: true });
    for (let index = node.childNodes.length - 1; index >= 0; index -= 1) {
      const child = node.childNodes.item(index);
      if (child) stack.push({ node: child, closing: false });
    }
  }
  return normalizeBlocks(chunks.join(""));
}

function visibleText(root: EpubXmlElement) {
  const chunks: string[] = [];
  const stack: EpubXmlNode[] = [root];
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) continue;
    if (node.nodeType === 3 || node.nodeType === 4) {
      chunks.push(node.nodeValue ?? "");
      continue;
    }
    if (
      node.nodeType === 1 &&
      ignoredElements.has((((node as EpubXmlElement).localName ?? node.nodeName).toLowerCase()))
    ) continue;
    for (let index = node.childNodes.length - 1; index >= 0; index -= 1) {
      const child = node.childNodes.item(index);
      if (child) stack.push(child);
    }
  }
  return chunks.join(" ");
}

function normalizeBlocks(value: string) {
  return value
    .replace(/\u00a0/gu, " ")
    .replace(/\r\n?/gu, "\n")
    .split(/\n+/u)
    .map((line) => line.replace(/[\t\f\v ]+/gu, " ").trim())
    .filter(Boolean)
    .join("\n\n");
}

function cleanInlineText(value: string) {
  return value.replace(/\s+/gu, " ").trim().slice(0, 200);
}

function compareDocumentOrder(left: EpubXmlElement, right: EpubXmlElement) {
  if (left === right) return 0;
  const position = left.compareDocumentPosition?.(right) ?? 0;
  return (position & 4) !== 0 ? -1 : 1;
}
