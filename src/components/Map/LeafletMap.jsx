import { useEffect } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, Circle, useMap } from 'react-leaflet';
import L from 'leaflet';
import { POI_RENDER_THROTTLE_INTERVAL_MS } from '../../poi/poiConstants.js';
import { renderThrottledPoiMarkers } from './renderThrottledPoiMarkers.jsx';

const currentPositionIcon = L.divIcon({
  html: '<div class="gps-marker"><div class="gps-marker-pulse"></div><div class="gps-marker-dot"></div></div>',
  className: 'custom-leaflet-gps-marker',
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

const startPinIcon = L.divIcon({
  html: '<div class="route-pin start-pin"><div class="pin-dot"></div></div>',
  className: 'custom-route-start-pin',
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

const endPinIcon = L.divIcon({
  html: '<div class="route-pin end-pin"><div class="pin-dot"></div></div>',
  className: 'custom-route-end-pin',
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

function ChangeView({ center, zoom }) {
  const map = useMap();

  useEffect(() => {
    if (center) map.setView([center.lat, center.lng], zoom);
  }, [center, zoom, map]);

  return null;
}

function FitBounds({ path }) {
  const map = useMap();

  useEffect(() => {
    if (path.length) {
      map.fitBounds(L.latLngBounds(path.map((point) => [point.lat, point.lng])), {
        padding: [40, 40],
        maxZoom: 16,
      });
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
  poiThrottleIntervalMs = POI_RENDER_THROTTLE_INTERVAL_MS,
}) {
  const initialCenter = center ?? currentLocation ?? { lat: 0, lng: 0 };

  return (
    <div className="leaflet-map-shell">
      <MapContainer
        center={[initialCenter.lat, initialCenter.lng]}
        zoom={zoom}
        zoomControl={interactive}
        dragging={interactive}
        touchZoom={interactive}
        doubleClickZoom={interactive}
        scrollWheelZoom={interactive}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          className="dark-tiles-fallback"
          attribution={'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}
        />

        {interactive && autoCenter && currentLocation && (
          <ChangeView center={currentLocation} zoom={zoom} />
        )}
        {!interactive && path.length > 0 && <FitBounds path={path} />}

        {path.length > 0 && (
          <>
            <Polyline
              positions={path.map((point) => [point.lat, point.lng])}
              pathOptions={{
                color: '#818cf8',
                weight: 8,
                opacity: 0.25,
                lineJoin: 'round',
                lineCap: 'round',
              }}
            />
            <Polyline
              positions={path.map((point) => [point.lat, point.lng])}
              pathOptions={{
                color: '#6366f1',
                weight: 4,
                opacity: 0.9,
                lineJoin: 'round',
                lineCap: 'round',
                dashArray: interactive ? '1, 2' : null,
              }}
            />
          </>
        )}

        {path.length > 0 && <Marker position={[path[0].lat, path[0].lng]} icon={startPinIcon} />}
        {!interactive && path.length > 1 && (
          <Marker position={[path[path.length - 1].lat, path[path.length - 1].lng]} icon={endPinIcon} />
        )}
        {currentLocation && (
          <Marker position={[currentLocation.lat, currentLocation.lng]} icon={currentPositionIcon} />
        )}

        {interactive && currentLocation && (
          <Circle
            center={[currentLocation.lat, currentLocation.lng]}
            radius={poiRadiusMeters}
            className="poi-radius-circle"
            pathOptions={{
              color: '#6366f1',
              weight: 1.5,
              opacity: 0.45,
              fillColor: '#6366f1',
              fillOpacity: 0.06,
              dashArray: '6, 4',
            }}
          />
        )}

        {renderThrottledPoiMarkers(pois, { interactive, intervalMs: poiThrottleIntervalMs })}
      </MapContainer>
    </div>
  );
}