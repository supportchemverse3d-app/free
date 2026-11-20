import type { V3 } from '../structure/vec.ts';

/**
 * Boundary-surface shapes of atomic and hybrid orbitals, built from the real angular functions
 * (the same formulas as in textbooks). The surface is r(θ,φ) = |Y(θ,φ)|, which shows the angular shape and the
 * sign of the wavefunction. Radial nodes and size are NOT modelled, so 1s, 2s and 3s look the same here.
 */
export interface MeshData {
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint16Array;
  extent: number;
}

export type AngularFn = (x: number, y: number, z: number) => number;

const SQ3 = Math.sqrt(3);

/** Real angular parts on the unit sphere (x, y, z are direction cosines). Relative sizes are normalised later. */
export const ANGULAR: Record<string, AngularFn> = {
  s: () => 1,
  px: (x) => SQ3 * x,
  py: (_x, y) => SQ3 * y,
  pz: (_x, _y, z) => SQ3 * z,
  dz2: (_x, _y, z) => (Math.sqrt(5) / 2) * (3 * z * z - 1),
  dxz: (x, _y, z) => Math.sqrt(15) * x * z,
  dyz: (_x, y, z) => Math.sqrt(15) * y * z,
  dxy: (x, y) => Math.sqrt(15) * x * y,
  dx2y2: (x, y) => (Math.sqrt(15) / 2) * (x * x - y * y),
  // General set of real f orbitals (cubic harmonics); the numerical factors only set relative display size.
  fz3: (_x, _y, z) => (5 * z * z * z - 3 * z) / 2,
  fxz2: (x, _y, z) => x * (5 * z * z - 1),
  fyz2: (_x, y, z) => y * (5 * z * z - 1),
  fxyz: (x, y, z) => 5 * x * y * z,
  fzx2y2: (x, y, z) => z * (x * x - y * y) * 2.5,
  fxx23y2: (x, y) => x * (x * x - 3 * y * y) * 1.5,
  fy3x2y2: (x, y) => y * (3 * x * x - y * y) * 1.5,
};

/** Combines weighted angular functions (used for hybrid orbitals). */
export const combo = (terms: [number, AngularFn][]): AngularFn => (x, y, z) => terms.reduce((s, [c, f]) => s + c * f(x, y, z), 0);

/** Directional hybrid lobe: c_s + c_p·√3·cosθ′ about the unit axis `dir`. */
export function hybridFn(cs: number, cp: number, dir: V3): AngularFn {
  const n = Math.hypot(...dir);
  const u: V3 = [dir[0] / n, dir[1] / n, dir[2] / n];
  return (x, y, z) => cs + cp * SQ3 * (x * u[0] + y * u[1] + z * u[2]);
}

/** s-character / p-character of sp, sp² and sp³ hybrids (cs² + cp² = 1). */
export const HYBRID_MIX = {
  sp: { cs: Math.SQRT1_2, cp: Math.SQRT1_2 },
  sp2: { cs: Math.sqrt(1 / 3), cp: Math.sqrt(2 / 3) },
  sp3: { cs: 0.5, cp: SQ3 / 2 },
} as const;

/** Lobe axes: sp along ±z, sp² trigonal planar in xy, sp³ tetrahedral. */
export const HYBRID_AXES: Record<'sp' | 'sp2' | 'sp3', V3[]> = {
  sp: [[0, 0, 1], [0, 0, -1]],
  sp2: [[1, 0, 0], [-0.5, Math.sqrt(3) / 2, 0], [-0.5, -Math.sqrt(3) / 2, 0]],
  sp3: [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]],
};

/** Peak |Y| over a coarse sphere sampling (used to normalise display size). */
export function peak(fn: AngularFn): number {
  let m = 0;
  for (let i = 0; i <= 60; i++) {
    const t = (i * Math.PI) / 60;
    for (let j = 0; j < 120; j++) {
      const p = (j * 2 * Math.PI) / 120;
      m = Math.max(m, Math.abs(fn(Math.sin(t) * Math.cos(p), Math.sin(t) * Math.sin(p), Math.cos(t))));
    }
  }
  return m;
}

