import { useEffect, useMemo, useState } from 'react';
import { buildCrystal, getCrystal, siteRadii } from '../engine/crystal/crystals.ts';
import { Formula } from '../lib/Formula.tsx';
import { MoleculeViewer, type ViewerAtom } from '../viewer/MoleculeViewer.tsx';
import type { Selection } from '../viewer/renderer.ts';
import { NotFound } from './MoleculePage.tsx';
import { Badge, Card, Fact, SectionTitle } from './primitives.tsx';

const METAL_COLOR = '#7FA6E8';
const OCT_COLOR = '#FF9F43';
const TET_COLOR = '#3CCBE0';

export function CrystalPage({ id }: { id: string }) {
  const def = getCrystal(id);
  const [showVoids, setShowVoids] = useState(false);
  const [selection, setSelection] = useState<Selection | null>(null);
  const model = useMemo(() => (def ? buildCrystal(def) : null), [def]);
  useEffect(() => { setShowVoids(false); setSelection(null); document.title = def ? `${def.name} · CHEMVERSE` : 'CHEMVERSE'; }, [def]);

  const atoms = useMemo<ViewerAtom[]>(() => {
    if (!model) return [];
    const list: ViewerAtom[] = model.sites.map((s) => {
      const r = siteRadii(model, s.role);
      const metal = model.def.family === 'metallic';
      return { element: s.element, x: s.position[0], y: s.position[1], z: s.position[2], radius: r.ball, fillRadius: r.fill, ...(metal ? { color: METAL_COLOR } : {}) };
    });
    if (showVoids) {
      for (const v of model.voids) {
        const r = model.nearest * 0.13;
        list.push({ element: v.kind === 'octahedral' ? 'Oh' : 'Td', label: v.kind === 'octahedral' ? 'O' : 'T', x: v.position[0], y: v.position[1], z: v.position[2], radius: r, fillRadius: r, color: v.kind === 'octahedral' ? OCT_COLOR : TET_COLOR });
      }
    }
    return list;
  }, [model, showVoids]);
  const extras = useMemo(() => (model ? { edges: model.edges.map((e) => ({ a: e.a, b: e.b })) } : undefined), [model]);

  if (!def || !model) return <NotFound what="This crystal structure" />;
  const total = Object.values(model.atomsPerCell).reduce((s, x) => s + x, 0);
  const sel = selection?.kind === 'atom' ? atoms[selection.index] : undefined;
  const selSite = selection?.kind === 'atom' ? model.sites[selection.index] : undefined;

  return (
    <div className="space-y-4">
      <div>
        <a href="#/crystals" className="text-sm text-slate-400 hover:text-white">← Crystal structures</a>
        <h1 className="mt-1 text-2xl font-semibold text-slate-100 sm:text-3xl">{def.name}</h1>
        <div className="mt-1 flex flex-wrap items-center gap-2"><span className="text-xl text-accent-cyan"><Formula text={def.formula} /></span><Badge tone="amber" title="Lattice positions are exact, sphere sizes are schematic">Unit-cell model</Badge></div>
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(340px,1fr)]">
        <div className="relative h-[54vh] min-h-[320px] lg:sticky lg:top-24 lg:h-[calc(100vh-8rem)]">
          <MoleculeViewer atoms={atoms} bonds={[]} extras={extras} selection={selection} onSelect={setSelection} label={`3D unit cell of ${def.name}`}>
            {sel && (
              <div role="status" className="rounded-2xl border border-border bg-elevated/95 p-3 text-sm backdrop-blur">
                <div className="flex justify-between"><span className="font-semibold text-slate-100">{selSite ? `${selSite.element} (${selSite.role})` : sel.element === 'Oh' ? 'Octahedral void' : 'Tetrahedral void'}</span><button type="button" aria-label="Clear selection" className="text-slate-400" onClick={() => setSelection(null)}>✕</button></div>
                {selSite && <p className="mt-1 text-slate-300">{selSite.share === 1 ? 'Lies entirely inside this cell.' : `Shared with neighbouring cells: ${selSite.share} of this atom belongs to the cell.`}</p>}
                {selSite && model.coordination[selSite.element] && <p className="text-slate-300">Coordination number: {model.coordination[selSite.element]!.count}{def.family === 'ionic' ? ` (${model.coordination[selSite.element]!.of} neighbours)` : ''}</p>}
              </div>
            )}
          </MoleculeViewer>
        </div>
        <div className="min-w-0 space-y-4">
          <Card><p className="text-sm leading-relaxed text-slate-200">{def.summary}</p></Card>
          <Card>
            <SectionTitle>Key facts (computed from the lattice)</SectionTitle>
            <dl className="grid grid-cols-2 gap-3">
              <Fact label="Atoms per unit cell" value={Object.entries(model.atomsPerCell).map(([el, n]) => `${n} ${el === 'M' ? '' : el}`.trim()).join(' + ')} note={`${total} in total, after counting shared corner/face/edge atoms.`} />
              <Fact label="Coordination number" value={Object.entries(model.coordination).map(([el, c]) => (def.family === 'ionic' ? `${el}: ${c.count}` : String(c.count))).join(', ')} />
              <Fact label="Packing efficiency" value={model.packingEfficiency === null ? null : `${(model.packingEfficiency * 100).toFixed(1)} %`} note={model.packingEfficiency === null ? 'Not defined here: ions have different sizes.' : 'Touching equal spheres.'} />
              <Fact label="Examples" value={def.examples.join(', ')} />
            </dl>
          </Card>
          {model.voids.length > 0 && (
            <Card>
              <SectionTitle>Voids</SectionTitle>
              <p className="text-sm leading-relaxed text-slate-300">{def.voidsInfo ?? 'Octahedral (O) and tetrahedral (T) voids of the underlying FCC lattice.'}</p>
              <p className="mt-2 text-sm text-slate-300">Counted per cell: {model.voids.filter((v) => v.kind === 'octahedral').reduce((s, v) => s + v.share, 0)} octahedral, {model.voids.filter((v) => v.kind === 'tetrahedral').reduce((s, v) => s + v.share, 0)} tetrahedral.</p>
              <button type="button" aria-pressed={showVoids} onClick={() => setShowVoids((v) => !v)} className={`mt-3 h-10 rounded-lg border px-4 text-sm focus-visible:outline-2 focus-visible:outline-accent-blue ${showVoids ? 'border-accent-cyan bg-accent-cyan/15 text-white' : 'border-border bg-bg/60 text-slate-200 hover:bg-elevated'}`}>{showVoids ? 'Hide voids' : 'Show voids'}</button>
              {showVoids && <p className="mt-2 text-xs text-slate-400"><span style={{ color: OCT_COLOR }}>●</span> octahedral &nbsp; <span style={{ color: TET_COLOR }}>●</span> tetrahedral</p>}
            </Card>
          )}
          <Card>
            <SectionTitle>About this model</SectionTitle>
            <ul className="space-y-1.5 text-sm leading-relaxed text-slate-300">
              <li>Atom positions, atoms per cell, coordination numbers and packing efficiency are calculated from the lattice geometry itself.</li>
              <li>{def.family === 'metallic' ? 'In Space-fill mode the spheres touch, so their size is fixed by geometry. In Ball mode they are drawn smaller so the lattice is visible.' : 'Ion sizes use hand-entered ionic radii (Shannon-type values, not yet checked against a cited source) only to scale cation and anion relative to each other. Treat sphere sizes as schematic.'}</li>
              <li>The cell is drawn with its corner, edge and face atoms; only the fraction shown in "Shared" belongs to this cell.</li>
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
