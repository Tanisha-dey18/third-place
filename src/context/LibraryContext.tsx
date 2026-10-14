import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { UserCollection } from '@/types';
import { LocalLibraryRepository, SupabaseLibraryRepository, type LibraryRepository } from '@/lib/repository/library';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';
import { removeLocal } from '@/lib/storage';

interface LibraryState {
  /** 'account' = synced to the signed-in user; 'device' = this browser only. */
  mode: 'account' | 'device';
  ready: boolean;
  savedIds: string[];
  isSaved(cafeId: string): boolean;
  toggleSave(cafeId: string, name?: string): Promise<void>;
  collections: UserCollection[];
  createCollection(name: string, description?: string | null): Promise<UserCollection | null>;
  renameCollection(id: string, name: string): Promise<void>;
  deleteCollection(id: string): Promise<void>;
  addToCollection(id: string, cafeId: string): Promise<void>;
  removeFromCollection(id: string, cafeId: string): Promise<void>;
}

const LibraryContext = createContext<LibraryState | null>(null);

export function LibraryProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const toast = useToast();
  const repo = useMemo<LibraryRepository>(() => (user ? new SupabaseLibraryRepository(user.id) : new LocalLibraryRepository()), [user]);
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [collections, setCollections] = useState<UserCollection[]>([]);
  const [ready, setReady] = useState(false);

  const reload = useCallback(async () => {
    const [s, c] = await Promise.all([repo.listSaved(), repo.listCollections()]);
    setSavedIds(s);
    setCollections(c);
  }, [repo]);

  useEffect(() => {
    let active = true;
    setReady(false);
    (async () => {
      try {
        // First sign-in on this device: move device-saved places into the account.
        if (repo.mode === 'account') {
          const local = new LocalLibraryRepository();
          const localSaved = await local.listSaved();
          if (localSaved.length) {
            await Promise.all(localSaved.map((id) => repo.setSaved(id, true).catch(() => undefined)));
            removeLocal('saved');
            toast.show(`Moved ${localSaved.length} saved place${localSaved.length === 1 ? '' : 's'} from this device to your account.`);
          }
        }
        if (active) await reload();
      } catch (e) {
        if (active) toast.show((e as Error).message || 'Could not load your saved places', 'error');
      } finally {
        if (active) setReady(true);
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repo]);

  /**
   * Optimistic update using functional setState (never a stale closure),
   * with rollback to the exact snapshot if the repository call fails.
   */
  const optimistic = useCallback(
    async <T,>(set: React.Dispatch<React.SetStateAction<T>>, next: (cur: T) => T, fn: () => Promise<void>): Promise<boolean> => {
      let snapshot: T | undefined;
      set((cur) => {
        snapshot = cur;
        return next(cur);
      });
      try {
        await fn();
        return true;
      } catch (e) {
        if (snapshot !== undefined) set(snapshot);
        toast.show((e as Error).message || 'Something went wrong', 'error');
        return false;
      }
    },
    [toast],
  );

  const isSaved = useCallback((id: string) => savedIds.includes(id), [savedIds]);

  const toggleSave = useCallback(
    async (cafeId: string, name?: string) => {
      const was = savedIds.includes(cafeId);
      const ok = await optimistic(setSavedIds, (cur) => (was ? cur.filter((x) => x !== cafeId) : [cafeId, ...cur.filter((x) => x !== cafeId)]), () => repo.setSaved(cafeId, !was));
      if (ok) toast.show(was ? `Removed${name ? ` ${name}` : ''} from Saved` : `Saved${name ? ` ${name}` : ''}${repo.mode === 'device' ? ' on this device' : ''}`);
    },
    [savedIds, repo, optimistic, toast],
  );

  const createCollection = useCallback(
    async (name: string, description: string | null = null) => {
      try {
        const col = await repo.createCollection(name, description);
        setCollections((c) => [...c, col]);
        return col;
      } catch (e) {
        toast.show((e as Error).message, 'error');
        return null;
      }
    },
    [repo, toast],
  );

  const mutate = useCallback(
    async (fn: () => Promise<void>, next: (c: UserCollection[]) => UserCollection[]) => {
      await optimistic(setCollections, next, fn);
    },
    [optimistic],
  );

  const value = useMemo<LibraryState>(
    () => ({
      mode: repo.mode,
      ready,
      savedIds,
      isSaved,
      toggleSave,
      collections,
      createCollection,
      renameCollection: (id, name) => mutate(() => repo.renameCollection(id, name), (cs) => cs.map((c) => (c.id === id ? { ...c, name } : c))),
      deleteCollection: (id) => mutate(() => repo.deleteCollection(id), (cs) => cs.filter((c) => c.id !== id)),
      addToCollection: (id, cafeId) =>
        mutate(() => repo.addToCollection(id, cafeId), (cs) => cs.map((c) => (c.id === id && !c.cafeIds.includes(cafeId) ? { ...c, cafeIds: [...c.cafeIds, cafeId] } : c))),
      removeFromCollection: (id, cafeId) =>
        mutate(() => repo.removeFromCollection(id, cafeId), (cs) => cs.map((c) => (c.id === id ? { ...c, cafeIds: c.cafeIds.filter((x) => x !== cafeId) } : c))),
    }),
    [repo, ready, savedIds, isSaved, toggleSave, collections, createCollection, mutate],
  );
  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>;
}

export function useLibrary(): LibraryState {
  const ctx = useContext(LibraryContext);
  if (!ctx) throw new Error('useLibrary must be used inside LibraryProvider');
  return ctx;
}
