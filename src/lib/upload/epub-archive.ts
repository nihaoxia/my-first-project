import { unzip } from "fflate";

export const epubArchivePolicy = {
  maxCompressedBytes: 2 * 1024 * 1024,
  maxEntries: 2_048,
  maxPathCharacters: 512,
  maxDeclaredExpandedBytes: 32 * 1024 * 1024,
  maxEntryExpandedBytes: 8 * 1024 * 1024,
  maxEntryCompressionRatio: 200,
  maxTotalCompressionRatio: 100,
  maxActualTextEntryBytes: 2 * 1024 * 1024,
  maxActualTextBytes: 8 * 1024 * 1024,
} as const;

export type EpubParseErrorCode =
  | "EPUB_INVALID_ARCHIVE"
  | "EPUB_UNSAFE_ARCHIVE"
  | "EPUB_EXPANDED_TOO_LARGE"
  | "EPUB_INVALID_XML"
  | "EPUB_DRM_UNSUPPORTED"
  | "EPUB_FIXED_LAYOUT_UNSUPPORTED"
  | "EPUB_MULTIPLE_RENDITIONS_UNSUPPORTED"
  | "EPUB_NO_READABLE_TEXT";

export class EpubParseError extends Error {
  readonly code: EpubParseErrorCode;

  constructor(code: EpubParseErrorCode) {
    super(code);
    this.name = "EpubParseError";
    this.code = code;
  }
}

export type EpubArchiveEntry = {
  path: string;
  compressedSize: number;
  uncompressedSize: number;
  compressionMethod: 0 | 8;
  localHeaderOffset: number;
  directory: boolean;
};

export type EpubArchive = {
  bytes: Uint8Array;
  entries: ReadonlyMap<string, EpubArchiveEntry>;
};

const signatures = {
  local: 0x04034b50,
  central: 0x02014b50,
  end: 0x06054b50,
} as const;
const marker = new TextEncoder().encode("application/epub+zip");

