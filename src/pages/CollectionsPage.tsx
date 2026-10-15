import { useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, FolderOpen, Pencil, Plus, Trash2, X } from 'lucide-react';
import type { Cafe } from '@/types';
import { usePlacesByKeys } from '@/hooks/usePlaces';
import { useLibrary } from '@/context/LibraryContext';
import { useAuth } from '@/context/AuthContext';
import { collectionNameSchema } from '@/lib/validation';
import { CafeCard } from '@/components/CafeCard';
import { SmartImage } from '@/components/SmartImage';
import { EmptyState } from '@/components/States';
import { Modal } from '@/components/Modal';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

interface Curated {
  title: string;
  rule: string;
  to: string;
}

// Rule-based lists open Explore with the matching filters, so they always
// reflect live data for the area you choose. Never hand-picked "trending" lists.
const CURATED: Curated[] = [
  { title: 'Wi-Fi listed', rule: 'Places whose listing or a verified report says they have Wi-Fi.', to: '/explore?fac=wifi' },
  { title: 'Open now', rule: 'Listed opening hours say they’re open right now (Kolkata time).', to: '/explore?open=1' },
  { title: 'Outdoor seating', rule: 'Outdoor seating listed at the source or verified.', to: '/explore?fac=outdoor_seating' },
  { title: 'Ice cream & desserts', rule: 'Places listed as ice-cream shops.', to: '/explore?cat=ice_cream' },
  { title: 'Air-conditioned', rule: 'Air conditioning listed or verified.', to: '/explore?fac=ac' },
  { title: 'Step-free access', rule: 'Wheelchair access listed or verified.', to: '/explore?fac=wheelchair_access' },
];

