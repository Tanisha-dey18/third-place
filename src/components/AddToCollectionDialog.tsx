import { useState, type FormEvent } from 'react';
import { Check, Plus } from 'lucide-react';
import { Modal } from './Modal';
import { useLibrary } from '@/context/LibraryContext';
import { collectionNameSchema } from '@/lib/validation';

const STARTERS = ['Date Ideas', 'Study Spots', 'Weekend Plans', 'Places to Try', 'Coffee Favourites'];

export function AddToCollectionDialog({ open, onClose, cafeId, cafeName }: { open: boolean; onClose(): void; cafeId: string; cafeName: string }) {
  const { collections, createCollection, addToCollection, removeFromCollection, mode } = useLibrary();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const create = async (e?: FormEvent, preset?: string) => {
    e?.preventDefault();
    const parsed = collectionNameSchema.safeParse(preset ?? name);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Invalid name');
      return;
    }
    if (collections.some((c) => c.name.toLowerCase() === parsed.data.toLowerCase())) {
      setError('You already have a collection with that name');
      return;
    }
    const col = await createCollection(parsed.data);
    if (col) {
      await addToCollection(col.id, cafeId);
      setName('');
      setError(null);
    }
  };

  const unused = STARTERS.filter((s) => !collections.some((c) => c.name.toLowerCase() === s.toLowerCase()));

  return (
    <Modal open={open} onClose={onClose} title="Add to a collection">
      <p className="-mt-2 mb-4 text-sm text-mocha">
        Organise <strong>{cafeName}</strong> into your lists.
        {mode === 'device' && ' Collections are stored on this device only.'}
      </p>
      {collections.length > 0 && (
        <ul className="mb-5 divide-y divide-oat/70 rounded-2xl border border-oat">
          {collections.map((c) => {
            const inside = c.cafeIds.includes(cafeId);
            return (
              <li key={c.id}>
                <button
                  onClick={() => void (inside ? removeFromCollection(c.id, cafeId) : addToCollection(c.id, cafeId))}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-cream"
                  aria-pressed={inside}
                >
                  <span>
                    <span className="block text-[15px] text-espresso">{c.name}</span>
                    <span className="text-xs text-latte">
                      {c.cafeIds.length} place{c.cafeIds.length === 1 ? '' : 's'}
                    </span>
                  </span>
                  <span className={`flex h-7 w-7 items-center justify-center rounded-full border ${inside ? 'border-espresso bg-espresso text-ivory' : 'border-oat text-latte'}`}>
                    {inside ? <Check size={15} aria-hidden /> : <Plus size={15} aria-hidden />}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <form onSubmit={create} className="flex gap-2">
        <label className="flex-1">
          <span className="sr-only">New collection name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="New collection name" className="input !py-2.5" />
        </label>
        <button type="submit" className="btn-primary">
          Create
        </button>
      </form>
      {error && <p className="mt-2 text-sm text-clay">{error}</p>}
      {unused.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {unused.map((s) => (
            <button key={s} onClick={() => void create(undefined, s)} className="chip">
              <Plus size={13} aria-hidden /> {s}
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
}