export function inspectEpubArchive(input: Uint8Array): EpubArchive {
  if (input.byteLength === 0 || input.byteLength > epubArchivePolicy.maxCompressedBytes) {
    throw new EpubParseError("EPUB_INVALID_ARCHIVE");
  }

  const bytes = input.slice();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const endOffset = findEndRecord(view, bytes.byteLength);
  const diskNumber = readU16(view, endOffset + 4);
  const centralDisk = readU16(view, endOffset + 6);
  const diskEntries = readU16(view, endOffset + 8);
  const totalEntries = readU16(view, endOffset + 10);
  const centralSize = readU32(view, endOffset + 12);
  const centralOffset = readU32(view, endOffset + 16);

  if (
    diskNumber !== 0 ||
    centralDisk !== 0 ||
    diskEntries !== totalEntries ||
    totalEntries === 0 ||
    totalEntries === 0xffff
  ) {
    throw new EpubParseError("EPUB_UNSAFE_ARCHIVE");
  }
  if (totalEntries > epubArchivePolicy.maxEntries) {
    throw new EpubParseError("EPUB_EXPANDED_TOO_LARGE");
  }
  if (centralOffset + centralSize !== endOffset || centralOffset >= endOffset) {
    throw new EpubParseError("EPUB_INVALID_ARCHIVE");
  }

  const entries = new Map<string, EpubArchiveEntry>();
  const localOffsets = new Set<number>();
  let offset = centralOffset;
  let totalCompressed = 0;
  let totalExpanded = 0;

  for (let index = 0; index < totalEntries; index += 1) {
    ensureRange(bytes, offset, 46);
    if (readU32(view, offset) !== signatures.central) {
      throw new EpubParseError("EPUB_INVALID_ARCHIVE");
    }

    const versionNeeded = readU16(view, offset + 6);
    const flags = readU16(view, offset + 8);
    const method = readU16(view, offset + 10);
    const crc32 = readU32(view, offset + 16);
    const compressedSize = readU32(view, offset + 20);
    const uncompressedSize = readU32(view, offset + 24);
    const nameLength = readU16(view, offset + 28);
    const extraLength = readU16(view, offset + 30);
    const commentLength = readU16(view, offset + 32);
    const diskStart = readU16(view, offset + 34);
    const localHeaderOffset = readU32(view, offset + 42);
    const recordLength = 46 + nameLength + extraLength + commentLength;
    ensureRange(bytes, offset, recordLength);

    if (
      versionNeeded >= 45 ||
      diskStart !== 0 ||
      compressedSize === 0xffffffff ||
      uncompressedSize === 0xffffffff ||
      localHeaderOffset === 0xffffffff ||
      hasZip64Extra(bytes.subarray(offset + 46 + nameLength, offset + 46 + nameLength + extraLength))
    ) {
      throw new EpubParseError("EPUB_UNSAFE_ARCHIVE");
    }
    if ((flags & (0x0001 | 0x0040 | 0x2000)) !== 0 || (method !== 0 && method !== 8)) {
      throw new EpubParseError("EPUB_UNSAFE_ARCHIVE");
    }

    const path = decodeEntryName(bytes.subarray(offset + 46, offset + 46 + nameLength));
    const directory = path.endsWith("/");
    validateEntryPath(path, directory);
    if (entries.has(path) || localOffsets.has(localHeaderOffset)) {
      throw new EpubParseError("EPUB_UNSAFE_ARCHIVE");
    }
    if (directory && (compressedSize !== 0 || uncompressedSize !== 0)) {
      throw new EpubParseError("EPUB_UNSAFE_ARCHIVE");
    }
    if (uncompressedSize > epubArchivePolicy.maxEntryExpandedBytes) {
      throw new EpubParseError("EPUB_EXPANDED_TOO_LARGE");
    }
    if (compressionRatio(uncompressedSize, compressedSize) > epubArchivePolicy.maxEntryCompressionRatio) {
      throw new EpubParseError("EPUB_EXPANDED_TOO_LARGE");
    }

    validateLocalHeader({
      bytes,
      view,
      centralOffset,
      path,
      flags,
      method,
      crc32,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
    });

    const entry: EpubArchiveEntry = {
      path,
      compressedSize,
      uncompressedSize,
      compressionMethod: method,
      localHeaderOffset,
      directory,
    };
    entries.set(path, entry);
    localOffsets.add(localHeaderOffset);
    totalCompressed += compressedSize;
    totalExpanded += uncompressedSize;
    if (totalExpanded > epubArchivePolicy.maxDeclaredExpandedBytes) {
      throw new EpubParseError("EPUB_EXPANDED_TOO_LARGE");
    }
    offset += recordLength;
  }

  if (
    offset !== endOffset ||
    compressionRatio(totalExpanded, totalCompressed) > epubArchivePolicy.maxTotalCompressionRatio
  ) {
    throw new EpubParseError(
      offset !== endOffset ? "EPUB_INVALID_ARCHIVE" : "EPUB_EXPANDED_TOO_LARGE",
    );
  }

  validateMimetype(bytes, view, entries);
  return { bytes, entries };
}

export async function readEpubEntries(
  archive: EpubArchive,
  requestedPaths: ReadonlySet<string>,
): Promise<ReadonlyMap<string, Uint8Array>> {
  let declaredBytes = 0;
  for (const path of requestedPaths) {
    const entry = archive.entries.get(path);
    if (!entry || entry.directory) throw new EpubParseError("EPUB_INVALID_ARCHIVE");
    if (entry.uncompressedSize > epubArchivePolicy.maxActualTextEntryBytes) {
      throw new EpubParseError("EPUB_EXPANDED_TOO_LARGE");
    }
    declaredBytes += entry.uncompressedSize;
  }
  if (declaredBytes > epubArchivePolicy.maxActualTextBytes) {
    throw new EpubParseError("EPUB_EXPANDED_TOO_LARGE");
  }
  if (requestedPaths.size === 0) return new Map();

  const expanded = await new Promise<Record<string, Uint8Array>>((resolve, reject) => {
    unzip(
      archive.bytes,
      { filter: (file) => requestedPaths.has(file.name) },
      (error, result) => {
        if (error) reject(new EpubParseError("EPUB_INVALID_ARCHIVE"));
        else resolve(result);
      },
    );
  });

  const output = new Map<string, Uint8Array>();
  let actualBytes = 0;
  for (const path of requestedPaths) {
    const value = expanded[path];
    const entry = archive.entries.get(path);
    if (!value || !entry || value.byteLength !== entry.uncompressedSize) {
      throw new EpubParseError("EPUB_INVALID_ARCHIVE");
    }
    if (value.byteLength > epubArchivePolicy.maxActualTextEntryBytes) {
      throw new EpubParseError("EPUB_EXPANDED_TOO_LARGE");
    }
    actualBytes += value.byteLength;
    if (actualBytes > epubArchivePolicy.maxActualTextBytes) {
      throw new EpubParseError("EPUB_EXPANDED_TOO_LARGE");
    }
    output.set(path, value);
  }
  return output;
}

