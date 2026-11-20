import { deriveVsepr } from '../chemistry/vsepr.ts';
import { BOND_ORDER_LENGTH_FACTOR, COVALENT_RADIUS, VALENCE_ELECTRONS } from '../chemistry/atomData.ts';
import { add, length, normalize, perpendicular, rotateAbout, rotationAligning, scale, signedAngle, sub, type V3 } from './vec.ts';

export type BondOrder = 1 | 2 | 3 | 'aromatic';

export interface SpecAtom {
  element: string;
  formalCharge?: number;
}

export interface MoleculeSpec {
  atoms: SpecAtom[];
  bonds: [number, number, BondOrder][];
  /** Planar ring template (e.g. benzene): ring atoms in order. Non-ring neighbours must be terminal. */
  ring?: { atoms: number[]; bondLength: number };
  /** Experimental or otherwise sourced bond lengths (Å) that replace the radius-sum estimate. */
  lengthOverrides?: { bond: [number, number]; angstrom: number; source: string }[];
  /**
   * Dihedral (degrees) between the first other neighbour on each end of a bond. Default is 60° (staggered) for
   * sp3–sp3 bonds and 0° (cis / eclipsed) otherwise; 180° gives trans / anti.
   */
  torsions?: { bond: [number, number]; degrees: number }[];
  /** Precomputed coordinates (e.g. ring conformers from a constrained geometry solve); placement is skipped. */
  coordinates?: [number, number, number][];
}

export interface GeneratedAtom {
  index: number;
  element: string;
  x: number;
  y: number;
  z: number;
}

export interface GeneratedStructure {
  atoms: GeneratedAtom[];
  bonds: { a: number; b: number; order: BondOrder }[];
  notes: string[];
}

const S3 = Math.sqrt(3) / 2;
const T = 1 / Math.sqrt(3);
const pentagon = (k: number): V3 => [Math.cos((2 * Math.PI * k) / 5), Math.sin((2 * Math.PI * k) / 5), 0];

/** Ideal direction sets by steric number. */
const IDEAL: Readonly<Record<number, readonly V3[]>> = {
  2: [[0, 0, 1], [0, 0, -1]],
  3: [[1, 0, 0], [-0.5, S3, 0], [-0.5, -S3, 0]],
  4: [[T, T, T], [T, -T, -T], [-T, T, -T], [-T, -T, T]],
  5: [[0, 0, 1], [0, 0, -1], [1, 0, 0], [-0.5, S3, 0], [-0.5, -S3, 0]],
  6: [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]],
  7: [[0, 0, 1], [0, 0, -1], pentagon(0), pentagon(1), pentagon(2), pentagon(3), pentagon(4)],
};

/** Slots occupied by lone pairs, keyed "steric-lonePairs". Lone pairs take equatorial (SN5) or trans (SN6) positions. */
const LONE_PAIR_SLOTS: Readonly<Record<string, readonly number[]>> = {
  '3-1': [2], '4-1': [3], '4-2': [2, 3], '5-1': [4], '5-2': [3, 4], '5-3': [2, 3, 4], '6-1': [5], '6-2': [4, 5],
};

export function estimateBondLength(elementA: string, elementB: string, order: 1 | 2 | 3): number {
  const ra = COVALENT_RADIUS[elementA];
  const rb = COVALENT_RADIUS[elementB];
  if (ra === undefined || rb === undefined) throw new Error(`No covalent radius for ${elementA} or ${elementB}`);
  return (ra + rb) * BOND_ORDER_LENGTH_FACTOR[order];
}

const bondKey = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);

/**
 * Directions (unit vectors, in the frame of the central atom) at which the lone pairs of a central atom point
 * in the idealised model, for the same slot rule generateStructure() uses. Empty when there are none.
 */
export function idealLonePairDirections(stericNumber: number, lonePairs: number): V3[] {
  if (lonePairs === 0) return [];
  const dirs = IDEAL[stericNumber];
  const slots = LONE_PAIR_SLOTS[`${stericNumber}-${lonePairs}`];
  if (!dirs || !slots) return [];
  return slots.map((k) => normalize(dirs[k]!));
}

