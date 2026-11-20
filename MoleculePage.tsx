import { useCallback, useEffect, useState } from 'react';
import { getMolecule } from '../data/library.ts';
import { Formula } from '../lib/Formula.tsx';
import { FAVOURITES_KEY, RECENTS_KEY, useStoredList } from '../lib/storage.ts';
import { MoleculeViewer } from '../viewer/MoleculeViewer.tsx';
import type { Selection } from '../viewer/renderer.ts';
import { MeasurementsTab, OverviewTab } from './InfoPanel.tsx';
import { SelectionCard } from './SelectionCard.tsx';
import { setViewerSelection } from '../ai/moleculeContext.ts';

type Tab = 'overview' | 'measurements';

export function NotFound({ what }: { what: string }) {
  return (
    <div className="mx-auto max-w-md space-y-3 py-16 text-center">
      <p className="text-lg font-semibold text-slate-100">{what} was not found</p>
      <p className="text-sm text-slate-400">It may have been removed or the link may be wrong.</p>
      <a href="#/" className="inline-block rounded-xl border border-border bg-surface px-4 py-2 text-sm text-slate-100 hover:bg-elevated focus-visible:outline-2 focus-visible:outline-accent-blue">Back to the library</a>
    </div>
  );
}

export function MoleculePage({ id }: { id: string }) {
  const molecule = getMolecule(id);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const favourites = useStoredList(FAVOURITES_KEY, 200);
  const recents = useStoredList(RECENTS_KEY, 8);
  const { add: addRecent } = recents;

  useEffect(() => {
    setSelection(null);
    setTab('overview');
    if (molecule) addRecent({ id: molecule.meta.id, type: molecule.kind, title: molecule.name, formula: molecule.formula });
    document.title = molecule ? `${molecule.name} · CHEMVERSE` : 'CHEMVERSE';
  }, [id, molecule, addRecent]);

  const moleculeId = molecule?.meta.id;
  useEffect(() => {
    if (moleculeId) setViewerSelection(moleculeId, selection);
  }, [moleculeId, selection]);

  const clearSelection = useCallback((s: Selection | null) => setSelection(s), []);

  if (!molecule) return <NotFound what="This molecule" />;
  const isFavourite = favourites.items.some((f) => f.id === molecule.meta.id && f.type === molecule.kind);
  const tabs: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'measurements', label: 'Measurements' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-white/[.06] bg-[#111b25] px-4 py-4">
        <div className="min-w-0">
          <a href="#/" className="text-sm text-slate-400 hover:text-white focus-visible:outline-2 focus-visible:outline-accent-blue">← Library</a>
          <h1 className="mt-1 text-[22px] font-bold tracking-tight text-slate-100 sm:text-3xl">{molecule.name}</h1>
          <p className="mt-1 text-lg font-semibold text-[#5bd9ce]"><Formula text={molecule.formula} /></p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a href={`#/ai/m/${molecule.meta.id}`} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#3bb8ad]/50 bg-[#1b3939] px-3 text-sm text-[#7eeadf] focus-visible:outline-2 focus-visible:outline-accent-blue">Ask Chemo AI</a>
          <button
            type="button"
            aria-pressed={isFavourite}
            onClick={() => (isFavourite ? favourites.remove(molecule.meta.id, molecule.kind) : favourites.add({ id: molecule.meta.id, type: molecule.kind, title: molecule.name, formula: molecule.formula }))}
            className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm focus-visible:outline-2 focus-visible:outline-accent-blue ${isFavourite ? 'border-amber-400/60 bg-amber-400/10 text-amber-200' : 'border-border bg-surface text-slate-200 hover:bg-elevated'}`}
          >
            <span aria-hidden="true">{isFavourite ? '★' : '☆'}</span>
            {isFavourite ? 'Saved' : 'Save'}
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(340px,.85fr)]">
        <div className="viewer-frame relative h-[52vh] min-h-[340px] max-h-[680px] lg:sticky lg:top-24 lg:h-[calc(100vh-9rem)]">
          <MoleculeViewer atoms={molecule.atoms} bonds={molecule.bonds} selection={selection} onSelect={clearSelection} label={`3D model of ${molecule.name}`}>
            {selection && <SelectionCard molecule={molecule} selection={selection} onClose={() => setSelection(null)} />}
          </MoleculeViewer>
        </div>

        <div className="min-w-0 space-y-4">
          <div role="tablist" aria-label="Molecule information" className="flex gap-1 rounded-2xl border border-white/[.07] bg-[#111b25] p-1">
            {tabs.map((t) => (
              <button
                key={t.id}
                role="tab"
                type="button"
                id={`tab-${t.id}`}
                aria-selected={tab === t.id}
                aria-controls={`panel-${t.id}`}
                onClick={() => setTab(t.id)}
                className={`flex-1 rounded-lg px-2 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-accent-blue ${tab === t.id ? 'bg-[#1b3939] text-[#75e5d9]' : 'text-slate-400 hover:text-slate-200'}`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
            {tab === 'overview' && <OverviewTab molecule={molecule} />}
            {tab === 'measurements' && <MeasurementsTab molecule={molecule} />}
          </div>
        </div>
      </div>
    </div>
  );
}
