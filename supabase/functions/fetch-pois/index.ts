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
// Required secret (set in Supabase dashboard → Project Settings → Edge Functions):
//   SUPABASE_SERVICE_ROLE_KEY

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

// Curated tag set — mirrors POI_OSM_TAGS in poiConstants.js
const OSM_TAG_FILTERS = [
  'node["tourism"](around:{radius},{lat},{lng});',
  'node["historic"](around:{radius},{lat},{lng});',
  'node["leisure"="park"](around:{radius},{lat},{lng});',
  'node["amenity"="cafe"](around:{radius},{lat},{lng});',
  'node["amenity"="restaurant"](around:{radius},{lat},{lng});',
];

/** @param {Record<string,string>} tags */
function deriveCategory(tags) {
  if (tags.amenity === 'cafe')        return 'cafe';
  if (tags.amenity === 'restaurant')  return 'restaurant';
  if (tags.leisure === 'park')        return 'park';
  if (tags.historic)                  return 'historic';
  if (tags.tourism)                   return 'tourism';
  return 'default';
}

/**
 * Normalizes a raw Overpass element into a NormalizedPoi.
 * @param {{ type: string, id: number, lat?: number, lon?: number, center?: { lat: number, lon: number }, tags: Record<string,string> }} el
 */
function normalize(el) {
  const lat = el.lat ?? el.center?.lat;
  const lng = el.lon ?? el.center?.lon;
  if (lat === undefined || lng === undefined) return null;

  const tags     = el.tags ?? {};
  const category = deriveCategory(tags);
  const name     = tags.name || tags['name:en'] || category;

  return {
    id:      `${el.type}/${el.id}`,
    osmId:   String(el.id),
    osmType: el.type,
    lat,
    lng,
    name,
    category,
    tags,
  };
}

Deno.serve(async (req) => {
  // CORS pre-flight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin':  '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400 });
  }

  const { geohash, lat, lng, radiusMeters = 500, ttlSeconds = 172800 } = body;

  if (!geohash || lat == null || lng == null) {
    return new Response(JSON.stringify({ error: 'Missing required fields: geohash, lat, lng' }), { status: 400 });
  }

  // ── 1. Build Overpass QL query ────────────────────────────────────────────
  const filledFilters = OSM_TAG_FILTERS.map((f) =>
    f
      .replace('{radius}', radiusMeters)
      .replace('{lat}',    lat)
      .replace('{lng}',    lng)
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

  // ── 2. Fetch from Overpass ────────────────────────────────────────────────
  let elements;
  try {
    const resp = await fetch(OVERPASS_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    `data=${encodeURIComponent(overpassQuery)}`,
    });

    if (!resp.ok) {
      throw new Error(`Overpass responded with HTTP ${resp.status}`);
    }

    const json = await resp.json();
    elements = json.elements ?? [];
  } catch (err) {
    console.error('[fetch-pois] Overpass fetch failed:', err);
    return new Response(JSON.stringify({ error: 'Overpass query failed', detail: err.message }), { status: 502 });
  }

  // ── 3. Normalize ──────────────────────────────────────────────────────────
  const pois = elements
    .map(normalize)
    .filter(Boolean);

  // ── 4. Upsert into poi_cache via service role ─────────────────────────────
  const supabaseUrl    = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SERVICE_ROLE_KEY') || '';

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const { error: upsertError } = await adminClient
    .from('poi_cache')
    .upsert({
      geohash,
      fetched_at:  new Date().toISOString(),
      ttl_seconds: ttlSeconds,
      pois,
    }, { onConflict: 'geohash' });

  if (upsertError) {
    // Non-fatal: log and still return the POIs so the client isn't blocked
    console.error('[fetch-pois] Cache upsert failed:', upsertError.message);
  }

  // ── 5. Return normalized POIs ─────────────────────────────────────────────
  return new Response(JSON.stringify({ pois }), {
    headers: {
      'Content-Type':                'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
});
