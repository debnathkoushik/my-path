// Supabase Edge Function: fetch-pois
// Deno runtime (Supabase Edge Functions use Deno)
//
// Responsibilities:
//  1. Receive { geohash, lat, lng, radiusMeters, ttlSeconds } from the client
//  2. Query the Overpass API for POIs within `radiusMeters` of (lat, lng)
//  3. Normalize results to NormalizedPoi[]
//  4. Upsert into poi_cache using the service role key (bypasses RLS)
//  5. Return { pois: NormalizedPoi[] }
//
// Deploy with:
//   supabase functions deploy fetch-pois
//
//   SUPABASE_SERVICE_ROLE_KEY

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const OVERPASS_ENDPOINTS = [
  'https://lz4.overpass-api.de/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];
const OSM_TAG_FILTERS = [
  'node["tourism"](around:{radius},{lat},{lng});',
  'node["historic"](around:{radius},{lat},{lng});',
  'node["leisure"="park"](around:{radius},{lat},{lng});',
  'node["amenity"="cafe"](around:{radius},{lat},{lng});',
  'node["amenity"="restaurant"](around:{radius},{lat},{lng});',
];

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/** @param {Record<string, string>} tags */
function deriveCategory(tags) {
  if (tags.amenity === 'cafe') return 'cafe';
  if (tags.amenity === 'restaurant') return 'restaurant';
  if (tags.leisure === 'park') return 'park';
  if (tags.historic) return 'historic';
  if (tags.tourism) return 'tourism';
  return 'default';
}

/**
 * Normalizes a raw Overpass element into a NormalizedPoi.
 * @param {{ type: string, id: number, lat?: number, lon?: number, center?: { lat: number, lon: number }, tags?: Record<string, string> }} el
 */
function normalize(el) {
  const lat = el.lat ?? el.center?.lat;
  const lng = el.lon ?? el.center?.lon;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const tags = el.tags ?? {};
  const category = deriveCategory(tags);

  return {
    id:      `${el.type}/${el.id}`,
    osmId:   String(el.id),
    osmType: el.type,
    lat,
    lng,
    name: tags.name || tags['name:en'] || category,
    category,
    tags,
  };
}

Deno.serve(async (req) => {
  // CORS pre-flight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        ...corsHeaders,
      },
    });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return jsonResponse({ error: 'Request body must be a JSON object' }, 400);
  }

  const { geohash, lat, lng, radiusMeters = 500, ttlSeconds = 172800 } = body;

  if (
    typeof geohash !== 'string' || !geohash.trim() ||
    !Number.isFinite(lat) || lat < -90 || lat > 90 ||
    !Number.isFinite(lng) || lng < -180 || lng > 180 ||
    !Number.isFinite(radiusMeters) || radiusMeters <= 0 || radiusMeters > 50_000 ||
    !Number.isFinite(ttlSeconds) || ttlSeconds <= 0
  ) {
    return jsonResponse({ error: 'Invalid geohash, coordinates, radiusMeters, or ttlSeconds' }, 400);
  }

  const filledFilters = OSM_TAG_FILTERS.map((filter) =>
    filter
      .replace('{radius}', String(radiusMeters))
      .replace('{lat}', String(lat))
      .replace('{lng}', String(lng))
  ).join('\n');

  const overpassQuery = `
    [out:json][timeout:25];
    (
      ${filledFilters}
    );
    out body;
    >;
    out skel qt;
  `.trim();

  // ── 1. Fetch from Overpass (multi-endpoint fallback) ──────────────────────
  let elements = null;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'PathFinder-GPS/1.0 (https://github.com/debnathkoushik/my-path)',
        },
        body: `data=${encodeURIComponent(overpassQuery)}`,
        signal: AbortSignal.timeout(10_000),
      });

      if (!resp.ok) {
        throw new Error(`Endpoint ${endpoint} responded with HTTP ${resp.status}`);
      }

      const json = await resp.json();
      if (Array.isArray(json?.elements)) {
        elements = json.elements;
        break;
      }
    } catch (err) {
      console.warn(`[fetch-pois] Failed to fetch from ${endpoint}:`, err);
    }
  }

  if (elements === null) {
    console.error('[fetch-pois] All Overpass endpoints failed');
    return jsonResponse({ error: 'Overpass query failed' }, 502);
  }

  // ── 2. Normalize ──────────────────────────────────────────────────────────
  const pois = elements
    .map(normalize)
    .filter(Boolean);

  // ── 3. Upsert into poi_cache via service role ─────────────────────────────
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SERVICE_ROLE_KEY') || '';

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('[fetch-pois] Supabase cache credentials are not configured');
    return jsonResponse({ pois, degraded: true, error: 'CACHE_UNAVAILABLE' });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
  const { error: upsertError } = await adminClient
    .from('poi_cache')
    .upsert({
      geohash,
      fetched_at: new Date().toISOString(),
      ttl_seconds: ttlSeconds,
      pois,
    }, { onConflict: 'geohash' });

  if (upsertError) {
    console.error('[fetch-pois] Cache upsert failed:', upsertError.message);
  }

  return jsonResponse({ pois });
});
