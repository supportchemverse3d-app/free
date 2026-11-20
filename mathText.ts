/**
 * Small LaTeX-subset formatter for school mathematics, physics and chemistry. No dependencies.
 * Supported: ^ _ {} \frac \sqrt \text, Greek letters, common operators and arrows, function names.
 * Anything unsupported is shown as the original text, never dropped silently.
 */
export type MathSeg =
  | { t: 'text'; v: string }
  | { t: 'sup'; v: MathSeg[] }
  | { t: 'sub'; v: MathSeg[] }
  | { t: 'frac'; n: MathSeg[]; d: MathSeg[] }
  | { t: 'sqrt'; v: MathSeg[] };

const SYMBOLS: Record<string, string> = {
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', varepsilon: 'ε', zeta: 'ζ', eta: 'η', theta: 'θ', iota: 'ι', kappa: 'κ',
  lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', pi: 'π', rho: 'ρ', sigma: 'σ', tau: 'τ', phi: 'φ', varphi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω',
  Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π', Sigma: 'Σ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω',
  times: '×', cdot: '·', div: '÷', pm: '±', mp: '∓', leq: '≤', le: '≤', geq: '≥', ge: '≥', neq: '≠', ne: '≠', approx: '≈', equiv: '≡',
  sim: '∼', propto: '∝', infty: '∞', partial: '∂', nabla: '∇', degree: '°', circ: '°', angle: '∠', perp: '⊥', parallel: '∥',
  to: '→', rightarrow: '→', leftarrow: '←', Rightarrow: '⇒', Leftarrow: '⇐', leftrightarrow: '↔', Leftrightarrow: '⇔',
  rightleftharpoons: '⇌', uparrow: '↑', downarrow: '↓', in: '∈', notin: '∉', subset: '⊂', subseteq: '⊆', supset: '⊃', cup: '∪', cap: '∩',
  emptyset: '∅', forall: '∀', exists: '∃', therefore: '∴', because: '∵', sum: 'Σ', prod: 'Π', int: '∫', oint: '∮', ldots: '…', cdots: '⋯', dots: '…',
  langle: '⟨', rangle: '⟩', hbar: 'ħ', ell: 'ℓ', quad: '  ', qquad: '    ', ',': ' ', ';': ' ', ':': ' ', '!': '', '%': '%', '&': '&', '_': '_', '{': '{', '}': '}', '$': '$', '#': '#',
};
const FUNCTIONS = new Set(['sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'cosec', 'log', 'ln', 'exp', 'lim', 'max', 'min', 'det', 'sinh', 'cosh', 'tanh', 'arcsin', 'arccos', 'arctan', 'mod', 'gcd', 'lcm']);
const FN_DISPLAY: Record<string, string> = { cosec: 'cosec' };

class Parser {
  i = 0;
  s: string;
  constructor(src: string) {
    this.s = src;
  }

  parseSeq(stop?: string): MathSeg[] {
    const out: MathSeg[] = [];
    let buf = '';
    const flush = () => {
      if (buf) out.push({ t: 'text', v: buf });
      buf = '';
    };
    while (this.i < this.s.length) {
      const c = this.s[this.i]!;
      if (stop && c === stop) break;
      if (c === '^' || c === '_') {
        flush();
        this.i++;
        out.push({ t: c === '^' ? 'sup' : 'sub', v: this.parseArg() });
      } else if (c === '{') {
        this.i++;
        const inner = this.parseSeq('}');
        if (this.s[this.i] === '}') this.i++;
        flush();
        out.push(...inner);
      } else if (c === '\\') {
        this.i++;
        const name = this.readCommand();
        if (name === 'frac' || name === 'dfrac' || name === 'tfrac') {
          flush();
          const n = this.parseArg();
          const d = this.parseArg();
          out.push({ t: 'frac', n, d });
        } else if (name === 'sqrt') {
          flush();
          out.push({ t: 'sqrt', v: this.parseArg() });
        } else if (name === 'text' || name === 'mathrm' || name === 'textbf' || name === 'mathbf' || name === 'operatorname') {
          flush();
          out.push(...this.parseArg());
        } else if (name === 'left' || name === 'right' || name === 'displaystyle' || name === 'big' || name === 'Big') {
          if (name === 'left' || name === 'right') {
            const d = this.s[this.i];
            if (d && d !== '.') buf += d === '|' ? '|' : d;
            if (d) this.i++;
          }
        } else if (FUNCTIONS.has(name)) {
          buf += FN_DISPLAY[name] ?? name;
        } else if (name in SYMBOLS) {
          buf += SYMBOLS[name];
        } else {
          buf += '\\' + name; // unsupported: keep visible
        }
      } else {
        buf += c;
        this.i++;
      }
    }
    flush();
    return out;
  }

  private readCommand(): string {
    const c = this.s[this.i] ?? '';
    if (!/[a-zA-Z]/.test(c)) {
      this.i++;
      return c;
    }
    let j = this.i;
    while (j < this.s.length && /[a-zA-Z]/.test(this.s[j]!)) j++;
    const name = this.s.slice(this.i, j);
    this.i = j;
    return name;
  }

  /** One argument: a {group}, a command, or a single character. */
  private parseArg(): MathSeg[] {
    while (this.s[this.i] === ' ') this.i++;
    const c = this.s[this.i];
    if (c === undefined) return [];
    if (c === '{') {
      this.i++;
      const inner = this.parseSeq('}');
      if (this.s[this.i] === '}') this.i++;
      return inner;
    }
    if (c === '\\') {
      const start = this.i;
      this.i++;
      const name = this.readCommand();
      if (name in SYMBOLS) return [{ t: 'text', v: SYMBOLS[name]! }];
      this.i = start;
      // a command argument such as \frac{..}{..} or \sqrt{..}
      const sub = new Parser(this.s);
      sub.i = start;
      const seq = sub.parseOne();
      this.i = sub.i;
      return seq;
    }
    this.i++;
    return [{ t: 'text', v: c }];
  }

  private parseOne(): MathSeg[] {
    const save = this.s;
    // parse exactly one item starting at this.i, by parsing a sequence that stops after one item
    const c = save[this.i];
    if (c !== '\\') return this.parseArg();
    this.i++;
    const name = this.readCommand();
    if (name === 'frac' || name === 'dfrac') return [{ t: 'frac', n: this.parseArg(), d: this.parseArg() }];
    if (name === 'sqrt') return [{ t: 'sqrt', v: this.parseArg() }];
    if (FUNCTIONS.has(name)) return [{ t: 'text', v: name }];
    return [{ t: 'text', v: '\\' + name }];
  }
}

export function parseMath(src: string): MathSeg[] {
  return new Parser(src).parseSeq();
}

/** Plain-text form, used for tests and accessibility labels. */
export function mathToPlain(segs: MathSeg[]): string {
  return segs
    .map((s) => {
      switch (s.t) {
        case 'text': return s.v;
        case 'sup': return '^' + (s.v.length === 1 && s.v[0]!.t === 'text' && s.v[0]!.v.length === 1 ? mathToPlain(s.v) : `(${mathToPlain(s.v)})`);
        case 'sub': return '_' + mathToPlain(s.v);
        case 'frac': return `(${mathToPlain(s.n)})/(${mathToPlain(s.d)})`;
        case 'sqrt': return `√(${mathToPlain(s.v)})`;
      }
    })
    .join('');
}
