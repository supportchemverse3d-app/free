import type { V3 } from '../structure/vec.ts';

/**
 * Unit-cell models for the Class 12 solid-state chapter. Lattice geometry (basis positions, coordination numbers,
 * atoms per cell, packing efficiency, voids) is derived from the lattice itself, not typed in, so the numbers
 * shown to students come from the same coordinates that are drawn.
 */
export type Role = 'atom' | 'cation' | 'anion';

export interface BasisSite {
  element: string;
  role: Role;
  /** Fractional coordinates in the conventional cell (cubic) or the primitive hexagonal cell (hcp). */
  frac: V3;
}

export interface CrystalDef {
  id: string;
  name: string;
  formula: string;
  family: 'metallic' | 'ionic';
  cell: 'cubic' | 'hexagonal';
  basis: BasisSite[];
  /** Typical examples (textbook level). */
  examples: string[];
  summary: string;
  /** Ionic radii used only to size ions relative to each other (Shannon-type values, entered by hand, unverified). */
  ionicRadii?: { cation: number; anion: number };
  voidsInfo?: string;
}

const FCC: V3[] = [[0, 0, 0], [0, 0.5, 0.5], [0.5, 0, 0.5], [0.5, 0.5, 0]];
const shift = (pts: V3[], d: V3): V3[] => pts.map((p) => [p[0] + d[0], p[1] + d[1], p[2] + d[2]] as V3);
const sites = (pts: V3[], element: string, role: Role): BasisSite[] => pts.map((frac) => ({ element, role, frac }));
const TET: V3[] = [[0.25, 0.25, 0.25], [0.75, 0.75, 0.25], [0.75, 0.25, 0.75], [0.25, 0.75, 0.75]];
const TET_ALL: V3[] = [...TET, ...shift(TET, [0.5, 0.5, 0.5]).map((p) => p.map((x) => x % 1) as unknown as V3)];

