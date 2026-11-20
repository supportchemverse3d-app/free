import { ELEMENT_SYMBOLS } from '../engine/chemistry/elements.ts';
import { parseFormula, toHillFormula } from '../engine/chemistry/formula.ts';
import { distance } from '../engine/structure/geometry.ts';
import type { Provenance, Value } from '../engine/structure/value.ts';
import type { RecordMeta } from './schema.ts';
import { validateMeta } from './validate.ts';

export interface AtomRecord {
  index: number;
  element: string;
  /** Cartesian coordinates in ångström. */
  x: number;
  y: number;
  z: number;
}

export interface BondRecord {
  a: number;
  b: number;
  order: 1 | 2 | 3 | 'aromatic';
}

/** Per-centre VSEPR analysis (atoms with two or more neighbours). */
export interface CentreAnalysis {
  atom: number;
  element: string;
  stericNumber: number;
  lonePairs: number;
  electronGeometry: string;
  molecularGeometry: string;
  hybridization: string;
}

export interface MoleculeAnalysis {
  centres: CentreAnalysis[];
  /** Provenance of the geometry rule used, shown with the values. */
  geometrySource: string;
  polarity: Value<{ polar: boolean; netBondDipole: number }>;
}

/** Literature values for bond lengths/angles. Draft entries until checked against the cited source. */
export interface ExperimentalGeometry {
  bondLengths: { a: number; b: number; angstrom: number; source: string }[];
  bondAngles: { a: number; vertex: number; c: number; degrees: number; source: string }[];
}

export interface MoleculeRecord {
  meta: RecordMeta;
  kind: 'molecule' | 'ion';
  name: string;
  iupacName?: string;
  synonyms: string[];
  /** Formula as displayed, e.g. "H₂O" or "SO4^2-". */
  formula: string;
  smiles?: string;
  inchiKey?: string;
  casNumber?: string;
  pubchemCid?: number;
  atoms: AtomRecord[];
  bonds: BondRecord[];
  structure: { source: string; method: string; provenance: Provenance };
  analysis?: MoleculeAnalysis;
  experimental?: ExperimentalGeometry;
  properties: { key: string; label: string; unit?: string; value: Value<string | number> }[];
  curriculum?: { classes: number[]; chapters: string[]; topics: string[] };
}

/** CAS registry number format with check digit: digits sum of (position from right × digit) mod 10. */
export function isValidCasNumber(cas: string): boolean {
  const m = /^(\d{2,7})-(\d{2})-(\d)$/.exec(cas);
  if (!m) return false;
  const digits = (m[1]! + m[2]!).split('').reverse();
  const sum = digits.reduce((s, d, i) => s + (i + 1) * Number(d), 0);
  return sum % 10 === Number(m[3]);
}

const INCHIKEY = /^[A-Z]{14}-[A-Z]{10}-[A-Z]$/;
const MIN_BOND_ANGSTROM = 0.5;
const MAX_BOND_ANGSTROM = 3.5;

export function validateMolecule(m: MoleculeRecord): string[] {
  const issues = validateMeta(m.meta);
  if (m.name.trim() === '') issues.push('Name is empty');
  if (m.structure.source.trim() === '' || m.structure.method.trim() === '') issues.push('Structure source and method are required');
  if (m.inchiKey !== undefined && !INCHIKEY.test(m.inchiKey)) issues.push('InChIKey format is invalid');
  if (m.casNumber !== undefined && !isValidCasNumber(m.casNumber)) issues.push('CAS number is invalid (format or check digit)');
  if (m.atoms.length === 0) issues.push('At least one atom is required');

  const counts: Record<string, number> = {};
  m.atoms.forEach((a, i) => {
    if (a.index !== i) issues.push(`Atom at position ${i} has index ${a.index}; indices must be sequential from 0`);
    if (!ELEMENT_SYMBOLS.has(a.element)) issues.push(`Atom ${i}: unknown element "${a.element}"`);
    if (![a.x, a.y, a.z].every(Number.isFinite)) issues.push(`Atom ${i}: coordinates must be finite`);
    counts[a.element] = (counts[a.element] ?? 0) + 1;
  });

  const seen = new Set<string>();
  for (const b of m.bonds) {
    const inRange = Number.isInteger(b.a) && Number.isInteger(b.b) && b.a >= 0 && b.b >= 0 && b.a < m.atoms.length && b.b < m.atoms.length;
    if (!inRange) { issues.push(`Bond ${b.a}-${b.b} references a missing atom`); continue; }
    if (b.a === b.b) { issues.push(`Bond ${b.a}-${b.b} connects an atom to itself`); continue; }
    const key = b.a < b.b ? `${b.a}-${b.b}` : `${b.b}-${b.a}`;
    if (seen.has(key)) issues.push(`Duplicate bond ${key}`);
    seen.add(key);
    const d = distance(m.atoms[b.a]!, m.atoms[b.b]!);
    if (d < MIN_BOND_ANGSTROM || d > MAX_BOND_ANGSTROM) issues.push(`Bond ${key} length ${d.toFixed(2)} Å is outside the plausible range`);
  }

  const inRange = (i: number) => Number.isInteger(i) && i >= 0 && i < m.atoms.length;
  for (const e of m.experimental?.bondLengths ?? []) {
    if (!inRange(e.a) || !inRange(e.b)) issues.push('Experimental bond length references a missing atom');
    if (!(e.angstrom > 0) || e.source.trim() === '') issues.push('Experimental bond length needs a positive value and a source');
  }
  for (const e of m.experimental?.bondAngles ?? []) {
    if (!inRange(e.a) || !inRange(e.vertex) || !inRange(e.c)) issues.push('Experimental bond angle references a missing atom');
    if (!(e.degrees > 0 && e.degrees <= 180) || e.source.trim() === '') issues.push('Experimental bond angle needs a value in (0, 180] and a source');
  }
  for (const c of m.analysis?.centres ?? []) {
    if (!inRange(c.atom) || m.atoms[c.atom]!.element !== c.element) issues.push(`Analysis centre ${c.atom} does not match the atom list`);
  }

  try {
    const parsed = parseFormula(m.formula);
    if (toHillFormula(parsed.elements) !== toHillFormula(counts)) {
      issues.push(`Formula ${m.formula} does not match atoms (${toHillFormula(counts)})`);
    }
    if (m.kind === 'ion' && parsed.charge === 0) issues.push('Ion formula must include a charge');
    if (m.kind === 'molecule' && parsed.charge !== 0) issues.push('Molecule formula must not include a charge');
  } catch (e) {
    issues.push(`Formula cannot be parsed: ${e instanceof Error ? e.message : String(e)}`);
  }
  return issues;
}
