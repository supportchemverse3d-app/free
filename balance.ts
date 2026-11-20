import { parseFormula, type ElementCounts } from './formula.ts';

export interface Species {
  formula: string;
  coefficient: number;
}

export interface BalanceResult {
  balanced: boolean;
  reactants: ElementCounts;
  products: ElementCounts;
  reactantCharge: number;
  productCharge: number;
  /** Elements whose atom counts differ (product minus reactant). */
  differences: Record<string, number>;
}

function tally(side: readonly Species[]): { counts: ElementCounts; charge: number } {
  const counts: ElementCounts = {};
  let charge = 0;
  for (const { formula, coefficient } of side) {
    if (!Number.isInteger(coefficient) || coefficient < 1) {
      throw new RangeError(`Invalid coefficient ${coefficient} for ${formula}`);
    }
    const parsed = parseFormula(formula);
    for (const [el, n] of Object.entries(parsed.elements)) counts[el] = (counts[el] ?? 0) + n * coefficient;
    charge += parsed.charge * coefficient;
  }
  return { counts, charge };
}

/** Verifies atom and charge conservation. Throws on invalid formulas or coefficients. */
export function checkBalance(reactants: readonly Species[], products: readonly Species[]): BalanceResult {
  if (reactants.length === 0 || products.length === 0) throw new RangeError('Both sides need at least one species');
  const left = tally(reactants);
  const right = tally(products);
  const differences: Record<string, number> = {};
  for (const el of new Set([...Object.keys(left.counts), ...Object.keys(right.counts)])) {
    const d = (right.counts[el] ?? 0) - (left.counts[el] ?? 0);
    if (d !== 0) differences[el] = d;
  }
  return {
    balanced: Object.keys(differences).length === 0 && left.charge === right.charge,
    reactants: left.counts,
    products: right.counts,
    reactantCharge: left.charge,
    productCharge: right.charge,
    differences,
  };
}
