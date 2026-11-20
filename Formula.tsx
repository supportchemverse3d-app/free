import { normalizeFormula } from '../engine/chemistry/formula.ts';

/** Renders a chemical formula with subscripts and a superscript charge. Accepts "H₂O", "H2O", "SO4^2-". */
export function Formula({ text }: { text: string }) {
  const ascii = normalizeFormula(text);
  const caret = ascii.indexOf('^');
  const body = caret === -1 ? ascii : ascii.slice(0, caret);
  const charge = caret === -1 ? '' : ascii.slice(caret + 1).replace('-', '−');
  const parts = body.split(/(\d+)/);
  return (
    <span className="whitespace-nowrap">
      {parts.map((part, i) => {
        if (part === '') return null;
        const isNumber = /^\d+$/.test(part);
        const before = parts[i - 1] ?? '';
        const subscript = isNumber && before !== '' && /[A-Za-z)\]]$/.test(before);
        return subscript ? <sub key={i}>{part}</sub> : <span key={i}>{part}</span>;
      })}
      {charge !== '' && <sup>{charge}</sup>}
    </span>
  );
}
