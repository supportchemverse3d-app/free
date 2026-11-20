import { ELEMENT_SYMBOLS, STANDARD_ATOMIC_WEIGHT, ATOMIC_WEIGHT_SOURCE } from './elements.ts';
import type { Value } from '../structure/value.ts';

export type ElementCounts = Record<string, number>;
export interface ParsedFormula {
  elements: ElementCounts;
  charge: number;
}

export class FormulaError extends Error {}

const SUB = '₀₁₂₃₄₅₆₇₈₉';
const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';

/**
 * Converts Unicode sub/superscripts to ASCII. Charge notation: "Fe^2+", "SO4^2-", "Na+", "Cl-".
 * A digit directly before a trailing sign without a caret is NOT read as a charge (it is ambiguous).
 */
export function normalizeFormula(input: string): string {
  let s = input.trim().replace(/\s+/g, '');
  s = s.replace(/[₀-₉]/g, (c) => String(SUB.indexOf(c)));
  s = s.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻]+/g, (run) => {
    const ascii = [...run].map((c) => (c === '⁺' ? '+' : c === '⁻' ? '-' : String(SUP.indexOf(c)))).join('');
    return '^' + ascii;
  });
  return s;
}

function splitCharge(s: string): { body: string; charge: number } {
  const caret = /^(.*)\^(\d*)([+-])$/.exec(s) ?? undefined;
  if (caret) {
    const magnitude = caret[2] === '' ? 1 : Number(caret[2]);
    return { body: caret[1]!, charge: caret[3] === '+' ? magnitude : -magnitude };
  }
  const caretSignFirst = /^(.*)\^([+-])(\d*)$/.exec(s);
  if (caretSignFirst) {
    const magnitude = caretSignFirst[3] === '' ? 1 : Number(caretSignFirst[3]);
    return { body: caretSignFirst[1]!, charge: caretSignFirst[2] === '+' ? magnitude : -magnitude };
  }
  const bare = /^(.*[A-Za-z)\]])([+-])$/.exec(s);
  if (bare) return { body: bare[1]!, charge: bare[2] === '+' ? 1 : -1 };
  return { body: s, charge: 0 };
}

function addCounts(target: ElementCounts, source: ElementCounts, factor: number): void {
  for (const [el, n] of Object.entries(source)) target[el] = (target[el] ?? 0) + n * factor;
}

const CLOSERS: Record<string, string> = { '(': ')', '[': ']' };

function parseSegment(s: string, start: number, closer: string | null): { counts: ElementCounts; next: number } {
  const counts: ElementCounts = {};
  let i = start;
  while (i < s.length) {
    const ch = s[i]!;
    if (closer !== null && ch === closer) return { counts, next: i + 1 };
    if (ch === '(' || ch === '[') {
      const inner = parseSegment(s, i + 1, CLOSERS[ch]!);
      if (inner.next > s.length || s[inner.next - 1] !== CLOSERS[ch]) throw new FormulaError(`Unclosed "${ch}"`);
      const { n, next } = readNumber(s, inner.next);
      addCounts(counts, inner.counts, n);
      i = next;
    } else if (/[A-Z]/.test(ch)) {
      const two = s[i + 1] !== undefined && /[a-z]/.test(s[i + 1]!) ? ch + s[i + 1] : null;
      let symbol: string;
      if (two !== null && ELEMENT_SYMBOLS.has(two)) symbol = two;
      else if (ELEMENT_SYMBOLS.has(ch)) symbol = ch;
      else throw new FormulaError(`Unknown element "${two ?? ch}"`);
      i += symbol.length;
      const { n, next } = readNumber(s, i);
      counts[symbol] = (counts[symbol] ?? 0) + n;
      i = next;
    } else {
      throw new FormulaError(`Unexpected character "${ch}"`);
    }
  }
  if (closer !== null) throw new FormulaError(`Missing "${closer}"`);
  return { counts, next: i };
}

function readNumber(s: string, i: number): { n: number; next: number } {
  let j = i;
  while (j < s.length && /[0-9]/.test(s[j]!)) j++;
  if (j === i) return { n: 1, next: i };
  const n = Number(s.slice(i, j));
  if (n < 1) throw new FormulaError('Subscript must be at least 1');
  return { n, next: j };
}

/** Parses a formula such as "H₂O", "Ca(OH)2", "CuSO4·5H2O", "SO4^2-". Throws FormulaError. */
export function parseFormula(input: string): ParsedFormula {
  const { body, charge } = splitCharge(normalizeFormula(input));
  if (body === '') throw new FormulaError('Empty formula');
  const elements: ElementCounts = {};
  for (const part of body.split(/[·•.]/)) {
    if (part === '') throw new FormulaError('Empty hydrate component');
    const lead = /^(\d+)/.exec(part);
    const factor = lead ? Number(lead[1]) : 1;
    const text = lead ? part.slice(lead[1]!.length) : part;
    const { counts } = parseSegment(text, 0, null);
    addCounts(elements, counts, factor);
  }
  return { elements, charge };
}

/** Hill order: C first, H second, then alphabetical; purely alphabetical when no carbon. */
export function toHillFormula(counts: ElementCounts): string {
  const symbols = Object.keys(counts);
  const hasC = 'C' in counts;
  const order = hasC
    ? ['C', 'H', ...symbols.filter((e) => e !== 'C' && e !== 'H').sort()].filter((e) => e in counts)
    : symbols.sort();
  return order.map((e) => (counts[e] === 1 ? e : `${e}${counts[e]}`)).join('');
}

/** Molar mass in g/mol. Returns "unavailable" if any element lacks a stored atomic weight. */
export function molarMass(counts: ElementCounts): Value<number> {
  let total = 0;
  for (const [el, n] of Object.entries(counts)) {
    const w = STANDARD_ATOMIC_WEIGHT[el];
    if (w === undefined) return { status: 'unavailable' };
    total += w * n;
  }
  return { status: 'available', value: Math.round(total * 1000) / 1000, provenance: 'derived', source: ATOMIC_WEIGHT_SOURCE };
}
