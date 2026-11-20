import type { Value } from '../structure/value.ts';

export interface CentralAtomInput {
  /** Valence electrons of the neutral atom (main-group). */
  valenceElectrons: number;
  /** Sum of bond orders to all neighbours (single = 1, double = 2, triple = 3). */
  bondOrderSum: number;
  /** Number of neighbouring atoms (sigma bonds). */
  neighbours: number;
  formalCharge: number;
}

export interface VseprResult {
  lonePairs: number;
  stericNumber: number;
  electronGeometry: string;
  molecularGeometry: string;
  hybridization: string;
}

const SOURCE = 'VSEPR steric-number rule (textbook convention; hybridization is a model, not a measurement)';

type Row = { electron: string; hybrid: string; shapes: readonly string[] };

/** shapes[i] = molecular geometry with i lone pairs. */
const TABLE: Readonly<Record<number, Row>> = {
  2: { electron: 'linear', hybrid: 'sp', shapes: ['linear'] },
  3: { electron: 'trigonal planar', hybrid: 'sp2', shapes: ['trigonal planar', 'bent'] },
  4: { electron: 'tetrahedral', hybrid: 'sp3', shapes: ['tetrahedral', 'trigonal pyramidal', 'bent'] },
  5: { electron: 'trigonal bipyramidal', hybrid: 'sp3d', shapes: ['trigonal bipyramidal', 'seesaw', 'T-shaped', 'linear'] },
  6: { electron: 'octahedral', hybrid: 'sp3d2', shapes: ['octahedral', 'square pyramidal', 'square planar'] },
  7: { electron: 'pentagonal bipyramidal', hybrid: 'sp3d3', shapes: ['pentagonal bipyramidal'] },
};

/**
 * Derives lone pairs, geometry and hybridization of a central atom.
 * Returns "unavailable" for odd-electron species, negative/non-integer lone pairs,
 * or steric numbers/lone-pair combinations outside the table (e.g. one neighbour).
 */
export function deriveVsepr(input: CentralAtomInput): Value<VseprResult> {
  const nonbondingElectrons = input.valenceElectrons - input.formalCharge - input.bondOrderSum;
  if (!Number.isInteger(nonbondingElectrons) || nonbondingElectrons < 0 || nonbondingElectrons % 2 !== 0) {
    return { status: 'unavailable' };
  }
  const lonePairs = nonbondingElectrons / 2;
  const stericNumber = input.neighbours + lonePairs;
  const row = TABLE[stericNumber];
  const shape = row?.shapes[lonePairs];
  if (row === undefined || shape === undefined) return { status: 'unavailable' };
  return {
    status: 'available',
    provenance: 'derived',
    source: SOURCE,
    value: {
      lonePairs,
      stericNumber,
      electronGeometry: row.electron,
      molecularGeometry: shape,
      hybridization: row.hybrid,
    },
  };
}
