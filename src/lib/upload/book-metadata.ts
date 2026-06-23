type UploadFileFormat = "TXT" | "EPUB";

export type InferredBookMetadata = {
  title: string;
  author: string | null;
  format: UploadFileFormat;
  originalFileName: string;
};

const titleAuthorSeparators = [" - ", " — ", " – ", " by "];

export function inferBookMetadataFromFileName(fileName: string): InferredBookMetadata | null {
  const trimmedFileName = fileName.trim();
  const format = detectMetadataFileFormat(trimmedFileName);

  if (!format) {
    return null;
  }

  const nameWithoutExtension = removeSupportedExtension(trimmedFileName, format);
  const { title, author } = splitTitleAndAuthor(nameWithoutExtension);

  return {
    title,
    author,
    format,
    originalFileName: trimmedFileName,
  };
}

export function splitTitleAndAuthor(rawTitle: string) {
  const normalizedTitle = normalizeMetadataStem(rawTitle);

  for (const separator of titleAuthorSeparators) {
    const separatorIndex = normalizedTitle.toLowerCase().indexOf(separator.toLowerCase());

    if (separatorIndex > 0) {
      const title = normalizeBookTitle(normalizedTitle.slice(0, separatorIndex));
      const author = normalizeAuthorName(normalizedTitle.slice(separatorIndex + separator.length));

      if (title && author) {
        return {
          title,
          author,
        };
      }
    }
  }

  return {
    title: normalizeBookTitle(normalizedTitle) || "未命名书籍",
    author: null,
  };
}

export function normalizeBookTitle(title: string) {
  return title
    .replace(/[_]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[.]+/g, " ")
    .trim();
}

function normalizeAuthorName(author: string) {
  return author.replace(/[_]+/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeMetadataStem(stem: string) {
  return stem.replace(/[_]+/g, " ").replace(/\s+/g, " ").trim();
}

function removeSupportedExtension(fileName: string, format: UploadFileFormat) {
  const extension = format === "TXT" ? ".txt" : ".epub";

  if (fileName.toLowerCase().endsWith(extension)) {
    return fileName.slice(0, -extension.length);
  }

  return fileName;
}

function detectMetadataFileFormat(fileName: string): UploadFileFormat | null {
  const normalized = fileName.trim().toLowerCase();

  if (normalized.endsWith(".txt")) {
    return "TXT";
  }

  if (normalized.endsWith(".epub")) {
    return "EPUB";
  }

  return null;
}
