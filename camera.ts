import { multiply, perspective, rotationX, rotationY, translation, type Mat4 } from './math.ts';

export const FOV_Y = (40 * Math.PI) / 180;
const NEAR = 0.1;
const FAR = 400;

export interface ViewState {
  /** Rotation of the molecule about its own centre (the model is centred at the origin). */
  rot: Mat4;
  dist: number;
  panX: number;
  panY: number;
}

export function initialView(dist: number, atoms?: readonly { x: number; y: number; z: number }[]): ViewState {
  return { rot: multiply(tilted(), principalRotation(atoms)), dist, panX: 0, panY: 0 };
}

/**
 * Rotation that lays the molecule's longest axis along screen-x and its thinnest along the line of sight,
 * so planar molecules (water, benzene) start face-on instead of with atoms hidden behind each other.
 * Jacobi eigen-decomposition of the 3×3 covariance of the atom positions.
 */
export function principalRotation(atoms?: readonly { x: number; y: number; z: number }[]): Mat4 {
  const id = multiply(rotationX(0), rotationY(0));
  if (!atoms || atoms.length < 3) return id;
  const n = atoms.length;
  const cx = atoms.reduce((s, a) => s + a.x, 0) / n, cy = atoms.reduce((s, a) => s + a.y, 0) / n, cz = atoms.reduce((s, a) => s + a.z, 0) / n;
  const A = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const a of atoms) {
    const d = [a.x - cx, a.y - cy, a.z - cz];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) A[i]![j]! += d[i]! * d[j]!;
  }
  const V = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let sweep = 0; sweep < 30; sweep++) {
    let off = 0;
    for (let p = 0; p < 2; p++) for (let q = p + 1; q < 3; q++) {
      const apq = A[p]![q]!;
      off += Math.abs(apq);
      if (Math.abs(apq) < 1e-12) continue;
      const theta = (A[q]![q]! - A[p]![p]!) / (2 * apq);
      const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
      const cs = 1 / Math.sqrt(t * t + 1), sn = t * cs;
      for (let k = 0; k < 3; k++) { const akp = A[k]![p]!, akq = A[k]![q]!; A[k]![p] = cs * akp - sn * akq; A[k]![q] = sn * akp + cs * akq; }
      for (let k = 0; k < 3; k++) { const apk = A[p]![k]!, aqk = A[q]![k]!; A[p]![k] = cs * apk - sn * aqk; A[q]![k] = sn * apk + cs * aqk; }
      for (let k = 0; k < 3; k++) { const vkp = V[k]![p]!, vkq = V[k]![q]!; V[k]![p] = cs * vkp - sn * vkq; V[k]![q] = sn * vkp + cs * vkq; }
    }
    if (off < 1e-12) break;
  }
  // eigenvectors are the columns of V; order by eigenvalue, largest first
  const order = [0, 1, 2].sort((i, j) => A[j]![j]! - A[i]![i]!);
  const axis = order.map((i) => [V[0]![i]!, V[1]![i]!, V[2]![i]!]);
  const [x, y] = [axis[0]!, axis[1]!];
  const z = [x[1]! * y[2]! - x[2]! * y[1]!, x[2]! * y[0]! - x[0]! * y[2]!, x[0]! * y[1]! - x[1]! * y[0]!];
  const m = new Float32Array(16);
  const rows = [x, y, z];
  for (let r = 0; r < 3; r++) for (let col = 0; col < 3; col++) m[col * 4 + r] = rows[r]![col]!;
  m[15] = 1;
  return m;
}

/** A slight starting tilt so flat molecules are not seen exactly edge-on or face-on. */
function tilted(): Mat4 {
  return multiply(rotationX(0.35), rotationY(-0.5));
}

/** Camera distance at which a sphere of the given radius fits the viewport (portrait screens are limited by width). */
export function fitDistance(radius: number, aspect: number): number {
  const limiting = Math.min(1, aspect);
  return (radius * 1.5) / (Math.sin(FOV_Y / 2) * limiting);
}

export function viewMatrix(v: ViewState): Mat4 {
  return multiply(translation(v.panX, v.panY, -v.dist), v.rot);
}

export const projectionMatrix = (aspect: number): Mat4 => perspective(FOV_Y, aspect, NEAR, FAR);

/** Drag rotation about the screen axes (left-multiplied so it always follows the finger). */
export function rotated(v: ViewState, dxPixels: number, dyPixels: number): ViewState {
  const k = 0.008;
  return { ...v, rot: multiply(rotationX(dyPixels * k), multiply(rotationY(dxPixels * k), v.rot)) };
}

export function panned(v: ViewState, dxPixels: number, dyPixels: number, viewportHeight: number): ViewState {
  const perPixel = (2 * v.dist * Math.tan(FOV_Y / 2)) / viewportHeight;
  return { ...v, panX: v.panX + dxPixels * perPixel, panY: v.panY - dyPixels * perPixel };
}

export function zoomed(v: ViewState, factor: number, min: number, max: number): ViewState {
  return { ...v, dist: Math.min(max, Math.max(min, v.dist * factor)) };
}

export const resetView = (dist: number, atoms?: readonly { x: number; y: number; z: number }[]): ViewState => initialView(dist, atoms);
