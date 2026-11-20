import type { MoleculeRecord } from '../content/molecule.ts';
import { anglesAtAtom, bondLength, describeBondOrder, neighboursOf } from '../engine/structure/analyze.ts';

export const atomLabel = (m: MoleculeRecord, i: number): string => `${m.atoms[i]!.element}${i + 1}`;

export interface LengthGroup {
  /** "C–H" for groups, "O1–H2" for a single bond. */
  label: string;
  order: string;
  count: number;
  predicted: number;
  literature?: { value: number; source: string };
}

export interface AngleGroup {
  label: string;
  count: number;
  predicted: number;
  literature?: { value: number; source: string };
}

const round = (x: number, d: number) => Math.round(x * 10 ** d) / 10 ** d;

export function groupBondLengths(m: MoleculeRecord): LengthGroup[] {
  const groups = new Map<string, { bonds: [number, number][]; order: string; predicted: number }>();
  for (const b of m.bonds) {
    const len = bondLength(m.atoms, b.a, b.b);
    const els = [m.atoms[b.a]!.element, m.atoms[b.b]!.element].sort().join('–');
    const order = describeBondOrder(b.order);
    const key = `${els}|${order}|${round(len, 2)}`;
    const g = groups.get(key) ?? { bonds: [], order, predicted: len };
    g.bonds.push([b.a, b.b]);
    groups.set(key, g);
  }
  return [...groups.values()].map((g) => {
    const first = g.bonds[0]!;
    const lit = (m.experimental?.bondLengths ?? []).find((e) => g.bonds.some(([a, b]) => (e.a === a && e.b === b) || (e.a === b && e.b === a)));
    return {
      label: g.bonds.length === 1 ? `${atomLabel(m, first[0])}–${atomLabel(m, first[1])}` : [m.atoms[first[0]]!.element, m.atoms[first[1]]!.element].join('–'),
      order: g.order,
      count: g.bonds.length,
      predicted: g.predicted,
      ...(lit ? { literature: { value: lit.angstrom, source: lit.source } } : {}),
    };
  });
}

export function groupBondAngles(m: MoleculeRecord): AngleGroup[] {
  const out: AngleGroup[] = [];
  for (let v = 0; v < m.atoms.length; v++) {
    if (neighboursOf(m.bonds, v).length < 2) continue;
    const groups = new Map<string, { items: { a: number; c: number }[]; degrees: number }>();
    for (const ang of anglesAtAtom(m.atoms, m.bonds, v)) {
      const key = String(round(ang.degrees, 1));
      const g = groups.get(key) ?? { items: [], degrees: ang.degrees };
      g.items.push({ a: ang.a, c: ang.c });
      groups.set(key, g);
    }
    for (const g of groups.values()) {
      const f = g.items[0]!;
      const lit = (m.experimental?.bondAngles ?? []).find((e) => e.vertex === v && g.items.some((i) => (e.a === i.a && e.c === i.c) || (e.a === i.c && e.c === i.a)));
      const els = [m.atoms[f.a]!.element, m.atoms[f.c]!.element].sort();
      out.push({
        label: g.items.length === 1 ? `${atomLabel(m, f.a)}–${atomLabel(m, v)}–${atomLabel(m, f.c)}` : `${els[0]}–${m.atoms[v]!.element}${v + 1}–${els[1]}`,
        count: g.items.length,
        predicted: g.degrees,
        ...(lit ? { literature: { value: lit.degrees, source: lit.source } } : {}),
      });
    }
  }
  return out;
}
