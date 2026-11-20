import { normalizeFormula, parseFormula, toHillFormula } from '../chemistry/formula.ts';

export type SearchEntryType = 'element' | 'molecule' | 'ion' | 'reaction' | 'topic' | 'concept';

export interface SearchEntry {
  id: string;
  type: SearchEntryType;
  title: string;
  /** Other names: synonyms, IUPAC name, symbols, abbreviations. */
  aliases: string[];
  /** Formulas this entry is findable by (a reaction lists every species formula). */
  formulas: string[];
  keywords: string[];
}

export interface SearchHit {
  entry: SearchEntry;
  score: number;
  matchedOn: 'formula' | 'name' | 'prefix' | 'word' | 'substring' | 'keyword' | 'fuzzy';
}

/** Lowercase, strip accents, convert Unicode sub/superscripts, collapse punctuation to single spaces. */
export function normalizeText(input: string): string {
  return normalizeFormula(input.normalize('NFKD').replace(/[̀-ͯ]/g, ''))
    .toLowerCase()
    .replace(/[^a-z0-9+\-^]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function plainText(input: string): string {
  return normalizeText(input).replace(/[+\-^]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Canonical formula key (Hill order), or null when the text is not a valid formula. */
export function formulaKey(input: string): string | null {
  try {
    const parsed = parseFormula(input);
    const hill = toHillFormula(parsed.elements);
    return parsed.charge === 0 ? hill : `${hill}^${parsed.charge}`;
  } catch {
    return null;
  }
}

interface Prepared {
  entry: SearchEntry;
  names: string[]; // normalised full names
  words: string[];
  formulaKeys: Set<string>;
  formulaLoose: Set<string>;
  keywords: string[];
}

function levenshtein(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const v = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
      cur.push(v);
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length]!;
}

export class SearchIndex {
  private readonly items: Prepared[];

  constructor(entries: readonly SearchEntry[]) {
    const ids = new Set<string>();
    this.items = entries.map((entry) => {
      if (ids.has(entry.id)) throw new Error(`Duplicate search entry id "${entry.id}"`);
      ids.add(entry.id);
      const names = [entry.title, ...entry.aliases].map(plainText).filter((n) => n !== '');
      const words = new Set(names.flatMap((n) => n.split(' ')));
      const formulaKeys = new Set<string>();
      const formulaLoose = new Set<string>();
      for (const f of entry.formulas) {
        const key = formulaKey(f);
        if (key !== null) formulaKeys.add(key);
        formulaLoose.add(normalizeFormula(f).toLowerCase());
      }
      return { entry, names, words: [...words], formulaKeys, formulaLoose, keywords: entry.keywords.map(plainText) };
    });
  }

  get size(): number {
    return this.items.length;
  }

  search(query: string, limit = 10): SearchHit[] {
    const q = plainText(query);
    if (q === '') return [];
    const rawQuery = query.trim();
    const qKey = formulaKey(rawQuery);
    const qLoose = normalizeFormula(rawQuery).toLowerCase();
    const hits: SearchHit[] = [];

    for (const p of this.items) {
      let best = null as SearchHit | null;
      const consider = (score: number, matchedOn: SearchHit['matchedOn']) => {
        if (best === null || score > best.score) best = { entry: p.entry, score, matchedOn };
      };

      if (qKey !== null && p.formulaKeys.has(qKey)) consider(110, 'formula');
      else if (p.formulaLoose.has(qLoose)) consider(90, 'formula');

      for (const n of p.names) {
        if (n === q) consider(100, 'name');
        else if (n.startsWith(q)) consider(80, 'prefix');
        else if (q.length >= 3 && n.includes(q)) consider(30, 'substring');
      }
      if (best === null || best.score < 60) {
        const qWords = q.split(' ');
        if (qWords.every((w) => p.words.some((pw) => pw.startsWith(w)))) consider(60, 'word');
      }
      if (best === null && q.length >= 3 && p.keywords.some((k) => k.includes(q))) consider(20, 'keyword');
      if (best !== null) hits.push(best);
    }

    if (hits.length === 0 && q.length >= 4) {
      const max = q.length >= 8 ? 2 : 1;
      for (const p of this.items) {
        const d = Math.min(...p.names.map((n) => levenshtein(q, n, max)));
        if (d <= max) hits.push({ entry: p.entry, score: 10 - d, matchedOn: 'fuzzy' });
      }
    }

    hits.sort((a, b) => b.score - a.score || a.entry.title.length - b.entry.title.length || a.entry.title.localeCompare(b.entry.title));
    return hits.slice(0, limit);
  }
}
