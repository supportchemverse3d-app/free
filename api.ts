import type { ChatRequest, ErrorCode } from './protocol.ts';
import { clearToken, DEACTIVATED_EVENT, getToken } from '../lib/activationToken.ts';

export type ClientErrorCode = ErrorCode | 'network' | 'config' | 'client_timeout';

/** Adds the activation token to calls to the Chemo AI server. */
const authHeaders = (): Record<string, string> => {
  const t = getToken();
  return t ? { authorization: `Bearer ${t}` } : {};
};

export class ChemoError extends Error {
  code: ClientErrorCode;
  retryable: boolean;
  /** Text that had already arrived when a streamed answer failed (may be empty). */
  partial = '';
  constructor(code: ClientErrorCode, message: string) {
    super(message);
    this.code = code;
    this.retryable = code !== 'bad_request' && code !== 'config' && code !== 'not_configured' && code !== 'not_activated';
    if (code === 'not_activated') {
      // The server says this phone is not (or no longer) activated: go back to the activation screen.
      clearToken();
      if (typeof window !== 'undefined') window.dispatchEvent(new Event(DEACTIVATED_EVENT));
    }
  }
}

const CLIENT_TIMEOUT_MS = 70_000;
export interface ChemoConfig {
  /** Address of the Chemo AI server. Empty means the same origin as the page. */
  apiUrl: string;
  /** Optional Supabase project for sign-in and chat sync. Both must be set to enable it. */
  supabaseUrl: string;
  /** Supabase *publishable* key (safe in the app when row level security is on). Never a secret key. */
  supabaseKey: string;
}

let cachedConfig: ChemoConfig | null = null;

/**
 * Settings read at runtime from chemo-config.json (shipped inside the app), so addresses can be changed
 * without touching code.
 */
export async function chemoConfig(): Promise<ChemoConfig> {
  if (cachedConfig) return cachedConfig;
  const cfg: ChemoConfig = { apiUrl: '', supabaseUrl: '', supabaseKey: '' };
  try {
    const res = await fetch('chemo-config.json', { cache: 'no-store' });
    if (res.ok) {
      const j = (await res.json()) as Record<string, unknown>;
      const t = (v: unknown) => (typeof v === 'string' ? v.trim().replace(/\/+$/, '') : '');
      cfg.apiUrl = t(j.apiUrl);
      cfg.supabaseUrl = t(j.supabaseUrl);
      cfg.supabaseKey = typeof j.supabaseKey === 'string' ? j.supabaseKey.trim() : '';
    }
  } catch {
    /* no config file: same origin, no cloud sync */
  }
  cachedConfig = cfg;
  return cfg;
}

export async function apiBase(): Promise<string> {
  return (await chemoConfig()).apiUrl;
}
export const resetApiBaseCache = (): void => {
  cachedConfig = null;
};

export async function sendChat(req: ChatRequest, outer?: AbortSignal): Promise<string> {
  const base = await apiBase();
  const ctl = new AbortController();
  const onOuter = () => ctl.abort();
  outer?.addEventListener('abort', onOuter);
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    ctl.abort();
  }, CLIENT_TIMEOUT_MS);
  try {
    let res: Response;
    try {
      res = await fetch(`${base}/api/chat`, { method: 'POST', headers: { 'content-type': 'application/json', ...authHeaders() }, body: JSON.stringify(req), signal: ctl.signal });
    } catch (e) {
      if (outer?.aborted) throw e;
      if (timedOut) throw new ChemoError('client_timeout', 'The answer took too long. Please try again.');
      throw new ChemoError('network', 'Could not connect to the Chemo AI server. Check your internet connection and try again.');
    }
    const text = await res.text();
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      // An HTML page or empty body: the app is not pointing at a Chemo AI server.
      throw new ChemoError('config', 'This app is not connected to a Chemo AI server. Set the server address in public/chemo-config.json.');
    }
    const d = data as { reply?: unknown; error?: { code?: ErrorCode; message?: string } };
    if (res.ok && typeof d.reply === 'string' && d.reply.trim()) return d.reply;
    if (d.error?.message) throw new ChemoError(d.error.code ?? 'server', d.error.message);
    throw new ChemoError('server', 'The server sent an unexpected answer. Please try again.');
  } finally {
    clearTimeout(timer);
    outer?.removeEventListener('abort', onOuter);
  }
}

