import { LANGS, type ChatMessage, type Lang } from './protocol.ts';

export interface StoredChat {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  /** Groups chats of the same subject/chapter/topic (or molecule). */
  scope: string;
  moleculeId?: string;
  lang: Lang;
  messages: ChatMessage[];
}

export interface Prefs {
  lang: Lang;
}

const CHATS_KEY = 'chemverse.chemo.chats.v1';
const PREFS_KEY = 'chemverse.chemo.prefs.v1';
const MAX_CHATS = 40;
const DEFAULT_PREFS: Prefs = { lang: 'english' };

function readJson(key: string): unknown {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function writeJson(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable or full: chat still works for this session */
  }
}

export function loadPrefs(): Prefs {
  const v = readJson(PREFS_KEY) as Partial<Prefs> | null;
  return {
    lang: LANGS.includes(v?.lang as Lang) ? (v!.lang as Lang) : DEFAULT_PREFS.lang,
  };
}
export const savePrefs = (p: Prefs): void => writeJson(PREFS_KEY, p);

const isMessage = (m: unknown): m is ChatMessage =>
  typeof m === 'object' && m !== null && ((m as ChatMessage).role === 'user' || (m as ChatMessage).role === 'assistant') && typeof (m as ChatMessage).content === 'string';

export function loadChats(): StoredChat[] {
  const v = readJson(CHATS_KEY);
  if (!Array.isArray(v)) return [];
  return v
    .filter((c): c is StoredChat => typeof c === 'object' && c !== null && typeof c.id === 'string' && typeof c.scope === 'string' && Array.isArray(c.messages) && c.messages.every(isMessage))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Optional listeners (used by cloud sync). They run only for changes made through the app, not for imports. */
let hooks: { saved?: (c: StoredChat) => void; deleted?: (id: string) => void } = {};
export const setChatHooks = (h: typeof hooks): void => {
  hooks = h;
};

export function saveChat(chat: StoredChat, opts: { silent?: boolean } = {}): void {
  const rest = loadChats().filter((c) => c.id !== chat.id);
  writeJson(CHATS_KEY, [chat, ...rest].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_CHATS));
  if (!opts.silent) hooks.saved?.(chat);
}
export function deleteChat(id: string): void {
  writeJson(CHATS_KEY, loadChats().filter((c) => c.id !== id));
  hooks.deleted?.(id);
}
export const getChat = (id: string): StoredChat | undefined => loadChats().find((c) => c.id === id);
export const latestChatInScope = (scope: string): StoredChat | undefined => loadChats().find((c) => c.scope === scope && c.messages.length > 0);
export const chatsInScope = (scope: string): StoredChat[] => loadChats().filter((c) => c.scope === scope && c.messages.length > 0);

export const newChatId = (): string => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

export const scopeKey = (moleculeId?: string): string => (moleculeId ? `m:${moleculeId}` : 'chat');

export function chatTitle(messages: ChatMessage[]): string {
  const first = messages.find((m) => m.role === 'user')?.content.replace(/\s+/g, ' ').trim() ?? 'New chat';
  return first.length > 52 ? first.slice(0, 51) + '…' : first;
}
