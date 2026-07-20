import type { InferredBookMetadata } from "./book-metadata.ts";
import type { ChapterPreview, ChapterWarning } from "./chapter-preview.ts";
import {
  epubArchivePolicy,
  EpubParseError,
  inspectEpubArchive,
  readEpubEntries,
} from "./epub-archive.ts";
import {
  assertNoEncryptedContent,
  parseContainerDocument,
  parseNavigationTitles,
  parsePackageDocument,
} from "./epub-package.ts";
import { extractEpubDocumentText } from "./epub-text.ts";
import { parseEpubXml } from "./epub-xml.ts";

export const epubBookPolicy = {
  maxChapters: 2_000,
  maxTitleCharacters: 200,
  maxExtractedTextBytes: 2 * 1024 * 1024,
  shortChapterCharacters: 500,
  contentPreviewCharacters: 120,
} as const;

export type ParsedEpubBook = {
  metadata: InferredBookMetadata;
  chapters: ChapterPreview[];
  warnings: ChapterWarning[];
};

export async function parseEpubBook(
  bytes: Uint8Array,
  fallbackMetadata: InferredBookMetadata,
): Promise<ParsedEpubBook> {
  const archive = inspectEpubArchive(bytes);
  const controlPaths = new Set(["META-INF/container.xml"]);
  if (archive.entries.has("META-INF/encryption.xml")) controlPaths.add("META-INF/encryption.xml");
  const control = await readEpubEntries(archive, controlPaths);
  const encryptionBytes = control.get("META-INF/encryption.xml");
  if (encryptionBytes) assertNoEncryptedContent(parseEpubXml(encryptionBytes));

  const containerBytes = control.get("META-INF/container.xml");
  if (!containerBytes) throw new EpubParseError("EPUB_INVALID_ARCHIVE");
  const packagePath = parseContainerDocument(parseEpubXml(containerBytes));
  const packageBytes = (await readEpubEntries(archive, new Set([packagePath]))).get(packagePath);
  if (!packageBytes) throw new EpubParseError("EPUB_INVALID_ARCHIVE");
  const packageDocument = parsePackageDocument(parseEpubXml(packageBytes), packagePath);

  const contentPaths = new Set(packageDocument.spine.map((item) => item.path));
  if (packageDocument.navigation) contentPaths.add(packageDocument.navigation.path);
  assertTotalActualBudget(archive, new Set([...controlPaths, packagePath, ...contentPaths]));
  const contentEntries = await readEpubEntries(archive, contentPaths);

  const navigationTitles = packageDocument.navigation
    ? parseNavigationTitles(
        parseEpubXml(requiredEntry(contentEntries, packageDocument.navigation.path)),
        packageDocument.navigation,
      )
    : new Map<string, string>();

  const chapters: ChapterPreview[] = [];
  let extractedTextBytes = 0;
  for (const spineItem of packageDocument.spine) {
    const extracted = extractEpubDocumentText(parseEpubXml(requiredEntry(contentEntries, spineItem.path)));
    if (!extracted.content) continue;

    extractedTextBytes += new TextEncoder().encode(extracted.content).byteLength;
    if (extractedTextBytes > epubBookPolicy.maxExtractedTextBytes) {
      throw new EpubParseError("EPUB_EXPANDED_TOO_LARGE");
    }
    const title = normalizeTitle(
      navigationTitles.get(spineItem.path) ||
        extracted.heading ||
        extracted.documentTitle ||
        `第 ${chapters.length + 1} 章`,
    );
    chapters.push(buildChapterPreview(chapters.length + 1, title, extracted.content));
    if (chapters.length > epubBookPolicy.maxChapters) {
      throw new EpubParseError("EPUB_EXPANDED_TOO_LARGE");
    }
  }
  if (chapters.length === 0) throw new EpubParseError("EPUB_NO_READABLE_TEXT");

  return {
    metadata: {
      title: normalizeMetadataValue(packageDocument.metadata.title) || fallbackMetadata.title,
      author: normalizeMetadataValue(packageDocument.metadata.author) || fallbackMetadata.author,
      format: "EPUB",
      originalFileName: fallbackMetadata.originalFileName,
    },
    chapters,
    warnings: [],
  };
}

function requiredEntry(entries: ReadonlyMap<string, Uint8Array>, path: string) {
  const value = entries.get(path);
  if (!value) throw new EpubParseError("EPUB_INVALID_ARCHIVE");
  return value;
}

function assertTotalActualBudget(
  archive: ReturnType<typeof inspectEpubArchive>,
  paths: ReadonlySet<string>,
) {
  let total = 0;
  for (const path of paths) {
    const entry = archive.entries.get(path);
    if (!entry || entry.directory) throw new EpubParseError("EPUB_INVALID_ARCHIVE");
    total += entry.uncompressedSize;
    if (total > epubArchivePolicy.maxActualTextBytes) {
      throw new EpubParseError("EPUB_EXPANDED_TOO_LARGE");
    }
  }
}

function buildChapterPreview(index: number, title: string, content: string): ChapterPreview {
  const characterCount = `${title}\n${content}`.replace(/\s/gu, "").length;
  const warnings: ChapterWarning[] =
    characterCount < epubBookPolicy.shortChapterCharacters ? ["short-chapter"] : [];
  return {
    index,
    title,
    characterCount,
    content,
    contentPreview: content.replace(/\s+/gu, " ").trim().slice(0, epubBookPolicy.contentPreviewCharacters),
    suggestedSkip: false,
    warnings,
  };
}

function normalizeTitle(value: string) {
  return value.replace(/\s+/gu, " ").trim().slice(0, epubBookPolicy.maxTitleCharacters) || "未命名章节";
}

function normalizeMetadataValue(value: string | null) {
  return value?.replace(/\s+/gu, " ").trim() || "";
}
