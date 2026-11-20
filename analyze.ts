import { angleDegrees, distance } from './geometry.ts';

export interface AtomLike {
  element: string;
  x: number;
  y: number;
  z: number;
}

export interface BondLike {
  a: number;
  b: number;
  order: 1 | 2 | 3 | 'aromatic';
}

export interface BondSummary {
  single: number;
  double: number;
  triple: number;
  aromatic: number;
  /** Every bond contributes exactly one sigma bond. */
  sigma: number;
  /** Double = 1, triple = 2, aromatic = 0.5 each (a benzene ring has six aromatic bonds → 3 pi bonds). */
  pi: number;
}

export function summarizeBonds(bonds: readonly BondLike[]): BondSummary {
  const s: BondSummary = { single: 0, double: 0, triple: 0, aromatic: 0, sigma: bonds.length, pi: 0 };
  for (const b of bonds) {
    if (b.order === 1) s.single++;
    else if (b.order === 2) s.double++;
    else if (b.order === 3) s.triple++;
    else s.aromatic++;
  }
  s.pi = s.double + 2 * s.triple + s.aromatic / 2;
  return s;
}

/** Element → count, in order of first appearance. */
export function countElements(atoms: readonly { element: string }[]): [string, number][] {
  const counts = new Map<string, number>();
  for (const a of atoms) counts.set(a.element, (counts.get(a.element) ?? 0) + 1);
  return [...counts.entries()];
}

export function neighboursOf(bonds: readonly BondLike[], atom: number): number[] {
  const out: number[] = [];
  for (const b of bonds) {
    if (b.a === atom) out.push(b.b);
    else if (b.b === atom) out.push(b.a);
  }
  return out.sort((x, y) => x - y);
}

export function bondLength(atoms: readonly AtomLike[], a: number, b: number): number {
  return distance(atoms[a]!, atoms[b]!);
}

export interface AngleAt {
  /** Neighbour atoms in the angle, with the vertex between them (a – vertex – c). */
  a: number;
  vertex: number;
  c: number;
  degrees: number;
}

/** All angles between pairs of bonds meeting at the given atom. */
export function anglesAtAtom(atoms: readonly AtomLike[], bonds: readonly BondLike[], vertex: number): AngleAt[] {
  const nb = neighboursOf(bonds, vertex);
  const out: AngleAt[] = [];
  for (let i = 0; i < nb.length; i++) {
    for (let j = i + 1; j < nb.length; j++) {
      out.push({ a: nb[i]!, vertex, c: nb[j]!, degrees: angleDegrees(atoms[nb[i]!]!, atoms[vertex]!, atoms[nb[j]!]!) });
    }
  }
  return out;
}

export function describeBondOrder(order: BondLike['order']): string {
  return order === 1 ? 'single' : order === 2 ? 'double' : order === 3 ? 'triple' : 'aromatic';
}
