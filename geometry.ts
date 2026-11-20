export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Distance between two points, in the same unit as the input (Å for molecule data). */
export function distance(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

/** Angle A–B–C in degrees, with B as the vertex. Throws if A or C coincides with B. */
export function angleDegrees(a: Vec3, b: Vec3, c: Vec3): number {
  const ux = a.x - b.x, uy = a.y - b.y, uz = a.z - b.z;
  const vx = c.x - b.x, vy = c.y - b.y, vz = c.z - b.z;
  const nu = Math.hypot(ux, uy, uz);
  const nv = Math.hypot(vx, vy, vz);
  if (nu === 0 || nv === 0) throw new RangeError('Angle undefined: coincident points');
  const cos = Math.max(-1, Math.min(1, (ux * vx + uy * vy + uz * vz) / (nu * nv)));
  return (Math.acos(cos) * 180) / Math.PI;
}
