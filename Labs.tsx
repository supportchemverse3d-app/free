import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { getMolecule, molecules } from '../data/library.ts';
import { HYBRIDS, HYBRID_MIX, buildBeforeScene, buildHybridScene, getHybrid, lonePairLobe, type LobeSpec } from '../engine/orbitals/orbitals.ts';
import { idealLonePairDirections } from '../engine/structure/generate.ts';
import { Formula } from '../lib/Formula.tsx';
import { MoleculeViewer, type ViewerAtom } from '../viewer/MoleculeViewer.tsx';
import type { Extras, Lobe, Selection } from '../viewer/renderer.ts';
import { Card, SectionTitle } from './primitives.tsx';
import { Icon } from './Home.tsx';

const POS = '#46C9C0';
const NEG = '#FF9A5C';
const LONE = '#FFD166';

function Shell({ title, subtitle, children, viewer }: { title: string; subtitle: string; children: ReactNode; viewer: ReactNode }) {
  return (
    <div className="space-y-4 pt-1">
      <div>
        <a href="#/" className="text-sm text-slate-400 hover:text-white">← Structure</a>
        <h1 className="mt-1 text-2xl font-semibold text-slate-100">{title}</h1>
        <p className="text-sm text-slate-400">{subtitle}</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(340px,1fr)]">
        <div className="relative h-[50vh] min-h-[300px] lg:sticky lg:top-24 lg:h-[calc(100vh-9rem)]">{viewer}</div>
        <div className="min-w-0 space-y-4">{children}</div>
      </div>
    </div>
  );
}

