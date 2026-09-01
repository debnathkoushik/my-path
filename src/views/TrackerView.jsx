import { useState, useEffect } from 'react';
import { Play, Square, Navigation, AlertCircle, RefreshCw } from 'lucide-react';
import Map from '../components/Map';
import RecordingStats from '../components/RecordingStats';
import SaveRouteModal from '../components/SaveRouteModal';
import { useGeolocation } from '../hooks/useGeolocation';
import { useTimer } from '../hooks/useTimer';
import { usePoiDiscovery } from '../hooks/usePoiDiscovery';
import { getPathDistance } from '../utils/haversine';
import { supabase } from '../services/supabaseClient';
import { POI_SEARCH_RADIUS_METERS } from '../poi/poiConstants';

export default function TrackerView() {
  const {
    currentLocation,
    path,
    isRecording,
    error: geoError,
    isMockEnabled,
    toggleMockMode,
    initLocation,
    startRecording,
    stopRecording,
    setPath
  } = useGeolocation();

  const {
    elapsedTime,
    startTimer,
    stopTimer,
    resetTimer
  } = useTimer();

  const { pois } = usePoiDiscovery({ currentLocation, isRecording });

  const [autoCenter, setAutoCenter] = useState(true);
  const [distance, setDistance] = useState(0);
  const [isInitializing, setIsInitializing] = useState(false);

  // Save modal states
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  console.log("currentLocation: ", currentLocation);

  // Recalculate distance when path updates
  useEffect(() => {
    if (path.length > 1) {
      setDistance(getPathDistance(path));
    } else {
      setDistance(0);
    }
  }, [path]);

  // Request initial location on component mount to center map
  useEffect(() => {
    setIsInitializing(true);
    initLocation()
      .catch((err) => console.log('Initial permission rejected:', err))
      .finally(() => setIsInitializing(false));
  }, []);

  const handleStart = async () => {
    setIsInitializing(true);
    try {
      await initLocation();
      startRecording();
      startTimer();
      setAutoCenter(true);
      setSaveError('');
    } catch (err) {
      console.error('Could not start tracking due to permission:', err);
    } finally {
      setIsInitializing(false);
    }
  };

  const handleStop = () => {
    stopRecording();
    stopTimer();

    if (path.length > 0) {
      setIsSaveModalOpen(true);
    } else {
      handleReset();
    }
  };

  const handleSaveRoute = async (routeName) => {
    setIsSaving(true);
    setSaveError('');
    try {
      const { data, error } = await supabase
        .from('routes')
        .insert([
          {
            name: routeName,
            coordinates: path,
            distance: distance,
            duration: elapsedTime
          }
        ])
        .select();

      if (error) throw error;

      if (data && data.length > 0) {
        // Success: Redirect to sharing page using hash routing
        const savedId = data[0].id;
        handleReset();
        setIsSaveModalOpen(false);
        window.location.hash = `#/path/${savedId}`;
      } else {
        throw new Error('Failed to retrieve saved route data');
      }
    } catch (err) {
      console.error('Error saving route to Supabase:', err);
      setSaveError(err.message || 'Error occurred while saving path');
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    stopRecording();
    resetTimer();
    setPath([]);
    setDistance(0);
    setIsSaveModalOpen(false);
  };

  const toggleAutoCenter = () => {
    setAutoCenter((prev) => !prev);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>

      {/* Premium Header */}
      <header className="glass-panel" style={{
        position: 'absolute',
        top: '16px',
        left: '16px',
        right: '16px',
        zIndex: 1000,
        borderRadius: 'var(--radius-md)',
        padding: '12px 18px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            width: '10px',
            height: '10px',
            borderRadius: '50%',
            backgroundColor: isRecording ? 'var(--success)' : 'var(--text-muted)',
            boxShadow: isRecording ? '0 0 8px var(--success)' : 'none',
            transition: 'all 0.3s ease'
          }} />
          <h1 style={{ fontSize: '16px', fontWeight: '700', letterSpacing: '-0.02em' }}>
            PathFinder <span style={{ color: 'var(--primary)', fontWeight: '400' }}>GPS</span>
          </h1>
        </div>

        {/* GPS Indicator & Simulator Switch */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* Mock GPS Toggle Button */}
          <button
            onClick={toggleMockMode}
            disabled={isRecording}
            className="glass-panel"
            style={{
              padding: '6px 12px',
              borderRadius: 'var(--radius-full)',
              fontSize: '10px',
              fontWeight: '600',
              color: isMockEnabled ? 'var(--primary)' : 'var(--text-secondary)',
              border: `1px solid ${isMockEnabled ? 'rgba(99, 102, 241, 0.4)' : 'var(--bg-card-border)'}`,
              backgroundColor: isMockEnabled ? 'rgba(99, 102, 241, 0.15)' : 'rgba(255, 255, 255, 0.02)',
              cursor: isRecording ? 'not-allowed' : 'pointer',
              opacity: isRecording ? 0.6 : 1,
              transition: 'all 0.2s ease',
              letterSpacing: '0.02em',
              textTransform: 'uppercase'
            }}
            title={isRecording ? "Cannot toggle simulation while tracking" : "Toggle Mock GPS Simulator for laptop testing"}
          >
            {isMockEnabled ? '🤖 Simulating' : '🔌 Use Simulator'}
          </button>

          <div style={{ width: '1px', height: '14px', backgroundColor: 'rgba(255, 255, 255, 0.15)' }} />

          {currentLocation ? (
            <span style={{ fontSize: '10px', color: isMockEnabled ? 'var(--primary)' : 'var(--success)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {isMockEnabled ? 'Sim Active' : `GPS Active (${Math.round(currentLocation.accuracy)}m)`}
            </span>
          ) : (
            <span style={{ fontSize: '10px', color: 'var(--text-secondary)', fontWeight: '500' }}>
              Locating...
            </span>
          )}
        </div>
      </header>

      {/* Error Banners */}
      {(geoError || saveError) && (
        <div className="glass-panel" style={{
          position: 'absolute',
          top: '80px',
          left: '16px',
          right: '16px',
          zIndex: 1000,
          borderRadius: 'var(--radius-sm)',
          padding: '10px 14px',
          backgroundColor: 'rgba(239, 68, 68, 0.15)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          color: '#fca5a5'
        }}>
          <AlertCircle size={14} />
          <span style={{ fontSize: '11px', fontWeight: '500' }}>{geoError || saveError}</span>
        </div>
      )}

      {/* Map Background Layer */}
      <div style={{ flex: 1, zIndex: 1, position: 'relative' }}>
        <Map
          center={currentLocation}
          path={path}
          currentLocation={currentLocation}
          interactive={true}
          autoCenter={autoCenter}
          pois={pois}
          poiRadiusMeters={POI_SEARCH_RADIUS_METERS}
        />

        {/* Floating Controls on Map */}
        <div style={{
          position: 'absolute',
          bottom: '220px',
          right: '16px',
          zIndex: 1000,
          display: 'flex',
          flexDirection: 'column',
          gap: '10px'
        }}>
          {/* Recenter Map Button */}
          <button
            onClick={toggleAutoCenter}
            className="glass-panel flex-center"
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              border: '1px solid var(--bg-card-border)',
              color: autoCenter ? 'var(--primary)' : 'var(--text-primary)',
              cursor: 'pointer',
              boxShadow: 'var(--shadow-md)'
            }}
            title="Toggle Lock Auto-Center"
          >
            <Navigation size={18} style={{ transform: autoCenter ? 'rotate(45deg)' : 'none', transition: 'transform 0.2s' }} />
          </button>
        </div>
      </div>

      {/* Stats and Action Dashboard Overlaid at Bottom */}
      <div style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 1000,
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        background: 'linear-gradient(180deg, rgba(8,9,13,0) 0%, rgba(8,9,13,0.95) 40%, rgba(8,9,13,1) 100%)'
      }}>

        {/* Statistics Dashboard */}
        <RecordingStats
          elapsedTime={elapsedTime}
          distance={distance}
          isRecording={isRecording}
        />

        {/* Start / Stop Control Buttons */}
        <div style={{ display: 'flex', gap: '12px', width: '100%' }}>
          {isRecording ? (
            <button
              onClick={handleStop}
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                padding: '14px 20px',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--danger)',
                border: 'none',
                color: '#ffffff',
                fontSize: '15px',
                fontWeight: '600',
                cursor: 'pointer',
                boxShadow: '0 4px 12px var(--danger-glow)'
              }}
            >
              <Square size={16} fill="white" />
              Stop & Save
            </button>
          ) : (
            <>
              {path.length > 0 && (
                <button
                  onClick={handleReset}
                  className="glass-panel"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '14px 20px',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--bg-card-border)',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer'
                  }}
                  title="Discard path"
                >
                  <RefreshCw size={16} />
                </button>
              )}
              <button
                onClick={handleStart}
                disabled={isInitializing}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  padding: '14px 20px',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: isInitializing ? 'var(--bg-card)' : 'var(--primary)',
                  border: 'none',
                  color: '#ffffff',
                  fontSize: '15px',
                  fontWeight: '600',
                  cursor: isInitializing ? 'not-allowed' : 'pointer',
                  boxShadow: isInitializing ? 'none' : '0 4px 12px var(--primary-glow)'
                }}
              >
                <Play size={16} fill="white" />
                {isInitializing ? 'Requesting GPS...' : 'Start Tracking'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Save Modal popup */}
      <SaveRouteModal
        isOpen={isSaveModalOpen}
        onClose={() => setIsSaveModalOpen(false)}
        onSave={handleSaveRoute}
        distance={distance}
        duration={elapsedTime}
        isSaving={isSaving}
      />

    </div>
  );
}
