import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { getMolecule } from '../../data/library.ts';
import { moleculeQuick } from '../prompts.ts';
import { getViewerSelection } from '../moleculeContext.ts';
import { deleteChat, getChat, loadChats, loadPrefs, savePrefs, type Prefs } from '../storage.ts';
import { cloudAvailable, loadSession, onSyncChange, signIn, signOut, signUp, startCloudSync, syncAll, syncState, type Session } from '../cloud.ts';
import { ChatPanel } from './ChatPanel.tsx';

function usePrefs(): [Prefs, (p: Partial<Prefs>) => void] {
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  const update = (p: Partial<Prefs>) => {
    setPrefs((cur) => {
      const next = { ...cur, ...p };
      savePrefs(next);
      return next;
    });
  };
  return [prefs, update];
}


function Header({ crumbs, title, sub }: { crumbs: { label: string; href: string }[]; title: string; sub?: ReactNode }) {
  return (
    <header className="mb-4">
      <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-x-1.5 text-[12px] text-slate-500">
        {crumbs.map((c, i) => (
          <span key={c.href} className="flex items-center gap-1.5">
            {i > 0 && <span aria-hidden="true">/</span>}
            <a href={c.href} className="hover:text-slate-300">{c.label}</a>
          </span>
        ))}
      </nav>
      <h1 className="mt-1.5 text-[22px] font-bold leading-tight tracking-tight text-slate-50">{title}</h1>
      {sub && <p className="mt-1 text-sm text-slate-400">{sub}</p>}
    </header>
  );
}

function Missing({ what }: { what: string }) {
  return (
    <div className="mx-auto max-w-md space-y-3 py-14 text-center">
      <p className="text-lg font-semibold text-slate-100">{what} was not found</p>
      <p className="text-sm text-slate-400">The link may be old.</p>
      <a href="#/ai" className="inline-block rounded-xl border border-border bg-surface px-4 py-2 text-sm text-slate-100">Back to Chemo AI</a>
    </div>
  );
}

/* ------------------------------------------------------------ Account */
const inputCls = 'block w-full rounded-lg border border-white/10 bg-[#0e1823] px-3 py-2 text-[16px] text-slate-100 placeholder:text-slate-500';

/** Optional sign-in so chats follow the student to other devices. Hidden when no Supabase project is configured. */
function AccountBox({ onSynced }: { onSynced: () => void }) {
  const [available, setAvailable] = useState(false);
  const [session, setSession] = useState<Session | null>(loadSession);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState<{ error: boolean; text: string } | null>(null);
  const [working, setWorking] = useState(false);
  const [sync, setSync] = useState(syncState);

  useEffect(() => {
    let live = true;
    void cloudAvailable().then((a) => { if (live) setAvailable(a); });
    const off = onSyncChange(() => {
      setSync(syncState());
      onSynced();
    });
    return () => { live = false; off(); };
  }, [onSynced]);

  if (!available) return null;

  const valid = () => {
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) { setMsg({ error: true, text: 'Enter a valid email address.' }); return false; }
    if (password.length < 6) { setMsg({ error: true, text: 'Password must be at least 6 characters.' }); return false; }
    return true;
  };
  const run = async (mode: 'in' | 'up') => {
    if (working || !valid()) return;
    setWorking(true);
    setMsg(null);
    try {
      const s = mode === 'in' ? await signIn(email.trim(), password) : await signUp(email.trim(), password);
      if (s) {
        setSession(s);
        setPassword('');
        setOpen(false);
        await syncAll();
      } else {
        setMsg({ error: false, text: 'Account created. Open the confirmation email, then come back and press Sign in.' });
      }
    } catch (e) {
      setMsg({ error: true, text: e instanceof Error ? e.message : 'Something went wrong. Please try again.' });
    } finally {
      setWorking(false);
    }
  };

  if (session) {
    return (
      <section aria-label="Account" className="mt-7 rounded-xl border border-white/[.07] px-3.5 py-3">
        <p className="text-sm text-slate-100">Signed in as <span className="font-semibold">{session.email}</span></p>
        <p className="mt-0.5 text-xs text-slate-400" role="status">
          {sync.status === 'syncing' ? 'Syncing chats…' : sync.status === 'ok' ? 'Chats are synced to your account.' : sync.status === 'error' ? `Sync problem: ${sync.error}` : 'Chats sync when you are online.'}
        </p>
        <div className="mt-2 flex gap-2">
          <button type="button" onClick={() => void syncAll()} className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-200">Sync now</button>
          <button type="button" onClick={() => void signOut().then(() => { setSession(null); setSync(syncState()); })} className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-200">Sign out</button>
        </div>
      </section>
    );
  }
  return (
    <section aria-label="Account" className="mt-7 rounded-xl border border-white/[.07] px-3.5 py-3">
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between text-left text-sm text-slate-100">
        <span><span className="font-semibold">Sign in to keep your chats</span><span className="block text-xs text-slate-400">Optional. Chats then follow you to other devices.</span></span>
        <span aria-hidden="true" className="text-slate-500">{open ? '–' : '+'}</span>
      </button>
      {open && (
        <form className="mt-3 space-y-2" onSubmit={(e) => { e.preventDefault(); void run('in'); }}>
          <input type="email" autoComplete="email" inputMode="email" placeholder="Email" aria-label="Email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
          <input type="password" autoComplete="current-password" placeholder="Password (6 or more characters)" aria-label="Password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls} />
          {msg && <p role={msg.error ? 'alert' : 'status'} className={`text-xs ${msg.error ? 'text-red-300' : 'text-[#7eeadf]'}`}>{msg.text}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={working} className="rounded-lg bg-[#3bb8ad] px-4 py-2 text-sm font-bold text-[#06201e] disabled:opacity-50">{working ? 'Please wait…' : 'Sign in'}</button>
            <button type="button" disabled={working} onClick={() => void run('up')} className="rounded-lg border border-white/10 px-4 py-2 text-sm text-slate-200 disabled:opacity-50">Create account</button>
          </div>
        </form>
      )}
    </section>
  );
}

