/**
 * Request/response contract shared by the Chemo AI frontend and the backend (server/).
 * The backend validates every request with validateChatRequest; nothing from the client is trusted.
 */

export type Lang = 'hindi' | 'english' | 'hinglish';
export type Mode = 'teach' | 'steps' | 'examples' | 'practice' | 'test' | 'check' | 'chat';

export const LANGS: readonly Lang[] = ['hindi', 'english', 'hinglish'];
export const MODES: readonly Mode[] = ['teach', 'steps', 'examples', 'practice', 'test', 'check', 'chat'];

export const LIMITS = {
  messages: 24,
  messageChars: 6000,
  totalChars: 30000,
  field: 160,
  moleculeChars: 14000,
} as const;

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatRequest {
  messages: ChatMessage[];
  lang: Lang;
  mode: Mode;
  /** Compact text description of the open molecule (see moleculeContext.ts). Absent unless one is open. */
  molecule?: string;
  /** Ask for a Server-Sent-Events stream so the first words appear almost immediately. */
  stream?: boolean;
}

export interface ChatResponse {
  reply: string;
}

export type ErrorCode = 'bad_request' | 'rate_limited' | 'not_configured' | 'timeout' | 'upstream' | 'server' | 'not_activated';

export interface ErrorResponse {
  error: { code: ErrorCode; message: string };
}

const clean = (s: string) => s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim();

/** Throws Error(message) with a student-safe message when the body is invalid. */
export function validateChatRequest(body: unknown): ChatRequest {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) throw new Error('Request body must be a JSON object');
  const b = body as Record<string, unknown>;

  if (!LANGS.includes(b.lang as Lang)) throw new Error('lang must be hindi, english or hinglish');
  if (!MODES.includes(b.mode as Mode)) throw new Error('mode is not supported');

  if (!Array.isArray(b.messages) || b.messages.length === 0) throw new Error('messages must be a non-empty list');
  if (b.messages.length > LIMITS.messages) throw new Error('Conversation is too long. Start a new chat.');
  let total = 0;
  const messages: ChatMessage[] = b.messages.map((m, i) => {
    if (typeof m !== 'object' || m === null) throw new Error(`messages[${i}] is invalid`);
    const mo = m as Record<string, unknown>;
    if (mo.role !== 'user' && mo.role !== 'assistant') throw new Error(`messages[${i}].role is invalid`);
    if (typeof mo.content !== 'string') throw new Error(`messages[${i}].content must be text`);
    const content = clean(mo.content);
    if (content.length === 0) throw new Error(`messages[${i}] is empty`);
    if (content.length > LIMITS.messageChars) throw new Error('A message is too long');
    total += content.length;
    return { role: mo.role, content };
  });
  if (total > LIMITS.totalChars) throw new Error('Conversation is too long. Start a new chat.');
  if (messages[messages.length - 1]!.role !== 'user') throw new Error('The last message must be from the student');

  const req: ChatRequest = { messages, lang: b.lang as Lang, mode: b.mode as Mode };
  if (b.stream !== undefined && typeof b.stream !== 'boolean') throw new Error('stream must be true or false');
  if (b.stream === true) req.stream = true;
  if (b.molecule !== undefined && b.molecule !== null && b.molecule !== '') {
    if (typeof b.molecule !== 'string') throw new Error('molecule must be text');
    if (b.molecule.length > LIMITS.moleculeChars) throw new Error('Molecule data is too large');
    req.molecule = clean(b.molecule);
  }
  return req;
}
