/**
 * Minimal, safe Markdown parser for Chemo AI replies. Produces a plain data tree (no HTML strings),
 * which the React layer renders, so model output can never inject markup or scripts.
 */
export type Inline =
  | { t: 'text'; v: string }
  | { t: 'bold'; v: Inline[] }
  | { t: 'italic'; v: Inline[] }
  | { t: 'code'; v: string }
  | { t: 'math'; v: string }
  | { t: 'link'; href: string; v: Inline[] };

export type Block =
  | { t: 'heading'; level: 1 | 2 | 3; v: Inline[] }
  | { t: 'p'; v: Inline[] }
  | { t: 'ul'; items: Inline[][] }
  | { t: 'ol'; start: number; items: Inline[][] }
  | { t: 'code'; lang: string; v: string }
  | { t: 'math'; v: string }
  | { t: 'quote'; v: Inline[] }
  | { t: 'table'; head: Inline[][]; rows: Inline[][][] }
  | { t: 'hr' };

const SAFE_URL = /^https?:\/\//i;

export function parseInline(src: string): Inline[] {
  const out: Inline[] = [];
  let i = 0;
  let buf = '';
  const flush = () => {
    if (buf) out.push({ t: 'text', v: buf });
    buf = '';
  };
  while (i < src.length) {
    const c = src[i]!;
    if (c === '\\' && i + 1 < src.length) {
      const n = src[i + 1]!;
      if (n === '(') {
        const end = src.indexOf('\\)', i + 2);
        if (end > -1) { flush(); out.push({ t: 'math', v: src.slice(i + 2, end).trim() }); i = end + 2; continue; }
      }
      if ('*`$_[]#\\'.includes(n)) { buf += n; i += 2; continue; }
    }
    if (c === '`') {
      const end = src.indexOf('`', i + 1);
      if (end > i + 1) { flush(); out.push({ t: 'code', v: src.slice(i + 1, end) }); i = end + 1; continue; }
    }
    if (c === '$') {
      // inline math: $...$ with no space after the opening or before the closing $, closing not followed by a digit
      const end = findMathEnd(src, i + 1);
      if (end > -1) { flush(); out.push({ t: 'math', v: src.slice(i + 1, end) }); i = end + 1; continue; }
    }
    if (c === '*' && src[i + 1] === '*') {
      const end = src.indexOf('**', i + 2);
      if (end > i + 2) { flush(); out.push({ t: 'bold', v: parseInline(src.slice(i + 2, end)) }); i = end + 2; continue; }
    }
    if (c === '*' && src[i + 1] !== ' ' && src[i + 1] !== '*' && src[i + 1] !== undefined) {
      const end = src.indexOf('*', i + 1);
      if (end > i + 1 && src[end - 1] !== ' ') { flush(); out.push({ t: 'italic', v: parseInline(src.slice(i + 1, end)) }); i = end + 1; continue; }
    }
    if (c === '[') {
      const m = /^\[([^\]]+)\]\(([^)\s]+)\)/.exec(src.slice(i));
      if (m && SAFE_URL.test(m[2]!)) { flush(); out.push({ t: 'link', href: m[2]!, v: parseInline(m[1]!) }); i += m[0].length; continue; }
    }
    buf += c;
    i++;
  }
  flush();
  return out;
}

function findMathEnd(src: string, from: number): number {
  if (src[from] === ' ' || src[from] === undefined || src[from] === '$') return -1;
  for (let j = from; j < src.length; j++) {
    if (src[j] === '\\') { j++; continue; }
    if (src[j] === '$') {
      if (src[j - 1] === ' ') return -1;
      if (/[0-9]/.test(src[j + 1] ?? '')) return -1;
      return j > from ? j : -1;
    }
  }
  return -1;
}

const isTableSep = (l: string) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l);
const splitRow = (l: string) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());

