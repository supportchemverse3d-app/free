import type { SearchEntry } from '../engine/search/search.ts';
import type { MoleculeRecord } from './molecule.ts';
export const moleculeSearchEntry = (m: MoleculeRecord): SearchEntry => ({
  id: m.meta.id,
  type: m.kind,
  title: m.name,
  aliases: [...(m.iupacName ? [m.iupacName] : []), ...m.synonyms],
  formulas: [m.formula],
  keywords: [...(m.casNumber ? [m.casNumber] : []), ...(m.curriculum?.chapters ?? []), ...(m.curriculum?.topics ?? [])],
});