/**
 * Surface of r = scale·|Y|. Returns separate meshes for the positive and negative phase; the two meet at the nodal
 * surface where |Y| = 0 so the split is seamless. Vertex normals are averaged face normals.
 */
export function orbitalMeshes(fn: AngularFn, scale: number, lat = 44, lon = 64): { positive: MeshData | null; negative: MeshData | null } {
  const rows = lat + 1;
  const cols = lon;
  const pos = new Float32Array(rows * cols * 3);
  const sgn = new Float32Array(rows * cols);
  let extent = 0;
  for (let i = 0; i < rows; i++) {
    const t = (i * Math.PI) / lat;
    for (let j = 0; j < cols; j++) {
      const p = (j * 2 * Math.PI) / lon;
      const x = Math.sin(t) * Math.cos(p);
      const y = Math.sin(t) * Math.sin(p);
      const z = Math.cos(t);
      const v = fn(x, y, z);
      const r = Math.abs(v) * scale;
      const o = (i * cols + j) * 3;
      pos[o] = x * r; pos[o + 1] = y * r; pos[o + 2] = z * r;
      sgn[i * cols + j] = v;
      extent = Math.max(extent, r);
    }
  }
  const tris: number[] = [];
  const triSign: number[] = [];
  for (let i = 0; i < lat; i++) {
    for (let j = 0; j < cols; j++) {
      const j2 = (j + 1) % cols;
      const a = i * cols + j, b = (i + 1) * cols + j, c = i * cols + j2, d = (i + 1) * cols + j2;
      for (const t of [[a, b, c], [b, d, c]]) {
        const s = (sgn[t[0]!]! + sgn[t[1]!]! + sgn[t[2]!]!) / 3;
        if (Math.abs(s) < 1e-9 && sgn[t[0]!] === 0) continue;
        tris.push(...t);
        triSign.push(s);
      }
    }
  }
  const normals = new Float32Array(pos.length);
  for (let t = 0; t < tris.length; t += 3) {
    const [i0, i1, i2] = [tris[t]! * 3, tris[t + 1]! * 3, tris[t + 2]! * 3];
    const e1 = [pos[i1]! - pos[i0]!, pos[i1 + 1]! - pos[i0 + 1]!, pos[i1 + 2]! - pos[i0 + 2]!];
    const e2 = [pos[i2]! - pos[i0]!, pos[i2 + 1]! - pos[i0 + 1]!, pos[i2 + 2]! - pos[i0 + 2]!];
    const n = [e1[1]! * e2[2]! - e1[2]! * e2[1]!, e1[2]! * e2[0]! - e1[0]! * e2[2]!, e1[0]! * e2[1]! - e1[1]! * e2[0]!];
    // Orient outward (away from the nucleus) so shading is consistent on both phases.
    const cx = pos[i0]! + pos[i1]! + pos[i2]!, cy = pos[i0 + 1]! + pos[i1 + 1]! + pos[i2 + 1]!, cz = pos[i0 + 2]! + pos[i1 + 2]! + pos[i2 + 2]!;
    const flip = n[0]! * cx + n[1]! * cy + n[2]! * cz < 0 ? -1 : 1;
    for (const i of [i0, i1, i2]) { normals[i] += flip * n[0]!; normals[i + 1] += flip * n[1]!; normals[i + 2] += flip * n[2]!; }
  }
  // Pole rings are one point: share their normals.
  for (const row of [0, rows - 1]) {
    let sx = 0, sy = 0, sz = 0;
    for (let j = 0; j < cols; j++) { const o = (row * cols + j) * 3; sx += normals[o]!; sy += normals[o + 1]!; sz += normals[o + 2]!; }
    for (let j = 0; j < cols; j++) { const o = (row * cols + j) * 3; normals[o] = sx; normals[o + 1] = sy; normals[o + 2] = sz; }
  }
  for (let o = 0; o < normals.length; o += 3) {
    const l = Math.hypot(normals[o]!, normals[o + 1]!, normals[o + 2]!) || 1;
    normals[o] /= l; normals[o + 1] /= l; normals[o + 2] /= l;
  }
  const part = (positive: boolean): MeshData | null => {
    const idx: number[] = [];
    triSign.forEach((s, k) => {
      if ((s > 0) === positive && Math.abs(s) > 1e-9) idx.push(tris[k * 3]!, tris[k * 3 + 1]!, tris[k * 3 + 2]!);
    });
    return idx.length === 0 ? null : { positions: pos, normals, indices: new Uint16Array(idx), extent };
  };
  return { positive: part(true), negative: part(false) };
}