export function generateStructure(spec: MoleculeSpec): GeneratedStructure {
  const n = spec.atoms.length;
  if (n === 0) throw new Error('A molecule needs at least one atom');
  const adjacency: number[][] = Array.from({ length: n }, () => []);
  const orderOf = new Map<string, BondOrder>();
  for (const [a, b, order] of spec.bonds) {
    if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0 || a >= n || b >= n || a === b) throw new Error(`Invalid bond ${a}-${b}`);
    if (orderOf.has(bondKey(a, b))) throw new Error(`Duplicate bond ${a}-${b}`);
    orderOf.set(bondKey(a, b), order);
    adjacency[a]!.push(b);
    adjacency[b]!.push(a);
  }
  adjacency.forEach((l) => l.sort((x, y) => x - y));

  const overrides = new Map<string, { angstrom: number; source: string }>();
  for (const o of spec.lengthOverrides ?? []) overrides.set(bondKey(o.bond[0], o.bond[1]), o);
  const notes: string[] = [];
  for (const o of overrides.values()) notes.push(`Bond length from ${o.source}`);

  const lengthOf = (a: number, b: number): number => {
    const o = overrides.get(bondKey(a, b));
    if (o) return o.angstrom;
    const order = orderOf.get(bondKey(a, b))!;
    if (order === 'aromatic') throw new Error('Aromatic bonds are only supported through a ring template');
    return estimateBondLength(spec.atoms[a]!.element, spec.atoms[b]!.element, order);
  };

  const positions: (V3 | null)[] = Array(n).fill(null);

  if (spec.coordinates) {
    if (spec.coordinates.length !== n) throw new Error('coordinates must list one position per atom');
    spec.coordinates.forEach((c, i) => (positions[i] = c));
    notes.push('Coordinates supplied by a conformer generator');
  } else if (n === 1) {
    positions[0] = [0, 0, 0];
  } else if (spec.ring) {
    placeRing(spec, adjacency, positions, lengthOf);
  } else {
    if (spec.bonds.length < n - 1) throw new Error('Structure is disconnected: too few bonds to join all atoms');
    if (spec.bonds.length > n - 1) throw new Error('Only acyclic molecules are supported without a ring template');
    placeTree(spec, adjacency, orderOf, positions, lengthOf);
  }

  if (positions.some((p) => p === null)) throw new Error('Structure is disconnected or could not be fully placed');
  const pts = positions as V3[];
  const centre = scale(pts.reduce((s, p) => add(s, p), [0, 0, 0] as V3), 1 / n);
  const atoms = pts.map((p, index) => {
    const q = sub(p, centre);
    return { index, element: spec.atoms[index]!.element, x: round(q[0]), y: round(q[1]), z: round(q[2]) };
  });
  notes.push('Idealised VSEPR geometry: lone-pair compression and other real-molecule distortions are not modelled.');
  return { atoms, bonds: spec.bonds.map(([a, b, order]) => ({ a, b, order })), notes };
}

const round = (x: number) => Math.round(x * 10000) / 10000;

interface LocalGeometry {
  neighbours: number[];
  dirs: V3[];
  stericNumber: number;
}

function localGeometry(spec: MoleculeSpec, adjacency: number[][], orderOf: Map<string, BondOrder>, i: number): LocalGeometry {
  const neighbours = adjacency[i]!;
  if (neighbours.length === 1) return { neighbours, dirs: [[0, 0, 1]], stericNumber: 0 };
  const atom = spec.atoms[i]!;
  const valence = VALENCE_ELECTRONS[atom.element];
  if (valence === undefined) throw new Error(`No valence-electron data for ${atom.element}`);
  let bondOrderSum = 0;
  for (const nb of neighbours) {
    const order = orderOf.get(bondKey(i, nb))!;
    if (order === 'aromatic') throw new Error('Aromatic bonds are only supported through a ring template');
    bondOrderSum += order;
  }
  const v = deriveVsepr({ valenceElectrons: valence, bondOrderSum, neighbours: neighbours.length, formalCharge: atom.formalCharge ?? 0 });
  if (v.status !== 'available') throw new Error(`Cannot derive geometry for atom ${i} (${atom.element})`);
  const { stericNumber, lonePairs } = v.value;
  const slots = IDEAL[stericNumber];
  if (!slots) throw new Error(`No ideal geometry for steric number ${stericNumber}`);
  const lpSlots = LONE_PAIR_SLOTS[`${stericNumber}-${lonePairs}`] ?? [];
  const bonded = slots.filter((_, idx) => !lpSlots.includes(idx));
  if (bonded.length !== neighbours.length) throw new Error(`Geometry mismatch at atom ${i}`);
  return { neighbours, dirs: [...bonded], stericNumber };
}