export function parseMarkdown(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (line.trim() === '') { i++; continue; }

    const fence = /^\s*```\s*([\w+-]*)\s*$/.exec(line);
    if (fence) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i]!)) body.push(lines[i++]!);
      i++; // closing fence (or end of text while streaming/truncated)
      blocks.push({ t: 'code', lang: fence[1] ?? '', v: body.join('\n') });
      continue;
    }
    if (/^\s*\$\$/.test(line)) {
      let text = line.trim().slice(2);
      if (text.endsWith('$$') && text.length >= 2) { blocks.push({ t: 'math', v: text.slice(0, -2).trim() }); i++; continue; }
      const body = [text];
      i++;
      while (i < lines.length && !lines[i]!.includes('$$')) body.push(lines[i++]!);
      if (i < lines.length) body.push(lines[i++]!.replace(/\$\$.*$/, ''));
      blocks.push({ t: 'math', v: body.join(' ').trim() });
      continue;
    }
    if (/^\s*\\\[/.test(line)) {
      const body = [line.trim().replace(/^\\\[/, '')];
      let done = /\\\]\s*$/.test(line);
      i++;
      while (!done && i < lines.length) { body.push(lines[i]!); done = /\\\]\s*$/.test(lines[i]!); i++; }
      blocks.push({ t: 'math', v: body.join(' ').replace(/\\\]\s*$/, '').trim() });
      continue;
    }
    const h = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (h) { blocks.push({ t: 'heading', level: Math.min(3, h[1]!.length) as 1 | 2 | 3, v: parseInline(h[2]!) }); i++; continue; }
    if (/^\s*([-*_])\s*\1\s*\1[\s\-*_]*$/.test(line)) { blocks.push({ t: 'hr' }); i++; continue; }
    if (/^\s*>/.test(line)) {
      const q: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i]!)) q.push(lines[i++]!.replace(/^\s*>\s?/, ''));
      blocks.push({ t: 'quote', v: parseInline(q.join(' ')) });
      continue;
    }
    if (line.includes('|') && i + 1 < lines.length && isTableSep(lines[i + 1]!)) {
      const head = splitRow(line).map(parseInline);
      i += 2;
      const rows: Inline[][][] = [];
      while (i < lines.length && lines[i]!.includes('|') && lines[i]!.trim() !== '') rows.push(splitRow(lines[i++]!).map(parseInline));
      blocks.push({ t: 'table', head, rows });
      continue;
    }
    const ul = /^\s*[-*•]\s+(.*)$/.exec(line);
    if (ul) {
      const items: Inline[][] = [];
      while (i < lines.length) {
        const m = /^\s*[-*•]\s+(.*)$/.exec(lines[i]!);
        if (!m) break;
        let text = m[1]!;
        i++;
        while (i < lines.length && /^\s{2,}\S/.test(lines[i]!) && !/^\s*([-*•]|\d+[.)])\s/.test(lines[i]!)) text += ' ' + lines[i++]!.trim();
        items.push(parseInline(text));
      }
      blocks.push({ t: 'ul', items });
      continue;
    }
    const ol = /^\s*(\d+)[.)]\s+(.*)$/.exec(line);
    if (ol) {
      const start = Number(ol[1]);
      const items: Inline[][] = [];
      while (i < lines.length) {
        const m = /^\s*\d+[.)]\s+(.*)$/.exec(lines[i]!);
        if (!m) break;
        let text = m[1]!;
        i++;
        while (i < lines.length && /^\s{2,}\S/.test(lines[i]!) && !/^\s*([-*•]|\d+[.)])\s/.test(lines[i]!)) text += ' ' + lines[i++]!.trim();
        items.push(parseInline(text));
      }
      blocks.push({ t: 'ol', start, items });
      continue;
    }
    // paragraph: consecutive plain lines
    const para: string[] = [line.trim()];
    i++;
    while (i < lines.length && lines[i]!.trim() !== '' && !/^\s*(```|\$\$|\\\[|#{1,6}\s|>|[-*•]\s|\d+[.)]\s)/.test(lines[i]!) && !(lines[i]!.includes('|') && i + 1 < lines.length && isTableSep(lines[i + 1]!))) para.push(lines[i++]!.trim());
    blocks.push({ t: 'p', v: parseInline(para.join(' ')) });
  }
  return blocks;
}
