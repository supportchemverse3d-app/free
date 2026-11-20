import type { MoleculeRecord } from '../content/molecule.ts';
import { bondLength, anglesAtAtom, describeBondOrder, neighboursOf } from '../engine/structure/analyze.ts';
import { LIMITS } from './protocol.ts';

/** The atom or bond currently selected in the 3D viewer (same shape as viewer Selection). */
export type MoleculeSelection = { kind: 'atom'; index: number } | { kind: 'bond'; a: number; b: number } | null;

const MAX_ATOMS_LISTED = 40;
const MAX_ANGLES = 40;
const r = (n: number, d = 3) => String(Math.round(n * 10 ** d) / 10 ** d);
const label = (m: MoleculeRecord, i: number) => `${m.atoms[i]!.element}${i + 1}`;

/**
 * Turns the molecule record that the 3D viewer is showing into compact text for the AI.
 * Only data that exists in the record is included; nothing is inferred here.
 * The text says explicitly that the AI is reading data, not looking at the screen.
 */
export function buildMoleculeContext(m: MoleculeRecord, selection: MoleculeSelection): string {
  const out: string[] = [];
  out.push('Structured data of the molecule currently open in the CHEMVERSE 3D viewer (idealised geometry stored in the app; coordinates in angstrom).');
  out.push(`Name: ${m.name}${m.iupacName ? ` (IUPAC: ${m.iupacName})` : ''}`);
  out.push(`Formula: ${m.formula}`);
  out.push(`Atoms: ${m.atoms.length}, bonds: ${m.bonds.length}. Structure source: ${m.structure.source} (${m.structure.method}).`);

  const shown = m.atoms.slice(0, MAX_ATOMS_LISTED);
  out.push('Atoms (label: x, y, z):');
  for (const a of shown) out.push(`${label(m, a.index)}: ${r(a.x)}, ${r(a.y)}, ${r(a.z)}`);
  if (m.atoms.length > shown.length) out.push(`(${m.atoms.length - shown.length} further atoms not listed to keep this short)`);

  out.push('Bonds (a-b, order, length in angstrom computed from coordinates):');
  for (const b of m.bonds.slice(0, 60)) {
    out.push(`${label(m, b.a)}-${label(m, b.b)}, ${describeBondOrder(b.order)}, ${r(bondLength(m.atoms, b.a, b.b), 3)}`);
  }
  if (m.bonds.length > 60) out.push(`(${m.bonds.length - 60} further bonds not listed)`);

  if (m.analysis && m.analysis.centres.length > 0) {
    out.push(`Geometry analysis (${m.analysis.geometrySource}):`);
    for (const c of m.analysis.centres.slice(0, 20)) {
      out.push(`${label(m, c.atom)}: steric number ${c.stericNumber}, lone pairs ${c.lonePairs}, electron geometry ${c.electronGeometry}, molecular geometry ${c.molecularGeometry}, hybridization ${c.hybridization}`);
    }
    const p = m.analysis.polarity;
    if (p && p.status === 'available' && typeof p.value === 'object' && p.value !== null) {
      out.push(`Polarity from bond dipoles: ${p.value.polar ? 'polar' : 'non-polar'}`);
    }
  } else {
    out.push('Geometry analysis: not available in the app for this molecule.');
  }

  if (m.experimental) {
    const lit = m.experimental;
    if (lit.bondAngles.length > 0) {
      out.push('Literature bond angles (as stored in the app):');
      for (const a of lit.bondAngles.slice(0, 10)) out.push(`${label(m, a.a)}-${label(m, a.vertex)}-${label(m, a.c)}: ${a.degrees} degrees (${a.source})`);
    }
  }

  const sel = describeSelection(m, selection);
  out.push(sel);

  let text = out.join('\n');
  if (text.length > LIMITS.moleculeChars) text = text.slice(0, LIMITS.moleculeChars - 40) + '\n(truncated)';
  return text;
}

function describeSelection(m: MoleculeRecord, selection: MoleculeSelection): string {
  if (!selection) return 'Selection: nothing is selected in the viewer.';
  if (selection.kind === 'atom') {
    const a = m.atoms[selection.index];
    if (!a) return 'Selection: nothing is selected in the viewer.';
    const nb = neighboursOf(m.bonds, selection.index);
    const angles = anglesAtAtom(m.atoms, m.bonds, selection.index).slice(0, MAX_ANGLES);
    const lines = [`Selection: atom ${label(m, selection.index)} (${a.element}) is selected.`];
    lines.push(`Bonded to: ${nb.length ? nb.map((i) => label(m, i)).join(', ') : 'no atoms'}`);
    for (const g of angles) lines.push(`Angle ${label(m, g.a)}-${label(m, g.vertex)}-${label(m, g.c)}: ${r(g.degrees, 1)} degrees`);
    return lines.join('\n');
  }
  if (!m.atoms[selection.a] || !m.atoms[selection.b]) return 'Selection: nothing is selected in the viewer.';
  const bond = m.bonds.find((b) => (b.a === selection.a && b.b === selection.b) || (b.a === selection.b && b.b === selection.a));
  return `Selection: bond ${label(m, selection.a)}-${label(m, selection.b)} is selected${bond ? `, ${describeBondOrder(bond.order)}` : ''}, length ${r(bondLength(m.atoms, selection.a, selection.b), 3)} angstrom.`;
}

/** Tiny shared store so the 3D viewer page can tell Chemo AI which atom/bond is selected. */
let current: { id: string; selection: MoleculeSelection } | null = null;
export const setViewerSelection = (id: string, selection: MoleculeSelection): void => {
  current = { id, selection };
};
export const getViewerSelection = (id: string): MoleculeSelection => (current && current.id === id ? current.selection : null);
