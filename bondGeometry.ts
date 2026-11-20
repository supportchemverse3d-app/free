import type { BondLike } from '../engine/structure/analyze.ts';
import { add, cross, length, normalize, scale, sub, type V3 } from '../engine/structure/vec.ts';
import type { Mat4 } from './math.ts';

export interface BondAtom {
  element: string;
  x: number;
  y: number;
  z: number;
  /** Optional overrides for non-molecular scenes (crystals): drawn radius in ball mode / space-filling mode, and colour. */
  radius?: number;
  fillRadius?: number;
  color?: string;
  /** Text drawn on the atom instead of the element symbol ('' hides it). */
  label?: string;
}

/** One drawn half-cylinder of a bond; each half takes the colour of the atom it is attached to. */
export interface CylinderSegment {
  bondA: number;
  bondB: number;
  colorAtom: number;
  radius: number;
  from: V3;
  to: V3;
}

const pos = (a: BondAtom): V3 => [a.x, a.y, a.z];

/** A unit vector perpendicular to u (stable choice). */
function anyPerpendicular(u: V3): V3 {
  const helper: V3 = Math.abs(u[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  return normalize(cross(u, helper));
}

/**
 * Direction in which parallel lines of a multiple bond are spread: in the plane of the bond and one
 * of its other neighbours when there is one (the usual textbook look), otherwise any perpendicular.
 */
function offsetDirection(atoms: readonly BondAtom[], bonds: readonly BondLike[], bond: BondLike, u: V3): V3 {
  const pa = pos(atoms[bond.a]!);
  for (const other of bonds) {
    if (other === bond) continue;
    const shared = other.a === bond.a || other.b === bond.a ? bond.a : other.a === bond.b || other.b === bond.b ? bond.b : -1;
    if (shared === -1) continue;
    const far = other.a === shared ? other.b : other.a;
    const normal = cross(u, sub(pos(atoms[far]!), pa));
    if (length(normal) > 1e-3) return normalize(cross(normal, u));
  }
  return anyPerpendicular(u);
}

const SINGLE_RADIUS = 0.12;

export function buildBondSegments(atoms: readonly BondAtom[], bonds: readonly BondLike[]): CylinderSegment[] {
  const out: CylinderSegment[] = [];
  for (const bond of bonds) {
    const pa = pos(atoms[bond.a]!);
    const pb = pos(atoms[bond.b]!);
    const axis = sub(pb, pa);
    if (length(axis) < 1e-6) continue;
    const u = normalize(axis);

    let lines: { offset: V3; radius: number }[];
    if (bond.order === 1) {
      lines = [{ offset: [0, 0, 0], radius: SINGLE_RADIUS }];
    } else if (bond.order === 2) {
      const p = offsetDirection(atoms, bonds, bond, u);
      lines = [{ offset: scale(p, -0.1), radius: 0.07 }, { offset: scale(p, 0.1), radius: 0.07 }];
    } else if (bond.order === 3) {
      const p = offsetDirection(atoms, bonds, bond, u);
      lines = [{ offset: scale(p, -0.19), radius: 0.06 }, { offset: [0, 0, 0], radius: 0.06 }, { offset: scale(p, 0.19), radius: 0.06 }];
    } else {
      // Aromatic: a full line plus a thinner inner line on the side of the ring centre (the model is centred at the origin).
      const mid = scale(add(pa, pb), 0.5);
      const towardCentre = sub([0, 0, 0], mid);
      const inward = sub(towardCentre, scale(u, towardCentre[0] * u[0] + towardCentre[1] * u[1] + towardCentre[2] * u[2]));
      const p = length(inward) > 1e-3 ? normalize(inward) : anyPerpendicular(u);
      lines = [{ offset: [0, 0, 0], radius: 0.1 }, { offset: scale(p, 0.2), radius: 0.05 }];
    }

    for (const line of lines) {
      const a = add(pa, line.offset);
      const b = add(pb, line.offset);
      const mid = scale(add(a, b), 0.5);
      out.push({ bondA: bond.a, bondB: bond.b, colorAtom: bond.a, radius: line.radius, from: a, to: mid });
      out.push({ bondA: bond.a, bondB: bond.b, colorAtom: bond.b, radius: line.radius, from: mid, to: b });
    }
  }
  return out;
}

/** Model matrix mapping the unit cylinder (radius 1, z from 0 to 1) onto the segment. */
export function cylinderModel(from: V3, to: V3, radius: number): Mat4 {
  const axis = sub(to, from);
  const z = normalize(axis);
  const x = anyPerpendicular(z);
  const y = cross(z, x);
  const m = new Float32Array(16);
  m[0] = x[0] * radius; m[1] = x[1] * radius; m[2] = x[2] * radius;
  m[4] = y[0] * radius; m[5] = y[1] * radius; m[6] = y[2] * radius;
  m[8] = axis[0]; m[9] = axis[1]; m[10] = axis[2];
  m[12] = from[0]; m[13] = from[1]; m[14] = from[2]; m[15] = 1;
  return m;
}

export const sphereModel = (p: V3, radius: number): Mat4 => {
  const m = new Float32Array(16);
  m[0] = m[5] = m[10] = radius;
  m[12] = p[0]; m[13] = p[1]; m[14] = p[2]; m[15] = 1;
  return m;
};

export const bondKey = (a: number, b: number): string => (a < b ? `${a}-${b}` : `${b}-${a}`);
