import { useEffect, useState } from 'react';
export type Section = 'home' | 'library' | 'crystals' | 'orbitals' | 'geometry' | 'hybridization' | 'conformations';
const SECTIONS: readonly string[] = ['home', 'library', 'crystals', 'orbitals', 'geometry', 'hybridization', 'conformations'];
export type Route =
  | { page: 'home'; section: Section; arg?: string }
  | { page: 'crystal'; id: string }
  | { page: 'orbital'; id: string }
  | { page: 'molecule'; id: string }
  | { page: 'ai'; args: string[] };
export function parseHash(hash: string): Route {
  const parts = hash.replace(/^#/, '').split('/');
  const [, kind, value] = parts;
  let id = '';
  try { id = value ? decodeURIComponent(value) : ''; } catch { id = value ?? ''; }
  if (kind === 'ai') return { page: 'ai', args: parts.slice(2).filter(Boolean).map((p) => { try { return decodeURIComponent(p); } catch { return p; } }) };
  if (kind === 'm' && id) return { page: 'molecule', id };
  if (kind === 'c' && id) return { page: 'crystal', id };
  if (kind === 'o' && id) return { page: 'orbital', id };
  if (kind && SECTIONS.includes(kind)) return { page: 'home', section: kind as Section, arg: id || undefined };
  return { page: 'home', section: 'home' };
}
export function useHashRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));
  useEffect(() => { const onChange = () => setRoute(parseHash(window.location.hash)); window.addEventListener('hashchange', onChange); return () => window.removeEventListener('hashchange', onChange); }, []);
  return route;
}
export const navigate = (hash: string) => { window.location.hash = hash; };
