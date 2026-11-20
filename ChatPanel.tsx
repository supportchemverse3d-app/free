import { useCallback, useEffect, useRef, useState } from 'react';
import type { MoleculeRecord } from '../../content/molecule.ts';
import { Formula } from '../../lib/Formula.tsx';
import { ChemoError, streamChat } from '../api.ts';
import { buildMoleculeContext, getViewerSelection } from '../moleculeContext.ts';
import { LANG_LABEL, type Quick } from '../prompts.ts';
import { LANGS, LIMITS, type ChatMessage, type Lang, type Mode } from '../protocol.ts';
import { chatsInScope, chatTitle, deleteChat, getChat, latestChatInScope, newChatId, saveChat, scopeKey, type StoredChat } from '../storage.ts';
import { Rich } from './Rich.tsx';

/** How many recent messages are sent with each request (keeps cost and latency bounded). */
const HISTORY_SENT = 8;

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    document.body.removeChild(ta);
    return ok;
  }
}

export interface ChatPanelProps {
  /** Optional small labels shown above the chat, e.g. the open molecule. */
  contextChips?: string[];
  molecule?: MoleculeRecord;
  quick: Quick[];
  lang: Lang;
  onLang: (l: Lang) => void;
  /** Open this stored chat instead of the latest chat of the scope. */
  chatId?: string;
  emptyHint: string;
}

function Dots() {
  return (
    <span className="chemo-dots" aria-hidden="true"><i /><i /><i /></span>
  );
}

