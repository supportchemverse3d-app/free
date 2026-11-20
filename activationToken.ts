/** Small, import-free helpers for the activation code, so the AI client can use them without import loops. */
export const TOKEN_KEY = 'chemverse-activation-v1';
export const DEVICE_KEY = 'chemverse-device-id-v1';
export const DEACTIVATED_EVENT = 'chemverse-deactivated';

function store(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function getToken(): string {
  try {
    return store()?.getItem(TOKEN_KEY) ?? '';
  } catch {
    return '';
  }
}
export function setToken(token: string): void {
  try {
    store()?.setItem(TOKEN_KEY, token);
  } catch {
    /* blocked storage: the student has to activate again next time */
  }
}
export function clearToken(): void {
  try {
    store()?.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

const ID_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';
export function makeDeviceId(random: () => number = Math.random): string {
  return 'd' + Array.from({ length: 23 }, () => ID_CHARS[Math.floor(random() * ID_CHARS.length) % ID_CHARS.length]).join('');
}
/** One random id per install. Reinstalling gives a new id, so the code's phone limit applies again. */
export function getDeviceId(): string {
  try {
    const have = store()?.getItem(DEVICE_KEY);
    if (have && /^[A-Za-z0-9_-]{8,64}$/.test(have)) return have;
  } catch {
    /* fall through */
  }
  const fresh = makeDeviceId();
  try {
    store()?.setItem(DEVICE_KEY, fresh);
  } catch {
    /* ignore */
  }
  return fresh;
}

/** Finds a code like CHEM-AB12-CD34 inside whatever the student typed or pasted (even a whole WhatsApp message). */
export function extractCode(text: string): string | null {
  const t = text.toUpperCase();
  const m = /CHEM[\s-]*([A-Z0-9]{4})[\s-]*([A-Z0-9]{4})/.exec(t);
  return m ? `CHEM-${m[1]}-${m[2]}` : null;
}
