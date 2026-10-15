// ───────────────────────────────────────────────────────────────
// THIRD PLACE · AI search function (Netlify Functions, Node 20)
//
// POST /api/ai-search
//   { action: "parse",   query }                 → { prefs, provider }
//   { action: "explain", query, results: [...] } → { explanations: { [id]: text } }
//
// Security model
// • API keys are read from server-side env vars only (never VITE_*).
// • The model only ever (a) extracts preferences into a fixed vocabulary,
//   validated by sanitizePreferences, or (b) writes one sentence about
//   records the deterministic engine ALREADY selected. It cannot add,
//   rename or invent places; unknown IDs are discarded.
// • No personal data is sent: no user IDs, emails or device location.
// • Input size limits, origin allow-list and a per-IP rate limit.
// The browser falls back to the rule-based parser on any error.
// ───────────────────────────────────────────────────────────────
import type { Config } from '@netlify/functions';
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import * as z from 'zod/v4';
import { sanitizePreferences } from '../../src/lib/engine/sanitize';
import { ATMOSPHERE_LABELS, FACILITY_LABELS, NEIGHBOURHOODS, OCCASION_LABELS } from '../../src/lib/taxonomy';
import { clientIp, corsHeaders, errorBody, json, NO_STORE, serverEnv } from '../../server/http';
import { createSharedRateLimiter, rateLimitStore } from '../../server/rateLimit';

type Provider = 'anthropic' | 'gemini' | 'groq';

const MAX_BODY = 8_000;
// Safety net only; the shared limit is Netlify's platform rate limiting (see config below).
// Shared across all function instances (Netlify Blobs). Netlify's platform rate-limit rules were
// verified NOT to be enforced on this site, and an in-memory counter only sees one instance.
// AI_DAILY_LIMIT caps total provider calls per UTC day to bound cost (default 500).
const limiter = createSharedRateLimiter(
  { route: 'ai', perClient: 20, windowMs: 60_000, globalPerDay: Math.max(1, Number(process.env.AI_DAILY_LIMIT) || 500) },
  rateLimitStore,
);

const DEFAULT_MODELS: Record<Provider, string> = {
  anthropic: 'claude-opus-5-5',
  gemini: 'gemini-2.5-flash',
  groq: 'llama-3.3-70b-versatile',
};

// ── Schemas ─────────────────────────────────────────────────────
const occasions = Object.keys(OCCASION_LABELS) as [string, ...string[]];
const atmospheres = Object.keys(ATMOSPHERE_LABELS) as [string, ...string[]];
const facilities = Object.keys(FACILITY_LABELS) as [string, ...string[]];
const neighbourhoods = NEIGHBOURHOODS.map((n) => n.slug) as [string, ...string[]];

const Extraction = z.object({
  occasion: z.enum(occasions).nullable(),
  maxBudgetInr: z.number().nullable(),
  neighbourhood: z.enum(neighbourhoods).nullable(),
  region: z.enum(['central', 'south', 'east', 'north']).nullable(),
  atmosphere: z.array(z.enum(atmospheres)),
  requiredFacilities: z.array(z.enum(facilities)),
  preferredFacilities: z.array(z.enum(facilities)),
  maxDistanceKm: z.number().nullable(),
  foodType: z.string().nullable(),
  seating: z.enum(['indoor', 'outdoor']).nullable(),
  minRating: z.number().nullable(),
  openAtTime: z.string().nullable(),
  durationHours: z.number().nullable(),
  keywords: z.array(z.string()),
});
type ExtractionT = z.infer<typeof Extraction>;

const Explanations = z.object({
  explanations: z.array(z.object({ id: z.string(), text: z.string() })),
});

const ParseBody = z.object({ action: z.literal('parse'), query: z.string().trim().min(2).max(300) });
const ExplainBody = z.object({
  action: z.literal('explain'),
  query: z.string().trim().min(2).max(300),
  results: z
    .array(
      z.object({
        id: z.string().max(64),
        name: z.string().max(120),
        neighbourhood: z.string().max(60),
        priceMin: z.number().nullable(),
        priceMax: z.number().nullable(),
        reasons: z.array(z.string().max(200)).max(10),
        unknowns: z.array(z.string().max(200)).max(10),
      }),
    )
    .min(1)
    .max(5),
});

