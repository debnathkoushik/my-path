# Current POI Specification: OpenStreetMap and Overpass

> **Status:** The Google Maps migration proposal in the historical sections below has been superseded. The active implementation uses Leaflet with OpenStreetMap tiles and retrieves POIs from Overpass. Do not follow the historical Google key, billing, attribution, or Places-retention instructions.

## Active behavior

- The app renders live and shared routes on Leaflet using OpenStreetMap tiles.
- While recording, movement-gated, leading/trailing fetches call the Supabase `fetch-pois` Edge Function, which queries Overpass and normalizes OSM data.
- The Edge Function writes geohash results to the existing `poi_cache` table with the service-role key. The client reads this cache and never writes to it directly.
- Cache misses fetch immediately; stale cache entries are shown while background refreshes run.
- POI marker rendering is separately throttled to 3 seconds, compared by OSM ID independently of result ordering, and published to React when background refreshes complete.
- IndexedDB provides an offline copy of normalized OSM POIs. Route tracking and saving do not depend on POI API availability.

The remainder of this document records the earlier Google migration proposal for history only; its requirements and checklist are not active.

## 1. Aim of the changes

The project discovers nearby POIs through Overpass behind a Supabase Edge Function and renders the app on Leaflet. The goal is to use Google Places API (New) for POI discovery and Google Maps JavaScript API for map display while preserving route tracking and the normalized POI contract.

The migration should keep the following unchanged from the user’s perspective:
- POI markers still appear on the map during recording.
- POI markers still appear during recording, with display fields fetched fresh.
- The map still renders route and POI markers in a throttled, non-jittery way.
- The UI and route-tracking flow remain stable.

## 2. Scope of the changes

This work changes the provider and map-rendering boundary, not the route-tracking UX model. The migration should be compatibility-first.

### Primary technical scope
- Swap the provider in the edge function from Overpass to Google Places API (New).
- Replace Leaflet/CARTO with Google Maps JavaScript API because Places content cannot be displayed on a non-Google map under the applicable service terms.
- Keep the data contract for the rest of the app compatible with the current `NormalizedPoi` shape.
- Keep network and render throttling, while removing persistent storage of Google place names and types.
- Persist only Google Place IDs and coordinates for offline fallback, expiring coordinates after 30 days.

### Explicit non-goals
- Redesigning route recording or distance tracking.
- Redesigning route recording or the record/save flow.

## 3. Required changes

### 3.1 Provider replacement
Replace the current Overpass implementation in [supabase/functions/fetch-pois/index.ts](supabase/functions/fetch-pois/index.ts) with Google Maps-based POI lookups. The function should still:
- accept `{ geohash, lat, lng, radiusMeters, ttlSeconds }`
- query Google Places Nearby Search (New)
- normalize results into the app’s internal POI shape
- return the fresh result without persisting Google place names or types
- return `{ pois: NormalizedPoi[] }`

### 3.2 Data mapping compatibility
Map Google results into the existing POI model expected by the app, including the fields used by:
- [src/poi/poiTypes.js](src/poi/poiTypes.js)
- [src/poi/PoiDiscoveryService.js](src/poi/PoiDiscoveryService.js)
- [src/components/Map/ThrottledPoiMarkers.jsx](src/components/Map/ThrottledPoiMarkers.jsx)

At minimum, each result should provide:
- `id`
- `lat`
- `lng`
- `name`
- `category`
- `tags`

If Google returns fields not already present in the schema, they should be normalized to the existing app contract rather than forcing UI changes.

### 3.3 Category compatibility
The current app color and pin logic expects categories such as:
- tourism
- historic
- park
- cafe
- restaurant
- default

Google place types should be mapped into this existing category model so the UI remains visually consistent without reworking the map marker styling.

### 3.4 Configuration and secrets
Add the required environment setup, including:
- a server-side Places API key stored as a Supabase Edge Function secret
- a separate browser-restricted Maps JavaScript API key and Google Map ID
- request limits or quotas
- safe fallback behavior when no Google results are returned or the API fails

