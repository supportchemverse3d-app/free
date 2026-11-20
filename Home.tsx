import { useMemo, useState } from 'react';
import { libraryCounts, molecules, getMolecule } from '../data/library.ts';
import { CRYSTALS } from '../engine/crystal/crystals.ts';
import { ORBITALS } from '../engine/orbitals/orbitals.ts';
import { Formula } from '../lib/Formula.tsx';
import { FAVOURITES_KEY, RECENTS_KEY, useStoredList } from '../lib/storage.ts';
import { MoleculeViewer } from '../viewer/MoleculeViewer.tsx';
import { MoleculeThumb } from './MoleculeThumb.tsx';
import { SearchBar } from './SearchBar.tsx';
import { SectionTitle } from './primitives.tsx';


type Category = 'all' | 'inorganic' | 'organic' | 'ions' | 'isomers';
const CHIPS: { id: Category; label: string }[] = [
  { id: 'all', label: 'All' }, { id: 'inorganic', label: 'Inorganic' }, { id: 'organic', label: 'Organic' }, { id: 'ions', label: 'Ions' }, { id: 'isomers', label: 'Isomers' },
];
const ISOMER_IDS = /^(cis-|trans-|cyclohexane-|ethane-eclipsed|butane-|bromochlorofluoromethane|butadiene|l-alanine|d-alanine|but-1-ene)/;
const isOrganic = (symbols: string[], id: string) => symbols.includes('C') && (symbols.includes('H') || symbols.includes('Cl')) && id !== 'hydrogen-cyanide';

const FEATURED = ['water', 'methane', 'benzene', 'ammonia', 'ethene', 'sulfur-hexafluoride', 'cyclohexane-chair', 'ethanol', 'xenon-tetrafluoride'];

const ICON = {
  molecule: 'M12 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM6 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM18 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM11 7.5 7 16.5M13 7.5l4 9M8 18h8',
  geometry: 'M12 3 3 19h18L12 3zM12 3v10M3 19l9-6 9 6',
  orbital: 'M12 12c3-6 7-6 7-3s-4 3-7 3zM12 12c-3 6-7 6-7 3s4-3 7-3zM12 12c-6-3-6-7-3-7s3 4 3 7zM12 12c6 3 6 7 3 7s-3-4-3-7z',
  hybrid: 'M12 12l7-4M12 12l-7-4M12 12v8M12 12l5 6',
  crystal: 'M12 3 4 7.5v9L12 21l8-4.5v-9L12 3zM4 7.5l8 4.5 8-4.5M12 12v9',
  conformation: 'M4 14c3-8 5 6 8-2s5 6 8-2',
};

export function Icon({ d, size = 22 }: { d: string; size?: number }) {
  return <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>;
}

export const MODULES: { hash: string; title: string; text: string; icon: string }[] = [
  { hash: '#/library', title: 'Molecules', text: `${libraryCounts.molecules + libraryCounts.ions} 3D models`, icon: ICON.molecule },
  { hash: '#/geometry', title: 'Molecular geometry', text: 'VSEPR with lone pairs', icon: ICON.geometry },
  { hash: '#/orbitals', title: 'Atomic orbitals', text: 's, p, d, f shapes and nodes', icon: ICON.orbital },
  { hash: '#/hybridization', title: 'Hybridization', text: 'sp to sp³d²', icon: ICON.hybrid },
  { hash: '#/crystals', title: 'Crystal structures', text: `${CRYSTALS.length} unit cells`, icon: ICON.crystal },
  { hash: '#/conformations', title: 'Conformations and isomers', text: 'Chair, boat, cis/trans, R/S', icon: ICON.conformation },
];