const nodes = (n: number, l: number): { label: string; value: string }[] => [
  { label: 'Radial nodes (n − l − 1)', value: String(n - l - 1) },
  { label: 'Angular nodes (l)', value: String(l) },
  { label: 'Total nodes (n − 1)', value: String(n - 1) },
];
const qn = (n: number, l: number, m: string): { label: string; value: string }[] => [
  { label: 'Quantum numbers', value: `n = ${n}, l = ${l}, m${l === 0 ? 'ₗ = 0' : 'ₗ: real combination of ' + m}` },
];

export interface OrbitalDef {
  id: string;
  name: string;
  group: 'atomic' | 'overlap';
  summary: string;
  facts: { label: string; value: string }[];
  /** Radii (in Bohr radii a₀, hydrogen-like atom) of spherical radial nodes drawn as shells. */
  radialNodes?: number[];
  /** Display radius of the outer surface in a₀ (chosen for display; not a probability contour). */
  displayRadiusA0?: number;
}

export const ORBITALS: OrbitalDef[] = [
  { id: '1s', name: '1s orbital', group: 'atomic', summary: 'Spherically symmetric and nodeless: the probability of finding the electron depends only on distance from the nucleus.', facts: [...qn(1, 0, ''), ...nodes(1, 0)], displayRadiusA0: 3 },
  { id: '2s', name: '2s orbital', group: 'atomic', summary: 'Spherical, with one spherical radial node (shown as the grey shell). The wavefunction has opposite signs inside and outside the node.', facts: [...qn(2, 0, ''), ...nodes(2, 0), { label: 'Radial node radius (hydrogen-like)', value: '2 a₀' }], radialNodes: [2], displayRadiusA0: 6 },
  { id: '3s', name: '3s orbital', group: 'atomic', summary: 'Spherical, with two spherical radial nodes. The sign alternates across each node.', facts: [...qn(3, 0, ''), ...nodes(3, 0), { label: 'Radial node radii (hydrogen-like)', value: '≈ 1.90 a₀ and 7.10 a₀' }], radialNodes: [1.9, 7.1], displayRadiusA0: 11 },
  { id: 'px', name: '2pₓ orbital', group: 'atomic', summary: 'Two lobes along the x-axis with opposite signs, separated by the yz nodal plane.', facts: [...qn(2, 1, 'pₓ, p_y, p_z'), ...nodes(2, 1), { label: 'Nodal plane', value: 'yz plane' }], displayRadiusA0: 6 },
  { id: 'py', name: '2p_y orbital', group: 'atomic', summary: 'Two lobes along the y-axis with opposite signs, separated by the xz nodal plane.', facts: [...qn(2, 1, 'pₓ, p_y, p_z'), ...nodes(2, 1), { label: 'Nodal plane', value: 'xz plane' }], displayRadiusA0: 6 },
  { id: 'pz', name: '2p_z orbital', group: 'atomic', summary: 'Two lobes along the z-axis with opposite signs, separated by the xy nodal plane.', facts: [...qn(2, 1, 'pₓ, p_y, p_z'), ...nodes(2, 1), { label: 'Nodal plane', value: 'xy plane' }], displayRadiusA0: 6 },
  { id: 'p3z', name: '3p_z orbital', group: 'atomic', summary: 'Like 2p_z but with one additional spherical radial node (grey shell): each lobe has an inner and an outer part of opposite sign.', facts: [...qn(3, 1, 'pₓ, p_y, p_z'), ...nodes(3, 1), { label: 'Radial node radius (hydrogen-like)', value: '6 a₀' }], radialNodes: [6], displayRadiusA0: 14 },
  { id: 'dz2', name: '3d_z² orbital', group: 'atomic', summary: 'Two lobes along z surrounded by a ring (torus) in the xy plane; the ring has the opposite sign to the lobes.', facts: [...qn(3, 2, 'five real d orbitals'), ...nodes(3, 2), { label: 'Angular nodes are', value: 'two cones' }], displayRadiusA0: 10 },
  { id: 'dxz', name: '3d_xz orbital', group: 'atomic', summary: 'Four lobes between the x and z axes, alternating in sign.', facts: [...qn(3, 2, 'five real d orbitals'), ...nodes(3, 2), { label: 'Angular nodes are', value: 'xy and yz planes' }], displayRadiusA0: 10 },
  { id: 'dyz', name: '3d_yz orbital', group: 'atomic', summary: 'Four lobes between the y and z axes, alternating in sign.', facts: [...qn(3, 2, 'five real d orbitals'), ...nodes(3, 2), { label: 'Angular nodes are', value: 'xy and xz planes' }], displayRadiusA0: 10 },
  { id: 'dxy', name: '3d_xy orbital', group: 'atomic', summary: 'Four lobes between the x and y axes, alternating in sign.', facts: [...qn(3, 2, 'five real d orbitals'), ...nodes(3, 2), { label: 'Angular nodes are', value: 'xz and yz planes' }], displayRadiusA0: 10 },
  { id: 'dx2y2', name: '3d_x²−y² orbital', group: 'atomic', summary: 'Four lobes pointing along the x and y axes, alternating in sign.', facts: [...qn(3, 2, 'five real d orbitals'), ...nodes(3, 2), { label: 'Angular nodes are', value: 'planes x = y and x = −y' }], displayRadiusA0: 10 },
  ...([
    ['fz3', '4f_z³', 'A ring of opposite sign around the middle and two axial lobes; three angular nodes (two cones and the xy plane).'],
    ['fxz2', '4f_xz²', 'Lobes arranged around the x–z plane; three angular nodes.'],
    ['fyz2', '4f_yz²', 'Lobes arranged around the y–z plane; three angular nodes.'],
    ['fxyz', '4f_xyz', 'Eight lobes in the corners of a cube, pointing between the axes; the three coordinate planes are nodal.'],
    ['fzx2y2', '4f_z(x²−y²)', 'Eight lobes; nodal planes are the xy plane and the planes x = ±y.'],
    ['fxx23y2', '4f_x(x²−3y²)', 'Six lobes in the xy plane plus structure above and below; three nodal planes.'],
    ['fy3x2y2', '4f_y(3x²−y²)', 'Six lobes in the xy plane plus structure above and below; three nodal planes.'],
  ] as const).map(([id, name, text]): OrbitalDef => ({ id, name: `${name} orbital`, group: 'atomic', summary: `${text} This is one member of the general set of seven real f orbitals.`, facts: [...qn(4, 3, 'seven real f orbitals'), ...nodes(4, 3)], displayRadiusA0: 14 })),
  { id: 'sigma-ss', name: 'σ bonding: s + s', group: 'overlap', summary: 'Head-on overlap of two s orbitals with the same sign along the bond axis, as in H₂. Electron density builds up between the nuclei.', facts: [{ label: 'Type', value: 'Bonding σ (axial overlap)' }, { label: 'Nodes between nuclei', value: 'none' }] },
  { id: 'sigma-star-ss', name: 'σ* antibonding: s − s', group: 'overlap', summary: 'The out-of-phase combination of two s orbitals. A nodal plane between the nuclei removes electron density from the bond region.', facts: [{ label: 'Type', value: 'Antibonding σ*' }, { label: 'Nodes between nuclei', value: '1 (perpendicular to the bond)' }] },
  { id: 'sigma-pp', name: 'σ bonding: p + p (head-on)', group: 'overlap', summary: 'Head-on overlap of two p orbitals along the bond axis, as in F₂. The facing lobes have the same sign.', facts: [{ label: 'Type', value: 'Bonding σ (axial overlap)' }, { label: 'Nodes between nuclei', value: 'none' }] },
  { id: 'sigma-star-pp', name: 'σ* antibonding: p − p (head-on)', group: 'overlap', summary: 'Out-of-phase head-on combination of two p orbitals: the facing lobes have opposite signs, giving a nodal plane between the nuclei.', facts: [{ label: 'Type', value: 'Antibonding σ*' }, { label: 'Nodes between nuclei', value: '1 (perpendicular to the bond)' }] },
  { id: 'pi-pp', name: 'π bonding: p + p (side-on)', group: 'overlap', summary: 'Sideways overlap of two parallel p orbitals above and below the bond axis, as in the second bond of C₂H₄. The nodal plane contains the bond axis.', facts: [{ label: 'Type', value: 'Bonding π (lateral overlap)' }, { label: 'Nodal plane', value: 'contains both nuclei' }] },
  { id: 'pi-star-pp', name: 'π* antibonding: p − p (side-on)', group: 'overlap', summary: 'Out-of-phase sideways combination of two parallel p orbitals: an additional nodal plane between the nuclei.', facts: [{ label: 'Type', value: 'Antibonding π*' }, { label: 'Nodal planes', value: 'one containing the nuclei and one between them' }] },
];

