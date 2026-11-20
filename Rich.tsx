import { Fragment, type ReactNode } from 'react';
import { parseInline, parseMarkdown, type Block, type Inline } from './markdown.ts';
import { mathToPlain, parseMath, type MathSeg } from './mathText.ts';

function renderSegs(segs: MathSeg[]): ReactNode[] {
  return segs.map((s, i) => {
    switch (s.t) {
      case 'text': return <Fragment key={i}>{s.v}</Fragment>;
      case 'sup': return <sup key={i}>{renderSegs(s.v)}</sup>;
      case 'sub': return <sub key={i}>{renderSegs(s.v)}</sub>;
      case 'frac': return <span key={i} className="chemo-frac"><span>{renderSegs(s.n)}</span><span>{renderSegs(s.d)}</span></span>;
      case 'sqrt': return <span key={i} className="chemo-sqrt">√<span className="chemo-sqrt-body">{renderSegs(s.v)}</span></span>;
    }
  });
}

export function MathView({ src, block = false }: { src: string; block?: boolean }) {
  const segs = parseMath(src);
  return <span className={block ? 'chemo-math chemo-math-block' : 'chemo-math'} role="math" aria-label={mathToPlain(segs)}>{renderSegs(segs)}</span>;
}

function Inlines({ nodes }: { nodes: Inline[] }) {
  return (
    <>
      {nodes.map((n, i) => {
        switch (n.t) {
          case 'text': return <Fragment key={i}>{n.v}</Fragment>;
          case 'bold': return <strong key={i} className="font-semibold text-slate-50"><Inlines nodes={n.v} /></strong>;
          case 'italic': return <em key={i}><Inlines nodes={n.v} /></em>;
          case 'code': return <code key={i} className="chemo-inline-code">{n.v}</code>;
          case 'math': return <MathView key={i} src={n.v} />;
          case 'link': return <a key={i} href={n.href} target="_blank" rel="noopener noreferrer" className="text-[#6fe3d8] underline underline-offset-2"><Inlines nodes={n.v} /></a>;
        }
      })}
    </>
  );
}

function BlockView({ b }: { b: Block }) {
  switch (b.t) {
    case 'heading': {
      const cls = b.level === 1 ? 'text-lg' : b.level === 2 ? 'text-base' : 'text-[15px]';
      return <h3 className={`${cls} mt-4 font-bold text-slate-50 first:mt-0`}><Inlines nodes={b.v} /></h3>;
    }
    case 'p': return <p className="mt-2.5 first:mt-0"><Inlines nodes={b.v} /></p>;
    case 'ul': return <ul className="mt-2.5 list-disc space-y-1.5 pl-5 first:mt-0">{b.items.map((it, i) => <li key={i}><Inlines nodes={it} /></li>)}</ul>;
    case 'ol': return <ol start={b.start} className="mt-2.5 list-decimal space-y-1.5 pl-5 first:mt-0">{b.items.map((it, i) => <li key={i}><Inlines nodes={it} /></li>)}</ol>;
    case 'code':
      return (
        <figure className="mt-2.5 first:mt-0">
          {b.lang && <figcaption className="rounded-t-lg border border-b-0 border-white/10 bg-[#0c1620] px-3 py-1 text-[10px] uppercase tracking-wider text-slate-500">{b.lang}</figcaption>}
          <pre className={`chemo-code ${b.lang ? 'rounded-b-lg' : 'rounded-lg'}`}><code>{b.v}</code></pre>
        </figure>
      );
    case 'math': return <div className="mt-2.5 overflow-x-auto py-1 text-center first:mt-0"><MathView src={b.v} block /></div>;
    case 'quote': return <blockquote className="mt-2.5 border-l-2 border-[#3bb8ad] pl-3 text-slate-300 first:mt-0"><Inlines nodes={b.v} /></blockquote>;
    case 'hr': return <hr className="my-3 border-white/10" />;
    case 'table':
      return (
        <div className="mt-2.5 overflow-x-auto first:mt-0">
          <table className="w-full border-collapse text-left text-[13px]">
            <thead><tr>{b.head.map((h, i) => <th key={i} className="border border-white/10 bg-white/[.04] px-2.5 py-1.5 font-semibold"><Inlines nodes={h} /></th>)}</tr></thead>
            <tbody>{b.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className="border border-white/10 px-2.5 py-1.5"><Inlines nodes={c} /></td>)}</tr>)}</tbody>
          </table>
        </div>
      );
  }
}

/** Renders Markdown with LaTeX-style math and code blocks. Never uses innerHTML. */
export function Rich({ text }: { text: string }) {
  const blocks = parseMarkdown(text);
  return <div className="chemo-rich text-[14.5px] leading-[1.7] text-slate-200">{blocks.map((b, i) => <BlockView key={i} b={b} />)}</div>;
}

/** Single-line inline Markdown (for short labels such as a definition or an FAQ question). */
export function RichInline({ text }: { text: string }) {
  return <Inlines nodes={parseInline(text)} />;
}
