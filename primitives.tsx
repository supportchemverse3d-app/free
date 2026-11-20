import type { ReactNode } from 'react';

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-border bg-surface p-4 ${className}`}>{children}</section>;
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">{children}</h2>;
}

type Tone = 'amber' | 'slate' | 'blue' | 'green' | 'violet';

const TONES: Record<Tone, string> = {
  amber: 'border-amber-400/40 bg-amber-400/10 text-amber-200',
  slate: 'border-slate-500/40 bg-slate-500/10 text-slate-300',
  blue: 'border-accent-blue/40 bg-accent-blue/10 text-blue-200',
  green: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200',
  violet: 'border-accent-violet/40 bg-accent-violet/10 text-violet-200',
};

export function Badge({ tone = 'slate', children, title }: { tone?: Tone; children: ReactNode; title?: string }) {
  return (
    <span title={title} className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${TONES[tone]}`}>
      {children}
    </span>
  );
}

/** A labelled value. `value` of null renders as "Not available", never as zero. */
export function Fact({ label, value, note }: { label: string; value: ReactNode | null; note?: string }) {
  return (
    <div className="rounded-xl border border-border bg-bg/60 p-3">
      <dt className="text-xs text-slate-400">{label}</dt>
      <dd className="mt-1 text-base font-semibold text-slate-100">{value ?? <span className="font-normal text-slate-400">Not available</span>}</dd>
      {note && <p className="mt-1 text-xs leading-snug text-slate-400">{note}</p>}
    </div>
  );
}

export function TypeLabel({ type }: { type: string }) {
  const text = type === 'molecule' ? 'Molecule' : type === 'ion' ? 'Ion' : type === 'element' ? 'Element' : type === 'reaction' ? 'Reaction' : type === 'concept' ? 'Structure' : type;
  const tone: Tone = type === 'element' ? 'violet' : type === 'reaction' ? 'green' : 'blue';
  return <Badge tone={tone}>{text}</Badge>;
}

export const linkClass =
  'rounded-lg border border-border bg-bg/60 px-3 py-1.5 text-sm text-slate-200 transition-colors hover:border-accent-blue hover:bg-elevated focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-blue';
