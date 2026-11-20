import type { V3 } from './vec.ts';

export interface Ray {
  origin: V3;
  /** Unit direction. */
  dir: V3;
}

export interface PickAtom {
  position: V3;
  radius: number;
}

export interface PickBond {
  a: number;
  b: number;
  radius: number;
}

export type Pick = { kind: 'atom'; index: number; t: number } | { kind: 'bond'; a: number; b: number; t: number } | null;

/** Smallest t ≥ 0 where the ray meets the sphere, or null. */
export function raySphere(ray: Ray, centre: V3, radius: number): number | null {
  const ox = ray.origin[0] - centre[0], oy = ray.origin[1] - centre[1], oz = ray.origin[2] - centre[2];
  const b = ox * ray.dir[0] + oy * ray.dir[1] + oz * ray.dir[2];
  const c = ox * ox + oy * oy + oz * oz - radius * radius;
  const disc = b * b - c;
  if (disc < 0) return null;
  const s = Math.sqrt(disc);
  const t0 = -b - s;
  if (t0 >= 0) return t0;
  const t1 = -b + s;
  return t1 >= 0 ? t1 : null;
}

/**
 * Ray against a finite cylinder (capped by distance to the axis segment) via closest approach of
 * the ray to the segment. Returns the ray parameter of closest approach if within radius.
 */
export function rayCapsule(ray: Ray, p: V3, q: V3, radius: number): number | null {
  const d = ray.dir;
  const u: V3 = [q[0] - p[0], q[1] - p[1], q[2] - p[2]];
  const w: V3 = [ray.origin[0] - p[0], ray.origin[1] - p[1], ray.origin[2] - p[2]];
  const a = d[0] * d[0] + d[1] * d[1] + d[2] * d[2];
  const b = d[0] * u[0] + d[1] * u[1] + d[2] * u[2];
  const c = u[0] * u[0] + u[1] * u[1] + u[2] * u[2];
  const dd = d[0] * w[0] + d[1] * w[1] + d[2] * w[2];
  const e = u[0] * w[0] + u[1] * w[1] + u[2] * w[2];
  const denom = a * c - b * b;
  let s = denom > 1e-12 ? (a * e - b * dd) / denom : 0; // parameter along the segment
  s = Math.max(0, Math.min(1, s));
  const t = (b * s - dd) / a; // matching ray parameter
  if (t < 0) return null;
  const cx = p[0] + u[0] * s, cy = p[1] + u[1] * s, cz = p[2] + u[2] * s;
  const rx = ray.origin[0] + d[0] * t - cx, ry = ray.origin[1] + d[1] * t - cy, rz = ray.origin[2] + d[2] * t - cz;
  return rx * rx + ry * ry + rz * rz <= radius * radius ? t : null;
}

/** Nearest atom or bond under the ray. A bond wins only if it is clearly in front of every atom hit. */
export function pickScene(ray: Ray, atoms: readonly PickAtom[], bonds: readonly PickBond[], bondsPickable: boolean): Pick {
  let best: Pick = null;
  for (let i = 0; i < atoms.length; i++) {
    const t = raySphere(ray, atoms[i]!.position, atoms[i]!.radius);
    if (t !== null && (best === null || t < best.t)) best = { kind: 'atom', index: i, t };
  }
  if (bondsPickable) {
    for (const bd of bonds) {
      const t = rayCapsule(ray, atoms[bd.a]!.position, atoms[bd.b]!.position, bd.radius);
      if (t === null) continue;
      if (best === null || (best.kind === 'bond' && t < best.t) || (best.kind === 'atom' && t < best.t - 1e-6)) {
        best = { kind: 'bond', a: bd.a, b: bd.b, t };
      }
    }
  }
  return best;
}
