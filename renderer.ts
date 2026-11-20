import { CPK_COLOR, FALLBACK_COLOR, FALLBACK_VDW_RADIUS, VDW_RADIUS } from '../engine/chemistry/atomData.ts';
import type { BondLike } from '../engine/structure/analyze.ts';
import type { V3 } from '../engine/structure/vec.ts';
import { buildBondSegments, bondKey, cylinderModel, sphereModel, type BondAtom, type CylinderSegment } from './bondGeometry.ts';
import { FOV_Y, projectionMatrix, viewMatrix, type ViewState } from './camera.ts';
import { invert, multiply, rayThrough, transform, type Mat4 } from './math.ts';
import { cylinderMesh, sphereMesh, type Mesh } from './meshes.ts';

export type RenderMode = 'ball-stick' | 'space-fill' | 'stick';
export type Selection = { kind: 'atom'; index: number } | { kind: 'bond'; a: number; b: number };

const BALL_SCALE = 0.25;
/** Atoms in stick mode are only joints between the rods (same radius as a single-bond rod). */
export const STICK_RADIUS = 0.12;
const EDGE_RADIUS = 0.022;
/** Generous picking radius so thin bonds are tappable with a finger. */
export const BOND_PICK_RADIUS = 0.22;

export function atomRadius(element: string, mode: RenderMode): number {
  if (mode === 'stick') return STICK_RADIUS;
  const vdw = VDW_RADIUS[element] ?? FALLBACK_VDW_RADIUS;
  return mode === 'space-fill' ? vdw : vdw * BALL_SCALE;
}

export const atomColor = (element: string): string => CPK_COLOR[element] ?? FALLBACK_COLOR;

/** Radius / colour actually drawn for an atom (scene overrides win over the per-element tables). */
export const drawnRadius = (a: BondAtom, mode: RenderMode): number =>
  mode === 'stick' ? STICK_RADIUS : mode === 'space-fill' ? (a.fillRadius ?? a.radius ?? atomRadius(a.element, mode)) : (a.radius ?? atomRadius(a.element, mode));
/** Radius while animating between modes: 0 = ball-and-stick, 1 = space-filling, -1 = stick. */
export const blendTarget = (mode: RenderMode): number => (mode === 'space-fill' ? 1 : mode === 'stick' ? -1 : 0);
const blendedRadius = (a: BondAtom, t: number): number => {
  const r0 = drawnRadius(a, 'ball-stick');
  const r1 = t >= 0 ? drawnRadius(a, 'space-fill') : drawnRadius(a, 'stick');
  const k = Math.abs(t);
  return r0 + (r1 - r0) * k;
};
export const drawnColor = (a: BondAtom): string => a.color ?? atomColor(a.element);

/** A translucent orbital lobe (already-built mesh in orbital-local coordinates). */
export interface Lobe {
  mesh: Mesh;
  color: string;
  position: V3;
  scale: number;
  /** Opacity, default 0.62. */
  alpha?: number;
}
export interface Extras {
  /** Thin wireframe lines, e.g. unit-cell edges. */
  edges?: { a: V3; b: V3 }[];
  lobes?: Lobe[];
}

const VERTEX = `
attribute vec3 aPos;
attribute vec3 aNormal;
uniform mat4 uModel;
uniform mat4 uView;
uniform mat4 uProj;
uniform mat3 uNormalMat;
varying vec3 vN;
varying vec3 vP;
void main() {
  vec4 p = uView * uModel * vec4(aPos, 1.0);
  vP = p.xyz;
  vN = uNormalMat * aNormal;
  gl_Position = uProj * p;
}`;

