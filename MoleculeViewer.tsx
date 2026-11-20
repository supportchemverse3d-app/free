import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, type PointerEvent as ReactPointerEvent } from 'react';
import { pickScene } from '../engine/structure/pick.ts';
import type { BondLike } from '../engine/structure/analyze.ts';
import { fitDistance, initialView, panned, rotated, zoomed, type ViewState } from './camera.ts';
import type { BondAtom } from './bondGeometry.ts';
import { BOND_PICK_RADIUS, MoleculeRenderer, blendTarget, drawnColor, drawnRadius, type Extras, type RenderMode, type Selection } from './renderer.ts';

export type ViewerAtom = BondAtom;

interface Props {
  atoms: ViewerAtom[];
  bonds: BondLike[];
  selection: Selection | null;
  onSelect: (selection: Selection | null) => void;
  /** Accessible description of the model, e.g. "3D model of water". */
  label: string;
  /** Wireframe edges and orbital lobes drawn with the atoms (crystals, orbitals). */
  extras?: Extras;
  /** Overlay shown at the bottom of the viewer (e.g. the selection card). */
  children?: ReactNode;
  /** Hide controls that make no sense for a scene (e.g. the mode switch for orbitals). */
  hideModes?: boolean;
  /** Bare viewer for previews: no toolbars or hint text. */
  minimal?: boolean;
  startSpinning?: boolean;
}

type Status = 'starting' | 'ready' | 'unsupported' | 'lost';

const MAX_DPR = 2;
const TAP_MOVE_LIMIT = 8;

const isLight = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255) > 150;
};

function drawLabels(canvas: HTMLCanvasElement, r: MoleculeRenderer, atoms: ViewerAtom[], mode: RenderMode, enabled: boolean) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const dpr = canvas.width / r.cssWidth;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, r.cssWidth, r.cssHeight);
  if (!enabled) return;
  const projected = atoms.map((a) => r.project([a.x, a.y, a.z], drawnRadius(a, mode)));
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  atoms.forEach((a, i) => {
    const p = projected[i]!;
    // Hide the label when another, closer atom covers this atom's centre.
    for (let j = 0; j < atoms.length; j++) {
      const q = projected[j]!;
      if (j !== i && q.depth < p.depth && Math.hypot(q.x - p.x, q.y - p.y) < q.screenRadius * 0.9) return;
    }
    const size = Math.max(9, Math.min(17, p.screenRadius * 0.82));
    if (p.screenRadius < 7) return;
    ctx.font = `700 ${size}px Inter, system-ui, sans-serif`;
    const light = isLight(drawnColor(a));
    // Halo keeps the symbol readable where a rod or a neighbouring atom passes behind it.
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(1.5, size * 0.12);
    ctx.strokeStyle = light ? 'rgba(255,255,255,0.35)' : 'rgba(8,12,28,0.42)';
    ctx.fillStyle = light ? '#14202E' : '#FFFFFF';
    const text = a.label ?? a.element;
    if (text === '') return;
    ctx.strokeText(text, p.x, p.y + 0.5);
    ctx.fillText(text, p.x, p.y + 0.5);
  });
}

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