function placeTree(
  spec: MoleculeSpec,
  adjacency: number[][],
  orderOf: Map<string, BondOrder>,
  positions: (V3 | null)[],
  lengthOf: (a: number, b: number) => number,
): void {
  const n = spec.atoms.length;
  let root = 0;
  for (let i = 1; i < n; i++) if (adjacency[i]!.length > adjacency[root]!.length) root = i;
  if (adjacency[root]!.length === 0) throw new Error('Atoms are not bonded');

  const worldDirs = new Map<number, Map<number, V3>>();
  const stericOf = new Map<number, number>();
  const parentOf = new Map<number, number>();

  const rootGeom = localGeometry(spec, adjacency, orderOf, root);
  positions[root] = [0, 0, 0];
  stericOf.set(root, rootGeom.stericNumber);
  worldDirs.set(root, new Map(rootGeom.neighbours.map((nb, k) => [nb, normalize(rootGeom.dirs[k]!)] as const)));

  const queue: number[] = [root];
  while (queue.length > 0) {
    const p = queue.shift()!;
    const pDirs = worldDirs.get(p)!;
    for (const c of adjacency[p]!) {
      if (parentOf.get(p) === c || positions[c] !== null) continue;
      parentOf.set(c, p);
      const d = pDirs.get(c)!;
      positions[c] = add(positions[p]!, scale(d, lengthOf(p, c)));

      const geom = localGeometry(spec, adjacency, orderOf, c);
      const kp = geom.neighbours.indexOf(p);
      const align = rotationAligning(normalize(geom.dirs[kp]!), scale(d, -1));
      let dirs = geom.dirs.map((v) => align(normalize(v)));

      const ref = geom.neighbours.findIndex((nb) => nb !== p);
      const parentRefNb = adjacency[p]!.find((nb) => nb !== c);
      if (ref >= 0 && parentRefNb !== undefined) {
        const pr = perpendicular(pDirs.get(parentRefNb)!, d);
        const cr = perpendicular(dirs[ref]!, d);
        if (length(pr) > 1e-6 && length(cr) > 1e-6) {
          const staggered = stericOf.get(p) === 4 && geom.stericNumber === 4;
          const override = (spec.torsions ?? []).find((t) => (t.bond[0] === p && t.bond[1] === c) || (t.bond[0] === c && t.bond[1] === p));
          const target = rotateAbout(pr, d, override ? (override.degrees * Math.PI) / 180 : staggered ? Math.PI / 3 : 0);
          const phi = signedAngle(cr, target, d);
          dirs = dirs.map((v) => rotateAbout(v, d, phi));
        }
      }
      stericOf.set(c, geom.stericNumber);
      worldDirs.set(c, new Map(geom.neighbours.map((nb, k) => [nb, dirs[k]!] as const)));
      queue.push(c);
    }
  }
}

function placeRing(spec: MoleculeSpec, adjacency: number[][], positions: (V3 | null)[], lengthOf: (a: number, b: number) => number): void {
  const ring = spec.ring!;
  const m = ring.atoms.length;
  if (m < 3) throw new Error('A ring needs at least three atoms');
  const radius = ring.bondLength / (2 * Math.sin(Math.PI / m));
  ring.atoms.forEach((atom, k) => {
    const angle = (2 * Math.PI * k) / m;
    positions[atom] = [radius * Math.cos(angle), radius * Math.sin(angle), 0];
  });
  ring.atoms.forEach((atom) => {
    for (const nb of adjacency[atom]!) {
      if (ring.atoms.includes(nb)) continue;
      if (adjacency[nb]!.length !== 1) throw new Error('Ring template supports only terminal substituents');
      const outward = normalize(positions[atom]!);
      positions[nb] = add(positions[atom]!, scale(outward, lengthOf(atom, nb)));
    }
  });
}