function Chips<T extends string>({ items, value, onChange, label }: { items: { id: T; label: string }[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-wrap lg:px-0">
      {items.map((c) => (
        <button key={c.id} type="button" aria-pressed={value === c.id} onClick={() => onChange(c.id)} className={`min-h-9 shrink-0 rounded-full px-3.5 text-sm transition focus-visible:outline-2 focus-visible:outline-accent-blue ${value === c.id ? 'bg-accent-cyan/20 text-white ring-1 ring-accent-cyan/60' : 'bg-surface text-slate-300 ring-1 ring-border hover:bg-elevated'}`}>{c.label}</button>
      ))}
    </div>
  );
}

const toLobe = (l: LobeSpec, at: [number, number, number] = [0, 0, 0], alpha?: number): Lobe => ({
  mesh: l.mesh,
  color: l.phase === '+' ? POS : l.phase === '-' ? NEG : '#9AA7B8',
  position: [l.position[0] + at[0], l.position[1] + at[1], l.position[2] + at[2]],
  scale: 1,
  alpha: l.phase === 'node' ? 0.28 : alpha,
});

/* ------------------------------------------------------------------ VSEPR */

interface GeoCase { id: string; name: string; sn: number; lp: number; example: string; angles: string; why: string }
const GEOMETRIES: GeoCase[] = [
  { id: 'linear2', name: 'Linear', sn: 2, lp: 0, example: 'carbon-dioxide', angles: '180°', why: 'Two electron groups push as far apart as possible: opposite sides of the atom.' },
  { id: 'trigonal', name: 'Trigonal planar', sn: 3, lp: 0, example: 'boron-trifluoride', angles: '120°', why: 'Three groups spread evenly in one plane.' },
  { id: 'bent3', name: 'Bent (1 lone pair)', sn: 3, lp: 1, example: 'sulfur-dioxide', angles: 'a little under 120°', why: 'Three groups point to the corners of a triangle, but one is a lone pair, so only two atoms are seen. The lone pair repels more strongly and squeezes the bond angle.' },
  { id: 'tetra', name: 'Tetrahedral', sn: 4, lp: 0, example: 'methane', angles: '109.5°', why: 'Four groups reach the corners of a tetrahedron, the arrangement that keeps them farthest apart in 3D.' },
  { id: 'pyramid', name: 'Trigonal pyramidal', sn: 4, lp: 1, example: 'ammonia', angles: 'a little under 109.5°', why: 'Tetrahedral electron arrangement with one lone pair; the three atoms form a pyramid.' },
  { id: 'bent4', name: 'Bent (2 lone pairs)', sn: 4, lp: 2, example: 'water', angles: 'less than 109.5°', why: 'Tetrahedral electron arrangement with two lone pairs; the two atoms and the central atom form a V.' },
  { id: 'tbp', name: 'Trigonal bipyramidal', sn: 5, lp: 0, example: 'phosphorus-pentachloride', angles: '90° and 120°', why: 'Five groups: three in a plane (equatorial) and two above and below (axial).' },
  { id: 'seesaw', name: 'See-saw', sn: 5, lp: 1, example: 'sulfur-tetrafluoride', angles: 'about 90° and 120° (slightly less)', why: 'The lone pair takes an equatorial position, where it has fewer close neighbours at 90°.' },
  { id: 'tshape', name: 'T-shaped', sn: 5, lp: 2, example: 'chlorine-trifluoride', angles: 'about 90°', why: 'Two lone pairs occupy equatorial positions; the three atoms form a T.' },
  { id: 'linear5', name: 'Linear (3 lone pairs)', sn: 5, lp: 3, example: 'xenon-difluoride', angles: '180°', why: 'Three lone pairs in the equatorial plane leave the two atoms on the axis.' },
  { id: 'octa', name: 'Octahedral', sn: 6, lp: 0, example: 'sulfur-hexafluoride', angles: '90°', why: 'Six groups point to the corners of an octahedron.' },
  { id: 'sqpyr', name: 'Square pyramidal', sn: 6, lp: 1, example: 'bromine-pentafluoride', angles: 'about 90° (slightly less)', why: 'Octahedral electron arrangement with one lone pair; five atoms remain.' },
  { id: 'sqplanar', name: 'Square planar', sn: 6, lp: 2, example: 'xenon-tetrafluoride', angles: '90°', why: 'The two lone pairs sit opposite each other, above and below the plane, leaving four atoms in a square.' },
];

export function GeometryLab() {
  const [id, setId] = useState('tetra');
  const [showLone, setShowLone] = useState(true);
  const [exampleId, setExampleId] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const g = GEOMETRIES.find((x) => x.id === id)!;
  useEffect(() => { setExampleId(null); setSelection(null); document.title = 'Molecular geometry · CHEMVERSE'; }, [id]);
  const mol = getMolecule(exampleId ?? g.example)!;
  const centre = mol.analysis!.centres[0]!;
  const others = useMemo(() => molecules.filter((m) => m.analysis?.centres[0] && m.analysis.centres[0].stericNumber === g.sn && m.analysis.centres[0].lonePairs === g.lp && m.analysis.centres.length === 1 && m.meta.id !== g.example).slice(0, 8), [g]);
  const extras = useMemo<Extras | undefined>(() => {
    if (!showLone || g.lp === 0) return undefined;
    const c = mol.atoms[centre.atom]!;
    const lobes: Lobe[] = [];
    for (const d of idealLonePairDirections(centre.stericNumber, centre.lonePairs)) {
      const l = lonePairLobe(d, 1.5);
      if (l) lobes.push({ mesh: l.mesh, color: LONE, position: [c.x, c.y, c.z], scale: 1, alpha: 0.6 });
    }
    return { lobes };
  }, [mol, centre, showLone, g]);
  const atoms: ViewerAtom[] = mol.atoms;
  return (
    <Shell title="Molecular geometry" subtitle="VSEPR: electron groups repel and take the shape that keeps them farthest apart." viewer={<MoleculeViewer atoms={atoms} bonds={mol.bonds} extras={extras} selection={selection} onSelect={setSelection} label={`3D model of ${mol.name} showing its lone pairs`} />}>
      <Chips items={GEOMETRIES.map((x) => ({ id: x.id, label: x.name }))} value={id} onChange={setId} label="Shape" />
      <Card>
        <div className="flex items-start justify-between gap-3">
          <div><p className="text-xl font-semibold text-slate-100">{g.name}</p><p className="text-sm text-slate-400">Example: {mol.name} <span className="text-accent-cyan"><Formula text={mol.formula} /></span></p></div>
          {g.lp > 0 && <button type="button" aria-pressed={showLone} onClick={() => setShowLone((v) => !v)} className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ${showLone ? 'bg-amber-400/15 text-amber-200 ring-amber-300/50' : 'bg-surface text-slate-300 ring-border'}`}>Lone pairs {showLone ? 'on' : 'off'}</button>}
        </div>
        <p className="mt-3 text-sm leading-relaxed text-slate-200">{g.why}</p>
        <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
          {[['Electron groups', String(g.sn)], ['Lone pairs', String(g.lp)], ['Bonded atoms', String(g.sn - g.lp)], ['Bond angle', g.angles], ['Electron geometry', centre.electronGeometry], ['Hybridization', centre.hybridization]].map(([k, v]) => (
            <div key={k} className="rounded-xl border border-border bg-bg/60 p-2.5"><dt className="text-xs text-slate-400">{k}</dt><dd className="font-semibold capitalize text-slate-100">{v}</dd></div>
          ))}
        </dl>
        {g.lp > 0 && <p className="mt-3 text-xs text-slate-400"><span style={{ color: LONE }}>●</span> Yellow lobes are lone pairs, drawn in the directions they take in the ideal electron arrangement.</p>}
      </Card>
      {others.length > 0 && (
        <Card>
          <SectionTitle>Other examples</SectionTitle>
          <div className="flex flex-wrap gap-2">
            {[g.example, ...others.map((m) => m.meta.id)].map((mid) => {
              const m = getMolecule(mid)!;
              return <button key={mid} type="button" aria-pressed={(exampleId ?? g.example) === mid} onClick={() => setExampleId(mid)} className={`rounded-lg px-3 py-1.5 text-sm ring-1 ${(exampleId ?? g.example) === mid ? 'bg-accent-cyan/20 text-white ring-accent-cyan/60' : 'bg-bg/60 text-slate-200 ring-border hover:bg-elevated'}`}><Formula text={m.formula} /></button>;
            })}
          </div>
          <a href={`#/m/${mol.meta.id}`} className="mt-3 inline-block text-sm text-accent-cyan">Open {mol.name} →</a>
        </Card>
      )}
    </Shell>
  );
}