export function MoleculeViewer({ atoms, bonds, selection, onSelect, label, extras, children, hideModes, minimal, startSpinning }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const labelsRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<MoleculeRenderer | null>(null);
  const viewRef = useRef<ViewState>(initialView(10));
  const fitRef = useRef(10);
  const rafRef = useRef(0);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const tap = useRef({ x: 0, y: 0, t: 0, moved: 0, valid: false });

  const [mode, setMode] = useState<RenderMode>('ball-stick');
  const [showLabels, setShowLabels] = useState(true);
  const [status, setStatus] = useState<Status>('starting');
  const [epoch, setEpoch] = useState(0);
  const [interacted, setInteracted] = useState(false);
  const [autoRotate, setAutoRotate] = useState(startSpinning ?? false);
  const [expanded, setExpanded] = useState(false);
  const blendRef = useRef(0);

  // Latest values for imperative callbacks (event handlers, animation frames).
  const live = useRef({ atoms, bonds, mode, showLabels, selection, onSelect, extras });
  live.current = { atoms, bonds, mode, showLabels, selection, onSelect, extras };

  const draw = useCallback(() => {
    const r = rendererRef.current;
    if (!r) return;
    const { mode: m, showLabels: l, selection: s, atoms: a } = live.current;
    r.draw(viewRef.current, m, s, blendRef.current);
    if (labelsRef.current) drawLabels(labelsRef.current, r, a, m, l);
  }, []);

  /** Draws on demand (not continuously) to save battery on phones. */
  const requestDraw = useCallback(() => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      draw();
    });
  }, [draw]);

  // Create the renderer (again after a lost context: a new canvas element is mounted via key={epoch}).
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    let renderer: MoleculeRenderer;
    try {
      renderer = new MoleculeRenderer(canvas);
    } catch {
      setStatus('unsupported');
      return;
    }
    rendererRef.current = renderer;

    const resize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w === 0 || h === 0) return;
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      renderer.setSize(w, h, dpr);
      const lc = labelsRef.current;
      if (lc) {
        lc.width = Math.round(w * dpr);
        lc.height = Math.round(h * dpr);
      }
      // Keep the molecule fitted when the viewport shape changes (e.g. rotating the phone).
      const newFit = fitDistance(renderer.fitRadius(live.current.mode), renderer.aspect);
      viewRef.current = { ...viewRef.current, dist: viewRef.current.dist * (newFit / fitRef.current) };
      fitRef.current = newFit;
      requestDraw();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    const onLost = (e: Event) => {
      e.preventDefault();
      setStatus('lost');
    };
    canvas.addEventListener('webglcontextlost', onLost);

    renderer.setMolecule(live.current.atoms, live.current.bonds);
    renderer.setExtras(live.current.extras);
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    renderer.setSize(container.clientWidth || 1, container.clientHeight || 1, dpr);
    fitRef.current = fitDistance(renderer.fitRadius(live.current.mode), renderer.aspect);
    viewRef.current = initialView(fitRef.current, live.current.atoms);
    setStatus('ready');
    resize();

    return () => {
      observer.disconnect();
      canvas.removeEventListener('webglcontextlost', onLost);
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
      renderer.dispose();
      rendererRef.current = null;
    };
  }, [epoch, requestDraw]);

  // A different molecule: upload it and reset the camera.
  useEffect(() => {
    const r = rendererRef.current;
    if (!r) return;
    r.setMolecule(atoms, bonds);
    r.setExtras(extras);
    fitRef.current = fitDistance(r.fitRadius(live.current.mode), r.aspect);
    viewRef.current = initialView(fitRef.current, atoms);
    requestDraw();
  }, [atoms, bonds, extras, status, requestDraw]);

  // Switching display mode: keep the molecule fitted (space-filling is much larger than ball-and-stick).
  useEffect(() => {
    const r = rendererRef.current;
    if (!r) return;
    const newFit = fitDistance(r.fitRadius(mode), r.aspect);
    viewRef.current = { ...viewRef.current, dist: viewRef.current.dist * (newFit / fitRef.current) };
    fitRef.current = newFit;
    requestDraw();
  }, [mode, requestDraw]);

  useEffect(() => {
    requestDraw();
  }, [mode, showLabels, selection, requestDraw]);

  // Smooth transition between ball-and-stick and space-filling.
  useEffect(() => {
    const target = blendTarget(mode);
    const from = blendRef.current;
    if (from === target) return;
    const start = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const k = Math.min(1, (now - start) / 280);
      const eased = k * k * (3 - 2 * k);
      blendRef.current = from + (target - from) * eased;
      draw();
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [mode, draw]);

  // Optional slow spin.
  useEffect(() => {
    if (!autoRotate) return;
    let raf = 0;
    let last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(64, now - last);
      last = now;
      viewRef.current = rotated(viewRef.current, dt * 0.055, 0);
      draw();
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [autoRotate, draw]);

  // Escape leaves the expanded view.
  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setExpanded(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [expanded]);

  // Bonds are not drawn (or pickable) in space-filling mode.
  useEffect(() => {
    if (mode === 'space-fill' && selection?.kind === 'bond') onSelect(null);
  }, [mode, selection, onSelect]);

  const zoomBy = useCallback((factor: number) => {
    const r = rendererRef.current;
    if (!r) return;
    viewRef.current = zoomed(viewRef.current, factor, r.boundingRadius * 1.05, fitRef.current * 3);
    requestDraw();
  }, [requestDraw]);

  // Wheel needs a non-passive listener so the page does not scroll while zooming.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setInteracted(true);
      zoomBy(Math.exp(e.deltaY * 0.0015));
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, [zoomBy, epoch]);

  const resetView = useCallback(() => {
    viewRef.current = initialView(fitRef.current, live.current.atoms);
    requestDraw();
  }, [requestDraw]);

  const pick = (clientX: number, clientY: number) => {
    const r = rendererRef.current;
    const canvas = canvasRef.current;
    if (!r || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    const ray = r.rayAt(clientX - rect.left, clientY - rect.top);
    if (!ray) return;
    const { atoms: a, bonds: b, mode: m, selection: current, onSelect: select } = live.current;
    const hit = pickScene(
      ray,
      a.map((x) => ({ position: [x.x, x.y, x.z] as const, radius: drawnRadius(x, m) * 1.12 })),
      b.map((x) => ({ a: x.a, b: x.b, radius: BOND_PICK_RADIUS })),
      m !== 'space-fill',
    );
    if (!hit) return select(null);
    if (hit.kind === 'atom') {
      return select(current?.kind === 'atom' && current.index === hit.index ? null : { kind: 'atom', index: hit.index });
    }
    const same = current?.kind === 'bond' && Math.min(current.a, current.b) === Math.min(hit.a, hit.b) && Math.max(current.a, current.b) === Math.max(hit.a, hit.b);
    select(same ? null : { kind: 'bond', a: hit.a, b: hit.b });
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    tap.current = pointers.current.size === 1 ? { x: e.clientX, y: e.clientY, t: performance.now(), moved: 0, valid: true } : { ...tap.current, valid: false };
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const prev = pointers.current.get(e.pointerId);
    const r = rendererRef.current;
    if (!prev || !r) return;
    const cur = { x: e.clientX, y: e.clientY };
    if (pointers.current.size === 1) {
      const dx = cur.x - prev.x;
      const dy = cur.y - prev.y;
      tap.current.moved += Math.abs(dx) + Math.abs(dy);
      const panMode = e.shiftKey || (e.buttons & 6) !== 0;
      viewRef.current = panMode ? panned(viewRef.current, dx, dy, r.cssHeight) : rotated(viewRef.current, dx, dy);
    } else if (pointers.current.size === 2) {
      const otherId = [...pointers.current.keys()].find((id) => id !== e.pointerId)!;
      const other = pointers.current.get(otherId)!;
      const oldDist = Math.hypot(prev.x - other.x, prev.y - other.y);
      const newDist = Math.hypot(cur.x - other.x, cur.y - other.y);
      if (oldDist > 0 && newDist > 0) viewRef.current = zoomed(viewRef.current, oldDist / newDist, r.boundingRadius * 1.05, fitRef.current * 3);
      viewRef.current = panned(viewRef.current, (cur.x - prev.x) / 2, (cur.y - prev.y) / 2, r.cssHeight);
    }
    pointers.current.set(e.pointerId, cur);
    setInteracted(true);
    requestDraw();
  };

  const onPointerEnd = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const wasSingle = pointers.current.size === 1;
    pointers.current.delete(e.pointerId);
    const t = tap.current;
    if (wasSingle && t.valid && t.moved < TAP_MOVE_LIMIT && performance.now() - t.t < 600 && e.type === 'pointerup') pick(e.clientX, e.clientY);
    if (pointers.current.size > 0) tap.current.valid = false;
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLCanvasElement>) => {
    const step = 18;
    const keys: Record<string, () => void> = {
      ArrowLeft: () => (viewRef.current = rotated(viewRef.current, -step, 0)),
      ArrowRight: () => (viewRef.current = rotated(viewRef.current, step, 0)),
      ArrowUp: () => (viewRef.current = rotated(viewRef.current, 0, -step)),
      ArrowDown: () => (viewRef.current = rotated(viewRef.current, 0, step)),
      '+': () => zoomBy(0.85),
      '=': () => zoomBy(0.85),
      '-': () => zoomBy(1.18),
      r: resetView,
      Escape: () => onSelect(null),
    };
    const action = keys[e.key];
    if (!action) return;
    e.preventDefault();
    action();
    requestDraw();
  };

  const seg = (active: boolean) => `inline-flex h-8 items-center rounded-lg px-2.5 text-[11px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-accent-blue ${active ? 'bg-accent-cyan/20 text-white shadow-[inset_0_0_0_1px_rgba(60,203,224,0.55)]' : 'text-slate-300 hover:bg-elevated'}`;
  const iconBtn = (active: boolean) => `inline-flex h-8 w-8 items-center justify-center rounded-lg transition-colors focus-visible:outline-2 focus-visible:outline-accent-blue ${active ? 'bg-accent-cyan/20 text-white shadow-[inset_0_0_0_1px_rgba(60,203,224,0.55)]' : 'text-slate-300 hover:bg-elevated'}`;
  const button = 'inline-flex h-9 items-center justify-center rounded-lg border border-border bg-surface/85 px-3 text-xs font-medium text-slate-200 backdrop-blur transition-colors hover:bg-elevated focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-blue';
  const segment = (active: boolean) => `${button} ${active ? 'bg-accent-blue/20 border-accent-blue text-white' : ''}`;

  return (
    <div ref={containerRef} className={`viewer-stage select-none overflow-hidden border border-border ${expanded ? 'fixed inset-0 z-50 h-dvh w-screen rounded-none' : 'relative h-full min-h-[280px] w-full rounded-2xl'}`}>
      {status !== 'unsupported' && status !== 'lost' && (
        <>
          <canvas
            key={epoch}
            ref={canvasRef}
            role="img"
            aria-label={`${label}. Drag to rotate, pinch or scroll to zoom, tap an atom or bond to select it.`}
            tabIndex={0}
            className="absolute inset-0 h-full w-full touch-none outline-none focus-visible:ring-2 focus-visible:ring-accent-blue"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerEnd}
            onPointerCancel={onPointerEnd}
            onDoubleClick={resetView}
            onContextMenu={(e) => e.preventDefault()}
            onKeyDown={onKeyDown}
          />
          <canvas ref={labelsRef} aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full" />
          {!hideModes && !minimal && (
            <div className="absolute left-3 top-3 flex gap-1 rounded-xl border border-border bg-bg/70 p-1 backdrop-blur" role="group" aria-label="Display mode">
              <button type="button" className={seg(mode === 'ball-stick')} aria-pressed={mode === 'ball-stick'} onClick={() => setMode('ball-stick')}>Ball</button>
              <button type="button" className={seg(mode === 'space-fill')} aria-pressed={mode === 'space-fill'} onClick={() => setMode('space-fill')}>Space-fill</button>
              <button type="button" className={seg(mode === 'stick')} aria-pressed={mode === 'stick'} onClick={() => setMode('stick')}>Stick</button>
            </div>
          )}
          {!minimal && <div className="absolute right-3 top-3 flex gap-1 rounded-xl border border-border bg-bg/70 p-1 backdrop-blur" role="group" aria-label="View controls">
            <button type="button" className={iconBtn(showLabels)} aria-pressed={showLabels} aria-label="Show element symbols" title="Symbols" onClick={() => setShowLabels((x) => !x)}><span className="text-sm font-bold">Aa</span></button>
            <button type="button" className={iconBtn(autoRotate)} aria-pressed={autoRotate} aria-label="Auto-rotate" title="Auto-rotate" onClick={() => setAutoRotate((x) => !x)}><Icon d="M20 12a8 8 0 1 1-2.5-5.8M20 4v5h-5" /></button>
            <button type="button" className={iconBtn(false)} aria-label="Reset view" title="Reset view" onClick={resetView}><Icon d="M12 3v4M12 17v4M3 12h4M17 12h4M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z" /></button>
            <button type="button" className={iconBtn(expanded)} aria-pressed={expanded} aria-label={expanded ? 'Exit full screen' : 'Full screen'} title="Full screen" onClick={() => setExpanded((x) => !x)}><Icon d={expanded ? 'M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5' : 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5'} /></button>
          </div>}
          {children && <div className="absolute inset-x-3 bottom-3 max-w-md">{children}</div>}
          {!interacted && !minimal && (
            <p className="pointer-events-none absolute inset-x-0 bottom-3 px-4 text-center text-xs text-slate-400">
              Drag to rotate · pinch to zoom · two fingers to move · tap an atom or bond
            </p>
          )}
        </>
      )}
      {(status === 'unsupported' || status === 'lost') && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center" role="alert">
          <p className="text-base font-semibold text-slate-100">{status === 'lost' ? '3D view was interrupted' : '3D view is not available'}</p>
          <p className="max-w-sm text-sm text-slate-400">
            {status === 'lost'
              ? 'The graphics context was lost, which can happen when the device is low on memory.'
              : 'This device or browser could not start WebGL. All molecule information is still available below.'}
          </p>
          {status === 'lost' && (
            <button type="button" className={button} onClick={() => { setStatus('starting'); setEpoch((n) => n + 1); }}>
              Reload 3D view
            </button>
          )}
        </div>
      )}
    </div>
  );
}
