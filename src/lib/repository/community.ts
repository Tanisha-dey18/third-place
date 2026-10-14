import type { FacilityReport, RatingSummary, Review } from '@/types';
import { supabase } from '@/lib/supabase';
import { readLocal, uid, writeLocal } from '@/lib/storage';

export interface ReviewInput {
  cafeId: string; // place key
  rating: number;
  body: string;
  visitedOn: string | null;
  photo?: File | null;
}

/**
 * Reviews, ratings, correction reports and review flags, keyed by place key.
 * - With Supabase + a signed-in user: stored in the database (RLS-protected).
 * - Otherwise: stored only in this browser and clearly labelled as such.
 * Ratings are always computed from actual review records — never seeded.
 *
 * Moderation policy: reviews publish immediately (one per person per place,
 * length-checked, daily limit enforced in the database) and can be flagged
 * by anyone signed in; moderators hide them. Reports never change displayed
 * facts until a moderator accepts them.
 */
export interface CommunityRepository {
  readonly mode: 'account' | 'device';
  ratingSummaries(keys: string[]): Promise<RatingSummary[]>;
  listReviews(placeKey: string): Promise<Review[]>;
  submitReview(input: ReviewInput, existing?: Review | null): Promise<Review>;
  deleteReview(review: Review): Promise<void>;
  submitReport(report: FacilityReport): Promise<void>;
  flagReview(reviewId: string, reason: string): Promise<void>;
}

export const MAX_PHOTO_BYTES = 3 * 1024 * 1024;
export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const BUCKET = 'review-photos';

function summarise(reviews: Pick<Review, 'cafeId' | 'rating'>[]): RatingSummary[] {
  const acc = new Map<string, { sum: number; count: number }>();
  for (const r of reviews) {
    const cur = acc.get(r.cafeId) ?? { sum: 0, count: 0 };
    cur.sum += r.rating;
    cur.count += 1;
    acc.set(r.cafeId, cur);
  }
  return Array.from(acc, ([cafeId, { sum, count }]) => ({ cafeId, average: sum / count, count }));
}