export const getOrbital = (id: string): OrbitalDef | undefined => ORBITALS.find((o) => o.id === id);

export interface LobeSpec {
  mesh: MeshData;
  /** Which phase this surface is. */
  phase: '+' | '-' | 'node';
  position: V3;
}

function phaseMeshes(fn: AngularFn, position: V3, size: number, flip = 1): LobeSpec[] {
  const m = orbitalMeshes((x, y, z) => flip * fn(x, y, z), size / peak(fn));
  const out: LobeSpec[] = [];
  if (m.positive) out.push({ mesh: m.positive, phase: '+', position });
  if (m.negative) out.push({ mesh: m.negative, phase: '-', position });
  return out;
}

/** Bohr-radius scale of the display: 1 a₀ = 0.28 drawing units. */
export const A0_UNITS = 0.28;

function nodeShell(radiusA0: number): LobeSpec {
  const m = orbitalMeshes(() => 1, radiusA0 * A0_UNITS, 20, 32);
  return { mesh: m.positive!, phase: 'node', position: [0, 0, 0] };
}

/** Everything to draw for an orbital id, in a common coordinate frame (bond axis = z for overlap pictures). */
export function buildOrbitalScene(id: string): LobeSpec[] {
  const def = getOrbital(id);
  if (!def) return [];
  const fnId = id === '1s' || id === '2s' || id === '3s' ? 's' : id === 'p3z' ? 'pz' : id;
  if (def.group === 'atomic') {
    const size = (def.displayRadiusA0 ?? 6) * A0_UNITS;
    return [...phaseMeshes(ANGULAR[fnId]!, [0, 0, 0], size), ...(def.radialNodes ?? []).map(nodeShell)];
  }
  const d = 1.5;
  const flipIf = (b: boolean) => (b ? -1 : 1);
  if (id === 'sigma-ss' || id === 'sigma-star-ss') return [...phaseMeshes(ANGULAR.s!, [0, 0, -d / 2], 1.15), ...phaseMeshes(ANGULAR.s!, [0, 0, d / 2], 1.15, flipIf(id === 'sigma-star-ss'))];
  if (id === 'sigma-pp') return [...phaseMeshes(ANGULAR.pz!, [0, 0, -d], 1.5), ...phaseMeshes(ANGULAR.pz!, [0, 0, d], 1.5, -1)];
  if (id === 'sigma-star-pp') return [...phaseMeshes(ANGULAR.pz!, [0, 0, -d], 1.5), ...phaseMeshes(ANGULAR.pz!, [0, 0, d], 1.5, 1)];
  return [...phaseMeshes(ANGULAR.px!, [0, 0, -d / 2], 1.3), ...phaseMeshes(ANGULAR.px!, [0, 0, d / 2], 1.3, flipIf(id === 'pi-star-pp'))];
}