export const CRYSTALS: CrystalDef[] = [
  { id: 'simple-cubic', name: 'Simple cubic (SC)', formula: 'M', family: 'metallic', cell: 'cubic', basis: sites([[0, 0, 0]], 'M', 'atom'), examples: ['Polonium (α-form)'], summary: 'One lattice point per cell, at the corners. Atoms touch along the cell edge.' },
  { id: 'body-centred-cubic', name: 'Body-centred cubic (BCC)', formula: 'M', family: 'metallic', cell: 'cubic', basis: sites([[0, 0, 0], [0.5, 0.5, 0.5]], 'M', 'atom'), examples: ['Na', 'K', 'Fe (α)', 'Cr', 'W'], summary: 'Corner atoms plus one atom at the cell centre. Atoms touch along the body diagonal.', voidsInfo: 'BCC has distorted tetrahedral and octahedral voids; they are not drawn here.' },
  { id: 'face-centred-cubic', name: 'Face-centred cubic (FCC / ccp)', formula: 'M', family: 'metallic', cell: 'cubic', basis: sites(FCC, 'M', 'atom'), examples: ['Cu', 'Ag', 'Au', 'Al', 'Ni'], summary: 'Corner atoms plus one atom at the centre of each face (cubic close packing, ABCABC…). Atoms touch along the face diagonal.', voidsInfo: 'Per cell: 4 octahedral voids (body centre and edge centres) and 8 tetrahedral voids.' },
  { id: 'hexagonal-close-packed', name: 'Hexagonal close-packed (HCP)', formula: 'M', family: 'metallic', cell: 'hexagonal', basis: [{ element: 'M', role: 'atom', frac: [0, 0, 0] }, { element: 'M', role: 'atom', frac: [1 / 3, 1 / 3, 0.5] }], examples: ['Mg', 'Zn', 'Ti', 'Cd'], summary: 'Close-packed layers stacked ABAB… The hexagonal prism shows 12 corner atoms, 2 face-centre atoms and 3 atoms in the middle layer.' },
  { id: 'rock-salt', name: 'Rock salt (NaCl)', formula: 'NaCl', family: 'ionic', cell: 'cubic', basis: [...sites(FCC, 'Cl', 'anion'), ...sites(shift(FCC, [0.5, 0, 0]).map((p) => p.map((x) => x % 1) as unknown as V3), 'Na', 'cation')], examples: ['NaCl', 'KCl', 'MgO', 'AgCl'], summary: 'Chloride ions form an FCC lattice; sodium ions occupy all the octahedral voids. Each ion is surrounded by six of the other kind.', ionicRadii: { cation: 1.02, anion: 1.81 } },
  { id: 'caesium-chloride', name: 'Caesium chloride (CsCl)', formula: 'CsCl', family: 'ionic', cell: 'cubic', basis: [{ element: 'Cl', role: 'anion', frac: [0, 0, 0] }, { element: 'Cs', role: 'cation', frac: [0.5, 0.5, 0.5] }], examples: ['CsCl', 'CsBr', 'CsI'], summary: 'Two interpenetrating simple cubic lattices. Each ion sits at the centre of a cube of the other ion (8:8 coordination).', ionicRadii: { cation: 1.74, anion: 1.81 } },
  { id: 'zinc-blende', name: 'Zinc blende (ZnS)', formula: 'ZnS', family: 'ionic', cell: 'cubic', basis: [...sites(FCC, 'S', 'anion'), ...sites(TET, 'Zn', 'cation')], examples: ['ZnS', 'CuCl', 'AgI'], summary: 'Sulfide ions form an FCC lattice and zinc ions occupy half of the tetrahedral voids (4:4 coordination).', ionicRadii: { cation: 0.6, anion: 1.84 } },
  { id: 'fluorite', name: 'Fluorite (CaF₂)', formula: 'CaF₂', family: 'ionic', cell: 'cubic', basis: [...sites(FCC, 'Ca', 'cation'), ...sites(TET_ALL, 'F', 'anion')], examples: ['CaF₂', 'BaF₂', 'SrF₂'], summary: 'Calcium ions form an FCC lattice and fluoride ions fill all eight tetrahedral voids (8:4 coordination).', ionicRadii: { cation: 1.12, anion: 1.31 } },
];

export const getCrystal = (id: string): CrystalDef | undefined => CRYSTALS.find((c) => c.id === id);

const EPS = 1e-6;
const HCP_C_OVER_A = Math.sqrt(8 / 3);

/** Cartesian position of a fractional coordinate for the lattice vectors of this cell type. */
function toCartesian(def: CrystalDef, f: V3, a: number): V3 {
  if (def.cell === 'cubic') return [f[0] * a, f[1] * a, f[2] * a];
  return [a * (f[0] + f[1] / 2), a * ((Math.sqrt(3) / 2) * f[1]), a * HCP_C_OVER_A * f[2]];
}

export interface PlacedSite {
  element: string;
  role: Role;
  position: V3;
  /** Fraction of this atom that belongs to the drawn cell (1, 1/2, 1/4, 1/8, …). */
  share: number;
}

export interface VoidSite {
  kind: 'octahedral' | 'tetrahedral';
  position: V3;
  share: number;
}

export interface CrystalModel {
  def: CrystalDef;
  /** Cell edge a (cubic) or a (hexagonal), in drawing units. The model is centred at the origin. */
  a: number;
  sites: PlacedSite[];
  edges: { a: V3; b: V3 }[];
  voids: VoidSite[];
  /** Nearest-neighbour distance (same units as a). */
  nearest: number;
  atomsPerCell: Record<string, number>;
  /** Nearest neighbours of each species in the infinite lattice (keyed by element). */
  coordination: Record<string, { count: number; of: string }>;
  packingEfficiency: number | null;
}

const key = (p: V3) => p.map((x) => Math.round(x / 1e-4)).join(',');

