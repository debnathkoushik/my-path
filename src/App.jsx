import React, { useState, useEffect } from 'react';
import TrackerView from './views/TrackerView';
import SharedRouteView from './views/SharedRouteView';
import './App.css';

function App() {
  const [view, setView] = useState('tracker'); // 'tracker' or 'shared'
  const [routeId, setRouteId] = useState(null);

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash;

      // Matches path patterns like: #/path/123e4567-e89b-12d3-a456-426614174000
      const match = hash.match(/^#\/path\/([a-f0-9-]+)$/i);

      if (match) {
        setRouteId(match[1]);
        setView('shared');
      } else {
        setRouteId(null);
        setView('tracker');
      }
    };

    // Monitor hash on startup
    handleHashChange();

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  return (
    <div className="app-container">
      {view === 'tracker' ? (
        <TrackerView />
      ) : (
        <SharedRouteView routeId={routeId} />
      )}
    </div>
  );
}

export default App;
