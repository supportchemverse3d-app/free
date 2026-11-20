/** Lightweight offline structure library: molecules, ions, crystals and orbitals. */
import moleculesJson from '../../data-src/molecules/molecules.json';
import type { MoleculeRecord } from '../content/molecule.ts';
import { moleculeSearchEntry } from '../content/searchEntries.ts';
import { CRYSTALS } from '../engine/crystal/crystals.ts';
import { ORBITALS } from '../engine/orbitals/orbitals.ts';
import { SearchIndex, formulaKey, type SearchEntry, type SearchHit } from '../engine/search/search.ts';

export const molecules = moleculesJson as unknown as MoleculeRecord[];
const moleculeById = new Map(molecules.map((m) => [m.meta.id, m]));
const moleculeByFormulaKey = new Map<string, MoleculeRecord>();
for (const m of molecules) {
  const key = formulaKey(m.formula);
  if (key !== null && !moleculeByFormulaKey.has(key)) moleculeByFormulaKey.set(key, m);
}
export const getMolecule = (id: string) => moleculeById.get(id);
export const findMoleculeByFormula = (formula: string) => {
  const key = formulaKey(formula);
  return key === null ? undefined : moleculeByFormulaKey.get(key);
};
const crystalEntries: SearchEntry[] = CRYSTALS.map((c) => ({ id: `crystal:${c.id}`, type: 'concept', title: c.name, aliases: [c.name.replace(/\(.*\)/, '').trim(), ...c.examples, 'crystal structure', 'unit cell', 'lattice'], formulas: c.family === 'ionic' ? [c.formula] : [], keywords: ['solid state', 'crystal', 'unit cell', c.family] }));
const orbitalEntries: SearchEntry[] = ORBITALS.map((o) => ({ id: `orbital:${o.id}`, type: 'concept', title: o.name, aliases: [o.id, o.name.replace(' orbitals', '').replace(' orbital', '')], formulas: [], keywords: ['orbital', 'atomic structure', 'hybridization', o.group] }));
const index = new SearchIndex([...molecules.map(moleculeSearchEntry), ...crystalEntries, ...orbitalEntries]);
export const libraryCounts = { molecules: molecules.filter((m) => m.kind === 'molecule').length, ions: molecules.filter((m) => m.kind === 'ion').length };
export function searchLibrary(query: string, limit = 8): SearchHit[] { return index.search(query, 40).sort((a, b) => b.score - a.score).slice(0, limit); }
export function routeFor(entry: Pick<SearchEntry, 'id' | 'type'>): string {
  if (entry.id.startsWith('crystal:')) return `#/c/${entry.id.slice(8)}`;
  if (entry.id.startsWith('orbital:')) return `#/o/${entry.id.slice(8)}`;
  return `#/m/${entry.id}`;
}