/* ------------------------------------------------------------ Hybridization */

export function HybridLab({ id }: { id?: string }) {
  const [hid, setHid] = useState<string>(id && getHybrid(id) ? id : 'sp3');
  const [after, setAfter] = useState(true);
  const [selection, setSelection] = useState<Selection | null>(null);
  const h = getHybrid(hid)!;
  useEffect(() => { document.title = 'Hybridization · CHEMVERSE'; }, []);
  const scene = useMemo(() => {
    const specs = after ? buildHybridScene(h) : buildBeforeScene(h);
    const lobes = specs.map((l) => toLobe(l));
    const L = after ? 1.9 : 0;
    const edges = after ? h.axes.map((a) => ({ a: [0, 0, 0] as [number, number, number], b: [a[0] * L, a[1] * L, a[2] * L] as [number, number, number] })) : [];
    const spots = new Map<string, [number, number, number]>();
    for (const l of specs) spots.set(l.position.join(','), l.position as [number, number, number]);
    const nuclei: ViewerAtom[] = [...spots.values()].map(([x, y, z]) => ({ element: 'He', x, y, z, radius: 0.07, fillRadius: 0.07, color: '#C9D3EE', label: '' }));
    return { extras: { lobes, edges } as Extras, nuclei };
  }, [h, after]);
  const mix = (HYBRID_MIX as Record<string, { cs: number; cp: number }>)[h.id];
  const sPct = Math.round(100 / h.lobes.length);
  return (
    <Shell title="Hybridization" subtitle="Atomic orbitals mix into new, equivalent hybrid orbitals that point toward the bonded atoms." viewer={<MoleculeViewer atoms={scene.nuclei} bonds={[]} extras={scene.extras} selection={selection} onSelect={setSelection} hideModes label={`${after ? 'Hybrid' : 'Atomic'} orbitals of ${h.name} hybridization`} />}>
      <Chips items={HYBRIDS.map((x) => ({ id: x.id, label: x.name }))} value={h.id} onChange={setHid} label="Hybridization" />
      <div role="group" aria-label="Before or after mixing" className="grid grid-cols-2 gap-1 rounded-xl border border-border bg-surface p-1">
        {[{ v: false, t: 'Before mixing' }, { v: true, t: 'After mixing' }].map((o) => <button key={o.t} type="button" aria-pressed={after === o.v} onClick={() => setAfter(o.v)} className={`rounded-lg py-2 text-sm font-medium ${after === o.v ? 'bg-elevated text-white' : 'text-slate-400'}`}>{o.t}</button>)}
      </div>
      <Card>
        <p className="text-xl font-semibold text-slate-100">{h.name} <span className="text-base font-normal text-slate-400">· {h.geometry}</span></p>
        <p className="mt-1 text-sm text-accent-cyan">{h.process}</p>
        <p className="mt-3 text-sm leading-relaxed text-slate-200">{after ? `The ${h.lobes.length} mixed orbitals are identical in shape. Each has a large lobe pointing at a neighbour and a small back lobe of opposite sign.` : `These are the ${h.from.length} atomic orbitals that mix: ${h.from.map((f) => f.label).join(', ')}. Switch to “After mixing” to see the result.`}</p>
        <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
          {[['Orbitals mixed', String(h.from.length)], ['Hybrids formed', String(h.lobes.length)], ['Bond angles', h.angles], ['s character', `${sPct}%`], ['Examples', h.examples]].map(([k, v]) => <div key={k} className="rounded-xl border border-border bg-bg/60 p-2.5"><dt className="text-xs text-slate-400">{k}</dt><dd className="font-semibold text-slate-100">{v}</dd></div>)}
        </dl>
        {mix && <p className="mt-3 text-xs leading-relaxed text-slate-400">Each {h.name} orbital = {mix.cs.toFixed(3)}·s + {mix.cp.toFixed(3)}·p (normalised mixing).</p>}
        <p className="mt-2 text-xs text-slate-400"><span style={{ color: POS }}>●</span> positive phase &nbsp; <span style={{ color: NEG }}>●</span> negative phase</p>
      </Card>
    </Shell>
  );
}

