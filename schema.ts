import type { Species } from '../engine/chemistry/balance.ts';

export type VerificationStatus = 'draft' | 'reviewed' | 'verified';

export type SourceKind = 'IUPAC' | 'NIST' | 'PubChem' | 'NCERT' | 'Textbook' | 'Journal' | 'Other';

export interface SourceRef {
  id: string;
  kind: SourceKind;
  title: string;
  /** Section, page, table or URL fragment identifying where the fact is found. */
  locator: string;
  url?: string;
  accessed?: string; // ISO date
  license?: string;
}

export interface RecordMeta {
  id: string;
  status: VerificationStatus;
  sources: SourceRef[];
  reviewedBy?: string;
  reviewedOn?: string; // ISO date
}

export interface ReactionRecord {
  meta: RecordMeta;
  curriculum?: { class: number; chapter: string; topic: string };
  reactants: Species[];
  products: Species[];
  /** Only present when reliably known and covered by the record's sources. */
  conditions?: string;
  type: string;
  /** True for equilibrium reactions (shown with ⇌). The coefficients are still the balanced forward direction. */
  reversible?: boolean;
  explanation: string;
  /** Ids of molecule/ion/element records this reaction involves. */
  involves: string[];
}

export interface PackManifest {
  id: string;
  schemaVersion: number;
  contentVersion: string;
  counts: { total: number; draft: number; reviewed: number; verified: number };
  dependencies: string[];
}
