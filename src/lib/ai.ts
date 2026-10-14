import type { Match, Preferences } from './engine';
import { parseQuery, sanitizePreferences, type ParseResult } from './engine';
import { config } from './config';

// Browser side of the optional AI integration. It never holds API keys:
// it calls our own Netlify Function, which talks to the provider.
// Any failure (not configured, rate-limited, timeout, invalid output)
// falls back to the deterministic parser, so search always works.

const ENDPOINT = '/api/ai-search';

export interface InterpretResult extends ParseResult {
  engine: 'ai' | 'rules';
  provider?: string;
}

async function post<T>(body: unknown, timeoutMs = 9000): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`AI function returned ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(t);
  }
}

export async function interpretQuery(query: string): Promise<InterpretResult> {
  const rules = parseQuery(query);
  if (!config.aiSearchEnabled) return { ...rules, engine: 'rules' };
  try {
    const data = await post<{ prefs: unknown; provider: string }>({ action: 'parse', query });
    const prefs = sanitizePreferences(data.prefs);
    // Location from the device is never sent to the AI; keep the rule-based "near me" signal.
    return { prefs, understood: rules.understood, wantsNearby: rules.wantsNearby, engine: 'ai', provider: data.provider };
  } catch (e) {
    console.warn('[THIRD PLACE] AI parsing unavailable, using rule-based parser.', e);
    return { ...rules, engine: 'rules' };
  }
}

/**
 * Ask the AI for short explanations of results that the deterministic
 * engine already selected. Only facts from those records are sent, and
 * only explanations for those exact IDs are accepted back.
 */
export async function explainMatches(query: string, matches: Match[]): Promise<Record<string, string>> {
  if (!config.aiSearchEnabled || matches.length === 0) return {};
  const top = matches.slice(0, 5);
  const allowed = new Set(top.map((m) => m.cafe.id));
  try {
    const data = await post<{ explanations: Record<string, unknown> }>({
      action: 'explain',
      query,
      results: top.map((m) => ({
        id: m.cafe.id,
        name: m.cafe.name,
        neighbourhood: m.cafe.neighbourhood,
        priceMin: m.cafe.priceMin,
        priceMax: m.cafe.priceMax,
        reasons: m.reasons,
        unknowns: m.unknowns,
      })),
    });
    const out: Record<string, string> = {};
    for (const [id, text] of Object.entries(data.explanations ?? {})) {
      if (allowed.has(id) && typeof text === 'string' && text.length <= 400) out[id] = text;
    }
    return out;
  } catch {
    return {};
  }
}

export type { Preferences };
