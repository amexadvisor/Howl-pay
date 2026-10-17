import React from 'react';
import { useApp } from '../../../context/AppContext';

export default function TasksView() {
  const { user, setActiveView, triggerHaptic } = useApp();

  const handleBack = () => {
    triggerHaptic('light');
    setActiveView('home-view');
  };

  const timewallUrl = `https://timewall.io/users/login?oid=78a1ef4a7932308b&uid=${encodeURIComponent(user.id)}`;

  return (
    <div id="tasks-view" className="view active">
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '20px' }}>
        <button
          onClick={handleBack}
          style={{
            background: 'var(--card-bg-light)',
            border: '1px solid var(--border-soft)',
            color: '#fff',
            width: '40px',
            height: '40px',
            borderRadius: '12px',
            cursor: 'pointer'
          }}
        >
          <i className="fa-solid fa-arrow-left"></i>
        </button>
        <h2 style={{ fontSize: '20px', fontWeight: 800, margin: 0 }}>Offerwall</h2>
      </div>

      <div className="offerwall-iframe-container">
        <iframe
          id="timewall-iframe"
          src={timewallUrl}
          title="TimeWall Offerwall"
          style={{ width: '100%', height: '100%', border: 'none' }}
        ></iframe>
      </div>
    </div>
  );
}
