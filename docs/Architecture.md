# PathFinder GPS — Architecture

> Last updated: 2026-10-02

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Technology Stack](#2-technology-stack)
3. [Runtime Architecture](#3-runtime-architecture)
4. [Front-End Layer](#4-front-end-layer)
5. [Back-End Layer](#5-back-end-layer)
6. [Database Layer](#6-database-layer)
7. [External Services](#7-external-services)
8. [Feature: Route Tracking and Saving](#8-feature-route-tracking-and-saving)
9. [Feature: Route Sharing](#9-feature-route-sharing)
10. [Feature: Nearby Places Discovery (POI)](#10-feature-nearby-places-discovery-poi)
11. [Module Dependency Graphs](#11-module-dependency-graphs)
12. [CI/CD Pipeline](#12-cicd-pipeline)
13. [Environment Variables](#13-environment-variables)

---

## 1. System Overview

PathFinder GPS is a Progressive Web App (PWA) that records, maps, saves, and shares GPS routes in real-time. It also discovers nearby Points of Interest (POI) during active tracking sessions.

```mermaid
graph LR
    subgraph Client["Client - Browser / PWA"]
        A[React SPA]
        B[Service Worker]
        C[IndexedDB]
    end

    subgraph Supabase["Supabase - Back-End"]
        D[PostgREST API]
        E[Edge Function: fetch-pois]
        F[(PostgreSQL)]
    end

    subgraph External["External Services"]
        G[OpenStreetMap Tiles]
        H[Overpass API]
    end

    A -- "REST via anon key" --> D
    A -- "invoke via anon key" --> E
    E -- "HTTP POST" --> H
    D -- "SQL read/write" --> F
    A -- "tile requests" --> G
    A -- "offline cache" --> C
    B -- "asset caching" --> A
```

---

## 2. Technology Stack

| Layer | Technology | Version | Purpose |
|---|---|---|---|
| **UI Framework** | React | 19.x | Component rendering, state management |
| **Build Tool** | Vite | 8.x | Dev server, HMR, production bundling |
| **PWA** | vite-plugin-pwa (Workbox) | 1.x | Service worker, offline caching, manifest |
| **Map Rendering** | Leaflet + react-leaflet | 1.9 / 5.0 | Interactive map, polylines, markers, circles |
| **Icons** | lucide-react | 1.x | UI iconography |
| **BaaS** | Supabase | 2.x | Auth-free PostgreSQL, Edge Functions, REST API |
| **Database** | PostgreSQL (Supabase-hosted) | 15+ | Route persistence and geohash POI cache |
| **Edge Runtime** | Deno (Supabase Edge Functions) | — | Server-side Overpass requests and cache writes |
| **Basemap** | OpenStreetMap | — | Map tiles |
| **POI Data** | Overpass API (OpenStreetMap) | — | Nearby places querying |
| **Hosting** | Vercel | — | Static SPA hosting, CDN |
| **CI/CD** | GitHub Actions | — | Migrations, Edge Function deploy, Vercel deploy |

---

## 3. Runtime Architecture

```mermaid
graph TB
    subgraph Browser["Browser Runtime"]
        direction TB
        main["main.jsx - Entry Point"]
        app["App.jsx - Router"]
        tv["TrackerView.jsx - Live Tracking"]
        srv["SharedRouteView.jsx - Route Display"]

        subgraph Hooks
            ug["useGeolocation"]
            ut["useTimer"]
            up["usePoiDiscovery"]
        end

        subgraph Components
            lm["LeafletMap"]
            rs["RecordingStats"]
            sm["SaveRouteModal"]
            sb["ShareButton"]
        end

        subgraph POI_Module["POI Module"]
            pds["PoiDiscoveryService"]
            spcs["SupabasePoiCacheStore"]
        end

        subgraph Utils
            hav["haversine.js"]
            geo["geohash.js"]
        end

        sc["supabaseClient.js"]
        idb["IndexedDB"]
    end

    subgraph Supabase_Runtime["Supabase Runtime"]
        pgrest["PostgREST"]
        ef["Edge Function: fetch-pois"]
        pg[("PostgreSQL: routes + poi_cache")]
    end

    subgraph OSM["OpenStreetMap Services"]
        tiles["OSM Tile Server"]
        overpass["Overpass API"]
    end

    main --> app
    app -->|"hash = #/"| tv
    app -->|"hash = #/path/:id"| srv
    tv --> ug & ut & up
    tv --> lm & rs & sm
    srv --> lm & sb
    up --> pds
    pds --> spcs & geo & hav
    spcs --> sc
    tv --> sc
    srv --> sc
    sc --> pgrest
    pds -->|"functions.invoke"| ef
    ef -->|"HTTP POST"| overpass
    ef -->|"service_role upsert"| pg
    pgrest --> pg
    tiles --> lm
    pds --> idb
```

---

## 4. Front-End Layer

### 4.1 Entry Point

| File | Role |
|---|---|
| `index.html` | HTML shell, PWA meta tags, viewport config |
| `src/main.jsx` | React root and global CSS |
| `src/App.jsx` | Hash-based router: `#/` leads to TrackerView, `#/path/:id` leads to SharedRouteView |

### 4.2 Views

| View | File | Responsibility |
|---|---|---|
| **TrackerView** | `src/views/TrackerView.jsx` | Live GPS tracking, recording controls, POI wiring, save-to-Supabase flow |
| **SharedRouteView** | `src/views/SharedRouteView.jsx` | Fetches a saved route by UUID, displays static map + stats + share button |

### 4.3 Components

| Component | File | Responsibility |
|---|---|---|
| **LeafletMap** | `src/components/Map/LeafletMap.jsx` | Renders OpenStreetMap tiles, route polylines, GPS dot, start/end pins, POI markers, and POI radius circle. |
| **RecordingStats** | `src/components/RecordingStats.jsx` | Displays duration, distance, average speed during active tracking |
| **SaveRouteModal** | `src/components/SaveRouteModal.jsx` | Modal dialog for naming and saving a recorded route |
| **ShareButton** | `src/components/ShareButton.jsx` | Native Web Share API with clipboard fallback |

### 4.4 Hooks

| Hook | File | Responsibility |
|---|---|---|
| **useGeolocation** | `src/hooks/useGeolocation.js` | `watchPosition` with noise filtering (accuracy over 50m rejected, under 1m movement ignored), mock GPS simulator mode, path accumulation |
| **useTimer** | `src/hooks/useTimer.js` | Elapsed time counter (1s interval), start/stop/reset |
| **usePoiDiscovery** | `src/hooks/usePoiDiscovery.js` | React wrapper around `PoiDiscoveryService`, translates position updates into reactive `pois` array, resets on tracking stop |

### 4.5 Utilities

| File | Exports | Purpose |
|---|---|---|
| `src/utils/haversine.js` | `getDistance()`, `getPathDistance()` | Haversine-formula geodesic distance calculations |
| `src/utils/geohash.js` | `encodeGeohash()`, `decodeGeohash()`, `getGeohashNeighbors()` | Pure-JS geohash encoding/decoding and 8-neighbor cell computation |

### 4.6 Services

| File | Export | Purpose |
|---|---|---|
| `src/services/supabaseClient.js` | `supabase` | Singleton Supabase client initialized with `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` |

### 4.7 Map Strategy

The app renders OpenStreetMap tiles through Leaflet and fetches POIs through the Overpass API from the Supabase Edge Function. No Google Maps key or map ID is required.

---

## 5. Back-End Layer

### 5.1 Supabase PostgREST API

The front-end communicates with Supabase PostgreSQL through the auto-generated REST API using the **anon (publishable) key**. No authentication is required — both `anon` and `authenticated` roles have permissions.

| Operation | Table | Role | Method |
|---|---|---|---|
| Insert route | `routes` | anon | `POST` |
| Read route by ID | `routes` | anon | `GET` with `.eq('id', routeId).single()` |
| Read POI cache | `poi_cache` | anon | `GET` with `.in('geohash', [...])` |

### 5.2 Edge Function: fetch-pois

| Property | Value |
|---|---|
| **File** | `supabase/functions/fetch-pois/index.ts` |
| **Runtime** | Deno (Supabase Edge Functions) |
| **Auth** | `--no-verify-jwt` (no auth required to invoke) |
| **Input** | `{ geohash, lat, lng, radiusMeters, ttlSeconds }` |
| **Steps** | 1. Validate request, 2. Build Overpass QL, 3. POST to Overpass, 4. Normalize results, 5. Upsert `poi_cache` with service role, 6. Return `{ pois }` |

```mermaid
sequenceDiagram
    participant Client as Browser
    participant EF as Edge Function fetch-pois
    participant OA as Overpass API
    participant DB as PostgreSQL poi_cache

    Client->>EF: supabase.functions.invoke fetch-pois with body
    EF->>OA: POST Overpass QL with application User-Agent
    OA-->>EF: elements array
    EF->>EF: normalize OSM elements into NormalizedPoi array
    EF->>DB: UPSERT poi_cache using service_role key
    DB-->>EF: OK
    EF-->>Client: pois NormalizedPoi array
```

**Why the Edge Function exists**: Overpass requires a custom `User-Agent`, and cache writes must use the Supabase service-role key. Both remain server-side; clients only read cached geohash rows.

---

## 6. Database Layer

### 6.1 Schema Diagram

```mermaid
erDiagram
    routes {
        uuid id PK
        text name
        jsonb coordinates
        numeric distance
        integer duration
        timestamptz created_at
    }

    poi_cache {
        text geohash PK
        timestamptz fetched_at
        integer ttl_seconds
        jsonb pois
    }
```

**routes** columns:
- `id` — UUID primary key, auto-generated via `gen_random_uuid()`
- `name` — NOT NULL, user-given route name
- `coordinates` — NOT NULL, JSONB array of `{lat, lng, timestamp}` objects
- `distance` — NOT NULL, total distance in meters
- `duration` — NOT NULL, total duration in seconds
- `created_at` — defaults to `now()` in UTC

**poi_cache** columns:
- `geohash` — TEXT primary key, precision-6 geohash string
- `fetched_at` — timestamp of last Overpass fetch
- `ttl_seconds` — row time-to-live (default 172800 seconds)
- `pois` — normalized OSM POI array stored as JSONB

### 6.2 Row-Level Security (RLS)

| Table | Policy | Roles | Action | Rule |
|---|---|---|---|---|
| `routes` | Allow public read access to routes | anon, authenticated | SELECT | `true` |
| `routes` | Allow public insert access to routes | anon, authenticated | INSERT | `true` |
| `poi_cache` | poi_cache_public_read | anon, authenticated | SELECT | `true` |
| `poi_cache` | *(no client write policy)* | — | INSERT/UPDATE | **Blocked** — only service-role Edge Function can write |

### 6.3 Migrations

| Migration File | Purpose |
|---|---|
| `20260814202055_initial_schema.sql` | Creates `routes` table, enables pgcrypto, sets RLS policies for public read/insert |
| `20260830000000_poi_cache.sql` | Creates `poi_cache` table, grants read-only access to anon/authenticated, RLS for service-role-only writes |

---

## 7. External Services

| Service | URL | Protocol | Purpose | Auth |
|---|---|---|---|---|
| **OpenStreetMap Tiles** | `tile.openstreetmap.org` | HTTPS tile GET | Map background tiles | None |
| **Overpass API** | `overpass-api.de/api/interpreter` | HTTPS POST | Nearby OSM POI queries | None; server request includes User-Agent |
| **Supabase** | `*.supabase.co` | HTTPS | PostgREST + Edge Functions | Publishable key (client), service-role key (Edge Function) |
| **Vercel** | `vercel.com` | HTTPS | Static site hosting + CDN | Deploy token |

---

## 8. Feature: Route Tracking and Saving

### 8.1 Data Flow

```mermaid
sequenceDiagram
    participant GPS as Browser Geolocation API
    participant UG as useGeolocation
    participant TV as TrackerView
    participant UT as useTimer
    participant LM as LeafletMap
    participant SM as SaveRouteModal
    participant SB as Supabase PostgREST
    participant DB as PostgreSQL routes

    TV->>UG: initLocation()
    UG->>GPS: getCurrentPosition()
    GPS-->>UG: lat lng accuracy
    UG-->>TV: currentLocation

    TV->>UG: startRecording()
    TV->>UT: startTimer()
    UG->>GPS: watchPosition with highAccuracy

    loop Every GPS update
        GPS-->>UG: position
        UG->>UG: Noise filter accuracy over 50m skip
        UG->>UG: Movement gate under 1m skip
        UG->>UG: Path filter under 3m since last path point skip
        UG-->>TV: currentLocation and path array
        TV->>LM: Re-render polyline and GPS dot
        TV->>TV: getPathDistance path gives distance
    end

    TV->>UG: stopRecording()
    TV->>UT: stopTimer()
    UG->>GPS: clearWatch()
    TV->>SM: Open modal with distance and duration

    SM->>TV: onSave routeName
    TV->>SB: supabase.from routes insert name coordinates distance duration
    SB->>DB: INSERT INTO routes
    DB-->>SB: id uuid
    SB-->>TV: data id
    TV->>TV: window.location.hash = #/path/id
```

### 8.2 Mock GPS Simulator

When `isMockEnabled === true`, `useGeolocation` bypasses the browser Geolocation API entirely:
- Starts at a fixed seed point (`37.7749, -122.4194` — San Francisco).
- Every 2 seconds, increments lat/lng by `0.00008` (~8.9m NE diagonal).
- Enables laptop/desktop testing without real GPS hardware.

---

## 9. Feature: Route Sharing

### 9.1 Data Flow

```mermaid
sequenceDiagram
    participant User as User
    participant App as App.jsx Router
    participant SRV as SharedRouteView
    participant SB as Supabase PostgREST
    participant DB as PostgreSQL routes
    participant LM as LeafletMap
    participant Share as ShareButton

    User->>App: Navigate to #/path/uuid
    App->>App: hashchange sets view to shared and routeId to uuid
    App->>SRV: Render SharedRouteView with routeId

    SRV->>SB: supabase.from routes select all eq id routeId single
    SB->>DB: SELECT FROM routes WHERE id = uuid
    DB-->>SB: route row
    SB-->>SRV: route data

    SRV->>LM: Render static map interactive false FitBounds to path
    SRV->>SRV: Display name date distance duration avg speed
    SRV->>Share: Render ShareButton with routeId routeName

    User->>Share: Click Share Route Link
    Share->>Share: navigator.share or clipboard.writeText
```

---

## 10. Feature: Nearby Places Discovery (POI)

### 10.1 End-to-End Data Flow

```mermaid
sequenceDiagram
    participant GPS as useGeolocation
    participant TV as TrackerView
    participant Hook as usePoiDiscovery
    participant PDS as PoiDiscoveryService
    participant Geo as geohash.js
    participant Store as SupabasePoiCacheStore
    participant SB as Supabase PostgREST
    participant EF as Edge Function
    participant OA as Overpass API
    participant DB as PostgreSQL poi_cache
    participant IDB as IndexedDB
    participant LM as LeafletMap

    Note over Hook: On mount loadFromIndexedDB
    Hook->>PDS: loadFromIndexedDB()
    PDS->>IDB: get lastKnownPois
    IDB-->>PDS: cached NormalizedPoi array or empty

    GPS-->>TV: currentLocation update
    TV->>Hook: currentLocation with isRecording true
    Hook->>PDS: onPositionUpdate lat lng

    PDS->>PDS: Distance gate: moved at least 325m?
    alt Below threshold
        PDS-->>Hook: return current markers without request
    else Above threshold or first call
        PDS->>PDS: Start 9s leading/trailing throttle
        PDS-->>Hook: return current markers immediately
    end

    Note over PDS: Fetch cycle runs
    PDS->>Geo: encodeGeohash lat lng 6
    Geo-->>PDS: center geohash
    PDS->>Geo: getGeohashNeighbors
    Geo-->>PDS: eight neighbor hashes
    PDS->>Store: getManyStaleOrFresh for nine cells
    Store->>SB: SELECT poi_cache rows
    SB->>DB: query by geohash
    DB-->>PDS: cache entries
    loop For each cell
        alt Missing cache row
            PDS->>EF: invoke fetch-pois
            EF->>OA: POST Overpass QL
            OA-->>EF: OSM elements
            EF->>EF: normalize POIs
            EF->>DB: upsert poi_cache
            EF-->>PDS: fresh POIs
            PDS->>Hook: publish updated POI snapshot
        else Fresh cache row
            PDS->>PDS: merge cached POIs
        else Stale cache row
            PDS->>PDS: serve stale POIs and start background refresh
            PDS->>EF: invoke fetch-pois
            EF->>OA: POST Overpass QL and refresh cache
            EF-->>PDS: fresh POIs
            PDS->>Hook: publish updated POI snapshot
        end
    end
    PDS->>IDB: persist last-known OSM POIs
    Hook-->>TV: pois
    TV->>LM: Render route and throttled markers on OSM tiles
```

### 10.2 Throttle and Gate Logic

```mermaid
flowchart TD
    A["GPS position update"] --> B{"First call? lastFetchLocation is null"}
    B -- Yes --> D["Fetch immediately and start 9s cooldown"]
    B -- No --> C{"Moved at least 325m? 500m x 0.65"}
    C -- No --> E["Return current in-memory POIs, no network call"]
    C -- Yes --> F{"Pending timer?"}
    F -- Yes --> G["Save latest position for trailing-edge fetch"]
    F -- No --> D
    D --> H["9s cooldown expires"]
    G --> H
    H --> I{"Pending trailing position?"}
    I -- Yes --> J["Run fetch cycle at latest position"]
    I -- No --> K["Wait for next movement threshold"]
```

### 10.3 POI Module Files

| File | Class / Exports | Responsibility |
|---|---|---|
| `src/poi/poiConstants.js` | Constants | Radius (500m), movement threshold (0.65), fetch throttle (9s), render throttle (3s), geohash precision, cache TTL, OSM tags, category colors |
| `src/poi/poiTypes.js` | Cache and POI helpers | `NormalizedPoi`/`CachedPoiEntry` typedefs, TTL freshness check, OSM tag categories |
| `src/poi/SupabasePoiCacheStore.js` | `SupabasePoiCacheStore` | Read-only client adapter for the Edge Function-owned geohash cache |
| `src/poi/PoiDiscoveryService.js` | `PoiDiscoveryService` | Distance gate, fetch throttle, geohash cache reads, SWR updates, bounded OSM POI map, IndexedDB offline mirror |

---

## 11. Module Dependency Graphs

### 11.1 Full Import Graph

```mermaid
graph TD
    main["main.jsx"] --> App["App.jsx"]
    App --> TV["TrackerView.jsx"]
    App --> SRV["SharedRouteView.jsx"]

    TV --> Map["Map/index.jsx"]
    TV --> RS["RecordingStats.jsx"]
    TV --> SM["SaveRouteModal.jsx"]
    TV --> uGeo["useGeolocation.js"]
    TV --> uTimer["useTimer.js"]
    TV --> uPOI["usePoiDiscovery.js"]
    TV --> hav["haversine.js"]
    TV --> sc["supabaseClient.js"]
    TV --> pConst["poiConstants.js"]

    SRV --> Map
    SRV --> SB["ShareButton.jsx"]
    SRV --> sc

    Map --> LM["LeafletMap.jsx"]
    LM --> pConst

    uGeo --> hav
    uPOI --> PDS["PoiDiscoveryService.js"]

    PDS --> sc
    PDS --> geo["geohash.js"]
    PDS --> hav
    PDS --> SPCS["SupabasePoiCacheStore.js"]
    PDS --> pTypes["poiTypes.js"]
    PDS --> pConst

    SPCS --> sc
    SPCS --> pTypes
    sc --> supabaseJS["@supabase/supabase-js"]
    LM --> leaflet["leaflet"]
    LM --> reactLeaflet["react-leaflet"]
    RS --> lucide["lucide-react"]
    SM --> lucide
    SB --> lucide
    TV --> lucide
    SRV --> lucide
```

### 11.2 POI Module Internal Dependencies

```mermaid
graph TD
    uPOI["usePoiDiscovery.js - React Hook"] --> PDS["PoiDiscoveryService.js - Orchestrator"]
    PDS --> SPCS["SupabasePoiCacheStore.js - Cache Adapter"]
    PDS --> pTypes["poiTypes.js - Types and Helpers"]
    PDS --> pConst["poiConstants.js - Config"]
    PDS --> geo["geohash.js - Spatial Index"]
    PDS --> hav["haversine.js - Distance Calc"]
    PDS --> sc["supabaseClient.js - Edge Function Invoke"]
    SPCS --> sc["supabaseClient.js"]
    SPCS --> pTypes
    LM["LeafletMap.jsx - Rendering"] --> pConst

    style uPOI fill:#1e3a5f,stroke:#6366f1,color:#fff
    style PDS fill:#1e3a5f,stroke:#6366f1,color:#fff
    style SPCS fill:#1e3a5f,stroke:#6366f1,color:#fff
    style pTypes fill:#1e3a5f,stroke:#6366f1,color:#fff
    style pConst fill:#1e3a5f,stroke:#6366f1,color:#fff
```

---

## 12. CI/CD Pipeline

Defined in `.github/workflows/deploy.yml`. Triggers on push to `main` or manual dispatch.

### 12.1 Pipeline Flow

```mermaid
graph TD
    A["Push to main or workflow_dispatch"] --> B["Job 1: migrate-production"]
    B --> C["Job 2: deploy-edge-functions"]
    C --> D["Job 3: deploy-production"]

    subgraph Job1["migrate-production"]
        B1["Checkout"] --> B2["Setup Supabase CLI"]
        B2 --> B3["supabase link --project-ref"]
        B3 --> B4["supabase db push --dry-run"]
        B4 --> B5["supabase db push"]
    end

    subgraph Job2["deploy-edge-functions"]
        C1["Checkout"] --> C2["Setup Supabase CLI"]
        C2 --> C3["supabase link --project-ref"]
        C3 --> C4["supabase functions deploy fetch-pois --no-verify-jwt"]
    end

    subgraph Job3["deploy-production"]
        D1["Checkout"] --> D2["Setup Node 22"]
        D2 --> D3["npm ci"]
        D3 --> D4["Validate env vars"]
        D4 --> D5["vercel pull"]
        D5 --> D6["vercel build --prod"]
        D6 --> D7["vercel deploy --prebuilt --prod"]
    end

    B --> Job1
    C --> Job2
    D --> Job3
```

### 12.2 Job Dependencies

| Job | Depends On | Purpose |
|---|---|---|
| `migrate-production` | — | Applies pending SQL migrations to the Supabase PostgreSQL database |
| `deploy-edge-functions` | `migrate-production` | Deploys the `fetch-pois` Edge Function to the Supabase project |
| `deploy-production` | `migrate-production`, `deploy-edge-functions` | Builds the Vite SPA and deploys to Vercel |

### 12.3 Concurrency

```yaml
concurrency:
  group: production-deploy
  cancel-in-progress: false
```

All three jobs share a single concurrency group. A second push while a deploy is in-flight will **queue** (not cancel) the running deploy.

---

## 13. Environment Variables

### 13.1 Client-Side (Vite)

Set in `.env.local` (local dev) or injected by Vercel (production).

| Variable | Prefix | Required | Purpose |
|---|---|---|---|
| `VITE_SUPABASE_URL` | `VITE_` | Yes | Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | `VITE_` | Yes | Supabase anon/public key |

### 13.2 Edge Function (Deno Runtime)

Automatically injected by Supabase.

| Variable | Source | Purpose |
|---|---|---|
| `SUPABASE_URL` | Auto-injected | Supabase project URL for the admin client |
| `SUPABASE_SERVICE_ROLE_KEY` | Auto-injected / Dashboard | Writes normalized Overpass results to `poi_cache` |

### 13.3 CI/CD (GitHub Actions)

| Variable | Type | Used By |
|---|---|---|
| `SUPABASE_ACCESS_TOKEN` | Secret | `migrate-production`, `deploy-edge-functions` |
| `SUPABASE_DB_PASSWORD` | Secret | `migrate-production` |
| `VERCEL_TOKEN` | Secret | `deploy-production` |
| `SUPABASE_PROJECT_ID` | Var | `migrate-production`, `deploy-edge-functions` |
| `VERCEL_ORG_ID` | Var | `deploy-production` |
| `VERCEL_PROJECT_ID` | Var | `deploy-production` |
| `VITE_SUPABASE_URL` | Var | `deploy-production` (build-time) |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Var | `deploy-production` (build-time) |