export function ChatPanel({ contextChips = [], molecule, quick, lang, onLang, chatId, emptyHint }: ChatPanelProps) {
  const moleculeId = molecule?.meta.id;
  const scope = scopeKey(moleculeId);
  const [id, setId] = useState<string>(() => newChatId());
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [inputMode, setInputMode] = useState<Mode>('chat');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ChemoError | null>(null);
  const [live, setLive] = useState('');
  const [copied, setCopied] = useState<number | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [historyTick, setHistoryTick] = useState(0);
  const created = useRef<number>(Date.now());
  const lastMode = useRef<Mode>('chat');
  const abort = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const liveRef = useRef('');
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback((chat: StoredChat | undefined) => {
    abort.current?.abort();
    setBusy(false);
    setError(null);
    setLive('');
    liveRef.current = '';
    setInput('');
    setInputMode('chat');
    if (chat) {
      setId(chat.id);
      setMessages(chat.messages);
      created.current = chat.createdAt;
    } else {
      setId(newChatId());
      setMessages([]);
      created.current = Date.now();
    }
  }, []);

  // Open the requested chat, or continue the latest chat of this scope, whenever the scope changes.
  useEffect(() => {
    load((chatId ? getChat(chatId) : undefined) ?? latestChatInScope(scope));
    setShowHistory(false);
  }, [scope, chatId, load]);

  useEffect(() => () => {
    abort.current?.abort();
    if (flushTimer.current) clearTimeout(flushTimer.current);
  }, []);

  // Grow the message box with its content (fallback for WebViews without field-sizing).
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 144)}px`;
  }, [input]);

  useEffect(() => {
    if (messages.length > 0 || busy || error) endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length, busy, error]);

  // While text streams in, follow it only if the student is already near the bottom.
  useEffect(() => {
    if (live && window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 220) endRef.current?.scrollIntoView({ block: 'end' });
  }, [live]);

  const persist = useCallback(
    (next: ChatMessage[]) => {
      if (next.length === 0) return;
      saveChat({ id, title: chatTitle(next), createdAt: created.current, updatedAt: Date.now(), scope, ...(moleculeId ? { moleculeId } : {}), lang, messages: next });
      setHistoryTick((t) => t + 1);
    },
    [id, scope, moleculeId, lang],
  );

  const pushLive = useCallback((text: string) => {
    liveRef.current = text;
    if (flushTimer.current) return;
    flushTimer.current = setTimeout(() => {
      flushTimer.current = null;
      setLive(liveRef.current);
    }, 60); // at most ~16 re-renders per second
  }, []);

  const run = useCallback(
    async (history: ChatMessage[], mode: Mode) => {
      abort.current?.abort();
      const ctl = new AbortController();
      abort.current = ctl;
      lastMode.current = mode;
      setBusy(true);
      setError(null);
      liveRef.current = '';
      setLive('');
      let sent = history.slice(-HISTORY_SENT);
      while (sent.length > 1 && sent[0]!.role === 'assistant') sent = sent.slice(1);
      try {
        const reply = await streamChat(
          {
            messages: sent,
            lang,
            mode,
            ...(molecule ? { molecule: buildMoleculeContext(molecule, getViewerSelection(molecule.meta.id)) } : {}),
          },
          pushLive,
          ctl.signal,
        );
        if (ctl.signal.aborted) return;
        const next: ChatMessage[] = [...history, { role: 'assistant', content: reply }];
        setMessages(next);
        persist(next);
        setInputMode(mode === 'practice' || mode === 'test' ? 'check' : 'chat');
      } catch (e) {
        if (ctl.signal.aborted) return;
        const err = e instanceof ChemoError ? e : new ChemoError('server', 'Something went wrong. Please try again.');
        if (err.partial) liveRef.current = err.partial;
        setError(err);
      } finally {
        if (abort.current === ctl) {
          setBusy(false);
          if (flushTimer.current) {
            clearTimeout(flushTimer.current);
            flushTimer.current = null;
          }
          setLive(liveRef.current && !ctl.signal.aborted ? liveRef.current : '');
        }
      }
    },
    [lang, molecule, persist, pushLive],
  );

  /** Stop generating: keep whatever text has arrived as the answer. */
  const stop = () => {
    const partial = liveRef.current.trim();
    abort.current?.abort();
    if (flushTimer.current) {
      clearTimeout(flushTimer.current);
      flushTimer.current = null;
    }
    setBusy(false);
    setError(null);
    if (partial) {
      const next: ChatMessage[] = [...messages, { role: 'assistant', content: liveRef.current }];
      setMessages(next);
      persist(next);
    }
    liveRef.current = '';
    setLive('');
  };

  const regenerate = () => {
    if (busy || messages.length < 2 || messages[messages.length - 1]!.role !== 'assistant') return;
    const base = messages.slice(0, -1);
    setMessages(base);
    persist(base);
    void run(base, lastMode.current);
  };

  const copy = async (i: number, text: string) => {
    if (await copyText(text)) {
      setCopied(i);
      setTimeout(() => setCopied((c) => (c === i ? null : c)), 1500);
    }
  };

  const submit = (text: string, mode: Mode) => {
    const t = text.trim();
    if (!t || busy) return;
    const next: ChatMessage[] = [...messages, { role: 'user', content: t.slice(0, LIMITS.messageChars) }];
    setMessages(next);
    persist(next);
    setInput('');
    setInputMode('chat');
    void run(next, mode);
  };

  const retry = () => {
    if (busy || messages.length === 0 || messages[messages.length - 1]!.role !== 'user') return;
    void run(messages, lastMode.current);
  };

  const history = chatsInScope(scope);
  void historyTick;
  const sel = molecule ? getViewerSelection(molecule.meta.id) : null;
  const selLabel = molecule && sel ? (sel.kind === 'atom' ? `${molecule.atoms[sel.index]?.element ?? '?'}${sel.index + 1}` : `${molecule.atoms[sel.a]?.element ?? '?'}${sel.a + 1}–${molecule.atoms[sel.b]?.element ?? '?'}${sel.b + 1}`) : null;

  return (
    <section aria-label="Chemo AI chat" className="flex min-h-0 flex-col">
      <div className="rounded-2xl border border-white/[.07] bg-[#111b25] px-3.5 py-3">
        {contextChips.length > 0 && <div className="mb-2.5 flex flex-wrap items-center gap-1.5" aria-label="Chat context">
          {contextChips.map((c, i) => (
            <span key={i} className={`rounded-md px-2 py-0.5 text-[11px] ${i === contextChips.length - 1 ? 'bg-[#1b3939] font-semibold text-[#7eeadf]' : 'bg-white/[.05] text-slate-400'}`}>{c}</span>
          ))}
        </div>}
        {molecule && (
          <p className="mt-2 text-[11.5px] leading-snug text-slate-400">
            Chemo AI receives this molecule's structure data: <span className="text-slate-200">{molecule.name}</span> (<Formula text={molecule.formula} />), {molecule.atoms.length} atoms, {molecule.bonds.length} bonds{selLabel ? `, selected ${selLabel}` : ', nothing selected'}. It reads the data; it cannot see the 3D view. <a href={`#/m/${molecule.meta.id}`} className="text-[#6fe3d8] underline underline-offset-2">Back to 3D view</a>
          </p>
        )}
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <div role="group" aria-label="Answer language" className="flex rounded-lg border border-white/10 p-0.5">
            {LANGS.map((l) => (
              <button key={l} type="button" aria-pressed={lang === l} onClick={() => onLang(l)} className={`rounded-md px-2.5 py-1 text-xs font-medium ${lang === l ? 'bg-[#1b3939] text-[#7eeadf]' : 'text-slate-400'}`}>{LANG_LABEL[l]}</button>
            ))}
          </div>
          <div className="ml-auto flex gap-1.5">
            <button type="button" onClick={() => setShowHistory((v) => !v)} aria-expanded={showHistory} className="rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-slate-300">History ({history.length})</button>
            <button type="button" onClick={() => load(undefined)} disabled={messages.length === 0} className="rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-slate-300 disabled:opacity-40">New chat</button>
          </div>
        </div>
        {showHistory && (
          <ul className="mt-2.5 max-h-52 divide-y divide-white/[.06] overflow-y-auto rounded-lg border border-white/[.07]">
            {history.length === 0 && <li className="px-3 py-2 text-xs text-slate-500">No saved chats here yet.</li>}
            {history.map((c) => (
              <li key={c.id} className="flex items-center">
                <button type="button" onClick={() => { load(c); setShowHistory(false); }} className={`min-w-0 flex-1 px-3 py-2 text-left text-xs ${c.id === id ? 'text-[#7eeadf]' : 'text-slate-300'}`}>
                  <span className="block truncate">{c.title}</span>
                  <span className="text-[10px] text-slate-500">{new Date(c.updatedAt).toLocaleString()} · {c.messages.length} messages</span>
                </button>
                <button type="button" aria-label={`Delete chat ${c.title}`} onClick={() => { deleteChat(c.id); if (c.id === id) load(undefined); setHistoryTick((t) => t + 1); }} className="px-3 py-2 text-[11px] text-slate-500">Delete</button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-3 space-y-4" aria-live="polite">
        {messages.length === 0 && !busy && <p className="px-1 text-sm text-slate-400">{emptyHint}</p>}
        {messages.map((m, i) =>
          m.role === 'user' ? (
            <div key={i} className="flex justify-end"><div className="max-w-[88%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-[#1b3939] px-3.5 py-2.5 text-[14.5px] leading-relaxed text-slate-100">{m.content}</div></div>
          ) : (
            <article key={i} className="min-w-0">
              <p className="mb-1 text-[10px] font-bold uppercase tracking-[.16em] text-[#64d9ce]">Chemo AI</p>
              <Rich text={m.content} />
              <div className="mt-1.5 flex gap-1">
                <button type="button" onClick={() => void copy(i, m.content)} className="rounded-md px-2 py-1 text-[11px] text-slate-500 hover:text-slate-300">{copied === i ? 'Copied' : 'Copy'}</button>
                {i === messages.length - 1 && !busy && i > 0 && <button type="button" onClick={regenerate} className="rounded-md px-2 py-1 text-[11px] text-slate-500 hover:text-slate-300">Regenerate</button>}
              </div>
            </article>
          ),
        )}
        {(busy || (error && live)) && live && (
          <article className="min-w-0">
            <p className="mb-1 text-[10px] font-bold uppercase tracking-[.16em] text-[#64d9ce]">Chemo AI</p>
            <Rich text={live} />
          </article>
        )}
        {busy && !live && (
          <div className="flex items-center gap-2 text-sm text-slate-400" role="status"><Dots /><span>Chemo AI is thinking…</span></div>
        )}
        {error && (
          <div role="alert" className="rounded-xl border border-red-400/30 bg-red-950/30 px-3.5 py-3 text-sm text-red-100">
            <p>{error.message}</p>
            {error.retryable && <button type="button" onClick={retry} className="mt-2 rounded-lg border border-red-300/40 px-3 py-1.5 text-xs font-semibold">Retry</button>}
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="chemo-input-bar mt-4">
        {quick.length > 0 && (
          <div className="mb-2 flex gap-1.5 overflow-x-auto pb-1" role="group" aria-label="Quick actions">
            {quick.map((qa) => (
              <button key={qa.id} type="button" disabled={busy} onClick={() => submit(qa.text, qa.mode)} className="shrink-0 rounded-full border border-white/10 bg-[#142431] px-3 py-1.5 text-xs text-slate-200 disabled:opacity-40">{qa.label}</button>
            ))}
          </div>
        )}
        <form
          onSubmit={(e) => { e.preventDefault(); submit(input, inputMode); }}
          className="flex items-end gap-2 rounded-2xl border border-white/10 bg-[#0e1823] p-2"
        >
          <div className="min-w-0 flex-1">
            <button type="button" onClick={() => setInputMode((m) => (m === 'check' ? 'chat' : 'check'))} aria-pressed={inputMode === 'check'} className={`mb-1 rounded-md px-2 py-0.5 text-[11px] ${inputMode === 'check' ? 'bg-[#1b3939] font-semibold text-[#7eeadf]' : 'bg-white/[.05] text-slate-400'}`}>
              {inputMode === 'check' ? 'Checking my answer' : 'Check my answer'}
            </button>
            <textarea
              ref={taRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && window.matchMedia?.('(pointer: fine)').matches) { e.preventDefault(); submit(input, inputMode); }
              }}
              rows={1}
              maxLength={4000}
              placeholder={inputMode === 'check' ? 'Type the question and your answer' : 'Ask a question'}
              aria-label="Message"
              className="chemo-textarea"
            />
          </div>
          {busy ? (
            <button type="button" onClick={stop} aria-label="Stop generating" className="h-10 shrink-0 rounded-xl border border-[#3bb8ad]/60 px-4 text-sm font-bold text-[#7eeadf]">Stop</button>
          ) : (
            <button type="submit" disabled={input.trim() === ''} aria-label="Send" className="h-10 shrink-0 rounded-xl bg-[#3bb8ad] px-4 text-sm font-bold text-[#06201e] disabled:opacity-40">Send</button>
          )}
        </form>
      </div>
    </section>
  );
}
