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

export function makeMinimalEpub3(options: {
  title?: string;
  author?: string;
  chapters?: Array<{ id: string; file: string; navTitle?: string; body: string }>;
} = {}) {
  const chapters = options.chapters ?? [
    { id: "one", file: "one.xhtml", navTitle: "导航第一章", body: "<h1>正文第一章</h1><p>雾从边境漫过来。</p>" },
    { id: "two", file: "two.xhtml", navTitle: "导航第二章", body: "<h1>正文第二章</h1><p>桥下没有水，只有风。</p>" },
  ];
  const metadata = [
    options.title === undefined ? "<dc:title>边境档案</dc:title>" : options.title ? `<dc:title>${options.title}</dc:title>` : "",
    options.author === undefined ? "<dc:creator>林间客</dc:creator>" : options.author ? `<dc:creator>${options.author}</dc:creator>` : "",
    "<dc:language>zh-CN</dc:language>",
  ].join("");
  const manifest = chapters
    .map((chapter) => `<item id="${chapter.id}" href="text/${chapter.file}" media-type="application/xhtml+xml"/>`)
    .join("");
  const spine = chapters.map((chapter) => `<itemref idref="${chapter.id}"/>`).join("");
  const nav = chapters
    .map((chapter) => `<li><a href="text/${chapter.file}">${chapter.navTitle ?? ""}</a></li>`)
    .join("");
  const entries: Record<string, EpubFixtureEntry> = {
    "META-INF/container.xml": '<?xml version="1.0"?><container><rootfiles><rootfile full-path="OPS/package.opf"/></rootfiles></container>',
    "OPS/package.opf": `<package xmlns="http://www.idpf.org/2007/opf" xmlns:dc="http://purl.org/dc/elements/1.1/" version="3.0"><metadata>${metadata}</metadata><manifest>${manifest}<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/></manifest><spine>${spine}</spine></package>`,
    "OPS/nav.xhtml": `<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><body><nav epub:type="toc"><ol>${nav}</ol></nav></body></html>`,
  };
  for (const chapter of chapters) {
    entries[`OPS/text/${chapter.file}`] = `<html xmlns="http://www.w3.org/1999/xhtml"><head><title>${chapter.id}</title></head><body>${chapter.body}</body></html>`;
  }
  return makeEpubZip(entries);
}

export function makeMinimalEpub2() {
  return makeEpubZip({
    "META-INF/container.xml": '<container><rootfiles><rootfile full-path="OEBPS/content.opf"/></rootfiles></container>',
    "OEBPS/content.opf": '<package version="2.0"><metadata><title>旧版档案</title><creator>旧作者</creator><language>zh</language></metadata><manifest><item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/><item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/></manifest><spine toc="ncx"><itemref idref="chapter"/></spine></package>',
    "OEBPS/toc.ncx": '<ncx><navMap><navPoint><navLabel><text>NCX 第一章</text></navLabel><content src="chapter.xhtml#top"/></navPoint></navMap></ncx>',
    "OEBPS/chapter.xhtml": '<html><head><title>文档标题</title></head><body><p>旧版正文。</p></body></html>',
  });
}
