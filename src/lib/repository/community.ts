import type { FacilityReport, RatingSummary, Review } from '@/types';
import { supabase } from '@/lib/supabase';
import { readLocal, uid, writeLocal } from '@/lib/storage';

export interface ReviewInput {
  cafeId: string;
  rating: number;
  body: string;
  visitedOn: string | null;
  photo?: File | null;
}

/**
 * Reviews, ratings and correction reports.
 * - With Supabase + a signed-in user: stored in the database (RLS-protected).
 * - Otherwise: stored only in this browser and clearly labelled as such.
 * Ratings are always computed from actual review records — never seeded.
 */
export interface CommunityRepository {
  readonly mode: 'account' | 'device';
  ratingSummaries(): Promise<RatingSummary[]>;
  listReviews(cafeId: string): Promise<Review[]>;
  submitReview(input: ReviewInput): Promise<Review>;
  deleteReview(reviewId: string): Promise<void>;
  submitReport(report: FacilityReport): Promise<void>;
}

const MAX_PHOTO_BYTES = 3 * 1024 * 1024;
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

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
  async ratingSummaries() {
    return summarise(this.all());
  }
  async listReviews(cafeId: string) {
    return this.all()
      .filter((r) => r.cafeId === cafeId)
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
    writeLocal('reviews', [...existing, review]);
    return review;
  }
  async deleteReview(reviewId: string) {
    writeLocal('reviews', this.all().filter((r) => r.id !== reviewId));
  }
  async submitReport(report: FacilityReport) {
    const reports = readLocal<(FacilityReport & { createdAt: string })[]>('reports', []);
    writeLocal('reports', [...reports, { ...report, createdAt: new Date().toISOString() }].slice(-100));
  }
}

// ── Supabase implementation ───────────────────────────────────
interface PublicReviewRow {
  id: string;
  cafe_id: string;
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
    if (!data.user) throw new Error('Please sign in first');
    return data.user;
  }
  private photoUrl(path: string | null): string | null {
    if (!path) return null;
    return this.db.storage.from('review-photos').getPublicUrl(path).data.publicUrl;
  }
  async ratingSummaries() {
    const { data, error } = await this.db.from('cafe_rating_summary').select('cafe_id, average_rating, review_count');
    if (error) throw new Error(error.message);
    return (data ?? []).map((r: { cafe_id: string; average_rating: number; review_count: number }) => ({
      cafeId: r.cafe_id,
      average: Number(r.average_rating),
      count: Number(r.review_count),
    }));
  }
  async listReviews(cafeId: string) {
    const { data, error } = await this.db
      .from('public_reviews')
      .select('*')
      .eq('cafe_id', cafeId)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return (data as PublicReviewRow[]).map((r) => ({
      id: r.id,
      cafeId: r.cafe_id,
      userId: r.user_id,
      authorName: r.author_name || 'THIRD PLACE member',
      rating: r.rating,
      body: r.body,
      visitedOn: r.visited_on,
      photoUrl: this.photoUrl(r.photo_path),
      createdAt: r.created_at,
      isLocal: false,
    }));
  }
  async submitReview(input: ReviewInput) {
    const user = await this.requireUser();
    let photoPath: string | null = null;
    if (input.photo) {
      if (!PHOTO_TYPES.includes(input.photo.type)) throw new Error('Photos must be JPEG, PNG or WebP');
      if (input.photo.size > MAX_PHOTO_BYTES) throw new Error('Photos must be under 3 MB');
      const ext = input.photo.type.split('/')[1];
      photoPath = `${user.id}/${uid()}.${ext}`;
      const { error: upErr } = await this.db.storage.from('review-photos').upload(photoPath, input.photo, { contentType: input.photo.type, upsert: false });
      if (upErr) throw new Error(`Photo upload failed: ${upErr.message}`);
    }
    const { data, error } = await this.db
      .from('reviews')
      .upsert(
        { user_id: user.id, cafe_id: input.cafeId, rating: input.rating, body: input.body, visited_on: input.visitedOn, photo_path: photoPath },
        { onConflict: 'user_id,cafe_id' },
      )
      .select('id, created_at')
      .single();
    if (error) throw new Error(error.message);
    return {
      id: data.id,
      cafeId: input.cafeId,
      userId: user.id,
      authorName: 'You',
      rating: input.rating,
      body: input.body,
      visitedOn: input.visitedOn,
      photoUrl: this.photoUrl(photoPath),
      createdAt: data.created_at,
      isLocal: false,
    };
  }
  async deleteReview(reviewId: string) {
    const { error } = await this.db.from('reviews').delete().eq('id', reviewId);
    if (error) throw new Error(error.message);
  }
  async submitReport(report: FacilityReport) {
    const user = await this.requireUser();
    const { error } = await this.db.from('facility_reports').insert({
      user_id: user.id,
      cafe_id: report.cafeId,
      report_type: report.reportType,
      facility: report.facility,
      reported_value: report.reportedValue,
      details: report.details,
    });
    if (error) throw new Error(error.message);
  }
}
