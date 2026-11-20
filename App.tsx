import { useEffect } from 'react';
import { CrystalList, Home, Library, OrbitalList } from './ui/Home.tsx';
import { MoleculePage } from './ui/MoleculePage.tsx';
import { CrystalPage } from './ui/CrystalPage.tsx';
import { OrbitalPage } from './ui/OrbitalPage.tsx';
import { ConformationsLab, GeometryLab, HybridLab } from './ui/Labs.tsx';
import { ChemoAI } from './ai/ui/ChemoAI.tsx';
import { SearchBar } from './ui/SearchBar.tsx';
import { useHashRoute, type Route } from './lib/useHashRoute.ts';

const NAV = [
  { id: 'home', hash: '#/', label: 'Structure', icon: 'M4 11 12 4l8 7v9h-5v-6H9v6H4z' },
  { id: 'library', hash: '#/library', label: 'Molecules', icon: 'M12 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM6 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM18 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM11 7.5 7 16.5M13 7.5l4 9M8 18h8' },
  { id: 'crystals', hash: '#/crystals', label: 'Crystals', icon: 'M12 3 4 7.5v9L12 21l8-4.5v-9L12 3zM4 7.5l8 4.5 8-4.5M12 12v9' },
  { id: 'ai', hash: '#/ai', label: 'AI', icon: 'M5 5h14v10H10l-5 4zM9 9h6M9 12h4' },
] as const;
function active(route: Route): string {
  if (route.page === 'ai') return 'ai';
  if (route.page === 'molecule') return 'library';
  if (route.page === 'crystal') return 'crystals';
  if (route.page === 'home' && route.section === 'library') return 'library';
  if (route.page === 'home' && route.section === 'crystals') return 'crystals';
  return 'home';
}
export function App() {
  const route = useHashRoute();
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const update = () => document.documentElement.classList.toggle('keyboard-open', window.innerHeight - viewport.height > 150);
    viewport.addEventListener('resize', update); viewport.addEventListener('scroll', update); update();
    return () => { viewport.removeEventListener('resize', update); viewport.removeEventListener('scroll', update); document.documentElement.classList.remove('keyboard-open'); };
  }, []);
  useEffect(() => { if (route.page === 'home') document.title = 'CHEMVERSE'; if (route.page !== 'molecule') window.scrollTo(0, 0); }, [route]);
  const onHome = route.page === 'home' && route.section === 'home';
  return <div className="app-shell">
    <header className="app-header"><div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3.5">
      <a href="#/" className="shrink-0 text-[17px] font-extrabold tracking-[.12em] text-white">CHEM<span className="text-[#54dfd1]">VERSE</span></a>
      <span className="hidden text-[10px] font-semibold tracking-[.18em] text-slate-500 sm:inline">3D STRUCTURE + AI</span>
      {!onHome && <div key={JSON.stringify(route)} className="ml-auto min-w-0 max-w-sm flex-1"><SearchBar /></div>}
    </div></header>
    <main className="app-main">
      {route.page === 'home' && route.section === 'home' && <Home />}
      {route.page === 'home' && route.section === 'library' && <Library />}
      {route.page === 'home' && route.section === 'crystals' && <CrystalList />}
      {route.page === 'home' && route.section === 'orbitals' && <OrbitalList />}
      {route.page === 'home' && route.section === 'geometry' && <GeometryLab />}
      {route.page === 'home' && route.section === 'hybridization' && <HybridLab id={route.arg} />}
      {route.page === 'home' && route.section === 'conformations' && <ConformationsLab />}
      {route.page === 'ai' && <ChemoAI args={route.args} />}
      {route.page === 'crystal' && <CrystalPage id={route.id} />}
      {route.page === 'orbital' && <OrbitalPage id={route.id} />}
      {route.page === 'molecule' && <MoleculePage id={route.id} />}
    </main>
    <nav aria-label="Main navigation" className="app-bottom-nav fixed inset-x-0 bottom-0 z-40 md:hidden"><ul className="mx-auto grid max-w-md grid-cols-4 px-1">
      {NAV.map((n) => <li key={n.hash}><a href={n.hash} aria-current={active(route) === n.id ? 'page' : undefined} className="nav-link flex flex-col items-center justify-center gap-1 text-[10px] font-semibold tracking-wide"><svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={n.icon} /></svg>{n.label}</a></li>)}
    </ul></nav>
  </div>;
}
export default App;