const FRAGMENT = `
precision mediump float;
varying vec3 vN;
varying vec3 vP;
uniform vec3 uColor;
uniform float uTint;
uniform float uAlpha;
uniform vec2 uDepth;
void main() {
  vec3 n = normalize(vN);
  if (!gl_FrontFacing) n = -n;
  vec3 v = normalize(-vP);
  float ndv = max(dot(n, v), 0.0);
  // Key light from upper left, soft cool fill from the right, warm bounce from below.
  vec3 key = normalize(vec3(-0.50, 0.70, 0.55));
  vec3 fill = normalize(vec3(0.80, 0.10, 0.35));
  vec3 bounce = normalize(vec3(0.20, -0.90, 0.25));
  float diff = clamp((dot(n, key) + 0.18) / 1.18, 0.0, 1.0);
  diff = diff * diff * (3.0 - 2.0 * diff);
  float fillD = max(dot(n, fill), 0.0);
  float bnc = max(dot(n, bounce), 0.0);
  vec3 base = mix(uColor, vec3(1.0, 0.80, 0.18), uTint * 0.55);
  // Slightly richer colour so atoms read as solid, saturated spheres.
  float lum = dot(base, vec3(0.299, 0.587, 0.114));
  base = clamp(mix(vec3(lum), base, 1.14), 0.0, 1.0);
  vec3 ambient = mix(vec3(0.20, 0.22, 0.28), vec3(0.40, 0.44, 0.52), n.y * 0.5 + 0.5);
  vec3 col = base * (ambient * 0.75 + diff * 0.80 + fillD * 0.14 * vec3(0.85, 0.95, 1.10) + bnc * 0.08 * vec3(1.10, 0.95, 0.80));
  // Darken toward the silhouette: gives volume and a clean solid edge (no glassy bright rim).
  col *= mix(0.52, 1.0, smoothstep(0.0, 0.62, ndv));
  vec3 h = normalize(key + v);
  float nh = max(dot(n, h), 0.0);
  float spec = pow(nh, 90.0) * 0.62 + pow(nh, 16.0) * 0.07;
  col += vec3(1.0, 0.98, 0.95) * spec * (0.35 + 0.65 * diff);
  col += uTint * vec3(0.10, 0.08, 0.0);
  // Depth cue: far parts fade a little toward the background.
  float dz = clamp((-vP.z - uDepth.x) / max(uDepth.y, 0.001), 0.0, 1.0);
  col = mix(col, vec3(0.04, 0.09, 0.13), dz * 0.30);
  col = pow(clamp(col, 0.0, 1.0), vec3(0.93));
  gl_FragColor = vec4(col * uAlpha, uAlpha);
}`;

interface GpuMesh {
  position: WebGLBuffer;
  normal: WebGLBuffer;
  index: WebGLBuffer;
  count: number;
}

