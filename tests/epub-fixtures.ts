import { strToU8, zipSync, type Zippable } from "fflate";

export type EpubFixtureEntry = string | Uint8Array;

export function makeEpubZip(
  entries: Record<string, EpubFixtureEntry> = {
    "META-INF/container.xml": "<container />",
    "OPS/chapter.xhtml": "<html><body><p>正文</p></body></html>",
  },
) {
  const archive: Zippable = {
    mimetype: [strToU8("application/epub+zip"), { level: 0 }],
  };

  for (const [path, content] of Object.entries(entries)) {
    archive[path] = typeof content === "string" ? strToU8(content) : content;
  }

  return zipSync(archive, { level: 6 });
}

export function makeZipWithFirstEntry(path: string, content: string) {
  return zipSync(
    {
      [path]: [strToU8(content), { level: 0 }],
      mimetype: [strToU8("application/epub+zip"), { level: 0 }],
    },
    { level: 6 },
  );
}

export function mutateZipEntry(
  input: Uint8Array,
  name: string,
  mutate: (view: DataView, centralOffset: number, localOffset: number) => void,
) {
  const output = input.slice();
  const view = new DataView(output.buffer, output.byteOffset, output.byteLength);
  const decoder = new TextDecoder();

  for (let offset = 0; offset <= output.length - 46; offset += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) continue;
    const nameLength = view.getUint16(offset + 28, true);
    const currentName = decoder.decode(output.subarray(offset + 46, offset + 46 + nameLength));
    if (currentName !== name) continue;
    const localOffset = view.getUint32(offset + 42, true);
    mutate(view, offset, localOffset);
    return output;
  }

  throw new Error(`ZIP fixture entry not found: ${name}`);
}

export function renameZipEntry(input: Uint8Array, oldName: string, newName: string) {
  const oldBytes = new TextEncoder().encode(oldName);
  const newBytes = new TextEncoder().encode(newName);
  if (oldBytes.length !== newBytes.length) throw new Error("Fixture ZIP rename must preserve byte length");

  return mutateZipEntry(input, oldName, (view, centralOffset, localOffset) => {
    const output = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
    output.set(newBytes, centralOffset + 46);
    output.set(newBytes, localOffset + 30);
  });
}
