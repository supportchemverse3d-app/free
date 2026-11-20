export type Provenance = 'experimental' | 'computed' | 'derived' | 'predicted';

/** A fact that is either available with provenance, or explicitly unavailable (never a silent 0). */
export type Value<T> =
  | { status: 'available'; value: T; provenance: Provenance; source: string }
  | { status: 'unavailable' };
