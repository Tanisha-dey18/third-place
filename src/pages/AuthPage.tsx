import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { MailCheck } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { credentialsSchema } from '@/lib/validation';
import { LogoMark } from '@/components/Logo';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

export default function AuthPage({ mode }: { mode: 'login' | 'signup' }) {
  useDocumentTitle(mode === 'login' ? 'Log in' : 'Create account');
  const { configured, user, signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmSent, setConfirmSent] = useState(false);
  const from = (location.state as { from?: string } | null)?.from ?? '/profile';

  if (user) return <Navigate to={from} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const parsed = credentialsSchema.safeParse({ email, password });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? 'Check your details');
    setBusy(true);
    setError(null);
    try {
      if (mode === 'login') {
        await signIn(parsed.data.email, parsed.data.password);
        navigate(from, { replace: true });
      } else {
        const { needsConfirmation } = await signUp(parsed.data.email, parsed.data.password, name);
        if (needsConfirmation) setConfirmSent(true);
        else navigate('/profile', { replace: true });
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page flex justify-center py-14">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <LogoMark size={44} className="mx-auto" />
          <h1 className="mt-5 text-4xl">{mode === 'login' ? 'Welcome back' : 'Make it your place'}</h1>
          <p className="mt-2 text-mocha">{mode === 'login' ? 'Log in to sync saved places, collections and reviews.' : 'Save places, build collections and share honest reviews.'}</p>
        </div>

        {!configured ? (
          <div className="card p-6 text-sm text-mocha">
            <h2 className="mb-2 font-sans text-base font-semibold text-espresso">Accounts aren’t available in demo mode</h2>
            <p>
              This deployment has no Supabase project configured, so we can’t create secure accounts. We won’t fake a login with a browser flag. You can still save places and build collections. They’re kept in this browser only.
            </p>
            <p className="mt-3">To enable accounts, set <code className="rounded bg-sand px-1">VITE_SUPABASE_URL</code> and <code className="rounded bg-sand px-1">VITE_SUPABASE_ANON_KEY</code> (see README).</p>
            <Link to="/explore" className="btn-primary mt-5">
              Keep exploring
            </Link>
          </div>
        ) : confirmSent ? (
          <div className="card p-6 text-center">
            <MailCheck className="mx-auto text-sage-dark" size={32} aria-hidden />
            <h2 className="mt-3 text-2xl">Check your inbox</h2>
            <p className="mt-2 text-sm text-mocha">We sent a confirmation link to {email}. Open it to activate your account, then log in.</p>
          </div>
        ) : (
          <form onSubmit={submit} className="card space-y-4 p-6" noValidate>
            {mode === 'signup' && (
              <label className="block">
                <span className="label">Display name <span className="font-normal text-latte">(shown on reviews)</span></span>
                <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} autoComplete="nickname" className="input" />
              </label>
            )}
            <label className="block">
              <span className="label">Email</span>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required className="input" />
            </label>
            <label className="block">
              <span className="label">Password</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                minLength={8}
                required
                className="input"
              />
              {mode === 'signup' && <span className="mt-1 block text-xs text-latte">At least 8 characters.</span>}
            </label>
            {error && (
              <p role="alert" className="text-sm text-clay">
                {error}
              </p>
            )}
            <button type="submit" className="btn-primary w-full !py-3" disabled={busy}>
              {busy ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Create account'}
            </button>
            <p className="text-center text-sm text-mocha">
              {mode === 'login' ? (
                <>
                  New here?{' '}
                  <Link to="/signup" className="underline">
                    Create an account
                  </Link>
                </>
              ) : (
                <>
                  Already have an account?{' '}
                  <Link to="/login" className="underline">
                    Log in
                  </Link>
                </>
              )}
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
