import React from 'react';
import { Timer, Compass, Activity } from 'lucide-react';

// Format elapsed seconds into HH:MM:SS or MM:SS
const formatTime = (totalSeconds) => {
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

// Format distance in meters or kilometers
const formatDistance = (meters) => {
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }
  return `${(meters / 1000).toFixed(2)} km`;
};

// Calculate average speed in km/h
const calculateSpeed = (meters, seconds) => {
  if (seconds <= 0 || meters <= 0) return '0.0 km/h';
  const km = meters / 1000;
  const hours = seconds / 3600;
  return `${(km / hours).toFixed(1)} km/h`;
};

export default function RecordingStats({ elapsedTime, distance, isRecording }) {
  return (
    <div className="glass-panel" style={{
      borderRadius: 'var(--radius-lg)',
      padding: '20px',
      display: 'grid',
      gridTemplateColumns: 'repeat(3, 1fr)',
      gap: '16px',
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* Top green glowing bar if recording is active */}
      {isRecording && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '3px',
          background: 'linear-gradient(90deg, var(--success) 0%, var(--primary) 100%)',
          boxShadow: '0 1px 8px var(--success-glow)'
        }} />
      )}

      {/* Elapsed Time Card */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)' }}>
          <Timer size={14} />
          <span style={{ fontSize: '12px', fontWeight: '500', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Duration</span>
        </div>
        <span style={{ fontSize: '20px', fontWeight: '700', fontFamily: 'monospace', color: 'var(--text-primary)' }}>
          {formatTime(elapsedTime)}
        </span>
      </div>

      {/* Distance Card */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', borderLeft: '1px solid rgba(255,255,255,0.06)', borderRight: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)' }}>
          <Compass size={14} />
          <span style={{ fontSize: '12px', fontWeight: '500', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Distance</span>
        </div>
        <span style={{ fontSize: '20px', fontWeight: '700', color: 'var(--text-primary)' }}>
          {formatDistance(distance)}
        </span>
      </div>

      {/* Average Speed Card */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)' }}>
          <Activity size={14} />
          <span style={{ fontSize: '12px', fontWeight: '500', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Avg Speed</span>
        </div>
        <span style={{ fontSize: '20px', fontWeight: '700', color: 'var(--text-primary)' }}>
          {calculateSpeed(distance, elapsedTime)}
        </span>
      </div>
    </div>
  );
}
