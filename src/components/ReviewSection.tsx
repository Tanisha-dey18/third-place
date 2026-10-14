import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Flag, Star, Trash2 } from 'lucide-react';
import type { Review } from '@/types';
import { useData } from '@/context/DataContext';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { reviewSchema } from '@/lib/validation';
import { formatDate } from './VerificationBadge';
import { ErrorState } from './States';
import { Modal } from './Modal';

const FLAG_REASONS: [string, string][] = [
  ['spam', 'Spam or advertising'],
  ['offensive', 'Offensive or abusive'],
  ['personal_info', 'Shares personal information'],
  ['not_a_real_visit', 'Doesn’t seem like a real visit'],
  ['other', 'Something else'],
];

export function ReviewSection({ cafeId, cafeName }: { cafeId: string; cafeName: string }) {
  const { community, refreshRatings, ratings } = useData();
  const { user, configured } = useAuth();
  const toast = useToast();
  const [reviews, setReviews] = useState<Review[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState('');
  const [visitedOn, setVisitedOn] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const summary = ratings.get(cafeId);

  const load = useCallback(() => {
    setLoadError(null);
    community
      .listReviews(cafeId)
      .then(setReviews)
      .catch((e: Error) => setLoadError(e.message));
  }, [community, cafeId]);
  useEffect(load, [load]);

  const canWrite = !configured || !!user;
  const mine = reviews?.find((r) => (user ? r.userId === user.id : r.isLocal));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const parsed = reviewSchema.safeParse({ rating, body, visitedOn: visitedOn || null });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Please check your review');
      return;
    }
    setSending(true);
    setError(null);
    try {
      await community.submitReview({ cafeId, ...parsed.data, photo }, mine ?? null);
      setBody('');
      setRating(0);
      setVisitedOn('');
      setPhoto(null);
      toast.show(community.mode === 'device' ? 'Review saved on this device only' : 'Review published');
      load();
      refreshRatings([cafeId]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSending(false);
    }
  };

  const remove = async (review: Review) => {
    try {
      await community.deleteReview(review);
      load();
      refreshRatings([cafeId]);
    } catch (err) {
      toast.show((err as Error).message, 'error');
    }
  };

  const [flagging, setFlagging] = useState<Review | null>(null);
  const [flagReason, setFlagReason] = useState('spam');
  const flag = async (review: Review) => {
    setFlagReason('spam');
    setFlagging(review);
  };
  const submitFlag = async () => {
    if (!flagging) return;
    try {
      await community.flagReview(flagging.id, flagReason);
      toast.show('Thanks, a moderator will review it.');
      setFlagging(null);
    } catch (err) {
      toast.show((err as Error).message, 'error');
    }
  };

  return (
    <section aria-labelledby="reviews-h">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="reviews-h" className="text-3xl">
          Reviews
        </h2>
        {summary && summary.count > 0 ? (
          <p className="flex items-center gap-1.5 text-sm text-mocha">
            <Star size={16} className="fill-clay text-clay" aria-hidden />
            <strong className="text-espresso">{summary.average.toFixed(1)}</strong> from {summary.count} review{summary.count === 1 ? '' : 's'}
            {community.mode === 'device' && <span className="text-latte">(stored on this device)</span>}
          </p>
        ) : (
          <p className="text-sm text-latte">No ratings yet. Ratings are averaged from real reviews only.</p>
        )}
      </div>

      {loadError ? (
        <ErrorState message={loadError} onRetry={load} />
      ) : reviews === null ? (
        <div className="shimmer h-24 rounded-2xl" aria-busy="true" />
      ) : reviews.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-oat p-5 text-sm text-mocha">Nobody has reviewed {cafeName} yet. Been here? Be the first.</p>
      ) : (
        <ul className="space-y-4">
          {reviews.map((r) => (
            <li key={r.id} className="card p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-espresso">{r.authorName}</p>
                  <p className="text-xs text-latte">
                    {r.visitedOn ? `Visited ${formatDate(r.visitedOn)} · ` : ''}
                    Posted {formatDate(r.createdAt)}
                    {r.isLocal && ' · saved on this device, not public'}
                  </p>
                </div>
                <Stars value={r.rating} />
              </div>
              <p className="mt-3 whitespace-pre-line text-[15px] leading-relaxed text-espresso">{r.body}</p>
              {r.photoUrl && <img src={r.photoUrl} alt={`Visitor photo of ${cafeName}`} loading="lazy" className="mt-3 max-h-64 rounded-xl object-cover" />}
              {!r.isLocal && mine?.id !== r.id && user && (
                <button onClick={() => void flag(r)} className="btn-link mt-3 text-xs text-latte" aria-label={`Flag review by ${r.authorName}`}>
                  <Flag size={12} aria-hidden /> Flag
                </button>
              )}
              {mine?.id === r.id && (
                <button onClick={() => void remove(r)} className="btn-link mt-3 text-clay">
                  <Trash2 size={14} aria-hidden /> Delete my review
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="card mt-6 p-5 sm:p-6">
        <h3 className="text-xl">{mine ? 'Update your review' : 'Write a review'}</h3>
        {!canWrite ? (
          <p className="mt-2 text-sm text-mocha">
            <Link to="/login" className="underline">
              Log in
            </Link>{' '}
            to write a review. One review per person per place keeps ratings honest.
          </p>
        ) : (
          <form onSubmit={submit} className="mt-4 space-y-4">
            {community.mode === 'device' && <p className="rounded-xl bg-sand/60 p-3 text-xs text-mocha">Accounts aren’t configured on this deployment, so your review stays in this browser and isn’t shared with anyone.</p>}
            <fieldset>
              <legend className="label">Your rating</legend>
              <div className="flex gap-1" role="radiogroup">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    role="radio"
                    aria-checked={rating === n}
                    aria-label={`${n} star${n === 1 ? '' : 's'}`}
                    onClick={() => setRating(n)}
                    className="rounded p-1"
                  >
                    <Star size={26} className={n <= rating ? 'fill-clay text-clay' : 'text-oat'} />
                  </button>
                ))}
              </div>
            </fieldset>
            <label className="block">
              <span className="label">Your experience</span>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={4}
                maxLength={1500}
                className="input"
                placeholder="What was it like? Noise, seating, Wi-Fi, food, service…"
              />
              <span className="mt-1 block text-right text-xs text-latte">{body.length}/1500</span>
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="label">When did you visit? <span className="font-normal text-latte">(optional)</span></span>
                <input type="date" value={visitedOn} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setVisitedOn(e.target.value)} className="input !py-2.5" />
              </label>
              {community.mode === 'account' && (
                <label className="block">
                  <span className="label">Photo <span className="font-normal text-latte">(optional, max 3 MB)</span></span>
                  <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} className="block w-full text-sm text-mocha file:mr-3 file:rounded-full file:border-0 file:bg-sand file:px-3 file:py-2" />
                </label>
              )}
            </div>
            {error && <p className="text-sm text-clay">{error}</p>}
            <button type="submit" className="btn-primary" disabled={sending}>
              {sending ? 'Saving…' : mine ? 'Update review' : 'Post review'}
            </button>
          </form>
        )}
      </div>
      <Modal open={!!flagging} onClose={() => setFlagging(null)} title="Flag this review">
        <fieldset>
          <legend className="label">What’s wrong with it?</legend>
          <div className="space-y-1.5">
            {FLAG_REASONS.map(([v, l]) => (
              <label key={v} className="flex cursor-pointer items-center gap-2.5 rounded-xl px-2 py-1.5 text-sm hover:bg-cream">
                <input type="radio" name="flag-reason" value={v} checked={flagReason === v} onChange={() => setFlagReason(v)} className="accent-espresso" />
                {l}
              </label>
            ))}
          </div>
        </fieldset>
        <p className="mt-3 text-xs text-latte">Flags go to a moderator. The review stays up until they decide.</p>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={() => setFlagging(null)} className="btn-ghost">
            Cancel
          </button>
          <button onClick={() => void submitFlag()} className="btn-primary">
            Send flag
          </button>
        </div>
      </Modal>
    </section>
  );
}

function Stars({ value }: { value: number }) {
  return (
    <span className="flex" aria-label={`${value} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} size={15} className={n <= value ? 'fill-clay text-clay' : 'text-oat'} aria-hidden />
      ))}
    </span>
  );
}
