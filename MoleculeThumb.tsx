import { useEffect, useRef, useState } from 'react';
import type { MoleculeRecord } from '../content/molecule.ts';
import { thumbnail } from '../viewer/thumbnails.ts';

/** A rendered 3D preview, produced lazily when the card scrolls into view. */
export function MoleculeThumb({ molecule, className = '' }: { molecule: MoleculeRecord; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const make = () => setSrc(thumbnail(molecule.meta.id, molecule.atoms, molecule.bonds));
    if (typeof IntersectionObserver === 'undefined') { make(); return; }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { make(); io.disconnect(); }
    }, { rootMargin: '120px' });
    io.observe(el);
    return () => io.disconnect();
  }, [molecule]);
  return (
    <div ref={ref} className={`flex items-center justify-center overflow-hidden thumb-stage ${className}`}>
      {src ? <img src={src} alt="" className="h-full w-full object-contain" draggable={false} /> : <span className="text-xs text-slate-500" aria-hidden="true">3D</span>}
    </div>
  );
}