### 3.5 Cache and throttling compatibility
The fetch and render flow must address transition, cost, and timing edge cases:
- **Cache Cutover Policy (Section 5.3):** Truncate legacy `poi_cache` rows and clear old IndexedDB records so Overpass results cannot leak into the Google provider.
- **Google content storage:** Do not persist names or types. IndexedDB may retain Place IDs and coordinates only, with coordinate records deleted after 30 days.
- **Provider request cost:** Make one nearby-search request per movement cycle, not one request per neighboring geohash.
- **Render Throttle Interval Optimization (Section 5.5):** Keep network fetch throttling at 9,000 ms and render throttling at 3,000 ms.
- **Order-Independent Marker Equality (Section 5.4):** Compare POI IDs without depending on response order.
- **Stationary updates (Section 5.6):** Publish fresh responses to React state through a service event callback.

## 4. Expected behavior after the changes

After the migration is complete:

1. When the app is recording and the user moves, the app still fetches nearby places for the active area.
2. The data source is Google Maps instead of Overpass, but the app continues to receive a normalized POI array with the same contract.
3. POI markers still appear on the map during tracking without breaking the current render timing model.
4. Persistent offline fallback contains only Place IDs and coordinates; display names and types come from fresh Places responses.
5. Failed or empty Google responses do not crash the app; they degrade gracefully and return empty POI data when appropriate.
6. Existing route tracking, timer logic, and map behavior remain stable.
7. Marker colors and labels remain consistent with the current style system.

## 5. Failure modes, breakage scenarios, and fixes/fallbacks

This section explicitly lists the failure modes and edge cases that could degrade or break the application during and after the Google Maps migration, detailing the exact failure condition, why and how it breaks the app, and the mandatory fix or fallback.

