import { checkBalance } from '../engine/chemistry/balance.ts';
import type { RecordMeta, ReactionRecord } from './schema.ts';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Returns a list of problems; an empty list means the metadata satisfies the provenance rules. */
export function validateMeta(meta: RecordMeta): string[] {
  const issues: string[] = [];
  if (meta.id.trim() === '') issues.push('Record id is empty');
  if (meta.sources.length === 0) issues.push('At least one source is required');
  for (const s of meta.sources) {
    if (s.id.trim() === '' || s.title.trim() === '' || s.locator.trim() === '') {
      issues.push(`Source "${s.id}" needs id, title and locator`);
    }
  }
  if (meta.status !== 'draft') {
    if (!meta.reviewedBy || meta.reviewedBy.trim() === '') issues.push(`${meta.status} record needs reviewedBy`);
    if (!meta.reviewedOn || !ISO_DATE.test(meta.reviewedOn)) issues.push(`${meta.status} record needs reviewedOn (YYYY-MM-DD)`);
  }
  if (meta.status === 'verified') {
    const independent = new Set(meta.sources.map((s) => s.id)).size;
    if (independent < 2) issues.push('verified record needs at least two distinct sources');
  }
  return issues;
}

/** Validates provenance rules, text completeness and atom/charge balance. */
export function validateReaction(r: ReactionRecord): string[] {
  const issues = validateMeta(r.meta);
  if (r.explanation.trim() === '') issues.push('Explanation is empty');
  if (r.type.trim() === '') issues.push('Reaction type is empty');
  try {
    const result = checkBalance(r.reactants, r.products);
    if (!result.balanced) {
      issues.push(`Unbalanced: element differences ${JSON.stringify(result.differences)}, charge ${result.reactantCharge} → ${result.productCharge}`);
    }
  } catch (e) {
    issues.push(`Cannot check balance: ${e instanceof Error ? e.message : String(e)}`);
  }
  return issues;
}