// ---- Hybrid orbitals -------------------------------------------------------------------------------------------
const SQ2 = Math.SQRT2;
const A = ANGULAR;
const S = A.s!, PX = A.px!, PY = A.py!, PZ = A.pz!, DZ2 = A.dz2!, DX2 = A.dx2y2!;
const eq3 = (k: number): AngularFn => hybridFn(Math.sqrt(1 / 3), Math.sqrt(2 / 3), [Math.cos((2 * Math.PI * k) / 3), Math.sin((2 * Math.PI * k) / 3), 0]);

export interface HybridDef {
  id: 'sp' | 'sp2' | 'sp3' | 'sp3d' | 'sp3d2';
  name: string;
  /** Atomic orbitals that mix. */
  from: { id: string; label: string }[];
  process: string;
  geometry: string;
  angles: string;
  examples: string;
  /** The hybrid lobes as angular functions (orthonormal). */
  lobes: AngularFn[];
  /** Direction each lobe points to (for labelling and tests). */
  axes: V3[];
}

const ax = (v: V3): V3 => v;
export const HYBRIDS: HybridDef[] = [
  { id: 'sp', name: 'sp', from: [{ id: 's', label: 's' }, { id: 'pz', label: 'p' }], process: '1 s + 1 p → 2 sp', geometry: 'Linear', angles: '180°', examples: 'BeCl₂, CO₂, C₂H₂', lobes: HYBRID_AXES.sp.map((d) => hybridFn(HYBRID_MIX.sp.cs, HYBRID_MIX.sp.cp, d)), axes: HYBRID_AXES.sp },
  { id: 'sp2', name: 'sp²', from: [{ id: 's', label: 's' }, { id: 'px', label: 'p' }, { id: 'py', label: 'p' }], process: '1 s + 2 p → 3 sp²', geometry: 'Trigonal planar', angles: '120°', examples: 'BF₃, C₂H₄, benzene', lobes: HYBRID_AXES.sp2.map((d) => hybridFn(HYBRID_MIX.sp2.cs, HYBRID_MIX.sp2.cp, d)), axes: HYBRID_AXES.sp2 },
  { id: 'sp3', name: 'sp³', from: [{ id: 's', label: 's' }, { id: 'px', label: 'p' }, { id: 'py', label: 'p' }, { id: 'pz', label: 'p' }], process: '1 s + 3 p → 4 sp³', geometry: 'Tetrahedral', angles: '109.5°', examples: 'CH₄, NH₃, H₂O', lobes: HYBRID_AXES.sp3.map((d) => hybridFn(HYBRID_MIX.sp3.cs, HYBRID_MIX.sp3.cp, d)), axes: HYBRID_AXES.sp3 },
  { id: 'sp3d', name: 'sp³d', from: [{ id: 's', label: 's' }, { id: 'px', label: 'p' }, { id: 'py', label: 'p' }, { id: 'pz', label: 'p' }, { id: 'dz2', label: 'd (z²)' }], process: '1 s + 3 p + 1 d → 5 sp³d', geometry: 'Trigonal bipyramidal', angles: '90° and 120°', examples: 'PCl₅, SF₄, ClF₃',
    lobes: [eq3(0), eq3(1), eq3(2), combo([[1 / SQ2, PZ], [1 / SQ2, DZ2]]), combo([[-1 / SQ2, PZ], [1 / SQ2, DZ2]])], axes: [ax([1, 0, 0]), ax([-0.5, Math.sqrt(3) / 2, 0]), ax([-0.5, -Math.sqrt(3) / 2, 0]), ax([0, 0, 1]), ax([0, 0, -1])] },
  { id: 'sp3d2', name: 'sp³d²', from: [{ id: 's', label: 's' }, { id: 'px', label: 'p' }, { id: 'py', label: 'p' }, { id: 'pz', label: 'p' }, { id: 'dz2', label: 'd (z²)' }, { id: 'dx2y2', label: 'd (x²−y²)' }], process: '1 s + 3 p + 2 d → 6 sp³d²', geometry: 'Octahedral', angles: '90°', examples: 'SF₆, XeF₄, BrF₅',
    lobes: [
      combo([[1 / Math.sqrt(6), S], [1 / SQ2, PZ], [1 / Math.sqrt(3), DZ2]]),
      combo([[1 / Math.sqrt(6), S], [-1 / SQ2, PZ], [1 / Math.sqrt(3), DZ2]]),
      combo([[1 / Math.sqrt(6), S], [1 / SQ2, PX], [-1 / Math.sqrt(12), DZ2], [0.5, DX2]]),
      combo([[1 / Math.sqrt(6), S], [-1 / SQ2, PX], [-1 / Math.sqrt(12), DZ2], [0.5, DX2]]),
      combo([[1 / Math.sqrt(6), S], [1 / SQ2, PY], [-1 / Math.sqrt(12), DZ2], [-0.5, DX2]]),
      combo([[1 / Math.sqrt(6), S], [-1 / SQ2, PY], [-1 / Math.sqrt(12), DZ2], [-0.5, DX2]]),
    ], axes: [[0, 0, 1], [0, 0, -1], [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0]] },
];