export function resolveEpubPath(basePath: string, href: string): string {
  if (!href || /[\\\0?]/u.test(href) || /%(?:00|2f|5c)/iu.test(href)) {
    throw new EpubParseError("EPUB_UNSAFE_ARCHIVE");
  }
  const withoutFragment = href.split("#", 1)[0] ?? "";
  if (!withoutFragment && href.startsWith("#")) {
    validateEntryPath(basePath, false);
    return basePath;
  }
  let decoded: string;
  try {
    decoded = decodeURIComponent(withoutFragment);
  } catch {
    throw new EpubParseError("EPUB_UNSAFE_ARCHIVE");
  }
  if (
    !decoded ||
    decoded.startsWith("/") ||
    decoded.startsWith("//") ||
    /^[a-z][a-z0-9+.-]*:/iu.test(decoded) ||
    /[\\\0?]/u.test(decoded)
  ) {
    throw new EpubParseError("EPUB_UNSAFE_ARCHIVE");
  }

  const baseSegments = basePath.split("/").slice(0, -1);
  for (const segment of decoded.split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      if (baseSegments.length === 0) throw new EpubParseError("EPUB_UNSAFE_ARCHIVE");
      baseSegments.pop();
    } else {
      baseSegments.push(segment);
    }
  }
  const resolved = baseSegments.join("/");
  validateEntryPath(resolved, false);
  return resolved;
}

function findEndRecord(view: DataView, length: number) {
  const minimum = Math.max(0, length - 65_557);
  const matches: number[] = [];
  for (let offset = length - 22; offset >= minimum; offset -= 1) {
    if (readU32(view, offset) !== signatures.end) continue;
    const commentLength = readU16(view, offset + 20);
    if (offset + 22 + commentLength === length) matches.push(offset);
  }
  if (matches.length !== 1) throw new EpubParseError("EPUB_INVALID_ARCHIVE");
  return matches[0];
}

function validateLocalHeader(input: {
  bytes: Uint8Array;
  view: DataView;
  centralOffset: number;
  path: string;
  flags: number;
  method: number;
  crc32: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
}) {
  const { bytes, view, centralOffset, path, flags, method, crc32, compressedSize, uncompressedSize, localHeaderOffset } = input;
  ensureRange(bytes, localHeaderOffset, 30);
  if (readU32(view, localHeaderOffset) !== signatures.local) {
    throw new EpubParseError("EPUB_INVALID_ARCHIVE");
  }
  const localFlags = readU16(view, localHeaderOffset + 6);
  const localMethod = readU16(view, localHeaderOffset + 8);
  const localCrc = readU32(view, localHeaderOffset + 14);
  const localCompressed = readU32(view, localHeaderOffset + 18);
  const localExpanded = readU32(view, localHeaderOffset + 22);
  const nameLength = readU16(view, localHeaderOffset + 26);
  const extraLength = readU16(view, localHeaderOffset + 28);
  const headerLength = 30 + nameLength + extraLength;
  ensureRange(bytes, localHeaderOffset, headerLength + compressedSize);
  const localPath = decodeEntryName(bytes.subarray(localHeaderOffset + 30, localHeaderOffset + 30 + nameLength));
  if (localPath !== path || localFlags !== flags || localMethod !== method) {
    throw new EpubParseError("EPUB_INVALID_ARCHIVE");
  }
  if (
    hasZip64Extra(bytes.subarray(localHeaderOffset + 30 + nameLength, localHeaderOffset + headerLength)) ||
    localHeaderOffset + headerLength + compressedSize > centralOffset
  ) {
    throw new EpubParseError("EPUB_UNSAFE_ARCHIVE");
  }
  if ((flags & 0x0008) === 0 && (localCrc !== crc32 || localCompressed !== compressedSize || localExpanded !== uncompressedSize)) {
    throw new EpubParseError("EPUB_INVALID_ARCHIVE");
  }
}

