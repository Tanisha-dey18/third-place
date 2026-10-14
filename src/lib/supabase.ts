import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { config } from './config';

/**
 * Supabase browser client, created only when configured.
 * Uses the anon/publishable key; all private data is protected by RLS.
 */
export const supabase: SupabaseClient | null = config.supabaseConfigured
  ? createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null;