/* ------------------------------------------------------------ Conformations */

interface Group { id: string; title: string; intro: string; items: { id: string; label: string; note: string }[] }
const GROUPS: Group[] = [
  { id: 'ethane', title: 'Ethane', intro: 'Rotation about the C–C single bond gives different conformations without breaking any bond.', items: [
    { id: 'ethane', label: 'Staggered', note: 'Each C–H bond on one carbon sits between two C–H bonds on the other (dihedral 60°). This is the lower-energy form.' },
    { id: 'ethane-eclipsed', label: 'Eclipsed', note: 'The C–H bonds line up (dihedral 0°). The hydrogens are closest together, so this is the higher-energy form.' } ] },
  { id: 'butane', title: 'Butane', intro: 'Looking along the middle C–C bond, the two CH₃ groups can take different positions.', items: [
    { id: 'butane-anti', label: 'Anti', note: 'The CH₃ groups are opposite each other (dihedral 180°). The most stable conformation.' },
    { id: 'butane-gauche', label: 'Gauche', note: 'The CH₃ groups are 60° apart. Less stable than anti because the groups are closer.' },
    { id: 'butane-eclipsed', label: 'Eclipsed', note: 'A CH₃ group eclipses an H (dihedral 120°). A high-energy form.' },
    { id: 'butane-fully-eclipsed', label: 'Fully eclipsed', note: 'The two CH₃ groups eclipse each other (dihedral 0°). The least stable conformation.' } ] },
  { id: 'cyclohexane', title: 'Cyclohexane', intro: 'The six-carbon ring is puckered. In the chair every hydrogen is either axial (parallel to the ring axis) or equatorial (around the ring’s edge).', items: [
    { id: 'cyclohexane-chair', label: 'Chair', note: 'All bonds are staggered and the angles are near tetrahedral, so the chair is the most stable form.' },
    { id: 'cyclohexane-boat', label: 'Boat', note: 'Two carbons point up, and the hydrogens at the bow and stern crowd each other. Less stable than the chair.' } ] },
  { id: 'alkene', title: 'Cis / trans (geometric) isomers', intro: 'A C=C double bond does not rotate, so groups on the same side (cis) and opposite sides (trans) are different compounds.', items: [
    { id: 'cis-but-2-ene', label: 'cis-But-2-ene', note: 'The two CH₃ groups are on the same side of the double bond.' },
    { id: 'trans-but-2-ene', label: 'trans-But-2-ene', note: 'The two CH₃ groups are on opposite sides of the double bond.' },
    { id: 'cis-1-2-dichloroethene', label: 'cis-1,2-Dichloroethene', note: 'Both Cl atoms are on the same side. Bond dipoles add, so the molecule is polar.' },
    { id: 'trans-1-2-dichloroethene', label: 'trans-1,2-Dichloroethene', note: 'Cl atoms on opposite sides. Bond dipoles cancel, so the molecule is non-polar.' } ] },
  { id: 'chiral', title: 'Mirror images (R / S)', intro: 'A carbon with four different groups has two mirror-image forms that cannot be superposed.', items: [
    { id: 'l-alanine', label: 'L-Alanine (S)', note: 'Priorities: NH₂ > COOH > CH₃ > H. With H pointing away, N → COOH → CH₃ runs counter-clockwise: (S).' },
    { id: 'd-alanine', label: 'D-Alanine (R)', note: 'The mirror image of L-alanine: the same sequence runs clockwise, so (R).' },
    { id: 'bromochlorofluoromethane-s', label: 'CHBrClF (S)', note: 'Priorities: Br > Cl > F > H. With H pointing away, Br → Cl → F runs counter-clockwise: (S).' },
    { id: 'bromochlorofluoromethane-r', label: 'CHBrClF (R)', note: 'The mirror image of the (S) form: Br → Cl → F runs clockwise.' } ] },
];