const colorCache = new Map<string, [number, number, number]>();
function rgb(hex: string): [number, number, number] {
  let c = colorCache.get(hex);
  if (!c) {
    const n = parseInt(hex.slice(1), 16);
    c = [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
    colorCache.set(hex, c);
  }
  return c;
}

/** Rods are a little deeper in tone than their atoms so white/pale atoms don't produce flat white pipes. */
export function bondColor(hex: string): string {
  const [r, g, b] = rgb(hex);
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  const k = lum > 0.7 ? 0.74 : 0.9;
  const h = (x: number) => Math.round(Math.min(1, x * k) * 255).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

export class MoleculeRenderer {
  private readonly gl: WebGLRenderingContext;
  private readonly program: WebGLProgram;
  private readonly sphere: GpuMesh;
  private readonly cylinder: GpuMesh;
  private readonly uniforms: Record<'uModel' | 'uView' | 'uProj' | 'uNormalMat' | 'uColor' | 'uTint' | 'uAlpha' | 'uDepth', WebGLUniformLocation>;
  private readonly aPos: number;
  private readonly aNormal: number;
  private atoms: BondAtom[] = [];
  private bonds: BondLike[] = [];
  private edges: { model: Mat4 }[] = [];
  private lobes: { gpu: GpuMesh; lobe: Lobe }[] = [];
  private segments: { seg: CylinderSegment; model: Mat4 }[] = [];
  private view: Mat4 = new Float32Array(16);
  private viewProj: Mat4 = new Float32Array(16);
  cssWidth = 1;
  cssHeight = 1;
  /** Radius of a sphere around the centred molecule that contains every atom (space-filling size). */
  boundingRadius = 1;

  private readonly canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl', { antialias: true, alpha: true, premultipliedAlpha: true }) as WebGLRenderingContext | null;
    if (!gl) throw new Error('WebGL is not available');
    this.gl = gl;
    this.program = this.link(VERTEX, FRAGMENT);
    this.aPos = gl.getAttribLocation(this.program, 'aPos');
    this.aNormal = gl.getAttribLocation(this.program, 'aNormal');
    const u = (name: string) => {
      const loc = gl.getUniformLocation(this.program, name);
      if (!loc) throw new Error(`Missing shader uniform ${name}`);
      return loc;
    };
    this.uniforms = { uModel: u('uModel'), uView: u('uView'), uProj: u('uProj'), uNormalMat: u('uNormalMat'), uColor: u('uColor'), uTint: u('uTint'), uAlpha: u('uAlpha'), uDepth: u('uDepth') };
    this.sphere = this.upload(sphereMesh(40, 64));
    this.cylinder = this.upload(cylinderMesh(36));
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.clearColor(0, 0, 0, 0);
  }

  private link(vs: string, fs: string): WebGLProgram {
    const gl = this.gl;
    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('Shader error: ' + gl.getShaderInfoLog(s));
      return s;
    };
    const p = gl.createProgram()!;
    gl.attachShader(p, compile(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('Program link error: ' + gl.getProgramInfoLog(p));
    return p;
  }

  private upload(mesh: Mesh): GpuMesh {
    const gl = this.gl;
    const make = (target: number, data: ArrayBufferView) => {
      const b = gl.createBuffer()!;
      gl.bindBuffer(target, b);
      gl.bufferData(target, data, gl.STATIC_DRAW);
      return b;
    };
    return {
      position: make(gl.ARRAY_BUFFER, mesh.positions),
      normal: make(gl.ARRAY_BUFFER, mesh.normals),
      index: make(gl.ELEMENT_ARRAY_BUFFER, mesh.indices),
      count: mesh.indices.length,
    };
  }

  setMolecule(atoms: readonly BondAtom[], bonds: readonly BondLike[]): void {
    this.atoms = atoms.map((a) => ({ ...a }));
    this.bonds = bonds.map((b) => ({ ...b }));
    this.segments = buildBondSegments(this.atoms, this.bonds).map((seg) => ({ seg, model: cylinderModel(seg.from, seg.to, seg.radius) }));
    this.boundingRadius = Math.max(
      0.5,
      ...this.atoms.map((a) => Math.hypot(a.x, a.y, a.z) + drawnRadius(a, 'space-fill')),
    );
  }

  /** Radius of a sphere that encloses the scene as drawn in the given mode. */
  fitRadius(mode: RenderMode): number {
    const edgeR = Math.max(0, ...this.extraEdges.flatMap((e) => [Math.hypot(...e.a), Math.hypot(...e.b)]));
    const lobeR = Math.max(0, ...this.lobes.map(({ lobe }) => Math.hypot(...lobe.position) + lobe.scale * (lobe.mesh.extent ?? 1)));
    return Math.max(0.5, edgeR, lobeR, ...this.atoms.map((a) => Math.hypot(a.x, a.y, a.z) + drawnRadius(a, mode)));
  }

  private extraEdges: { a: V3; b: V3 }[] = [];

  /** Wireframe edges and translucent orbital lobes drawn together with the atoms. */
  setExtras(extras: Extras | undefined): void {
    for (const { gpu } of this.lobes) this.free(gpu);
    this.extraEdges = extras?.edges ?? [];
    this.edges = this.extraEdges.map((e) => ({ model: cylinderModel(e.a, e.b, EDGE_RADIUS) }));
    this.lobes = (extras?.lobes ?? []).map((lobe) => ({ gpu: this.upload(lobe.mesh), lobe }));
  }

  private free(m: GpuMesh): void {
    this.gl.deleteBuffer(m.position);
    this.gl.deleteBuffer(m.normal);
    this.gl.deleteBuffer(m.index);
  }

  setSize(cssWidth: number, cssHeight: number, dpr: number): void {
    this.cssWidth = Math.max(1, cssWidth);
    this.cssHeight = Math.max(1, cssHeight);
    this.canvas.width = Math.max(1, Math.round(this.cssWidth * dpr));
    this.canvas.height = Math.max(1, Math.round(this.cssHeight * dpr));
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  }

  get aspect(): number {
    return this.cssWidth / this.cssHeight;
  }

  draw(view: ViewState, mode: RenderMode, selection: Selection | null, blend: number = blendTarget(mode)): void {
    const gl = this.gl;
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.program);
    const proj = projectionMatrix(this.aspect);
    this.view = viewMatrix(view);
    this.viewProj = multiply(proj, this.view);
    gl.uniformMatrix4fv(this.uniforms.uProj, false, proj);
    gl.uniformMatrix4fv(this.uniforms.uView, false, this.view);
    gl.uniform1f(this.uniforms.uAlpha, 1);
    const fit = Math.max(this.boundingRadius, 0.5);
    gl.uniform2f(this.uniforms.uDepth, view.dist - fit, fit * 2.4);

    this.bindMesh(this.sphere);
    this.atoms.forEach((atom, i) => {
      const model = sphereModel([atom.x, atom.y, atom.z], blendedRadius(atom, blend));
      const selected = selection?.kind === 'atom' && selection.index === i;
      this.drawObject(this.sphere, model, drawnColor(atom), selected ? 1 : 0);
    });

    if (blend < 0.95) {
      // Rounded rod ends: a sphere of the rod radius at every end, so multiple-bond rods never show flat cut faces.
      for (const { seg } of this.segments) {
        const selected = selection?.kind === 'bond' && bondKey(seg.bondA, seg.bondB) === bondKey(selection.a, selection.b);
        const color = bondColor(drawnColor(this.atoms[seg.colorAtom]!));
        this.drawObject(this.sphere, sphereModel(seg.from, seg.radius), color, selected ? 1 : 0);
        this.drawObject(this.sphere, sphereModel(seg.to, seg.radius), color, selected ? 1 : 0);
      }
      this.bindMesh(this.cylinder);
      const selectedKey = selection?.kind === 'bond' ? bondKey(selection.a, selection.b) : null;
      for (const { seg, model } of this.segments) {
        const selected = selectedKey !== null && bondKey(seg.bondA, seg.bondB) === selectedKey;
        this.drawObject(this.cylinder, model, bondColor(drawnColor(this.atoms[seg.colorAtom]!)), selected ? 1 : 0);
      }
    }

    if (this.edges.length > 0) {
      this.bindMesh(this.cylinder);
      for (const e of this.edges) this.drawObject(this.cylinder, e.model, '#7C8BB8', 0);
    }

    if (this.lobes.length > 0) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
      gl.disable(gl.CULL_FACE);
      for (const { gpu, lobe } of this.lobes) {
        gl.uniform1f(this.uniforms.uAlpha, lobe.alpha ?? 0.62);
        this.bindMesh(gpu);
        const model = sphereModel(lobe.position, lobe.scale);
        this.drawObject(gpu, model, lobe.color, 0, true);
      }
      gl.depthMask(true);
      gl.enable(gl.CULL_FACE);
      gl.disable(gl.BLEND);
      gl.uniform1f(this.uniforms.uAlpha, 1);
    }
  }

  private bindMesh(mesh: GpuMesh): void {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.position);
    gl.enableVertexAttribArray(this.aPos);
    gl.vertexAttribPointer(this.aPos, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.normal);
    gl.enableVertexAttribArray(this.aNormal);
    gl.vertexAttribPointer(this.aNormal, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.index);
  }

  private drawObject(mesh: GpuMesh, model: Mat4, color: string, tint: number, _translucent = false): void {
    const gl = this.gl;
    const mv = multiply(this.view, model);
    const normalMat = new Float32Array([mv[0]!, mv[1]!, mv[2]!, mv[4]!, mv[5]!, mv[6]!, mv[8]!, mv[9]!, mv[10]!]);
    const [r, g, b] = rgb(color);
    gl.uniformMatrix4fv(this.uniforms.uModel, false, model);
    gl.uniformMatrix3fv(this.uniforms.uNormalMat, false, normalMat);
    gl.uniform3f(this.uniforms.uColor, r, g, b);
    gl.uniform1f(this.uniforms.uTint, tint);
    gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0);
  }

  /** Ray in molecule space through a point given in CSS pixels relative to the canvas. */
  rayAt(cssX: number, cssY: number): { origin: V3; dir: V3 } | null {
    const inv = invert(this.viewProj);
    return inv ? rayThrough(inv, (cssX / this.cssWidth) * 2 - 1, 1 - (cssY / this.cssHeight) * 2) : null;
  }

  /** Screen position (CSS px), view-space depth (positive = in front of the camera) and on-screen radius of a world point. */
  project(p: V3, worldRadius: number): { x: number; y: number; depth: number; screenRadius: number } {
    const [cx, cy, , w] = transform(this.viewProj, p);
    const depth = w;
    const pixelsPerUnit = this.cssHeight / (2 * Math.tan(FOV_Y / 2) * Math.max(depth, 1e-6));
    return { x: (cx / w * 0.5 + 0.5) * this.cssWidth, y: (1 - (cy / w * 0.5 + 0.5)) * this.cssHeight, depth, screenRadius: worldRadius * pixelsPerUnit };
  }

  dispose(): void {
    const gl = this.gl;
    for (const m of [this.sphere, this.cylinder, ...this.lobes.map((l) => l.gpu)]) this.free(m);
    gl.deleteProgram(this.program);
  }
}