export default function CollectionsPage() {
  useDocumentTitle('Collections');
  const { collections, createCollection, mode, ready } = useLibrary();
  const { configured, user } = useAuth();
  const [creating, setCreating] = useState(false);
  const coverKeys = useMemo(() => Array.from(new Set(collections.flatMap((c) => c.cafeIds.slice(0, 3)))).slice(0, 50), [collections]);
  const covers = usePlacesByKeys(coverKeys);
  const byId = (id: string) => covers.places.find((p) => p.id === id);

  return (
    <div className="page pt-10">
      <p className="eyebrow">Collections</p>
      <h1 className="mt-2 text-4xl sm:text-5xl">Lists worth keeping</h1>

      <section className="mt-10">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl">Your collections</h2>
            <p className="text-sm text-mocha">
              {mode === 'account' ? 'Synced to your account.' : configured && !user ? 'Stored on this device. Log in to sync them to your account.' : 'Stored on this device only. Accounts aren’t configured on this deployment.'}
            </p>
          </div>
          <button onClick={() => setCreating(true)} className="btn-primary">
            <Plus size={16} aria-hidden /> New collection
          </button>
        </div>
        {!ready ? (
          <div className="shimmer h-32 rounded-2xl" />
        ) : collections.length === 0 ? (
          <EmptyState title="No collections yet" icon={<FolderOpen size={28} aria-hidden />} action={<button onClick={() => setCreating(true)} className="btn-primary">Create your first</button>}>
            Group places into lists like Date Ideas, Study Spots, Weekend Plans, Places to Try or Coffee Favourites.
          </EmptyState>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {collections.map((col) => {
              const covers = col.cafeIds.map((id) => byId(id)).filter(Boolean).slice(0, 3) as Cafe[];
              return (
                <Link key={col.id} to={`/collections/${col.id}`} className="card group overflow-hidden transition-shadow hover:shadow-lift">
                  <div className="grid h-36 grid-cols-3 gap-0.5 bg-sand">
                    {[0, 1, 2].map((i) => (
                      <SmartImage key={i} src={covers[i]?.photos[0]?.url} alt="" className="h-full" width={240} />
                    ))}
                  </div>
                  <div className="p-4">
                    <h3 className="text-xl">{col.name}</h3>
                    <p className="text-sm text-latte">
                      {col.cafeIds.length} place{col.cafeIds.length === 1 ? '' : 's'}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <section className="mt-16">
        <h2 className="text-2xl">From THIRD PLACE</h2>
        <p className="mb-5 text-sm text-mocha">Built from live data using the rule shown on each list. Pick an area on the next screen.</p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CURATED.map((c) => (
            <Link key={c.title} to={c.to} className="card block p-5 transition-shadow hover:shadow-lift">
              <h3 className="text-xl">{c.title}</h3>
              <p className="mt-1 text-xs text-latte">Rule: {c.rule}</p>
            </Link>
          ))}
        </div>
      </section>

      <NameDialog
        open={creating}
        title="New collection"
        onClose={() => setCreating(false)}
        existing={collections.map((c) => c.name)}
        onSubmit={async (name) => {
          const col = await createCollection(name);
          if (col) setCreating(false);
        }}
      />
    </div>
  );
}

export function CollectionDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { collections, renameCollection, deleteCollection, removeFromCollection, ready } = useLibrary();
  const col = collections.find((c) => c.id === id);
  const itemsState = usePlacesByKeys(col?.cafeIds ?? []);
  const loading = itemsState.status === 'loading' && itemsState.places.length === 0;
  const [renaming, setRenaming] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  useDocumentTitle(col?.name ?? 'Collection');

  if (!ready || loading) return <div className="page py-12"><div className="shimmer h-40 rounded-2xl" /></div>;
  if (!col) {
    return (
      <div className="page py-16">
        <EmptyState title="Collection not found" action={<Link to="/collections" className="btn-primary">Back to collections</Link>}>
          It may have been deleted, or it lives on another device or account.
        </EmptyState>
      </div>
    );
  }
  const items = col.cafeIds.map((cid) => itemsState.places.find((p) => p.id === cid)).filter(Boolean) as Cafe[];
  const missing = itemsState.status === 'ready' ? col.cafeIds.length - items.length : 0;

  return (
    <div className="page pt-8">
      <Link to="/collections" className="btn-link !no-underline text-mocha">
        <ArrowLeft size={15} aria-hidden /> Collections
      </Link>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl sm:text-5xl">{col.name}</h1>
          <p className="mt-1 text-sm text-latte">
            {items.length} place{items.length === 1 ? '' : 's'}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setRenaming(true)} className="btn-ghost">
            <Pencil size={15} aria-hidden /> Rename
          </button>
          <button onClick={() => setConfirmDelete(true)} className="btn-ghost text-clay">
            <Trash2 size={15} aria-hidden /> Delete
          </button>
        </div>
      </div>
      {missing > 0 && <p className="mt-3 text-sm text-latte">{missing} place{missing === 1 ? ' is' : 's are'} no longer listed and can’t be shown.</p>}
      <div className="mt-8">
        {items.length === 0 ? (
          <EmptyState title="This collection is empty" action={<Link to="/explore" className="btn-primary">Find places to add</Link>}>
            Open any place and choose “Add to collection”.
          </EmptyState>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((c) => (
              <div key={c.id} className="relative">
                <CafeCard cafe={c} />
                <button onClick={() => void removeFromCollection(col.id, c.id)} className="btn-link mt-2 pl-1 text-mocha">
                  <X size={14} aria-hidden /> Remove from {col.name}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <NameDialog
        open={renaming}
        title="Rename collection"
        initial={col.name}
        onClose={() => setRenaming(false)}
        existing={collections.filter((c) => c.id !== col.id).map((c) => c.name)}
        onSubmit={async (name) => {
          await renameCollection(col.id, name);
          setRenaming(false);
        }}
      />
      <Modal open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Delete this collection?">
        <p className="text-sm text-mocha">“{col.name}” will be deleted. The places themselves stay saved if you saved them.</p>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={() => setConfirmDelete(false)} className="btn-ghost">
            Cancel
          </button>
          <button
            onClick={async () => {
              await deleteCollection(col.id);
              navigate('/collections');
            }}
            className="btn bg-clay text-ivory hover:bg-[#9c5d3c]"
          >
            Delete
          </button>
        </div>
      </Modal>
    </div>
  );
}

function NameDialog({
  open,
  title,
  initial = '',
  existing,
  onClose,
  onSubmit,
}: {
  open: boolean;
  title: string;
  initial?: string;
  existing: string[];
  onClose(): void;
  onSubmit(name: string): Promise<void>;
}) {
  const [name, setName] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const parsed = collectionNameSchema.safeParse(name);
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? 'Invalid name');
    if (existing.some((x) => x.toLowerCase() === parsed.data.toLowerCase())) return setError('You already have a collection with that name');
    setError(null);
    await onSubmit(parsed.data);
    setName('');
  };
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <form onSubmit={submit}>
        <label className="block">
          <span className="label">Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} className="input" placeholder="e.g. Weekend Plans" />
        </label>
        {error && <p className="mt-2 text-sm text-clay">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-ghost">
            Cancel
          </button>
          <button type="submit" className="btn-primary">
            Save
          </button>
        </div>
      </form>
    </Modal>
  );
}