// ── Prompts ─────────────────────────────────────────────────────
const PARSE_SYSTEM = `You convert a person's request for a café or hangout in Kolkata, India into structured search preferences.
Use ONLY the allowed enum values. Use null or [] when the request doesn't say something. Never guess.
- occasion: one of ${occasions.join(', ')}.
- maxBudgetInr: per-person ceiling in rupees if stated ("under 400", "cheap" ≈ 300), else null.
- neighbourhood: one of ${neighbourhoods.join(', ')} if a specific area is named; region (central/south/east/north) for "South Kolkata" etc.
- requiredFacilities: only facilities the person says they NEED (${facilities.join(', ')}). "Laptop-friendly" alone is NOT wifi or charging; use atmosphere work_friendly. Needing to charge a laptop → charging.
- preferredFacilities: facilities mentioned as nice-to-have or without stating a need. Staying 2+ hours → long_stay here.
- atmosphere: from ${atmospheres.join(', ')}.
- openAtTime: "HH:MM" 24h if they need it open at a time.
- keywords: up to 5 notable words (dishes, styles) not covered above.
Return only the structured object.`;

const EXPLAIN_SYSTEM = `You write one short, friendly sentence (max 30 words) per place explaining why it suits the request.
Use ONLY the facts provided for that place (reasons, price, neighbourhood). If unknowns are listed, briefly note one.
Never add facilities, prices, hours, dishes, ratings or reviews that are not in the provided facts. Never mention places not provided.
Return an explanation for each provided id.`;

// ── Provider calls ──────────────────────────────────────────────
async function callAnthropic<T>(model: string, system: string, user: string, schema: z.ZodType<T>): Promise<T> {
  const client = new Anthropic({ apiKey: serverEnv().ANTHROPIC_API_KEY, timeout: 15_000, maxRetries: 1 });
  const res = await client.messages.parse({
    model,
    max_tokens: 4000,
    system,
    messages: [{ role: 'user', content: user }],
    output_config: { effort: 'low', format: zodOutputFormat(schema) },
  });
  if (res.stop_reason === 'refusal' || !res.parsed_output) throw new Error('No structured output');
  return res.parsed_output as T;
}

