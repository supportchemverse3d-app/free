import { Fragment, type ReactNode } from 'react';
import type { MoleculeRecord } from '../content/molecule.ts';
import { SYMBOL_TO_NAME } from '../engine/chemistry/elements.ts';
import { countElements, summarizeBonds } from '../engine/structure/analyze.ts';
import { Formula } from '../lib/Formula.tsx';
import { atomLabel, groupBondAngles, groupBondLengths } from './measurements.ts';
import { Badge, Card, Fact, SectionTitle } from './primitives.tsx';

/** "sp3d2" → sp³d² */
function Hybridization({ value }: { value: string }) {
  return (
    <span>
      {value.split(/(\d)/).map((part, i) => (/^\d$/.test(part) ? <sup key={i}>{part}</sup> : <Fragment key={i}>{part}</Fragment>))}
    </span>
  );
}

const fmt = (x: number, digits: number) => x.toFixed(digits);

function numberFact(m: MoleculeRecord, key: string): number | null {
  const p = m.properties.find((x) => x.key === key)?.value;
  return p && p.status === 'available' && typeof p.value === 'number' ? p.value : null;
}

export function OverviewTab({ molecule: m }: { molecule: MoleculeRecord }) {
  const bonds = summarizeBonds(m.bonds);
  const composition = countElements(m.atoms);
  const mass = numberFact(m, 'molarMass');
  const pol = m.analysis?.polarity;
  const note = m.properties.find((p) => p.key === 'note')?.value;
  const typeCounts: [string, number][] = [['Single', bonds.single], ['Double', bonds.double], ['Triple', bonds.triple], ['Aromatic', bonds.aromatic]];

  return (
    <div className="space-y-4">
      <Card>
        <SectionTitle>Key facts</SectionTitle>
        <dl className="grid grid-cols-2 gap-3">
          <Fact label="Molar mass" value={mass === null ? null : `${fmt(mass, 3)} g/mol`} note={mass === null ? 'An atomic weight is missing from the local table.' : 'Derived from standard atomic weights.'} />
          <Fact label="Atoms" value={m.atoms.length} />
          <Fact label="Bonds" value={m.bonds.length === 0 ? null : `${bonds.sigma} σ, ${bonds.pi} π`} />
          <Fact
            label="Polarity"
            value={pol && pol.status === 'available' ? (pol.value.polar ? 'Polar' : 'Non-polar') : null}
            note={
              m.kind === 'ion'
                ? 'Not applicable: polarity describes neutral molecules.'
                : pol && pol.status === 'available'
                  ? 'Qualitative: from bond dipoles over the 3D shape.'
                  : 'Cannot be decided from electronegativity alone.'
            }
          />
        </dl>
      </Card>

      <Card>
        <SectionTitle>Names</SectionTitle>
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between gap-4"><dt className="text-slate-400">Formula</dt><dd className="text-slate-100"><Formula text={m.formula} /></dd></div>
          <div className="flex justify-between gap-4"><dt className="text-slate-400">IUPAC name</dt><dd className="text-right text-slate-100">{m.iupacName ?? <span className="text-slate-400">Not available</span>}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-slate-400">Also known as</dt><dd className="text-right text-slate-100">{m.synonyms.length > 0 ? m.synonyms.join(', ') : <span className="text-slate-400">None listed</span>}</dd></div>
        </dl>
      </Card>

      <Card>
        <SectionTitle>Molecular geometry and hybridization</SectionTitle>
        {m.analysis && m.analysis.centres.length > 0 ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] text-left text-sm">
                <thead className="text-xs text-slate-400">
                  <tr><th className="pb-2 font-medium">Atom</th><th className="pb-2 font-medium">Shape</th><th className="pb-2 font-medium">Hybridization</th><th className="pb-2 font-medium">Lone pairs</th></tr>
                </thead>
                <tbody className="text-slate-100">
                  {m.analysis.centres.map((c) => (
                    <tr key={c.atom} className="border-t border-border">
                      <td className="py-2 pr-3">{atomLabel(m, c.atom)}</td>
                      <td className="py-2 pr-3 capitalize">{c.molecularGeometry}<span className="block text-xs normal-case text-slate-400">electron geometry: {c.electronGeometry}</span></td>
                      <td className="py-2 pr-3"><Hybridization value={c.hybridization} /></td>
                      <td className="py-2">{c.lonePairs}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs leading-snug text-slate-400">Derived with the {m.analysis.geometrySource}.</p>
          </>
        ) : (
          <p className="text-sm text-slate-300">{m.atoms.length === 2 ? 'Diatomic: the two atoms always lie on a straight line, so there is no central atom to assign a shape or hybridization to.' : 'No geometry could be derived for this structure.'}</p>
        )}
      </Card>

      <Card>
        <SectionTitle>Composition and bonds</SectionTitle>
        <ul className="flex flex-wrap gap-2">
          {composition.map(([el, n]) => (
            <li key={el}><Badge tone="slate">{SYMBOL_TO_NAME[el] ?? el} ({el}) × {n}</Badge></li>
          ))}
        </ul>
        <ul className="mt-3 flex flex-wrap gap-2 text-sm text-slate-300">
          {typeCounts.filter(([, n]) => n > 0).map(([label, n]) => (
            <li key={label} className="rounded-lg border border-border bg-bg/60 px-2.5 py-1">{label}: {n}</li>
          ))}
        </ul>
      </Card>

      {note && note.status === 'available' && (
        <Card className="border-amber-400/30">
          <SectionTitle>Note</SectionTitle>
          <p className="text-sm leading-relaxed text-slate-200">{String(note.value)}</p>
        </Card>
      )}

      <DataQuality m={m} />
    </div>
  );
}

function DataQuality({ m }: { m: MoleculeRecord }) {
  return (
    <Card>
      <SectionTitle>About this data</SectionTitle>
      <ul className="space-y-2 text-sm leading-relaxed text-slate-300">
        <li><Badge tone="amber">3D structure</Badge> <span className="ml-1">{m.structure.method}.</span></li>
        <li><Badge tone={m.meta.status === 'draft' ? 'amber' : 'green'}>Structure information</Badge> <span className="ml-1">Geometry is generated from a chemistry model.</span></li>
        <li className="text-slate-400">Experimental properties such as melting point, boiling point and measured dipole moment have not been added yet. They will only be added with a cited source.</li>
      </ul>
    </Card>
  );
}

function Compare({ predicted, unit, digits, literature }: { predicted: number; unit: string; digits: number; literature?: { value: number; source: string } }) {
  return (
    <span className="block text-right">
      <span className="text-slate-100">{fmt(predicted, digits)}{unit}</span>
      <span className="block text-xs text-slate-400">model value</span>
      {literature && (
        <>
          <span className="mt-1 block text-accent-cyan" title={literature.source}>{fmt(literature.value, digits + 1)}{unit}</span>
          <span className="block text-xs text-slate-400">reference value</span>
        </>
      )}
    </span>
  );
}

export function MeasurementsTab({ molecule: m }: { molecule: MoleculeRecord }) {
  const lengths = groupBondLengths(m);
  const angles = groupBondAngles(m);
  const hasLiterature = lengths.some((l) => l.literature) || angles.some((a) => a.literature);
  return (
    <div className="space-y-4">
      <Card>
        <SectionTitle>Bond lengths</SectionTitle>
        {lengths.length === 0 ? <p className="text-sm text-slate-400">This structure has no bonds.</p> : (
          <ul className="divide-y divide-border">
            {lengths.map((l) => (
              <li key={`${l.label}-${l.order}-${l.predicted}`} className="flex items-center justify-between gap-4 py-2.5 text-sm">
                <span className="text-slate-100">{l.label}<span className="block text-xs text-slate-400">{l.order} bond{l.count > 1 ? ` × ${l.count}` : ''}</span></span>
                <Compare predicted={l.predicted} unit=" Å" digits={2} literature={l.literature} />
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card>
        <SectionTitle>Bond angles</SectionTitle>
        {angles.length === 0 ? <p className="text-sm text-slate-400">No atom has two or more bonds, so there are no bond angles.</p> : (
          <ul className="divide-y divide-border">
            {angles.map((a) => (
              <li key={`${a.label}-${a.predicted}`} className="flex items-center justify-between gap-4 py-2.5 text-sm">
                <span className="text-slate-100">{a.label}{a.count > 1 && <span className="block text-xs text-slate-400">{a.count} equal angles</span>}</span>
                <Compare predicted={a.predicted} unit="°" digits={1} literature={a.literature} />
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card>
        <SectionTitle>How to read these numbers</SectionTitle>
        <ul className="space-y-1.5 text-sm leading-relaxed text-slate-300">
          <li>Model values use an idealised VSEPR geometry and covalent radii. They are useful teaching approximations, not experimental measurements.</li>
          {hasLiterature && <li><span className="font-medium text-accent-cyan">Literature</span> values are reference measurements. Real angles can differ from ideal values because lone pairs repel more strongly than bonding pairs.</li>}
          {!hasLiterature && <li>No literature values have been added for this molecule yet.</li>}
        </ul>
      </Card>
    </div>
  );
}

export type { ReactNode };
