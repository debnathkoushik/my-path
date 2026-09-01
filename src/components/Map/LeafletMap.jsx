import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, Circle, useMap } from 'react-leaflet';
import L from 'leaflet';
import { POI_CATEGORY_COLORS } from '../../poi/poiConstants.js';

// HTML element-based custom icon for the current user location dot (glowing pulse)
const currentPositionIcon = L.divIcon({
  html: `
    <div class="gps-marker">
      <div class="gps-marker-pulse"></div>
      <div class="gps-marker-dot"></div>
    </div>
  `,
  className: 'custom-leaflet-gps-marker',
  iconSize: [24, 24],
  iconAnchor: [12, 12]
});

// Custom icon for the start pin (green circle)
const startPinIcon = L.divIcon({
  html: `
    <div class="route-pin start-pin">
      <div class="pin-dot"></div>
    </div>
  `,
  className: 'custom-route-start-pin',
  iconSize: [16, 16],
  iconAnchor: [8, 8]
});

// Custom icon for the end pin (red circle)
const endPinIcon = L.divIcon({
  html: `
    <div class="route-pin end-pin">
      <div class="pin-dot"></div>
    </div>
  `,
  className: 'custom-route-end-pin',
  iconSize: [16, 16],
  iconAnchor: [8, 8]
});

/**
 * Returns a Leaflet divIcon for a single POI marker.
 * The category colour is applied via a CSS custom property so the
 * hover glow in CSS always matches the dot fill.
 * @param {{ name: string, category: string }} poi
 * @returns {L.DivIcon}
 */
function makePOIIcon(poi) {
  const color = POI_CATEGORY_COLORS[poi.category] ?? POI_CATEGORY_COLORS.default;
  return L.divIcon({
    html: `
      <div class="poi-marker" style="--poi-color: ${color}">
        <div class="poi-marker-dot"></div>
        <span class="poi-marker-label">${poi.name.replace(/</g, '&lt;')}</span>
      </div>
    `,
    className: 'custom-leaflet-poi-marker',
    iconSize:   [26, 26],
    iconAnchor: [13, 13],
  });
}

// Helper component to pan/zoom the map dynamically when props change
function ChangeView({ center, zoom }) {
  const map = useMap();
  useEffect(() => {
    if (center) {
      map.setView([center.lat, center.lng], zoom);
    }
  }, [center, zoom, map]);
  return null;
}

// Helper component to fit map bounds to the polyline (useful for static/saved routes)
function FitBounds({ path }) {
  const map = useMap();
  useEffect(() => {
    if (path && path.length > 0) {
      const bounds = L.latLngBounds(path.map(p => [p.lat, p.lng]));
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
    }
  }, [path, map]);
  return null;
}

export default function LeafletMap({
  center = { lat: 0, lng: 0 },
  zoom = 15,
  path = [],
  currentLocation = null,
  interactive = true,
  autoCenter = true,
  pois = [],
  poiRadiusMeters = 500,
}) {
  const defaultCenter = center || (currentLocation ? { lat: currentLocation.lat, lng: currentLocation.lng } : { lat: 0, lng: 0 });

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <MapContainer
        center={[defaultCenter.lat, defaultCenter.lng]}
        zoom={zoom}
        zoomControl={interactive}
        dragging={interactive}
        touchZoom={interactive}
        doubleClickZoom={interactive}
        scrollWheelZoom={interactive}
      >
        {/* CartoDB Dark Matter tiles (premium dark UI look) */}
        <TileLayer
          url={`https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png?key=${import.meta.env.CARTO_API_KEY}`}
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        />

        {/* ChangeView runs during active tracking */}
        {interactive && autoCenter && currentLocation && (
          <ChangeView center={{ lat: currentLocation.lat, lng: currentLocation.lng }} zoom={zoom} />
        )}

        {/* FitBounds runs when loading a static path or shared path */}
        {!interactive && path.length > 0 && <FitBounds path={path} />}

        {/* Render the polyline path */}
        {path.length > 0 && (
          <Polyline
            positions={path.map(p => [p.lat, p.lng])}
            pathOptions={{
              color: '#6366f1',
              weight: 4,
              opacity: 0.9,
              lineJoin: 'round',
              lineCap: 'round',
              dashArray: !interactive ? null : '1, 2' // dash overlay if active tracking, solid otherwise
            }}
          />
        )}

        {/* Polyline shadow/glow for high visual polish */}
        {path.length > 0 && (
          <Polyline
            positions={path.map(p => [p.lat, p.lng])}
            pathOptions={{
              color: '#818cf8',
              weight: 8,
              opacity: 0.25,
              lineJoin: 'round',
              lineCap: 'round'
            }}
          />
        )}

        {/* Render start pin */}
        {path.length > 0 && (
          <Marker position={[path[0].lat, path[0].lng]} icon={startPinIcon} />
        )}

        {/* Render end pin for static completed paths */}
        {!interactive && path.length > 1 && (
          <Marker position={[path[path.length - 1].lat, path[path.length - 1].lng]} icon={endPinIcon} />
        )}

        {/* Current user location dot */}
        {currentLocation && (
          <Marker
            position={[currentLocation.lat, currentLocation.lng]}
            icon={currentPositionIcon}
          />
        )}

        {/* POI radius circle — active tracking only */}
        {interactive && currentLocation && (
          <Circle
            center={[currentLocation.lat, currentLocation.lng]}
            radius={poiRadiusMeters}
            className="poi-radius-circle"
            pathOptions={{
              color:       '#6366f1',
              weight:       1.5,
              opacity:      0.45,
              fillColor:   '#6366f1',
              fillOpacity:  0.06,
              dashArray:   '6, 4',
            }}
          />
        )}

        {/* POI markers — active tracking only */}
        {interactive && pois.map((poi) => (
          <Marker
            key={poi.id}
            position={[poi.lat, poi.lng]}
            icon={makePOIIcon(poi)}
          />
        ))}
      </MapContainer>
    </div>
  );
}
