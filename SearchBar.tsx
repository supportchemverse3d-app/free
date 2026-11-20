import { useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { getMolecule, libraryCounts, routeFor, searchLibrary } from '../data/library.ts';
import { Formula } from '../lib/Formula.tsx';
import { RECENTS_KEY, useStoredList, type StoredItem } from '../lib/storage.ts';
import { navigate } from '../lib/useHashRoute.ts';
import { TypeLabel } from './primitives.tsx';
interface Option { id: string; type: string; title: string }
function Secondary({ option }: { option: Option }) {
  if (option.type === 'molecule' || option.type === 'ion') { const m = getMolecule(option.id); return m ? <span className="text-sm text-slate-400"><Formula text={m.formula} /></span> : null; }
  return null;
}
export function SearchBar({ large = false, autoFocus = false }: { large?: boolean; autoFocus?: boolean }) {
  const [query, setQuery] = useState(''); const [open, setOpen] = useState(false); const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null); const listId = useId(); const recents = useStoredList(RECENTS_KEY, 8);
  const trimmed = query.trim();
  const results = useMemo<Option[]>(() => trimmed === '' ? [] : searchLibrary(trimmed, 8).map((h) => ({ id: h.entry.id, type: h.entry.type, title: h.entry.title })), [trimmed]);
  const showingRecents = trimmed === '' && recents.items.length > 0; const options: Option[] = showingRecents ? recents.items : results;
  const notFound = trimmed !== '' && results.length === 0;
  const choose = (o: Option) => {
    const m = getMolecule(o.id); const item: StoredItem = { id: o.id, type: o.type, title: o.title, ...(m ? { formula: m.formula } : {}) };
    recents.add(item); setQuery(''); setOpen(false); inputRef.current?.blur(); navigate(routeFor({ id: o.id, type: o.type as 'molecule' }));
  };
  const onKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((i) => Math.min(options.length - 1, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
    else if (e.key === 'Enter') { const pick = options[active] ?? options[0]; if (pick) { e.preventDefault(); choose(pick); } }
    else if (e.key === 'Escape') setOpen(false);
  };
  const panelOpen = open && (options.length > 0 || notFound); const sizing = large ? 'h-14 text-lg' : 'h-11 text-base';
  return <div className="relative w-full">
    <label htmlFor={`${listId}-input`} className="sr-only">Search molecules and structures</label>
    <div className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-slate-400" aria-hidden="true"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg></div>
    <input id={`${listId}-input`} ref={inputRef} type="search" inputMode="search" enterKeyHint="search" autoComplete="off" autoCorrect="off" autoCapitalize="none" spellCheck={false} autoFocus={autoFocus} role="combobox" aria-expanded={panelOpen} aria-controls={listId} aria-autocomplete="list" aria-activedescendant={panelOpen && options[active] ? `${listId}-${active}` : undefined} placeholder="Search water, CH4, benzene…" value={query} onChange={(e) => { setQuery(e.target.value); setActive(0); setOpen(true); }} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} onKeyDown={onKeyDown} className={`${sizing} w-full rounded-2xl border border-border bg-surface pl-12 pr-4 text-slate-100 placeholder:text-slate-500 focus:border-accent-blue focus:outline-none focus:ring-2 focus:ring-accent-blue/40`}/>
    {panelOpen && <div id={listId} role="listbox" aria-label={showingRecents ? 'Recent searches' : 'Search results'} onMouseDown={(e) => e.preventDefault()} className="absolute inset-x-0 top-full z-40 mt-2 max-h-[60vh] overflow-y-auto rounded-2xl border border-border bg-elevated p-1.5 shadow-2xl shadow-black/50">
      {showingRecents && <div className="flex items-center justify-between px-3 pb-1 pt-2 text-xs text-slate-400"><span>Recent searches</span><button type="button" className="rounded px-1 text-slate-300 hover:text-white" onClick={recents.clear}>Clear</button></div>}
      {options.map((o, i) => <div key={`${o.type}-${o.id}`} id={`${listId}-${i}`} role="option" aria-selected={i === active} onClick={() => choose(o)} onMouseEnter={() => setActive(i)} className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl px-3 py-2.5 ${i === active ? 'bg-surface' : ''}`}><div className="min-w-0"><div className="truncate font-medium text-slate-100">{o.title}</div><Secondary option={o}/></div><TypeLabel type={o.type}/></div>)}
      {notFound && <div className="space-y-1 px-3 py-3 text-sm text-slate-300" role="status"><p className="font-medium text-slate-100">No match for “{trimmed}”.</p><p className="text-slate-400">Try a formula such as H2O or a common molecule name. The library has {libraryCounts.molecules} molecules and {libraryCounts.ions} ions.</p></div>}
    </div>}
  </div>;
}
