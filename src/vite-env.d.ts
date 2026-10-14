/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_DEMO_MODE?: string;
  /** @deprecated no longer used */
  readonly VITE_CAFE_DATA_SOURCE?: string;
  readonly VITE_MAP_TILE_URL?: string;
  readonly VITE_MAP_ATTRIBUTION?: string;
  readonly VITE_MAP_ENABLED?: string;
  readonly VITE_AI_SEARCH_ENABLED?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
