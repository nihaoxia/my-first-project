export const LOOKUP_PAGE_SIZE = 100;

type LookupRow = { id: string };
type LookupPageLoader<T extends LookupRow> = (cursor: string | null, take: number) => Promise<T[]>;

export function normalizeImportLookupText(value: string) {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase("und");
}

export function selectUniqueOriginalMatch<T extends { title: string }>(items: T[], title: string): T | null {
  const matches = items.filter((item) => normalizeImportLookupText(item.title) === normalizeImportLookupText(title));
  return matches.length === 1 ? matches[0] : null;
}

export function selectUniqueTranslationMatch<T extends { title: string; originalBook: { title: string } }>(items: T[], originalTitle: string, translationTitle: string): T | null {
  const matches = items.filter((item) => normalizeImportLookupText(item.title) === normalizeImportLookupText(translationTitle) && normalizeImportLookupText(item.originalBook.title) === normalizeImportLookupText(originalTitle));
  return matches.length === 1 ? matches[0] : null;
}

async function findUniqueByPages<T extends LookupRow>(loadPage: LookupPageLoader<T>, matches: (row: T) => boolean): Promise<T | null> {
  let cursor: string | null = null;
  let match: T | null = null;
  for (;;) {
    const page = await loadPage(cursor, LOOKUP_PAGE_SIZE);
    for (const row of page) {
      if (!matches(row)) continue;
      if (match) return null;
      match = row;
    }
    if (page.length < LOOKUP_PAGE_SIZE) return match;
    cursor = page[page.length - 1].id;
  }
}

export function findUniqueOriginalMatchByPages<T extends LookupRow & { title: string }>(loadPage: LookupPageLoader<T>, title: string) {
  const canonicalTitle = normalizeImportLookupText(title);
  return findUniqueByPages(loadPage, (row) => normalizeImportLookupText(row.title) === canonicalTitle);
}

export function findUniqueTranslationMatchByPages<T extends LookupRow & { title: string; originalBook: { title: string } }>(loadPage: LookupPageLoader<T>, originalTitle: string, translationTitle: string) {
  const canonicalOriginalTitle = normalizeImportLookupText(originalTitle);
  const canonicalTranslationTitle = normalizeImportLookupText(translationTitle);
  return findUniqueByPages(loadPage, (row) => normalizeImportLookupText(row.title) === canonicalTranslationTitle && normalizeImportLookupText(row.originalBook.title) === canonicalOriginalTitle);
}
