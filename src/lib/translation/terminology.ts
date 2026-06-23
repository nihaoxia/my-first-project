export type TranslationGlossaryTerm = {
  sourceTerm: string;
  targetTerm?: string;
  note?: string;
};

export type TerminologyCandidate = {
  term: string;
  sourceLanguage: string;
  count: number;
  contexts: string[];
};

export type ExtractTerminologyCandidatesInput = {
  sourceLanguage: string;
  texts: string[];
  maxCandidates?: number;
};

const DEFAULT_MAX_CANDIDATES = 20;
const CHINESE_BOOK_TITLE_PATTERN = /《[^》]{2,40}》/g;
const ENGLISH_PROPER_TERM_PATTERN = /\b(?:[A-Z][a-zA-Z]+)(?:\s+[A-Z][a-zA-Z]+)+\b/g;

export function extractTerminologyCandidates(
  input: ExtractTerminologyCandidatesInput,
): TerminologyCandidate[] {
  const candidates = new Map<string, TerminologyCandidate>();

  for (const rawText of input.texts) {
    const text = rawText.trim();

    if (text.length === 0) {
      continue;
    }

    for (const term of extractTermsFromText(text)) {
      const candidate = candidates.get(term);

      if (candidate) {
        candidate.count += 1;
        candidate.contexts.push(text);
        continue;
      }

      candidates.set(term, {
        term,
        sourceLanguage: input.sourceLanguage,
        count: 1,
        contexts: [text],
      });
    }
  }

  return [...candidates.values()]
    .sort((left, right) => {
      if (right.count !== left.count) {
        return right.count - left.count;
      }

      return left.term.localeCompare(right.term);
    })
    .slice(0, input.maxCandidates ?? DEFAULT_MAX_CANDIDATES);
}

function extractTermsFromText(text: string) {
  const terms = new Set<string>();

  for (const match of text.matchAll(CHINESE_BOOK_TITLE_PATTERN)) {
    terms.add(match[0]);
  }

  for (const match of text.matchAll(ENGLISH_PROPER_TERM_PATTERN)) {
    const term = stripLeadingEnglishArticle(match[0]);

    if (term.split(/\s+/).length >= 2) {
      terms.add(term);
    }
  }

  return terms;
}

function stripLeadingEnglishArticle(term: string) {
  return term.replace(/^(The|A|An)\s+/, "");
}