### 5.1 Provider API key failure, quota exhaustion, or rate limiting
- **Failure mode:** The Google Places API key is missing, unauthorized, restricted by IP/referrer, or billing quota / rate limits are exceeded (HTTP 400, 403, 429, or `OVER_QUERY_LIMIT` / `REQUEST_DENIED`).
- **Why it breaks the app:** If the Supabase edge function does not catch provider errors cleanly, it returns 500 status or throws an uncaught exception. The client [`PoiDiscoveryService`](file:///Users/koushikdebnath/my-path/src/poi/PoiDiscoveryService.js) fetch rejects, triggering unhandled promise rejections, error notification noise, and an interrupted discovery loop. In the worst case, active route tracking stalls or map POI rendering freezes completely while the client hammers the failing API.
- **Fix or fallback:**
  - *Edge function:* Wrap Google API requests in structured try/catch blocks. If Google returns an error or quota exhaustion, log a telemetry error and return HTTP 200 with `{ pois: [], degraded: true, error: "PROVIDER_UNAVAILABLE" }` rather than throwing a 500 error.
  - *Client fallback:* [`PoiDiscoveryService`](src/poi/PoiDiscoveryService.js) preserves currently rendered markers, falls back to locally retained Place IDs/coordinates as unlabeled markers, and exponentially backs off failed requests up to 60 seconds.

---

### 5.2 Schema contract mismatch or missing required fields in `NormalizedPoi`
- **Failure mode:** Google Places API responses omit fields expected by the client (e.g., missing `displayName`, `location`, `types`, or `id`).
- **Why it breaks the app:** 
  - [`ThrottledPoiMarkers`](src/components/Map/ThrottledPoiMarkers.jsx) renders markers by key and coordinate position. Invalid coordinates can cause map marker construction to fail.
  - Unknown categories can lose intended marker colors unless they fall back to `default`.
  - If `poi.id` is missing or duplicate, React warns on key collision and DOM reconciler re-mounts elements incorrectly.
- **Fix or fallback:**
  - *Strict normalization in edge function:* Enforce runtime validation in [`fetch-pois/index.ts`](file:///Users/koushikdebnath/my-path/supabase/functions/fetch-pois/index.ts) mapping:
    - `id`: require `place.id` and prefix it with `google/`; discard results without an ID.
    - `lat` / `lng`: Validate as finite numbers; discard any item with non-numeric coordinates before sending downstream.
    - `name`: Fall back to `place.displayName?.text?.trim() || "Point of Interest"`.
    - `category`: Map known Google `types` array to internal categories (`tourism`, `historic`, `park`, `cafe`, `restaurant`); fall back to `"default"`.
    - `tags`: Guarantee an empty object `{}` is assigned if Google does not supply key-value tags.
    - `osmId` / `osmType`: Explicitly set to `null` to adhere to the existing 8-field `NormalizedPoi` typedef without generating `undefined` property access errors.

---

### 5.3 Legacy cache data and Google content retention
- **Failure mode:** Existing `poi_cache` rows and IndexedDB records contain Overpass data or previously persisted Google names/types.
- **Why it breaks the app:** Old OSM entries could appear alongside Google results, and persistent Google place names/types exceed the allowed Places content retention.
- **Fix or fallback:** Apply the timestamped migration to truncate `public.poi_cache`; upgrade the IndexedDB database and clear old records. New offline fallback records may contain only Google Place IDs and coordinates, and coordinate records expire after 30 days. Fresh display names and types stay in memory only while rendering current results.

---

### 5.4 Non-deterministic Google result ordering defeating the render throttle
- **Failure mode:** Overpass returns elements sorted deterministically by OSM ID. Google Places returns places ranked by relevance, prominence, or distance, which can vary slightly between subsequent queries at neighboring GPS coordinates even when discovering the exact same set of POIs.
- **Why it breaks the app:** The marker equality guard in [`useThrottledPois.js`](file:///Users/koushikdebnath/my-path/src/hooks/useThrottledPois.js) (`arePoisEqual`) performs a positional comparison (`a[i]?.id !== b[i]?.id`). If the same 10 POIs arrive in a different order from Google, `arePoisEqual` returns `false`. This tricks `useThrottledPois` into treating identical data as a fresh update, constantly resetting cooldowns and triggering unnecessary Leaflet DOM marker rebuilds, causing the exact visual pin jitter the throttle was created to eliminate.
- **Fix or fallback:**
  - Update `arePoisEqual` in [`useThrottledPois.js`](file:///Users/koushikdebnath/my-path/src/hooks/useThrottledPois.js) from positional comparison to order-independent Set-based ID comparison:
    ```js
    export function arePoisEqual(a = [], b = []) {
      if (a === b) return true;
      if (!a || !b || a.length !== b.length) return false;
      const aIds = new Set(a.map(p => p.id));
      return b.every(p => aIds.has(p.id));
    }
    ```

---

### 5.5 Dual-layer throttle compounding
- **Failure mode:** The network fetch throttle and marker render throttle share one interval, stacking UI delay after the provider responds.
- **Why it breaks the app:** POIs arrive late during movement, making the visible search area feel behind the current location.
- **Fix or fallback:** Keep the network interval at 9 seconds and use the independent `POI_RENDER_THROTTLE_INTERVAL_MS = 3000` so marker changes flush promptly.

---

### 5.6 Fresh response not propagated while stationary
- **Failure mode:** The user stops moving while a nearby-search request is in flight.
- **Why it breaks the app:** A response that only updates service memory would not reach React until another GPS event.
- **Fix or fallback:** Publish each successful fresh response through `onPoisUpdated`; background stale-while-revalidate is intentionally not used because it would increase Places calls and persist restricted content.

---

### 5.7 Sparse areas or `ZERO_RESULTS` treated as errors or repeated cache misses
- **Failure mode:** In rural, maritime, or unmapped areas, Google Places API returns `ZERO_RESULTS` or empty `results: []`.
- **Why it breaks the app:** Treating an empty but successful response as a provider failure would preserve unrelated stale markers and obscure the actual empty result.
- **Fix or fallback:**
  - Treat `ZERO_RESULTS` as a valid, successful response.
  - Return `{ pois: [] }`, clear the current marker set, and rely on the movement gate plus 9-second throttle to avoid per-GPS-update requests. Do not persist Google result bodies.

---

### 5.8 Network loss / offline operation during active tracking
- **Failure mode:** The user loses cellular coverage while actively recording a route.
- **Why it breaks the app:** Network calls to Supabase edge function fail with `TypeError: Failed to fetch`. If unhandled, this can break execution in the location update pipeline or trigger spammy error modals that obscure the map and tracking controls.
- **Fix or fallback:**
  - Catch network errors inside [`PoiDiscoveryService`](file:///Users/koushikdebnath/my-path/src/poi/PoiDiscoveryService.js), retain the current in-memory markers, and use ID/coordinate-only IndexedDB fallback data.
  - Display a subtle, non-blocking offline indicator without resetting or tearing down active map markers.

---

### 5.9 Unbounded memory accumulation on long routes
- **Failure mode:** POIs from every earlier search remain in the active marker set.
- **Why it breaks the app:** Long recordings can accumulate unnecessary markers and slow the map.
- **Fix or fallback:** Replace the in-memory marker set with each successful nearby response and enforce the 300-item cap. Persist only IDs and coordinates for the 30-day offline fallback.

---

## 6. Implementation phases and execution sequence

The migration and stability fixes are structured into 4 sequential phases:

### Phase 1: Edge function & Google Places provider replacement
- Replace the Overpass query pipeline in [`supabase/functions/fetch-pois/index.ts`](file:///Users/koushikdebnath/my-path/supabase/functions/fetch-pois/index.ts) with Google Places API Nearby Search.
- Implement strict normalization returning the 8-field `NormalizedPoi` shape with safe defaults (`osmId: null`, `osmType: null`, `tags: {}`).
- Map Google place `types` into the existing 6 app categories (`tourism`, `historic`, `park`, `cafe`, `restaurant`, `default`).
- Handle empty results as successful and catch upstream API failures (HTTP 403, 429, quota exhaustion) to return `{ pois: [], degraded: true }` with HTTP 200.
- Do not persist Places names/types in Supabase or browser storage.

### Phase 2: Legacy cache cleanup and retention policy (Section 5.3)
- **Problem addressed:** Existing server and IndexedDB entries contain legacy Overpass data and full Google content from earlier builds.
- **Cutover execution:**
  - Create a migration file [`supabase/migrations/20261006000000_truncate_poi_cache_for_google_migration.sql`](file:///Users/koushikdebnath/my-path/supabase/migrations/20261006000000_truncate_poi_cache_for_google_migration.sql) executing `TRUNCATE TABLE poi_cache;` to wipe legacy Overpass entries.
  - Upgrade IndexedDB and clear old cached POI payloads.
  - Persist only Place IDs and coordinates locally, expiring coordinates after 30 days.

### Phase 3: Google Maps renderer & client compatibility
- **Problem addressed:** Google Places content must be displayed on Google Maps, and fresh response ordering/latency must not cause marker jitter.
- **Client optimizations:**
  1. Replace Leaflet/CARTO with Google Maps JavaScript API and preserve live route, radius, current-location, and POI overlays.
  2. Make one Places nearby-search request per movement cycle to bound request cost.
  3. Keep network fetch throttling at 9 seconds and render throttling at 3 seconds.
  4. **Order-independent equality guard (Section 5.4):**
     - Refactor `arePoisEqual` in [`src/hooks/useThrottledPois.js`](file:///Users/koushikdebnath/my-path/src/hooks/useThrottledPois.js) to use a `Set`-based ID comparison, preventing Google's non-deterministic ordering from triggering redundant marker rebuilds.
  5. Publish each successful response through the `onPoisUpdated` subscription so it reaches React even if the next GPS event is delayed.

### Phase 4: End-to-end verification, error handling & rollout safety
- Verify local Edge Function responses against mock and real Google Places data.
- Configure distinct server-side Places and browser Maps JavaScript API keys, plus a production map ID.
- Verify the app displays Places results only on the Google basemap and complies with Google attribution and retention rules.
- Validate degraded mode and offline behavior during active tracking.
- Confirm zero duplicate markers and smooth pin rendering transitions without jitter.
- Check build and linter status (`npm run build`, `npm run lint`).

---

## 7. Completion checklist

Use this checklist to track and verify completion across each implementation phase. Each item should be checked before considering the task complete.

### Phase 1: Provider migration & edge function
- [ ] Audit the current Overpass-based edge function and map the exact provider contract that the app expects.
- [ ] Choose the Google API source and confirm the request pattern to be used (for example, nearby search / place details).
- [x] Replace the Overpass fetch logic with Google Places requests in the edge function.
- [ ] Confirm the edge function still accepts and validates `{ geohash, lat, lng, radiusMeters, ttlSeconds }`.
- [ ] Confirm the edge function still returns `{ pois: NormalizedPoi[] }` in the expected format.
- [x] Handle empty results as a valid success without throwing errors.
- [x] Implement graceful degraded responses instead of 500 on Google API errors.

### Phase 2: Cache cutover & database migration
- [ ] Create migration `20261006000000_truncate_poi_cache_for_google_migration.sql` with `TRUNCATE TABLE poi_cache;`.
- [ ] Deploy cache truncation in lockstep with the Edge Function release to prevent duplicate markers.
- [x] Remove persistent storage of Google names/types and keep only permitted ID/coordinate offline fallback.
- [x] Clear legacy server cache rows and old IndexedDB records.
- [ ] Verify coordinate fallback expires after 30 days in a browser session.

### Phase 3: Client compatibility & throttle decoupling
- [ ] Map Google results into the existing `NormalizedPoi` fields required by the app.
- [ ] Ensure `id`, `lat`, `lng`, `name`, `category`, and `tags` are always present for rendered markers.
- [ ] Populate `osmId` and `osmType` as `null` to avoid undefined property access in existing type guards.
- [ ] Update fallback name logic when Google results omit display names.
- [ ] Map Google `types` to the app’s existing category names without breaking icons or colors.
- [ ] Update `arePoisEqual` in `useThrottledPois.js` to use order-independent Set-based equality check.
- [x] Decouple render throttle interval (`POI_RENDER_THROTTLE_INTERVAL_MS = 3000`) from fetch throttle (9000ms).
- [x] Add the `onPoisUpdated` event subscription so fresh results reach React state asynchronously.
- [x] Replace Leaflet/CARTO with Google Maps JavaScript API.

### Phase 4: App verification & rollout safety
- [ ] Confirm the app still triggers POI discovery while recording.
- [ ] Confirm the app still renders POIs during active tracking.
- [ ] Confirm route tracking and recording remain unaffected.
- [ ] Confirm marker labels and colors are still readable on the current map theme.
- [ ] Configure and test the browser-restricted Maps JavaScript key and production map ID.
- [ ] Test local edge function behavior with sample Google responses.
- [ ] Verify the app can recover gracefully when Google returns empty or partial results.
- [ ] Verify null/error handling for invalid API responses, expired keys, or quota errors.
- [ ] Check build and lint status after the migration.
- [ ] Confirm deployment configuration includes the required Google API key and environment values.
- [ ] Review billing, quota, and error-handling assumptions before production rollout.

---

## 8. Acceptance criteria

The task is complete only when all checklist items above are checked and the app still behaves as expected in development with the Google Maps provider enabled.