/** All lattice images of the basis in a block of cells around the origin cell. */
function lattice(def: CrystalDef, a: number, range: number): { site: BasisSite; position: V3 }[] {
  const out: { site: BasisSite; position: V3 }[] = [];
  for (let i = -range; i <= range; i++) for (let j = -range; j <= range; j++) for (let k = -range; k <= range; k++) {
    for (const site of def.basis) out.push({ site, position: toCartesian(def, [site.frac[0] + i, site.frac[1] + j, site.frac[2] + k], a) });
  }
  return out;
}

const dist = (p: V3, q: V3) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);

function insideHexPrism(p: V3, a: number, c: number): { inside: boolean; weight: number } {
  if (p[2] < -EPS || p[2] > c + EPS) return { inside: false, weight: 0 };
  const zw = Math.abs(p[2]) < EPS || Math.abs(p[2] - c) < EPS ? 0.5 : 1;
  const r = Math.hypot(p[0], p[1]);
  let ok = true;
  for (let k = 0; k < 6; k++) {
    const ang = ((30 + 60 * k) * Math.PI) / 180;
    if (p[0] * Math.cos(ang) + p[1] * Math.sin(ang) > a * Math.cos(Math.PI / 6) + EPS) ok = false;
  }
  if (!ok) return { inside: false, weight: 0 };
  const vertex = Math.abs(r - a) < EPS;
  return { inside: true, weight: zw * (vertex ? 1 / 3 : 1) };
}

