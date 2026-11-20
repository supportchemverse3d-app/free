import type { ReactNode } from 'react';
import type { MoleculeRecord } from '../content/molecule.ts';
import { SYMBOL_TO_NAME } from '../engine/chemistry/elements.ts';
import { anglesAtAtom, bondLength, describeBondOrder, neighboursOf } from '../engine/structure/analyze.ts';
import type { Selection } from '../viewer/renderer.ts';
import { atomLabel } from './measurements.ts';

const MAX_ANGLES = 6;

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-slate-400">{k}</dt>
      <dd className="text-right text-slate-100">{v}</dd>
    </div>
  );
}

export function SelectionCard({ molecule: m, selection, onClose }: { molecule: MoleculeRecord; selection: Selection; onClose: () => void }) {
  let title: string;
  let body: ReactNode;

  if (selection.kind === 'atom') {
    const atom = m.atoms[selection.index]!;
    const nb = neighboursOf(m.bonds, selection.index);
    const angles = anglesAtAtom(m.atoms, m.bonds, selection.index);
    const centre = m.analysis?.centres.find((c) => c.atom === selection.index);
    title = `${atomLabel(m, selection.index)} · ${SYMBOL_TO_NAME[atom.element] ?? atom.element}`;
    body = (
      <dl className="space-y-1">
        <Row k="Symbol" v={atom.element} />
        <Row k="Bonded to" v={nb.length === 0 ? 'No bonds' : nb.map((i) => atomLabel(m, i)).join(', ')} />
        {nb.slice(0, 4).map((i) => <Row key={i} k={`${atomLabel(m, selection.index)}–${atomLabel(m, i)} length`} v={`${bondLength(m.atoms, selection.index, i).toFixed(2)} Å`} />)}
        {angles.slice(0, MAX_ANGLES).map((a) => <Row key={`${a.a}-${a.c}`} k={`${atomLabel(m, a.a)}–${atomLabel(m, a.vertex)}–${atomLabel(m, a.c)}`} v={`${a.degrees.toFixed(1)}°`} />)}
        {angles.length > MAX_ANGLES && <p className="pt-1 text-xs text-slate-400">{angles.length - MAX_ANGLES} more angles are listed on the Measurements tab.</p>}
        {centre && <Row k="Shape" v={`${centre.molecularGeometry}, ${centre.hybridization}`} />}
      </dl>
    );
  } else {
    const a = m.atoms[selection.a]!;
    const b = m.atoms[selection.b]!;
    const bond = m.bonds.find((x) => (x.a === selection.a && x.b === selection.b) || (x.a === selection.b && x.b === selection.a));
    const lit = m.experimental?.bondLengths.find((e) => (e.a === selection.a && e.b === selection.b) || (e.a === selection.b && e.b === selection.a));
    title = `${atomLabel(m, selection.a)}–${atomLabel(m, selection.b)} bond`;
    body = (
      <dl className="space-y-1">
        <Row k="Between" v={`${SYMBOL_TO_NAME[a.element] ?? a.element} and ${SYMBOL_TO_NAME[b.element] ?? b.element}`} />
        <Row k="Bond type" v={bond ? describeBondOrder(bond.order) : 'unknown'} />
        <Row k="Length" v={`${bondLength(m.atoms, selection.a, selection.b).toFixed(2)} Å`} />
        {lit && <Row k="Literature length" v={`${lit.angstrom.toFixed(3)} Å`} />}
      </dl>
    );
  }

  return (
    <div role="status" aria-live="polite" className="max-h-[46%] overflow-y-auto rounded-2xl border border-border bg-elevated/95 p-3 text-sm shadow-xl shadow-black/40 backdrop-blur">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="font-semibold text-slate-100">{title}</h3>
        <button type="button" onClick={onClose} aria-label="Clear selection" className="rounded-lg px-2 py-1 text-slate-400 hover:bg-surface hover:text-white focus-visible:outline-2 focus-visible:outline-accent-blue">✕</button>
      </div>
      {body}
    </div>
  );
}
