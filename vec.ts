export type V3 = readonly [number, number, number];

export const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const length = (a: V3): number => Math.hypot(a[0], a[1], a[2]);

export function normalize(a: V3): V3 {
  const l = length(a);
  if (l === 0) throw new RangeError('Cannot normalise a zero vector');
  return [a[0] / l, a[1] / l, a[2] / l];
}

/** Rodrigues rotation of v about a unit axis by angle (radians). */
export function rotateAbout(v: V3, axis: V3, angle: number): V3 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const k = cross(axis, v);
  const d = dot(axis, v) * (1 - c);
  return [v[0] * c + k[0] * s + axis[0] * d, v[1] * c + k[1] * s + axis[1] * d, v[2] * c + k[2] * s + axis[2] * d];
}

/** Returns a rotation that maps unit vector u onto unit vector v. */
export function rotationAligning(u: V3, v: V3): (p: V3) => V3 {
  const d = dot(u, v);
  if (d > 1 - 1e-12) return (p) => p;
  if (d < -1 + 1e-12) {
    const helper: V3 = Math.abs(u[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    const axis = normalize(cross(u, helper));
    return (p) => rotateAbout(p, axis, Math.PI);
  }
  const axis = normalize(cross(u, v));
  const angle = Math.acos(Math.max(-1, Math.min(1, d)));
  return (p) => rotateAbout(p, axis, angle);
}

/** Signed angle from one vector to another about a unit axis. */
export function signedAngle(from: V3, to: V3, axis: V3): number {
  return Math.atan2(dot(axis, cross(from, to)), dot(from, to));
}

/** Component of v perpendicular to a unit axis. */
export function perpendicular(v: V3, axis: V3): V3 {
  return sub(v, scale(axis, dot(v, axis)));
}
