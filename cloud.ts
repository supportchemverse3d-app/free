/**
 * Optional Supabase sign-in and chat sync. Talks to Supabase's REST endpoints with fetch (no extra library).
 * Only the publishable key is used. Data is protected by row level security (see supabase/schema.sql),
 * so each signed-in student can read and write only their own chats. The app works fully without signing in.
 */
import { chemoConfig } from './api.ts';
import { getChat, loadChats, saveChat, setChatHooks, type StoredChat } from './storage.ts';

export interface Session {
  accessToken: string;
  refreshToken: string;
  /** Unix seconds. */
  expiresAt: number;
  userId: string;
  email: string;
}

export class CloudError extends Error {}

const SESSION_KEY = 'chemverse.chemo.session.v1';
const TABLE = 'chemo_chats';

/* ------------------------------------------------------------ session storage */
export function loadSession(): Session | null {
  try {
    const v = JSON.parse(window.localStorage.getItem(SESSION_KEY) ?? 'null') as Partial<Session> | null;
    if (v && typeof v.accessToken === 'string' && typeof v.refreshToken === 'string' && typeof v.expiresAt === 'number' && typeof v.userId === 'string' && typeof v.email === 'string') return v as Session;
  } catch {
    /* ignore */
  }
  return null;
}
function saveSession(s: Session | null): void {
  try {
    if (s) window.localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else window.localStorage.removeItem(SESSION_KEY);
  } catch {
    /* storage unavailable */
  }
}

/* --------------------------------------------------------------------- http */
async function conf(): Promise<{ url: string; key: string } | null> {
  const c = await chemoConfig();
  return c.supabaseUrl && c.supabaseKey ? { url: c.supabaseUrl, key: c.supabaseKey } : null;
}
export async function cloudAvailable(): Promise<boolean> {
  return (await conf()) !== null;
}

function errorText(body: unknown, status: number): string {
  const b = body as { error_description?: string; msg?: string; message?: string; error?: string } | null;
  const m = b?.error_description ?? b?.msg ?? b?.message ?? b?.error;
  if (typeof m === 'string' && m) {
    if (/invalid login credentials/i.test(m)) return 'Wrong email or password.';
    if (/email not confirmed/i.test(m)) return 'Confirm your email first. Check your inbox for the link from Supabase.';
    if (/already registered/i.test(m)) return 'This email already has an account. Use Sign in.';
    if (/password should be at least/i.test(m)) return 'Password is too short. Use at least 6 characters.';
    return m;
  }
  return `Request failed (HTTP ${status}).`;
}

async function call(path: string, init: RequestInit & { token?: string; headers?: Record<string, string> } = {}): Promise<unknown> {
  const c = await conf();
  if (!c) throw new CloudError('Cloud sync is not set up in this app.');
  const { token, headers, ...rest } = init;
  let res: Response;
  try {
    res = await fetch(`${c.url}${path}`, { ...rest, headers: { apikey: c.key, authorization: `Bearer ${token ?? c.key}`, 'content-type': 'application/json', ...headers } });
  } catch {
    throw new CloudError('Could not reach the cloud. Check your internet connection.');
  }
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (!res.ok) throw new CloudError(errorText(body, res.status));
  return body;
}

/* --------------------------------------------------------------------- auth */
interface TokenBody {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  expires_at?: number;
  user?: { id?: string; email?: string };
}
function toSession(b: TokenBody | null, fallbackEmail: string): Session | null {
  if (!b || typeof b.access_token !== 'string' || typeof b.refresh_token !== 'string' || !b.user?.id) return null;
  const expiresAt = typeof b.expires_at === 'number' ? b.expires_at : Math.floor(Date.now() / 1000) + (b.expires_in ?? 3600);
  return { accessToken: b.access_token, refreshToken: b.refresh_token, expiresAt, userId: b.user.id, email: b.user.email ?? fallbackEmail };
}

export async function signIn(email: string, password: string): Promise<Session> {
  const body = (await call('/auth/v1/token?grant_type=password', { method: 'POST', body: JSON.stringify({ email, password }) })) as TokenBody;
  const s = toSession(body, email);
  if (!s) throw new CloudError('Sign-in did not return a session. Please try again.');
  saveSession(s);
  return s;
}

/** Returns the new session, or null when the project requires email confirmation first. */
export async function signUp(email: string, password: string): Promise<Session | null> {
  const body = (await call('/auth/v1/signup', { method: 'POST', body: JSON.stringify({ email, password }) })) as TokenBody;
  const s = toSession(body, email);
  if (s) saveSession(s);
  return s;
}

export async function signOut(): Promise<void> {
  const s = loadSession();
  saveSession(null);
  if (s) {
    try {
      await call('/auth/v1/logout', { method: 'POST', token: s.accessToken });
    } catch {
      /* the local session is already gone; the server token simply expires */
    }
  }
}