/* ---------------------------------------------------------------- Chat */
function ChemoHome() {
  const [prefs, setPrefs] = usePrefs();
  const refresh = useCallback(() => {}, []);
  return (
    <div className="mx-auto max-w-2xl">
      <header className="mb-4">
        <p className="eyebrow">CHEMVERSE</p>
        <h1 className="mt-1 text-[26px] font-bold tracking-tight text-slate-50">Chemo AI</h1>
        <p className="mt-1 text-sm text-slate-400">Ask any study question. You get a clear explanation with worked examples.</p>
      </header>
      <ChatPanel quick={[]} lang={prefs.lang} onLang={(l) => setPrefs({ lang: l })} emptyHint="Type your question below. Chemo AI answers educational questions only." />
      <AccountBox onSynced={refresh} />
      <p className="mt-6 text-sm"><a href="#/ai/history" className="text-[#6fe3d8]">See all chats</a></p>
    </div>
  );
}

/* ------------------------------------------------------- All chats */
function HistoryPage() {
  const [chats, setChats] = useState(() => loadChats());
  return (
    <div className="mx-auto max-w-2xl">
      <Header crumbs={[{ label: 'Chemo AI', href: '#/ai' }]} title="Chat history" sub="Saved on this device only." />
      {chats.length === 0 && <p className="text-sm text-slate-400">No saved chats yet.</p>}
      <ul>
        {chats.map((c) => (
          <li key={c.id} className="flex items-center border-b border-white/[.07] last:border-b-0">
            <a href={`#/ai/h/${c.id}`} className="min-w-0 flex-1 px-1 py-3">
              <span className="block truncate text-sm text-slate-100">{c.title}</span>
              <span className="block truncate text-[11px] text-slate-500">{c.moleculeId ? 'Molecule chat' : 'Chat'} · {new Date(c.updatedAt).toLocaleDateString()}</span>
            </a>
            <button type="button" aria-label={`Delete chat ${c.title}`} onClick={() => { deleteChat(c.id); setChats(loadChats()); }} className="px-3 py-2 text-xs text-slate-500">Delete</button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------ Molecule chat */
function MoleculeChat({ moleculeId }: { moleculeId: string }) {
  const [prefs, setPrefs] = usePrefs();
  const molecule = getMolecule(moleculeId);
  if (!molecule) return <Missing what="This molecule" />;
  const hasSel = getViewerSelection(molecule.meta.id) !== null;
  return (
    <div className="mx-auto max-w-2xl">
      <Header crumbs={[{ label: 'Chemo AI', href: '#/ai' }, { label: molecule.name, href: `#/m/${molecule.meta.id}` }]} title={`Ask about ${molecule.name}`} />
      <ChatPanel
        contextChips={['3D molecule', molecule.name]}
        molecule={molecule}
        quick={moleculeQuick(prefs.lang, hasSel)}
        lang={prefs.lang}
        onLang={(l) => setPrefs({ lang: l })}
        emptyHint="Ask about the structure, or use a quick action. Answers use the stored 3D data of this molecule."
      />
    </div>
  );
}

/* ------------------------------------------------------ Saved chat */
function SavedChat({ chatId }: { chatId: string }) {
  const [prefs, setPrefs] = usePrefs();
  const chat = getChat(chatId);
  const molecule = chat?.moleculeId ? getMolecule(chat.moleculeId) : undefined;
  if (!chat) return <Missing what="This chat" />;
  return (
    <div className="mx-auto max-w-2xl">
      <Header crumbs={[{ label: 'Chemo AI', href: '#/ai' }]} title={chat.title} />
      <ChatPanel {...(molecule ? { molecule } : {})} quick={[]} lang={prefs.lang} onLang={(l) => setPrefs({ lang: l })} chatId={chat.id} emptyHint="" />
    </div>
  );
}

/* ------------------------------------------------------------- Router */
export function ChemoAI({ args }: { args: string[] }) {
  useEffect(() => {
    document.title = 'Chemo AI · CHEMVERSE';
    startCloudSync();
  }, []);
  const [a, b] = args;
  if (a === 'history') return <HistoryPage />;
  if (a === 'm' && b) return <MoleculeChat key={b} moleculeId={b} />;
  if (a === 'h' && b) return <SavedChat key={b} chatId={b} />;
  // Everything else, including old subject/chapter links, opens the chat.
  return <ChemoHome />;
}