/** Maximum wait for the first text, and between two pieces of text, while streaming. */
const STREAM_IDLE_MS = 30_000;

function parseReply(res: Response, text: string): string {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new ChemoError('config', 'This app is not connected to a Chemo AI server. Set the server address in public/chemo-config.json.');
  }
  const d = data as { reply?: unknown; error?: { code?: ErrorCode; message?: string } };
  if (res.ok && typeof d.reply === 'string' && d.reply.trim()) return d.reply;
  if (d.error?.message) throw new ChemoError(d.error.code ?? 'server', d.error.message);
  throw new ChemoError('server', 'The server sent an unexpected answer. Please try again.');
}

/**
 * Streaming chat: calls onText(fullTextSoFar) as the answer arrives and resolves with the final text.
 * If the server or WebView cannot stream, the whole answer arrives at once and onText is called once.
 * On a network or server failure after some text arrived, the error carries that partial text in `partial`.
 */
export async function streamChat(req: ChatRequest, onText: (full: string) => void, outer?: AbortSignal): Promise<string> {
  const base = await apiBase();
  const ctl = new AbortController();
  const onOuter = () => ctl.abort();
  outer?.addEventListener('abort', onOuter);
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const arm = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timedOut = true;
      ctl.abort();
    }, STREAM_IDLE_MS);
  };
  let full = '';
  const partialError = (code: ClientErrorCode, message: string) => {
    const e = new ChemoError(code, message);
    e.partial = full;
    return e;
  };
  try {
    arm();
    let res: Response;
    try {
      res = await fetch(`${base}/api/chat`, { method: 'POST', headers: { 'content-type': 'application/json', ...authHeaders() }, body: JSON.stringify({ ...req, stream: true }), signal: ctl.signal });
    } catch (e) {
      if (outer?.aborted) throw e;
      if (timedOut) throw new ChemoError('client_timeout', 'The answer took too long. Please try again.');
      throw new ChemoError('network', 'Could not connect to the Chemo AI server. Check your internet connection and try again.');
    }
    const isStream = (res.headers.get('content-type') ?? '').includes('text/event-stream');
    if (!res.ok || !isStream || !res.body) {
      const reply = parseReply(res, await res.text());
      onText(reply);
      return reply;
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    let finished = false;
    const handle = (line: string): void => {
      if (!line.startsWith('data:')) return;
      let ev: { t?: string; v?: unknown; error?: { code?: ErrorCode; message?: string } };
      try {
        ev = JSON.parse(line.slice(5).trim());
      } catch {
        return;
      }
      if (ev.t === 'delta' && typeof ev.v === 'string') {
        full += ev.v;
        onText(full);
      } else if (ev.t === 'done') finished = true;
      else if (ev.t === 'error') throw partialError(ev.error?.code ?? 'server', ev.error?.message ?? 'The answer was interrupted. Please try again.');
    };
    try {
      for (;;) {
        arm();
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf('\n')) >= 0) {
          handle(buf.slice(0, nl).replace(/\r$/, ''));
          buf = buf.slice(nl + 1);
        }
      }
      if (buf) handle(buf.replace(/\r$/, ''));
    } catch (e) {
      if (e instanceof ChemoError) throw e;
      if (outer?.aborted) throw e;
      if (timedOut) throw partialError('client_timeout', 'The answer stopped arriving. Please try again.');
      throw partialError('network', 'The connection dropped while the answer was arriving. Please try again.');
    }
    if (!full.trim()) throw partialError('server', 'The server sent an empty answer. Please try again.');
    if (!finished) throw partialError('network', 'The answer was cut off. Please try again.');
    return full;
  } finally {
    if (timer) clearTimeout(timer);
    outer?.removeEventListener('abort', onOuter);
  }
}
