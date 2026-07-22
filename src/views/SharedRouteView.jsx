import React, { useState, useEffect } from 'react';
import { Loader2, AlertCircle, Plus, Calendar, Compass, Timer, Activity } from 'lucide-react';
import Map from '../components/Map';
import ShareButton from '../components/ShareButton';
import { supabase } from '../services/supabaseClient';

export default function SharedRouteView({ routeId }) {
  const [route, setRoute] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function fetchRoute() {
      if (!routeId) return;
      setLoading(true);
      setError('');
      try {
        const { data, error } = await supabase
          .from('routes')
          .select('*')
          .eq('id', routeId)
          .single();

        if (error) throw error;
        if (!data) throw new Error('Route not found');

        setRoute(data);
      } catch (err) {
        console.error('Error fetching shared route:', err);
        setError(err.message || 'Route not found or failed to load');
      } finally {
        setLoading(false);
      }
    }

    fetchRoute();
  }, [routeId]);

  // Helpers
  const formatDistance = (meters) => {
    if (meters < 1000) return `${Math.round(meters)} m`;
    return `${(meters / 1000).toFixed(2)} km`;
  };

  const formatDuration = (totalSeconds) => {
    const hrs = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;

    const paddedMins = mins.toString().padStart(2, '0');
    const paddedSecs = secs.toString().padStart(2, '0');

    if (hrs > 0) {
      const paddedHrs = hrs.toString().padStart(2, '0');
      return `${paddedHrs}:${paddedMins}:${paddedSecs}`;
    }
    return `${paddedMins}:${paddedSecs}`;
  };

  const calculateSpeed = (meters, seconds) => {
    if (seconds <= 0 || meters <= 0) return '0.0 km/h';
    const km = meters / 1000;
    const hours = seconds / 3600;
    return `${(km / hours).toFixed(1)} km/h`;
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        gap: '16px',
        backgroundColor: '#08090d',
        color: 'var(--text-primary)'
      }}>
        <Loader2 size={32} className="spinner" style={{ color: 'var(--primary)' }} />
        <span style={{ fontSize: '14px', fontWeight: '500', color: 'var(--text-secondary)' }}>
          Retrieving Shared Route...
        </span>
        <style>{`
          .spinner {
            animation: spin 1s linear infinite;
          }
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  if (error || !route) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        padding: '24px',
        gap: '20px',
        backgroundColor: '#08090d',
        color: 'var(--text-primary)',
        textAlign: 'center'
      }}>
        <AlertCircle size={48} style={{ color: 'var(--danger)' }} />
        <div>
          <h2 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '8px' }}>Route Failed to Load</h2>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            {error || "We couldn't find the route you are looking for."}
          </p>
        </div>
        <button
          onClick={() => { window.location.hash = '#/'; }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '12px 20px',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'var(--primary)',
            border: 'none',
            color: '#ffffff',
            fontWeight: '600',
            cursor: 'pointer'
          }}
        >
          <Plus size={16} />
          Track a New Route
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>

      {/* Back to Tracker / New Route top floating action */}
      <header style={{
        position: 'absolute',
        top: '16px',
        left: '16px',
        right: '16px',
        zIndex: 1000,
        display: 'flex',
        justifyContent: 'flex-end'
      }}>
        <button
          onClick={() => { window.location.hash = '#/'; }}
          className="glass-panel"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '10px 16px',
            borderRadius: 'var(--radius-full)',
            border: '1px solid var(--bg-card-border)',
            color: 'var(--text-primary)',
            fontSize: '13px',
            fontWeight: '600',
            cursor: 'pointer',
            boxShadow: 'var(--shadow-md)'
          }}
        >
          <Plus size={14} />
          Create New Route
        </button>
      </header>

      {/* Map Background Layer (Interactive=false makes it static and fits the bounds) */}
      <div style={{ flex: 1, zIndex: 1 }}>
        <Map
          path={route.coordinates}
          currentLocation={null}
          interactive={false}
        />
      </div>

      {/* Route Detail Panels Overlay at Bottom */}
      <div style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 1000,
        padding: '20px 16px 24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        background: 'linear-gradient(180deg, rgba(8,9,13,0) 0%, rgba(8,9,13,0.95) 30%, rgba(8,9,13,1) 100%)'
      }}>
        {/* Route Info Header */}
        <div style={{ padding: '0 4px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '4px' }}>
            {route.name}
          </h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)', fontSize: '12px' }}>
            <Calendar size={12} />
            <span>Tracked on {formatDate(route.created_at)}</span>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="glass-panel" style={{
          borderRadius: 'var(--radius-md)',
          padding: '16px',
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '12px',
          border: '1px solid var(--bg-card-border)'
        }}>
          {/* Distance */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--text-secondary)' }}>
              <Compass size={12} />
              <span style={{ fontSize: '10px', fontWeight: '500', textTransform: 'uppercase' }}>Distance</span>
            </div>
            <span style={{ fontSize: '16px', fontWeight: '700' }}>{formatDistance(route.distance)}</span>
          </div>

          {/* Duration */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', borderLeft: '1px solid rgba(255,255,255,0.06)', borderRight: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--text-secondary)' }}>
              <Timer size={12} />
              <span style={{ fontSize: '10px', fontWeight: '500', textTransform: 'uppercase' }}>Duration</span>
            </div>
            <span style={{ fontSize: '16px', fontWeight: '700', fontFamily: 'monospace' }}>{formatDuration(route.duration)}</span>
          </div>

          {/* Average Speed */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--text-secondary)' }}>
              <Activity size={12} />
              <span style={{ fontSize: '10px', fontWeight: '500', textTransform: 'uppercase' }}>Avg Speed</span>
            </div>
            <span style={{ fontSize: '16px', fontWeight: '700' }}>{calculateSpeed(route.distance, route.duration)}</span>
          </div>
        </div>

        {/* Action Controls */}
        <ShareButton routeId={route.id} routeName={route.name} />
      </div>

    </div>
  );
}
