import type { UserCollection, UserProfile } from '@/types';
import { supabase } from '@/lib/supabase';
import { readLocal, uid, writeLocal } from '@/lib/storage';

/** Saved places and user collections. */
export interface LibraryRepository {
  readonly mode: 'account' | 'device';
  listSaved(): Promise<string[]>;
  setSaved(cafeId: string, saved: boolean): Promise<void>;
  listCollections(): Promise<UserCollection[]>;
  createCollection(name: string, description?: string | null): Promise<UserCollection>;
  renameCollection(id: string, name: string): Promise<void>;
  deleteCollection(id: string): Promise<void>;
  addToCollection(id: string, cafeId: string): Promise<void>;
  removeFromCollection(id: string, cafeId: string): Promise<void>;
}

// ── Device implementation (unauthenticated / demo) ────────────
export class LocalLibraryRepository implements LibraryRepository {
  readonly mode = 'device' as const;
  async listSaved() {
    return readLocal<string[]>('saved', []);
  }
  async setSaved(cafeId: string, saved: boolean) {
    const cur = new Set(readLocal<string[]>('saved', []));
    if (saved) cur.add(cafeId);
    else cur.delete(cafeId);
    writeLocal('saved', Array.from(cur));
  }
  private cols() {
    return readLocal<UserCollection[]>('collections', []);
  }
  private save(cols: UserCollection[]) {
    writeLocal('collections', cols);
  }
  private touch(id: string, fn: (c: UserCollection) => UserCollection) {
    this.save(this.cols().map((c) => (c.id === id ? { ...fn(c), updatedAt: new Date().toISOString() } : c)));
  }
  async listCollections() {
    return this.cols();
  }
  async createCollection(name: string, description: string | null = null) {
    const now = new Date().toISOString();
    const col: UserCollection = { id: uid(), name, description, cafeIds: [], createdAt: now, updatedAt: now };
    this.save([...this.cols(), col]);
    return col;
  }
  async renameCollection(id: string, name: string) {
    this.touch(id, (c) => ({ ...c, name }));
  }
  async deleteCollection(id: string) {
    this.save(this.cols().filter((c) => c.id !== id));
  }
  async addToCollection(id: string, cafeId: string) {
    this.touch(id, (c) => ({ ...c, cafeIds: c.cafeIds.includes(cafeId) ? c.cafeIds : [...c.cafeIds, cafeId] }));
  }
  async removeFromCollection(id: string, cafeId: string) {
    this.touch(id, (c) => ({ ...c, cafeIds: c.cafeIds.filter((x) => x !== cafeId) }));
  }
}

// ── Supabase implementation (signed-in users) ─────────────────
export class SupabaseLibraryRepository implements LibraryRepository {
  readonly mode = 'account' as const;
  constructor(private readonly userId: string) {}
  private get db() {
    if (!supabase) throw new Error('Supabase is not configured');
    return supabase;
  }
  async listSaved() {
    const { data, error } = await this.db.from('saved_places').select('cafe_id').order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map((r: { cafe_id: string }) => r.cafe_id);
  }
  async setSaved(cafeId: string, saved: boolean) {
    const q = saved
      ? this.db.from('saved_places').upsert({ user_id: this.userId, cafe_id: cafeId }, { onConflict: 'user_id,cafe_id', ignoreDuplicates: true })
      : this.db.from('saved_places').delete().eq('user_id', this.userId).eq('cafe_id', cafeId);
    const { error } = await q;
    if (error) throw new Error(error.message);
  }
  async listCollections() {
    const { data, error } = await this.db
      .from('collections')
      .select('id, name, description, created_at, updated_at, collection_items(cafe_id, created_at)')
      .order('created_at');
    if (error) throw new Error(error.message);
    return (data ?? []).map(
      (c: { id: string; name: string; description: string | null; created_at: string; updated_at: string; collection_items: { cafe_id: string; created_at: string }[] }) => ({
        id: c.id,
        name: c.name,
        description: c.description,
        createdAt: c.created_at,
        updatedAt: c.updated_at,
        cafeIds: (c.collection_items ?? []).sort((a, b) => a.created_at.localeCompare(b.created_at)).map((i) => i.cafe_id),
      }),
    );
  }
  async createCollection(name: string, description: string | null = null) {
    const { data, error } = await this.db
      .from('collections')
      .insert({ user_id: this.userId, name, description })
      .select('id, name, description, created_at, updated_at')
      .single();
    if (error) throw new Error(error.message);
    return { id: data.id, name: data.name, description: data.description, createdAt: data.created_at, updatedAt: data.updated_at, cafeIds: [] };
  }
  async renameCollection(id: string, name: string) {
    const { error } = await this.db.from('collections').update({ name }).eq('id', id);
    if (error) throw new Error(error.message);
  }
  async deleteCollection(id: string) {
    const { error } = await this.db.from('collections').delete().eq('id', id);
    if (error) throw new Error(error.message);
  }
  async addToCollection(id: string, cafeId: string) {
    const { error } = await this.db
      .from('collection_items')
      .upsert({ collection_id: id, cafe_id: cafeId }, { onConflict: 'collection_id,cafe_id', ignoreDuplicates: true });
    if (error) throw new Error(error.message);
  }
  async removeFromCollection(id: string, cafeId: string) {
    const { error } = await this.db.from('collection_items').delete().eq('collection_id', id).eq('cafe_id', cafeId);
    if (error) throw new Error(error.message);
  }
}

// ── Profiles ─────────────────────────────────────────────────
interface ProfileRow {
  id: string;
  display_name: string | null;
  preferred_budget: UserProfile['preferredBudget'];
  preferred_neighbourhood: string | null;
  dietary_preferences: string[] | null;
}

export async function fetchProfile(userId: string): Promise<UserProfile | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from('user_profiles').select('*').eq('id', userId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const r = data as ProfileRow;
  return {
    id: r.id,
    displayName: r.display_name,
    preferredBudget: r.preferred_budget,
    preferredNeighbourhood: r.preferred_neighbourhood,
    dietaryPreferences: r.dietary_preferences ?? [],
  };
}

export async function saveProfile(p: UserProfile): Promise<void> {
  if (!supabase) throw new Error('Supabase is not configured');
  const { error } = await supabase.from('user_profiles').upsert({
    id: p.id,
    display_name: p.displayName,
    preferred_budget: p.preferredBudget,
    preferred_neighbourhood: p.preferredNeighbourhood,
    dietary_preferences: p.dietaryPreferences,
  });
  if (error) throw new Error(error.message);
}

/** Local (device) preferences for visitors without an account. */
export function readLocalPrefs(): Omit<UserProfile, 'id'> {
  return readLocal('prefs', { displayName: null, preferredBudget: null, preferredNeighbourhood: null, dietaryPreferences: [] as string[] });
}
export function writeLocalPrefs(p: Omit<UserProfile, 'id'>) {
  writeLocal('prefs', p);
}
