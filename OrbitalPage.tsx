import { useEffect, useMemo, useState } from 'react';
import { buildOrbitalScene, getOrbital } from '../engine/orbitals/orbitals.ts';
import { MoleculeViewer } from '../viewer/MoleculeViewer.tsx';
import type { Extras, Lobe, Selection } from '../viewer/renderer.ts';
import { NotFound } from './MoleculePage.tsx';
import { Card, SectionTitle } from './primitives.tsx';

const POS = '#46C9C0';
const NEG = '#FF9A5C';

export function OrbitalPage({ id }: { id: string }) {
  const def = getOrbital(id);
  const [selection, setSelection] = useState<Selection | null>(null);
  useEffect(() => { document.title = def ? `${def.name} · CHEMVERSE` : 'CHEMVERSE'; }, [def]);
  const extras = useMemo<Extras | undefined>(() => {
    if (!def) return undefined;
    const lobes: Lobe[] = buildOrbitalScene(def.id).map((l) => ({ mesh: l.mesh, color: l.phase === '+' ? POS : l.phase === '-' ? NEG : '#9AA7B8', position: l.position, scale: 1, alpha: l.phase === 'node' ? 0.28 : undefined }));
    const L = 2.6;
    const axes = [[[-L, 0, 0], [L, 0, 0]], [[0, -L, 0], [0, L, 0]], [[0, 0, -L], [0, 0, L]]] as const;
    return { lobes, edges: axes.map(([a, b]) => ({ a, b })) };
  }, [def]);
  const nuclei = useMemo(() => {
    if (!def) return [];
    if (def.group === 'overlap') {
      const d = def.id === 'sigma-ss' ? 0.75 : def.id === 'pi-pp' ? 0.75 : 1.5;
      return [{ element: 'He', x: 0, y: 0, z: -d, radius: 0.07, fillRadius: 0.07, color: '#C9D3EE', label: '' }, { element: 'He', x: 0, y: 0, z: d, radius: 0.07, fillRadius: 0.07, color: '#C9D3EE', label: '' }];
    }
    return [{ element: 'He', x: 0, y: 0, z: 0, radius: 0.07, fillRadius: 0.07, color: '#C9D3EE', label: '' }];
  }, [def]);

  if (!def) return <NotFound what="This orbital" />;
  return (
    <div className="space-y-4">
      <div>
        <a href="#/orbitals" className="text-sm text-slate-400 hover:text-white">← Orbitals</a>
        <h1 className="mt-1 text-2xl font-semibold text-slate-100 sm:text-3xl">{def.name}</h1>
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(340px,1fr)]">
        <div className="relative h-[54vh] min-h-[320px] lg:sticky lg:top-24 lg:h-[calc(100vh-8rem)]">
          <MoleculeViewer atoms={nuclei} bonds={[]} extras={extras} selection={selection} onSelect={setSelection} hideModes label={`3D shape of the ${def.name}`} />
        </div>
        <div className="min-w-0 space-y-4">
          <Card><p className="text-sm leading-relaxed text-slate-200">{def.summary}</p></Card>
          <Card>
            <SectionTitle>Facts</SectionTitle>
            <dl className="divide-y divide-border text-sm">
              {def.facts.map((f) => <div key={f.label} className="flex justify-between gap-4 py-2"><dt className="text-slate-400">{f.label}</dt><dd className="text-right text-slate-100">{f.value}</dd></div>)}
            </dl>
          </Card>
          <Card>
            <SectionTitle>Colours</SectionTitle>
            <p className="text-sm text-slate-300"><span style={{ color: POS }}>●</span> positive phase of the wavefunction &nbsp; <span style={{ color: NEG }}>●</span> negative phase.{def.radialNodes ? <> <span style={{ color: '#9AA7B8' }}>●</span> grey shells mark the radial nodes.</> : null} The sign is a property of the wavefunction, not an electric charge. Thin lines are the x, y and z axes.</p>
          </Card>
          <Card>
            <SectionTitle>About this model</SectionTitle>
            <ul className="space-y-1.5 text-sm leading-relaxed text-slate-300">
              <li>Lobe shapes come from the real angular wavefunctions Y(θ,φ); the drawn surface has radius |Y|.</li>
              {def.radialNodes && <li>Grey shells are drawn at the radial-node radii of a hydrogen-like atom (1 a₀ = Bohr radius).</li>}
              {def.group === 'atomic' && <li>Overall size is chosen for display; it is not a probability contour.</li>}
              {def.group === 'overlap' && <li>Overlap pictures are schematic: sizes and distances are chosen for clarity, not taken from a real molecule.</li>}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