function validateMimetype(
  bytes: Uint8Array,
  view: DataView,
  entries: ReadonlyMap<string, EpubArchiveEntry>,
) {
  const entry = entries.get("mimetype");
  if (!entry || entry.localHeaderOffset !== 0 || entry.compressionMethod !== 0) {
    throw new EpubParseError("EPUB_INVALID_ARCHIVE");
  }
  const flags = readU16(view, 6);
  const nameLength = readU16(view, 26);
  const extraLength = readU16(view, 28);
  if ((flags & 0x0008) !== 0 || nameLength !== 8 || extraLength !== 0 || entry.uncompressedSize !== marker.length) {
    throw new EpubParseError("EPUB_INVALID_ARCHIVE");
  }
  const start = 30 + nameLength;
  const content = bytes.subarray(start, start + entry.compressedSize);
  if (content.length !== marker.length || !content.every((value, index) => value === marker[index])) {
    throw new EpubParseError("EPUB_INVALID_ARCHIVE");
  }
}

function validateEntryPath(path: string, directory: boolean) {
  if (
    !path ||
    path.length > epubArchivePolicy.maxPathCharacters ||
    /[\\\0]/u.test(path) ||
    path.startsWith("/") ||
    /^[a-z]:\//iu.test(path)
  ) {
    throw new EpubParseError("EPUB_UNSAFE_ARCHIVE");
  }
  const normalized = directory ? path.slice(0, -1) : path;
  const segments = normalized.split("/");
  if (!normalized || segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw new EpubParseError("EPUB_UNSAFE_ARCHIVE");
  }
}

function decodeEntryName(bytes: Uint8Array) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new EpubParseError("EPUB_UNSAFE_ARCHIVE");
  }
}

function hasZip64Extra(extra: Uint8Array) {
  const view = new DataView(extra.buffer, extra.byteOffset, extra.byteLength);
  let offset = 0;
  while (offset + 4 <= extra.byteLength) {
    const id = readU16(view, offset);
    const size = readU16(view, offset + 2);
    if (offset + 4 + size > extra.byteLength) throw new EpubParseError("EPUB_INVALID_ARCHIVE");
    if (id === 0x0001) return true;
    offset += 4 + size;
  }
  if (offset !== extra.byteLength) throw new EpubParseError("EPUB_INVALID_ARCHIVE");
  return false;
}

function compressionRatio(expanded: number, compressed: number) {
  if (expanded === 0) return 0;
  if (compressed === 0) return Number.POSITIVE_INFINITY;
  return expanded / compressed;
}

function ensureRange(bytes: Uint8Array, offset: number, length: number) {
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 0 || offset + length > bytes.byteLength) {
    throw new EpubParseError("EPUB_INVALID_ARCHIVE");
  }
}

function readU16(view: DataView, offset: number) {
  if (offset < 0 || offset + 2 > view.byteLength) throw new EpubParseError("EPUB_INVALID_ARCHIVE");
  return view.getUint16(offset, true);
}

function readU32(view: DataView, offset: number) {
  if (offset < 0 || offset + 4 > view.byteLength) throw new EpubParseError("EPUB_INVALID_ARCHIVE");
  return view.getUint32(offset, true);
}