/** A session whose access token is valid for at least a minute, refreshing it when needed. Null if signed out. */
export async function validSession(now = Date.now()): Promise<Session | null> {
  const s = loadSession();
  if (!s) return null;
  if (s.expiresAt - now / 1000 > 60) return s;
  try {
    const body = (await call('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: JSON.stringify({ refresh_token: s.refreshToken }) })) as TokenBody;
    const next = toSession(body, s.email);
    if (!next) throw new CloudError('Session expired');
    saveSession(next);
    return next;
  } catch (e) {
    // A refresh token that Supabase rejects means the student must sign in again; a network error does not.
    if (e instanceof CloudError && !/reach the cloud/.test(e.message)) saveSession(null);
    return null;
  }
}

/* --------------------------------------------------------------------- data */
interface Row {
  id: string;
  updated_at: number;
  data: StoredChat;
}
const isChat = (c: unknown): c is StoredChat =>
  typeof c === 'object' && c !== null && typeof (c as StoredChat).id === 'string' && Array.isArray((c as StoredChat).messages) && typeof (c as StoredChat).scope === 'string';

export async function fetchRemoteChats(s: Session): Promise<StoredChat[]> {
  const rows = (await call(`/rest/v1/${TABLE}?select=id,updated_at,data&order=updated_at.desc&limit=40`, { method: 'GET', token: s.accessToken })) as Row[] | null;
  return (rows ?? []).map((r) => r.data).filter(isChat);
}
export async function pushRemoteChat(s: Session, chat: StoredChat): Promise<void> {
  await call(`/rest/v1/${TABLE}?on_conflict=id`, {
    method: 'POST',
    token: s.accessToken,
    headers: { prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify([{ id: chat.id, title: chat.title, updated_at: chat.updatedAt, data: chat }]),
  });
}
export async function deleteRemoteChat(s: Session, id: string): Promise<void> {
  await call(`/rest/v1/${TABLE}?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE', token: s.accessToken, headers: { prefer: 'return=minimal' } });
}

/** Newer copy wins. Chats missing on one side are copied to it. */
export function mergeChats(local: StoredChat[], remote: StoredChat[]): { toSave: StoredChat[]; toPush: StoredChat[] } {
  const l = new Map(local.map((c) => [c.id, c]));
  const r = new Map(remote.map((c) => [c.id, c]));
  const toSave: StoredChat[] = [];
  const toPush: StoredChat[] = [];
  for (const [id, rc] of r) {
    const lc = l.get(id);
    if (!lc || rc.updatedAt > lc.updatedAt) toSave.push(rc);
    else if (lc.updatedAt > rc.updatedAt) toPush.push(lc);
  }
  for (const [id, lc] of l) if (!r.has(id)) toPush.push(lc);
  return { toSave, toPush };
}

/* --------------------------------------------------------------------- sync */
export type SyncStatus = 'off' | 'syncing' | 'ok' | 'error';
let status: SyncStatus = 'off';
let lastError = '';
const listeners = new Set<() => void>();
const setStatus = (s: SyncStatus, err = ''): void => {
  status = s;
  lastError = err;
  listeners.forEach((f) => f());
};
export const syncState = (): { status: SyncStatus; error: string } => ({ status, error: lastError });
export const onSyncChange = (f: () => void): (() => void) => {
  listeners.add(f);
  return () => listeners.delete(f);
};

/** Pulls remote chats, merges by recency, and pushes anything newer from this device. */
export async function syncAll(): Promise<void> {
  const s = await validSession();
  if (!s) {
    setStatus('off');
    return;
  }
  setStatus('syncing');
  try {
    const { toSave, toPush } = mergeChats(loadChats(), await fetchRemoteChats(s));
    for (const c of toSave) saveChat(c, { silent: true });
    for (const c of toPush) await pushRemoteChat(s, c);
    setStatus('ok');
  } catch (e) {
    setStatus('error', e instanceof CloudError ? e.message : 'Sync failed.');
  }
}

const pending = new Map<string, ReturnType<typeof setTimeout>>();
let started = false;

/** Keeps the cloud copy up to date after each change made in the app. Safe to call more than once. */
export function startCloudSync(): void {
  if (started) return;
  started = true;
  setChatHooks({
    saved: (chat) => {
      if (!loadSession()) return;
      const prev = pending.get(chat.id);
      if (prev) clearTimeout(prev);
      pending.set(chat.id, setTimeout(async () => {
        pending.delete(chat.id);
        const s = await validSession();
        const latest = getChat(chat.id);
        if (!s || !latest) return;
        try {
          await pushRemoteChat(s, latest);
          setStatus('ok');
        } catch (e) {
          setStatus('error', e instanceof CloudError ? e.message : 'Sync failed.');
        }
      }, 1500));
    },
    deleted: (id) => {
      void (async () => {
        const s = await validSession();
        if (!s) return;
        try {
          await deleteRemoteChat(s, id);
        } catch (e) {
          setStatus('error', e instanceof CloudError ? e.message : 'Sync failed.');
        }
      })();
    },
  });
  void syncAll();
}