// ── Device (local) implementation ─────────────────────────────
export class LocalCommunityRepository implements CommunityRepository {
  readonly mode = 'device' as const;
  private all(): Review[] {
    return readLocal<Review[]>('reviews', []);
  }
  async ratingSummaries(keys: string[]) {
    const set = new Set(keys);
    return summarise(this.all().filter((r) => set.has(r.cafeId)));
  }
  async listReviews(placeKey: string) {
    return this.all()
      .filter((r) => r.cafeId === placeKey)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  async submitReview(input: ReviewInput) {
    const existing = this.all().filter((r) => r.cafeId !== input.cafeId); // one review per place
    const review: Review = {
      id: uid(),
      cafeId: input.cafeId,
      userId: 'this-device',
      authorName: 'You (this device)',
      rating: input.rating,
      body: input.body,
      visitedOn: input.visitedOn,
      photoUrl: null, // photo uploads require Supabase Storage
      createdAt: new Date().toISOString(),
      isLocal: true,
    };
    writeLocal('reviews', [...existing, review].slice(-200));
    return review;
  }
  async deleteReview(review: Review) {
    writeLocal('reviews', this.all().filter((r) => r.id !== review.id));
  }
  async submitReport(report: FacilityReport) {
    const reports = readLocal<(FacilityReport & { createdAt: string })[]>('reports', []);
    writeLocal('reports', [...reports, { ...report, createdAt: new Date().toISOString() }].slice(-100));
  }
  async flagReview() {
    /* nothing to moderate locally */
  }
}

// ── Supabase implementation ───────────────────────────────────
interface PublicReviewRow {
  id: string;
  place_key: string;
  user_id: string;
  author_name: string | null;
  rating: number;
  body: string;
  visited_on: string | null;
  photo_path: string | null;
  created_at: string;
}

export class SupabaseCommunityRepository implements CommunityRepository {
  readonly mode = 'account' as const;
  private get db() {
    if (!supabase) throw new Error('Supabase is not configured');
    return supabase;
  }
  private async requireUser() {
    const { data } = await this.db.auth.getUser();
    if (!data.user) throw new Error('Please log in first.');
    return data.user;
  }
  private photoUrl(path: string | null): string | null {
    if (!path) return null;
    return this.db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  }
  private async removePhoto(path: string | null | undefined) {
    if (!path) return;
    await this.db.storage.from(BUCKET).remove([path]).catch(() => undefined);
  }
  async ratingSummaries(keys: string[]) {
    if (!keys.length) return [];
    const { data, error } = await this.db.from('cafe_rating_summary').select('place_key, average_rating, review_count').in('place_key', keys.slice(0, 100));
    if (error) throw new Error(error.message);
    return (data ?? []).map((r: { place_key: string; average_rating: number; review_count: number }) => ({
      cafeId: r.place_key,
      average: Number(r.average_rating),
      count: Number(r.review_count),
    }));
  }
  async listReviews(placeKey: string) {
    const { data, error } = await this.db.from('public_reviews').select('*').eq('place_key', placeKey).order('created_at', { ascending: false }).limit(50);
    if (error) throw new Error(error.message);
    return (data as PublicReviewRow[]).map((r) => ({
      id: r.id,
      cafeId: r.place_key,
      userId: r.user_id,
      authorName: r.author_name || 'THIRD PLACE member',
      rating: r.rating,
      body: r.body,
      visitedOn: r.visited_on,
      photoUrl: this.photoUrl(r.photo_path),
      photoPath: r.photo_path,
      createdAt: r.created_at,
      isLocal: false,
    }));
  }
  async submitReview(input: ReviewInput, existing?: Review | null) {
    const user = await this.requireUser();
    let photoPath: string | null = existing?.photoPath ?? null;
    let uploaded: string | null = null;
    if (input.photo) {
      if (!PHOTO_TYPES.includes(input.photo.type)) throw new Error('Photos must be JPEG, PNG or WebP.');
      if (input.photo.size > MAX_PHOTO_BYTES) throw new Error('Photos must be under 3 MB.');
      const ext = input.photo.type === 'image/jpeg' ? 'jpg' : input.photo.type.split('/')[1];
      uploaded = `${user.id}/${uid()}.${ext}`;
      const { error: upErr } = await this.db.storage.from(BUCKET).upload(uploaded, input.photo, { contentType: input.photo.type, upsert: false });
      if (upErr) throw new Error(`Photo upload failed: ${upErr.message}`);
      photoPath = uploaded;
    }
    // user_id defaults to auth.uid() in the database and RLS rejects any other value.
    const { data, error } = await this.db
      .from('reviews')
      .upsert(
        { user_id: user.id, place_key: input.cafeId, rating: input.rating, body: input.body, visited_on: input.visitedOn, photo_path: photoPath },
        { onConflict: 'user_id,place_key' },
      )
      .select('id, created_at')
      .single();
    if (error) {
      await this.removePhoto(uploaded); // don't leave an orphaned upload behind
      throw new Error(error.message);
    }
    if (uploaded && existing?.photoPath && existing.photoPath !== uploaded) await this.removePhoto(existing.photoPath);
    return {
      id: data.id,
      cafeId: input.cafeId,
      userId: user.id,
      authorName: 'You',
      rating: input.rating,
      body: input.body,
      visitedOn: input.visitedOn,
      photoUrl: this.photoUrl(photoPath),
      photoPath,
      createdAt: data.created_at,
      isLocal: false,
    };
  }
  async deleteReview(review: Review) {
    const { error } = await this.db.from('reviews').delete().eq('id', review.id);
    if (error) throw new Error(error.message);
    await this.removePhoto(review.photoPath);
  }
  async submitReport(report: FacilityReport) {
    const user = await this.requireUser();
    const { error } = await this.db.from('facility_reports').insert({
      user_id: user.id,
      place_key: report.cafeId,
      report_type: report.reportType,
      facility: report.facility,
      reported_available: report.reportedAvailable ?? null,
      reported_value: report.reportedValue,
      details: report.details,
    });
    if (error) throw new Error(error.message);
  }
  async flagReview(reviewId: string, reason: string) {
    const user = await this.requireUser();
    const { error } = await this.db.from('content_flags').insert({ user_id: user.id, review_id: reviewId, reason });
    if (error) throw new Error(/duplicate/i.test(error.message) ? 'You already flagged this review.' : error.message);
  }
}
