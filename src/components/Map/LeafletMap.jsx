import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';

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
  autoCenter = true
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
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
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
      </MapContainer>
    </div>
  );
}
