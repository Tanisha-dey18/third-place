import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import type { BudgetBand } from '@/types';
import { useAuth } from '@/context/AuthContext';
import { useLibrary } from '@/context/LibraryContext';
import { useToast } from '@/context/ToastContext';
import { BUDGET_OPTIONS, NEIGHBOURHOODS } from '@/lib/taxonomy';
import { profileSchema } from '@/lib/validation';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

const DIETARY = ['Vegetarian', 'Vegan', 'Eggless', 'Jain', 'Gluten-free', 'Lactose-free'];

export default function ProfilePage() {
  useDocumentTitle('Profile');
  const { configured, user, profile, signOut, updateProfile, loading } = useAuth();
  const { savedIds, collections, mode } = useLibrary();
  const toast = useToast();
  const [displayName, setDisplayName] = useState('');
  const [budget, setBudget] = useState<BudgetBand | ''>('');
  const [area, setArea] = useState('');
  const [dietary, setDietary] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setDisplayName(profile.displayName ?? '');
    setBudget(profile.preferredBudget ?? '');
    setArea(profile.preferredNeighbourhood ?? '');
    setDietary(profile.dietaryPreferences);
  }, [profile]);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const parsed = profileSchema.safeParse({
      displayName: displayName.trim() || null,
      preferredBudget: budget || null,
      preferredNeighbourhood: area || null,
      dietaryPreferences: dietary,
    });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? 'Check your details');
    setSaving(true);
    setError(null);
    try {
      await updateProfile(parsed.data);
      toast.show(user ? 'Preferences saved to your account' : 'Preferences saved on this device');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="page py-12"><div className="shimmer h-60 rounded-2xl" /></div>;

  return (
    <div className="page max-w-3xl pt-10">
      <p className="eyebrow">Profile</p>
      <h1 className="mt-2 text-4xl sm:text-5xl">{user ? profile?.displayName || 'Your profile' : 'Your preferences'}</h1>

      <div className="mt-6 card p-5 text-sm">
        {user ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-mocha">
              Signed in as <strong className="text-espresso">{user.email}</strong>
            </p>
            <button
              onClick={() => signOut().then(() => toast.show('Logged out')).catch((e: Error) => toast.show(e.message, 'error'))}
              className="btn-ghost !py-2"
            >
              <LogOut size={15} aria-hidden /> Log out
            </button>
          </div>
        ) : configured ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-mocha">You’re browsing without an account. Preferences and saved places stay on this device.</p>
            <div className="flex gap-2">
              <Link to="/login" className="btn-primary !py-2">
                Log in
              </Link>
              <Link to="/signup" className="btn-ghost !py-2">
                Sign up
              </Link>
            </div>
          </div>
        ) : (
          <p className="text-mocha">
            <strong className="text-espresso">Demo mode:</strong> accounts are disabled because Supabase isn’t configured. Preferences below are stored in this browser only and
            power “Recommended for you” on the home page.
          </p>
        )}
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Link to="/saved" className="card p-5 hover:shadow-lift">
          <p className="font-serif text-3xl">{savedIds.length}</p>
          <p className="text-sm text-mocha">Saved places {mode === 'device' && '(this device)'}</p>
        </Link>
        <Link to="/collections" className="card p-5 hover:shadow-lift">
          <p className="font-serif text-3xl">{collections.length}</p>
          <p className="text-sm text-mocha">Collections {mode === 'device' && '(this device)'}</p>
        </Link>
      </div>

      <form onSubmit={save} className="card mt-6 space-y-5 p-6">
        <h2 className="text-2xl">Preferences</h2>
        {user && (
          <label className="block">
            <span className="label">Display name</span>
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={40} className="input" />
            <span className="mt-1 block text-xs text-latte">Shown on your reviews instead of your email.</span>
          </label>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="label">Usual budget per person</span>
            <select value={budget} onChange={(e) => setBudget(e.target.value as BudgetBand)} className="input !py-2.5">
              <option value="">No preference</option>
              {BUDGET_OPTIONS.map((b) => (
                <option key={b.band} value={b.band}>
                  {b.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="label">Home neighbourhood</span>
            <select value={area} onChange={(e) => setArea(e.target.value)} className="input !py-2.5">
              <option value="">No preference</option>
              {NEIGHBOURHOODS.map((n) => (
                <option key={n.slug} value={n.slug}>
                  {n.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <fieldset>
          <legend className="label">
            Dietary preferences <span className="font-normal text-latte">(optional, only if you want to share)</span>
          </legend>
          <div className="flex flex-wrap gap-2">
            {DIETARY.map((d) => (
              <button
                type="button"
                key={d}
                aria-pressed={dietary.includes(d)}
                onClick={() => setDietary((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]))}
                className={`chip ${dietary.includes(d) ? 'chip-on' : ''}`}
              >
                {d}
              </button>
            ))}
          </div>
        </fieldset>
        {error && <p className="text-sm text-clay">{error}</p>}
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? 'Saving…' : 'Save preferences'}
        </button>
      </form>
    </div>
  );
}
