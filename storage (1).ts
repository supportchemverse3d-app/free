import { useCallback, useEffect, useState } from 'react';

export interface StoredItem {
  id: string;
  type: string;
  title: string;
  formula?: string;
}

/** localStorage with every access guarded: private windows and some WebViews can throw. */
function read(key: string): StoredItem[] {
  try {
    const raw = window.localStorage.getItem(key);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed.filter((x) => x && typeof x.id === 'string' && typeof x.title === 'string') as StoredItem[]) : [];
  } catch {
    return [];
  }
}

function write(key: string, items: StoredItem[]): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(items));
  } catch {
    /* storage unavailable: the app keeps working without persistence */
  }
}

const listeners = new Map<string, Set<() => void>>();
const notify = (key: string) => listeners.get(key)?.forEach((fn) => fn());

/** A small persisted list shared by every component that uses the same key. */
export function useStoredList(key: string, max: number) {
  const [items, setItems] = useState<StoredItem[]>(() => read(key));

  useEffect(() => {
    const fn = () => setItems(read(key));
    if (!listeners.has(key)) listeners.set(key, new Set());
    listeners.get(key)!.add(fn);
    return () => void listeners.get(key)?.delete(fn);
  }, [key]);

  const add = useCallback((item: StoredItem) => {
    write(key, [item, ...read(key).filter((x) => !(x.id === item.id && x.type === item.type))].slice(0, max));
    notify(key);
  }, [key, max]);

  const remove = useCallback((id: string, type: string) => {
    write(key, read(key).filter((x) => !(x.id === id && x.type === type)));
    notify(key);
  }, [key]);

  const clear = useCallback(() => {
    write(key, []);
    notify(key);
  }, [key]);

  return { items, add, remove, clear };
}

export const RECENTS_KEY = 'chemverse.recents.v1';
export const FAVOURITES_KEY = 'chemverse.favourites.v1';