function ModuleTile({ m }: { m: (typeof MODULES)[number] }) {
  return (
    <a href={m.hash} className="group flex items-center gap-3 rounded-2xl bg-surface/80 p-3.5 ring-1 ring-border transition hover:bg-elevated hover:ring-accent-cyan/50 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-accent-blue">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent-cyan/10 text-accent-cyan transition group-hover:bg-accent-cyan/20"><Icon d={m.icon} /></span>
      <span className="min-w-0"><span className="block truncate text-sm font-semibold text-slate-100">{m.title}</span><span className="block truncate text-xs text-slate-400">{m.text}</span></span>
    </a>
  );
}

function MiniList({ title, items, onClear }: { title: string; items: { id: string; type: string; title: string; formula?: string }[]; onClear?: () => void }) {
  if (items.length === 0) return null;
  return (
    <section>
      <div className="mb-2 flex items-center justify-between"><SectionTitle>{title}</SectionTitle>{onClear && <button type="button" onClick={onClear} className="-mt-3 text-xs text-slate-500 hover:text-white">Clear</button>}</div>
      <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {items.map((i) => {
          const m = getMolecule(i.id);
          return (
            <li key={`${i.type}-${i.id}`} className="shrink-0">
              <a href={`#/m/${i.id}`} className="flex w-28 flex-col overflow-hidden rounded-2xl bg-surface/80 ring-1 ring-border hover:ring-accent-cyan/50 focus-visible:outline-2 focus-visible:outline-accent-blue">
                {m ? <MoleculeThumb molecule={m} className="h-20 w-full" /> : <div className="flex h-20 items-center justify-center text-2xl font-bold text-accent-violet">{i.id}</div>}
                <span className="truncate px-2.5 py-1.5 text-xs text-slate-200">{i.title}</span>
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function Home() {
  const recents = useStoredList(RECENTS_KEY, 8);
  const favourites = useStoredList(FAVOURITES_KEY, 200);
  const featured = useMemo(() => {
    const day = Math.floor(Date.now() / 86_400_000);
    return getMolecule(FEATURED[day % FEATURED.length]!) ?? molecules[0]!;
  }, []);
  return (
    <div className="space-y-7">
      <section className="space-y-4 pt-2">
        <h1 className="text-3xl font-bold leading-tight text-slate-100 sm:text-4xl">See chemistry<br /><span className="bg-gradient-to-r from-accent-cyan via-accent-blue to-accent-violet bg-clip-text text-transparent">in three dimensions</span></h1>
        <SearchBar large />
      </section>

      <section aria-label="Featured molecule" className="relative overflow-hidden rounded-3xl ring-1 ring-border">
        <div className="h-[44vh] min-h-[280px] max-h-[460px]">
          <MoleculeViewer atoms={featured.atoms} bonds={featured.bonds} selection={null} onSelect={() => {}} minimal startSpinning label={`3D model of ${featured.name}`} />
        </div>
        <a href={`#/m/${featured.meta.id}`} className="absolute inset-x-3 bottom-3 flex items-center justify-between rounded-2xl bg-bg/75 px-4 py-3 backdrop-blur ring-1 ring-border hover:ring-accent-cyan/50 focus-visible:outline-2 focus-visible:outline-accent-blue">
          <span><span className="block text-[11px] uppercase tracking-wider text-accent-cyan">Featured today</span><span className="block text-base font-semibold text-slate-100">{featured.name} <span className="ml-1 text-accent-cyan"><Formula text={featured.formula} /></span></span></span>
          <span className="text-sm text-slate-300">Open →</span>
        </a>
      </section>

      <section aria-label="Explore">
        <SectionTitle>Explore</SectionTitle>
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">{MODULES.map((m) => <ModuleTile key={m.hash} m={m} />)}</div>
      </section>

      <MiniList title="Saved" items={favourites.items} />
      <MiniList title="Recently explored" items={recents.items} onClear={recents.clear} />
    </div>
  );
}

export function Library() {
  const [cat, setCat] = useState<Category>('all');
  const shown = useMemo(() => molecules.filter((m) => {
    if (cat === 'isomers') return ISOMER_IDS.test(m.meta.id);
    if (cat === 'ions') return m.kind === 'ion';
    if (cat === 'all') return true;
    if (m.kind === 'ion') return false;
    const org = isOrganic([...new Set(m.atoms.map((a) => a.element))], m.meta.id);
    return cat === 'organic' ? org : !org;
  }), [cat]);
  return (
    <div className="space-y-4 pt-2">
      <div><h1 className="text-2xl font-semibold text-slate-100">Molecule library</h1><p className="text-sm text-slate-400">{libraryCounts.molecules} molecules and {libraryCounts.ions} ions. Tap one to rotate it in 3D.</p></div>
      <SearchBar />
      <div role="group" aria-label="Filter by category" className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1">
        {CHIPS.map((c) => (
          <button key={c.id} type="button" aria-pressed={cat === c.id} onClick={() => setCat(c.id)} className={`min-h-9 shrink-0 rounded-full px-3.5 text-sm transition focus-visible:outline-2 focus-visible:outline-accent-blue ${cat === c.id ? 'bg-accent-cyan/20 text-white ring-1 ring-accent-cyan/60' : 'bg-surface text-slate-300 ring-1 ring-border hover:bg-elevated'}`}>{c.label}</button>
        ))}
      </div>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {shown.map((m) => (
          <li key={m.meta.id}>
            <a href={`#/m/${m.meta.id}`} className="block overflow-hidden rounded-2xl bg-surface/80 ring-1 ring-border transition hover:bg-elevated hover:ring-accent-cyan/50 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-accent-blue">
              <MoleculeThumb molecule={m} className="aspect-square w-full" />
              <span className="block px-3 pb-3 pt-2"><span className="block text-base text-accent-cyan"><Formula text={m.formula} /></span><span className="block truncate text-sm text-slate-200">{m.name}</span></span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function CrystalList() {
  return (
    <section className="pt-2">
      <h1 className="mb-1 text-2xl font-semibold text-slate-100">Crystal structures</h1>
      <p className="mb-4 text-sm text-slate-400">Unit cells from the Class 12 solid-state chapter, with computed coordination number and packing efficiency.</p>
      <ul className="grid gap-3 sm:grid-cols-2">
        {CRYSTALS.map((c) => (
          <li key={c.id}>
            <a href={`#/c/${c.id}`} className="block h-full rounded-2xl bg-surface/80 p-4 ring-1 ring-border transition hover:bg-elevated hover:ring-accent-cyan/50 focus-visible:outline-2 focus-visible:outline-accent-blue">
              <span className="text-lg font-semibold text-slate-100">{c.name}</span>
              <span className="mt-1 block text-xs uppercase tracking-wider text-accent-cyan">{c.family === 'metallic' ? 'Metallic' : 'Ionic'}</span>
              <span className="mt-2 block text-sm text-slate-400">{c.summary}</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function OrbitalList() {
  const groups: { id: 'atomic' | 'hybrid' | 'overlap'; title: string }[] = [{ id: 'atomic', title: 'Atomic orbitals' }, { id: 'overlap', title: 'Bond overlap (σ and π)' }];
  return (
    <section className="space-y-6 pt-2">
      <div><h1 className="mb-1 text-2xl font-semibold text-slate-100">Atomic orbitals</h1><p className="text-sm text-slate-400">Shape, nodes and phase. Hybrid orbitals are in the Hybridization lab.</p></div>
      {groups.map((g) => (
        <div key={g.id}>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">{g.title}</h2>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {ORBITALS.filter((o) => o.group === g.id).map((o) => (
              <li key={o.id}><a href={`#/o/${o.id}`} className="block h-full rounded-2xl bg-surface/80 p-3.5 text-sm text-slate-100 ring-1 ring-border transition hover:bg-elevated hover:ring-accent-cyan/50 focus-visible:outline-2 focus-visible:outline-accent-blue">{o.name}</a></li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
