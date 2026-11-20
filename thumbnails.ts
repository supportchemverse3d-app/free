import { initialView, fitDistance } from './camera.ts';
import { MoleculeRenderer, type RenderMode } from './renderer.ts';
import type { BondAtom } from './bondGeometry.ts';
import type { BondLike } from '../engine/structure/analyze.ts';

/**
 * Small 3D previews for cards. One shared off-screen WebGL renderer draws each model once and returns a PNG data URL,
 * so a long list does not need one WebGL context per card (mobile browsers allow only a handful).
 */
const SIZE = 200;
let renderer: MoleculeRenderer | null = null;
let canvas: HTMLCanvasElement | null = null;
let failed = false;
const cache = new Map<string, string>();

export function thumbnail(key: string, atoms: readonly BondAtom[], bonds: readonly BondLike[], mode: RenderMode = 'ball-stick'): string | null {
  const hit = cache.get(key);
  if (hit) return hit;
  if (failed) return null;
  try {
    if (!renderer) {
      canvas = document.createElement('canvas');
      renderer = new MoleculeRenderer(canvas);
    }
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setSize(SIZE, SIZE, dpr);
    renderer.setMolecule(atoms, bonds);
    renderer.setExtras(undefined);
    const view = initialView(fitDistance(renderer.fitRadius(mode) * 0.92, 1), atoms);
    renderer.draw(view, mode, null);
    const url = canvas!.toDataURL('image/png');
    cache.set(key, url);
    return url;
  } catch {
    failed = true;
    return null;
  }
}
