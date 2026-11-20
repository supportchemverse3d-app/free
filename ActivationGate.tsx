import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { chemoConfig } from '../ai/api.ts';
import { clearToken, DEACTIVATED_EVENT, extractCode, getDeviceId, getToken, setToken } from '../lib/activationToken.ts';

const SUPPORT_EMAIL = 'support.chemverse.3d@gmail.com';

/** AbortSignal.timeout does not exist on older phones/browsers, which made the gate fail. */
function timeoutSignal(ms: number): AbortSignal {
  const ctl = new AbortController();
  setTimeout(() => ctl.abort(), ms);
  return ctl.signal;
}

async function post(base: string, path: string, body: unknown, ms = 15000): Promise<{ status: number; data: Record<string, any> }> {
  const res = await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: timeoutSignal(ms) });
  let data: Record<string, any> = {};
  try {
    data = await res.json();
  } catch {
    /* not JSON */
  }
  return { status: res.status, data };
}

/** A code can arrive in a link: https://site/#/activate?code=CHEM-AB12-CD34 */
function codeFromLink(): string {
  try {
    const m = /[?&]code=([^&]+)/.exec(window.location.hash + window.location.search);
    return (m && extractCode(decodeURIComponent(m[1]))) || '';
  } catch {
    return '';
  }
}

type Phase = 'checking' | 'open' | 'locked';

/**
 * Keeps the app locked until this device is activated with a code from the owner.
 * If the server has activation switched off (or no server is set), the app simply opens.
 */
export function ActivationGate({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<Phase>(() => (getToken() ? 'open' : 'checking'));
  const [base, setBase] = useState('');
  const [text, setText] = useState(codeFromLink);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [offline, setOffline] = useState(false);

  const start = useCallback(async () => {
    setOffline(false);
    let apiUrl = '';
    try {
      apiUrl = (await chemoConfig()).apiUrl;
    } catch {
      /* no config: treated as "no server" */
    }
    setBase(apiUrl);
    if (!apiUrl) {
      setPhase('open');
      return;
    }
    let required = true;
    try {
      const r = await fetch(apiUrl + '/api/activate/config', { signal: timeoutSignal(8000) });
      if (r.ok) required = (await r.json()).required === true;
      else required = false; // an older server that does not know about activation
    } catch {
      if (getToken()) {
        setPhase('open'); // offline but already activated
        return;
      }
      setOffline(true);
      setPhase('locked');
      return;
    }
    if (!required) {
      setPhase('open');
      return;
    }
    const token = getToken();
    if (!token) {
      setPhase('locked');
      return;
    }
    // Activated before: confirm quietly that the owner has not switched this code off.
    try {
      const { data } = await post(apiUrl, '/api/activate/check', { token }, 8000);
      if (data.valid === false) {
        clearToken();
        setMsg('This activation is no longer valid. Please enter a new code.');
        setPhase('locked');
      } else setPhase('open');
    } catch {
      setPhase('open');
    }
  }, []);

  useEffect(() => {
    void start();
    const onOut = () => {
      setMsg('This device is not activated any more. Please enter your code.');
      setPhase('locked');
    };
    window.addEventListener(DEACTIVATED_EVENT, onOut);
    return () => window.removeEventListener(DEACTIVATED_EVENT, onOut);
  }, [start]);

  const activate = async () => {
    setMsg('');
    const code = extractCode(text);
    if (!code) {
      setMsg('Please enter a code that looks like CHEM-AB12-CD34.');
      return;
    }
    setBusy(true);
    try {
      const { status, data } = await post(base, '/api/activate', { code, deviceId: getDeviceId() });
      if (status === 200 && typeof data.token === 'string') {
        setToken(data.token);
        if (/activate/.test(window.location.hash)) window.location.hash = '#/';
        setPhase('open');
      } else setMsg(data.error?.message || 'Activation failed. Please try again.');
    } catch {
      setMsg('Could not reach the server. Check your internet and try again.');
    } finally {
      setBusy(false);
    }
  };

  const paste = async () => {
    try {
      setText(await navigator.clipboard.readText());
    } catch {
      setMsg('Press and hold in the box, then choose Paste.');
    }
  };

  if (phase === 'open') return <>{children}</>;

  return (
    <div className="act-screen" role="dialog" aria-modal="true" aria-label="Activate CHEMVERSE">
      <div className="act-card">
        <div className="act-badge">
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="8" cy="15" r="4" /><path d="M10.8 12.2 20 3m-3 3 3 3m-6-0 2 2" /></svg>
        </div>
        <p className="act-brand">CHEM<span>VERSE</span></p>
        {phase === 'checking' ? (
          <p className="act-sub">Checking...</p>
        ) : offline ? (
          <>
            <h1 className="act-title">Internet needed</h1>
            <p className="act-sub">Connect to the internet to activate CHEMVERSE on this device.</p>
            <button type="button" className="act-btn" onClick={() => void start()}>Try again</button>
          </>
        ) : (
          <>
            <h1 className="act-title">Activate CHEMVERSE</h1>
            <p className="act-sub">Enter the activation code you received. You only need to do this once on each device.</p>
            <input
              className="act-input"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="CHEM-XXXX-XXXX"
              aria-label="Activation code"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              onKeyDown={(e) => e.key === 'Enter' && void activate()}
            />
            <div className="act-row">
              <button type="button" className="act-ghost" onClick={() => void paste()}>Paste</button>
              <button type="button" className="act-btn" onClick={() => void activate()} disabled={busy}>{busy ? 'Please wait...' : 'Activate'}</button>
            </div>
            {msg && <p className="act-note">{msg}</p>}
            <a className="act-mail" href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('CHEMVERSE activation code')}`}>No code? Email {SUPPORT_EMAIL}</a>
          </>
        )}
      </div>
    </div>
  );
}