export const getHybrid = (id: string): HybridDef | undefined => HYBRIDS.find((h) => h.id === id);

/** The hybrid lobes, drawn at the origin. Positive phase = large lobe; the small back lobe has the opposite sign. */
export function buildHybridScene(h: HybridDef): LobeSpec[] {
  const scale = 2.0 / Math.max(...h.lobes.map(peak));
  return h.lobes.flatMap((fn) => {
    const m = orbitalMeshes(fn, scale);
    return [...(m.positive ? [{ mesh: m.positive, phase: '+' as const, position: [0, 0, 0] as V3 }] : []), ...(m.negative ? [{ mesh: m.negative, phase: '-' as const, position: [0, 0, 0] as V3 }] : [])];
  });
}

/** The atomic orbitals before mixing, laid out in a row along x so each can be seen. */
export function buildBeforeScene(h: HybridDef): LobeSpec[] {
  const n = h.from.length;
  const gap = 2.3;
  return h.from.flatMap((f, i) => phaseMeshes(ANGULAR[f.id]!, [(i - (n - 1) / 2) * gap, 0, 0], 0.95));
}

/** One lone-pair lobe pointing along `dir` from `origin` (single teardrop, positive phase only). */
export function lonePairLobe(dir: V3, size: number): LobeSpec | null {
  const fn = hybridFn(HYBRID_MIX.sp3.cs, HYBRID_MIX.sp3.cp, dir);
  const m = orbitalMeshes(fn, size / peak(fn), 28, 40);
  return m.positive ? { mesh: m.positive, phase: '+', position: [0, 0, 0] } : null;
}