async function callGemini<T>(model: string, system: string, user: string, schema: z.ZodType<T>): Promise<T> {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': serverEnv().GEMINI_API_KEY ?? '' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: `${system}\nRespond with JSON matching this schema: ${JSON.stringify(z.toJSONSchema(schema))}` }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0 },
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}`);
  const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  return schema.parse(JSON.parse(text));
}

async function callGroq<T>(model: string, system: string, user: string, schema: z.ZodType<T>): Promise<T> {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${serverEnv().GROQ_API_KEY ?? ''}` },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: `${system}\nRespond with JSON matching this schema: ${JSON.stringify(z.toJSONSchema(schema))}` },
        { role: 'user', content: user },
      ],
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Groq ${res.status}`);
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return schema.parse(JSON.parse(data.choices?.[0]?.message?.content ?? ''));
}

function providerConfig(): { provider: Provider; model: string } | null {
  const env = serverEnv();
  const p = (env.AI_PROVIDER ?? '').toLowerCase() as Provider;
  const keys: Record<Provider, string | undefined> = {
    anthropic: env.ANTHROPIC_API_KEY,
    gemini: env.GEMINI_API_KEY,
    groq: env.GROQ_API_KEY,
  };
  if (!(p in keys) || !keys[p]) return null;
  return { provider: p, model: env.AI_MODEL || DEFAULT_MODELS[p] };
}

function call<T>(cfg: { provider: Provider; model: string }, system: string, user: string, schema: z.ZodType<T>): Promise<T> {
  if (cfg.provider === 'anthropic') return callAnthropic(cfg.model, system, user, schema);
  if (cfg.provider === 'gemini') return callGemini(cfg.model, system, user, schema);
  return callGroq(cfg.model, system, user, schema);
}

function toPreferences(x: ExtractionT) {
  return sanitizePreferences({
    occasion: x.occasion,
    maxBudget: x.maxBudgetInr,
    location: x.neighbourhood ? { mode: 'neighbourhood', slug: x.neighbourhood } : x.region ? { mode: 'region', region: x.region } : { mode: 'anywhere' },
    atmosphere: x.atmosphere,
    requiredFacilities: x.requiredFacilities,
    preferredFacilities: x.preferredFacilities,
    maxDistanceKm: x.maxDistanceKm,
    foodType: x.foodType,
    seating: x.seating,
    minRating: x.minRating,
    openAt: x.openAtTime ? { day: new Date().getDay(), time: x.openAtTime } : null,
    keywords: x.keywords,
    durationHours: x.durationHours,
  });
}

// ── HTTP ─────────────────────────────────────────────────────────

export default async function handler(req: Request): Promise<Response> {
  const cors = corsHeaders(req, serverEnv());
  if (cors === false) return json(403, errorBody('origin_not_allowed', 'Origin not allowed.'), NO_STORE);
  const h = { ...cors, ...NO_STORE };
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { ...cors, 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type' } });
  }
  if (req.method !== 'POST') return json(405, errorBody('method_not_allowed', 'Use POST.'), { ...h, Allow: 'POST' });

  const cfg = providerConfig();
  if (!cfg) return json(503, errorBody('not_configured', 'AI search is not configured.'), h);

  const decision = await limiter.check(clientIp(req));
  if (!decision.allowed) {
    console.log(JSON.stringify({ evt: 'rate_limited', route: 'ai', reason: decision.reason, shared: decision.shared }));
    const msg = decision.reason === 'global' ? 'AI search has reached today’s limit. Rule-based search still works.' : 'Too many requests, please slow down.';
    return json(429, errorBody('rate_limited', msg, true), { ...h, 'Retry-After': String(decision.retryAfter) });
  }

  const declared = Number(req.headers.get('content-length') ?? '0');
  if (declared > MAX_BODY) return json(413, errorBody('too_large', 'Request too large.'), h);
  const raw = await req.text();
  if (raw.length > MAX_BODY) return json(413, errorBody('too_large', 'Request too large.'), h);
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json(400, errorBody('invalid_json', 'Invalid JSON.'), h);
  }

  try {
    const parse = ParseBody.safeParse(body);
    if (parse.success) {
      const extraction = await call(cfg, PARSE_SYSTEM, parse.data.query, Extraction);
      return json(200, { prefs: toPreferences(extraction), provider: cfg.provider }, h);
    }
    const explain = ExplainBody.safeParse(body);
    if (explain.success) {
      const allowed = new Set(explain.data.results.map((r) => r.id));
      const facts = explain.data.results.map((r) => ({
        id: r.id,
        name: r.name,
        neighbourhood: r.neighbourhood,
        pricePerPersonInr: r.priceMin == null ? 'unknown' : `${r.priceMin}-${r.priceMax ?? r.priceMin}`,
        reasons: r.reasons,
        unknowns: r.unknowns,
      }));
      const out = await call(cfg, EXPLAIN_SYSTEM, `Request: ${explain.data.query}\n\nPlaces (the only ones you may mention):\n${JSON.stringify(facts)}`, Explanations);
      const explanations: Record<string, string> = {};
      for (const e of out.explanations) {
        if (allowed.has(e.id) && e.text.length <= 400) explanations[e.id] = e.text.trim();
      }
      return json(200, { explanations }, h);
    }
    return json(400, errorBody('invalid_request', 'Invalid request.'), h);
  } catch (err) {
    // Log server-side without echoing provider details to the client.
    console.error('[ai-search]', err instanceof Error ? err.message : err);
    return json(502, errorBody('provider_unavailable', 'AI provider unavailable.', true), h);
  }
}

export const config: Config = {
  path: '/api/ai-search',
  method: ['POST', 'OPTIONS'],
  rateLimit: { windowLimit: 20, windowSize: 60, aggregateBy: ['ip', 'domain'] },
};