export function buildCrystal(def: CrystalDef, a = 2): CrystalModel {
  const c = a * HCP_C_OVER_A;
  const sites: PlacedSite[] = [];
  const seen = new Set<string>();

  const placeAll = (images: { site: BasisSite; position: V3 }[], accept: (p: V3) => number) => {
    for (const { site, position } of images) {
      const share = accept(position);
      if (share <= 0) continue;
      const k = `${site.element}|${key(position)}`;
      if (seen.has(k)) continue;
      seen.add(k);
      sites.push({ element: site.element, role: site.role, position, share });
    }
  };

  const images = lattice(def, a, 2);
  if (def.cell === 'cubic') {
    placeAll(images, (p) => {
      if (p.some((x) => x < -EPS || x > a + EPS)) return 0;
      const onBoundary = p.filter((x) => Math.abs(x) < EPS || Math.abs(x - a) < EPS).length;
      return 1 / 2 ** onBoundary;
    });
  } else {
    placeAll(images, (p) => {
      const r = insideHexPrism(p, a, c);
      return r.inside ? r.weight : 0;
    });
  }

  // Centre the model at the origin.
  const centre: V3 = def.cell === 'cubic' ? [a / 2, a / 2, a / 2] : [0, 0, c / 2];
  const shiftC = (p: V3): V3 => [p[0] - centre[0], p[1] - centre[1], p[2] - centre[2]];
  sites.forEach((s) => (s.position = shiftC(s.position)));

  const edges: { a: V3; b: V3 }[] = [];
  if (def.cell === 'cubic') {
    const corners: V3[] = [];
    for (let i = 0; i < 8; i++) corners.push([(i & 1) * a, ((i >> 1) & 1) * a, ((i >> 2) & 1) * a]);
    for (let i = 0; i < 8; i++) for (const bit of [1, 2, 4]) if ((i & bit) === 0) edges.push({ a: shiftC(corners[i]!), b: shiftC(corners[i | bit]!) });
  } else {
    const hex = (z: number): V3[] => Array.from({ length: 6 }, (_, k) => [a * Math.cos((k * Math.PI) / 3), a * Math.sin((k * Math.PI) / 3), z] as V3);
    const bottom = hex(0).map(shiftC);
    const top = hex(c).map(shiftC);
    for (let k = 0; k < 6; k++) edges.push({ a: bottom[k]!, b: bottom[(k + 1) % 6]! }, { a: top[k]!, b: top[(k + 1) % 6]! }, { a: bottom[k]!, b: top[k]! });
  }

  // Nearest-neighbour distance and coordination from the infinite lattice.
  const big = lattice(def, a, 2);
  const origin = def.basis.map((s) => ({ s, p: toCartesian(def, s.frac, a) }));
  let nearest = Infinity;
  for (const o of origin) for (const q of big) {
    const d = dist(o.p, q.position);
    if (d > EPS) nearest = Math.min(nearest, d);
  }
  const ionic = def.family === 'ionic';
  const coordination: Record<string, { count: number; of: string }> = {};
  for (const o of origin) {
    if (coordination[o.s.element]) continue;
    // Metals: nearest like atoms. Ionic: nearest atoms of any other kind at the minimum cation–anion distance.
    let best = Infinity;
    for (const q of big) {
      if (ionic ? q.site.role === o.s.role : false) continue;
      const d = dist(o.p, q.position);
      if (d > EPS) best = Math.min(best, d);
    }
    let count = 0;
    let of = o.s.element;
    for (const q of big) {
      if (ionic && q.site.role === o.s.role) continue;
      const d = dist(o.p, q.position);
      if (d > EPS && Math.abs(d - best) < 1e-6) {
        count++;
        of = q.site.element;
      }
    }
    coordination[o.s.element] = { count, of };
  }

  const atomsPerCell: Record<string, number> = {};
  for (const s of sites) atomsPerCell[s.element] = (atomsPerCell[s.element] ?? 0) + s.share;
  for (const k of Object.keys(atomsPerCell)) atomsPerCell[k] = Math.round(atomsPerCell[k]! * 1e6) / 1e6;

  // Packing efficiency of touching equal spheres (metals only).
  let packingEfficiency: number | null = null;
  if (!ionic) {
    const z = Object.values(atomsPerCell).reduce((s, x) => s + x, 0);
    const r = nearest / 2;
    const volume = def.cell === 'cubic' ? a ** 3 : ((3 * Math.sqrt(3)) / 2) * a * a * c;
    packingEfficiency = (z * (4 / 3) * Math.PI * r ** 3) / volume;
  }

  // Voids of an FCC lattice (octahedral at body/edge centres, tetrahedral at (¼,¼,¼) positions).
  const voids: VoidSite[] = [];
  const fccBased = def.id === 'face-centred-cubic' || def.id === 'rock-salt' || def.id === 'zinc-blende' || def.id === 'fluorite';
  if (fccBased) {
    // Octahedral voids: body centre and the centre of each of the 12 edges.
    const uniq = new Map<string, V3>();
    uniq.set(key([0.5, 0.5, 0.5]), [0.5, 0.5, 0.5]);
    for (const i of [0, 1]) for (const j of [0, 1]) for (const p of [[0.5, i, j], [i, 0.5, j], [i, j, 0.5]] as V3[]) uniq.set(key(p), p);
    for (const p of uniq.values()) {
      const onBoundary = p.filter((x) => x === 0 || x === 1).length;
      voids.push({ kind: 'octahedral', position: shiftC([p[0] * a, p[1] * a, p[2] * a]), share: 1 / 2 ** onBoundary });
    }
    for (const i of [0.25, 0.75]) for (const j of [0.25, 0.75]) for (const k of [0.25, 0.75]) voids.push({ kind: 'tetrahedral', position: shiftC([i * a, j * a, k * a]), share: 1 });
  }

  return { def, a, sites, edges, voids, nearest, atomsPerCell, coordination, packingEfficiency };
}

/** Display radii. Metals touch in space-filling mode; ions are sized by the ratio of their ionic radii. */
export function siteRadii(model: CrystalModel, role: Role): { ball: number; fill: number } {
  const { def, nearest } = model;
  if (def.family === 'metallic' || !def.ionicRadii) return { ball: nearest * 0.2, fill: nearest / 2 };
  const { cation, anion } = def.ionicRadii;
  const frac = role === 'cation' ? cation / (cation + anion) : anion / (cation + anion);
  const fill = nearest * frac;
  return { ball: fill * 0.42, fill };
}
