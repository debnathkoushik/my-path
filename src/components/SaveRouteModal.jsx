import React, { useState, useEffect } from 'react';
import { X, Save, AlertCircle } from 'lucide-react';

export default function SaveRouteModal({
  isOpen,
  onClose,
  onSave,
  distance,
  duration,
  isSaving
}) {
  const [routeName, setRouteName] = useState('');
  const [error, setError] = useState('');

  // Set default route name based on current date/time when opened
  useEffect(() => {
    if (isOpen) {
      const now = new Date();
      const dateString = now.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
      setRouteName(`Route on ${dateString}`);
      setError('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!routeName.trim()) {
      setError('Please enter a name for your route');
      return;
    }
    onSave(routeName.trim());
  };

  // Helper formatting
  const formatDuration = (secs) => {
    const mins = Math.floor(secs / 60);
    const remainingSecs = secs % 60;
    return `${mins}m ${remainingSecs}s`;
  };

  const formatDistance = (meters) => {
    if (meters < 1000) return `${Math.round(meters)} meters`;
    return `${(meters / 1000).toFixed(2)} km`;
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(5, 5, 8, 0.8)',
      backdropFilter: 'blur(10px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      zIndex: 2000
    }}>
      <div className="glass-panel" style={{
        width: '100%',
        maxWidth: '400px',
        borderRadius: 'var(--radius-lg)',
        padding: '24px',
        position: 'relative',
        animation: 'modal-in 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
      }}>
        {/* Close Button */}
        <button
          onClick={onClose}
          disabled={isSaving}
          style={{
            position: 'absolute',
            top: '16px',
            right: '16px',
            background: 'none',
            border: 'none',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            padding: '4px',
            borderRadius: '50%'
          }}
        >
          <X size={18} />
        </button>

        {/* Modal Title */}
        <h2 style={{ fontSize: '20px', fontWeight: '700', marginBottom: '8px' }}>Save Your Route</h2>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '20px' }}>
          Give your tracked path a name to share it with others.
        </p>

        {/* Route Stats Summary */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          backgroundColor: 'rgba(255, 255, 255, 0.03)',
          border: '1px solid var(--bg-card-border)',
          borderRadius: 'var(--radius-md)',
          padding: '12px 16px',
          marginBottom: '20px'
        }}>
          <div>
            <span style={{ display: 'block', fontSize: '10px', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: '600' }}>Distance</span>
            <span style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text-primary)' }}>{formatDistance(distance)}</span>
          </div>
          <div style={{ textAlign: 'right' }}>
            <span style={{ display: 'block', fontSize: '10px', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: '600' }}>Duration</span>
            <span style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text-primary)' }}>{formatDuration(duration)}</span>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Route Name Input */}
          <div style={{ marginBottom: '16px' }}>
            <label htmlFor="routeName" style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '6px' }}>
              Route Name
            </label>
            <input
              type="text"
              id="routeName"
              value={routeName}
              onChange={(e) => setRouteName(e.target.value)}
              disabled={isSaving}
              placeholder="e.g. Morning Run"
              style={{
                width: '100%',
                backgroundColor: 'rgba(0, 0, 0, 0.2)',
                border: '1px solid var(--bg-card-border)',
                borderRadius: 'var(--radius-sm)',
                padding: '12px 14px',
                color: 'var(--text-primary)',
                fontSize: '14px',
                outline: 'none'
              }}
              autoFocus
            />
          </div>

          {/* Error Message */}
          {error && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              color: 'var(--danger)',
              fontSize: '12px',
              fontWeight: '500',
              marginBottom: '16px'
            }}>
              <AlertCircle size={14} />
              <span>{error}</span>
            </div>
          )}

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="glass-panel"
              style={{
                flex: 1,
                padding: '12px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--bg-card-border)',
                color: 'var(--text-primary)',
                fontWeight: '600',
                fontSize: '14px',
                cursor: 'pointer'
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                padding: '12px',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: 'var(--primary)',
                border: 'none',
                color: '#ffffff',
                fontWeight: '600',
                fontSize: '14px',
                cursor: isSaving ? 'not-allowed' : 'pointer',
                boxShadow: '0 4px 10px var(--primary-glow)'
              }}
            >
              <Save size={16} />
              {isSaving ? 'Saving...' : 'Save Route'}
            </button>
          </div>
        </form>
      </div>

      <style>{`
        @keyframes modal-in {
          from {
            opacity: 0;
            transform: scale(0.95) translateY(10px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