/** In a chair, a hydrogen is axial when its C–H bond lies along the ring axis (z). */
export function isAxialHydrogen(atoms: ViewerAtom[], bonds: { a: number; b: number }[], h: number): boolean {
  const b = bonds.find((x) => x.a === h || x.b === h);
  if (!b) return false;
  const c = atoms[b.a === h ? b.b : b.a]!;
  const a = atoms[h]!;
  const v = [a.x - c.x, a.y - c.y, a.z - c.z];
  return Math.abs(v[2]!) / Math.hypot(v[0]!, v[1]!, v[2]!) > 0.9;
}

export function ConformationsLab() {
  const [gid, setGid] = useState('cyclohexane');
  const group = GROUPS.find((g) => g.id === gid)!;
  const [mid, setMid] = useState(group.items[0]!.id);
  const [axial, setAxial] = useState(true);
  const [selection, setSelection] = useState<Selection | null>(null);
  useEffect(() => { document.title = 'Conformations · CHEMVERSE'; }, []);
  const pickGroup = (id: string) => { setGid(id); setMid(GROUPS.find((g) => g.id === id)!.items[0]!.id); setSelection(null); };
  const item = group.items.find((i) => i.id === mid) ?? group.items[0]!;
  const mol = getMolecule(item.id);
  const atoms = useMemo<ViewerAtom[]>(() => {
    if (!mol) return [];
    if (gid !== 'cyclohexane' || !axial || item.id !== 'cyclohexane-chair') return mol.atoms;
    return mol.atoms.map((a, i) => (a.element === 'H' ? { ...a, color: isAxialHydrogen(mol.atoms, mol.bonds, i) ? '#FFD166' : '#9FB4C7' } : a));
  }, [mol, gid, axial, item.id]);
  return (
    <Shell title="Conformations and isomers" subtitle="Same atoms, different 3D arrangements." viewer={mol ? <MoleculeViewer atoms={atoms} bonds={mol.bonds} selection={selection} onSelect={setSelection} label={`3D model of ${mol.name}`} /> : <p className="p-6 text-slate-400">Model not available.</p>}>
      <Chips items={GROUPS.map((g) => ({ id: g.id, label: g.title.split(' (')[0]! }))} value={gid} onChange={pickGroup} label="Topic" />
      <Card>
        <p className="text-sm leading-relaxed text-slate-300">{group.intro}</p>
        <div className="mt-3"><Chips items={group.items.map((i) => ({ id: i.id, label: i.label }))} value={item.id} onChange={(v) => { setMid(v); setSelection(null); }} label="Variant" /></div>
        <p className="mt-3 text-sm leading-relaxed text-slate-100">{item.note}</p>
        {gid === 'cyclohexane' && item.id === 'cyclohexane-chair' && (
          <div className="mt-3">
            <button type="button" aria-pressed={axial} onClick={() => setAxial((v) => !v)} className={`rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ${axial ? 'bg-amber-400/15 text-amber-200 ring-amber-300/50' : 'bg-surface text-slate-300 ring-border'}`}>Colour axial / equatorial H {axial ? 'on' : 'off'}</button>
            {axial && <p className="mt-2 text-xs text-slate-400"><span style={{ color: '#FFD166' }}>●</span> axial (6) &nbsp; <span style={{ color: '#9FB4C7' }}>●</span> equatorial (6)</p>}
          </div>
        )}
        {mol && <a href={`#/m/${mol.meta.id}`} className="mt-3 inline-block text-sm text-accent-cyan">Open full details →</a>}
      </Card>
      <p className="px-1 text-xs text-slate-500"><Icon d="M12 8v5M12 16h.01" size={12} /> Drag to rotate, pinch to zoom. Tap an atom or bond for its numbers.</p>
    </Shell>
  );
}
