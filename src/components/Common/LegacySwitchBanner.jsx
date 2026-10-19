import React, { useState } from 'react';

export default function LegacySwitchBanner() {
  const [minimized, setMinimized] = useState(true);

  const shouldShow =
    Boolean(import.meta.env?.DEV) ||
    window.location.search.includes('switch=1') ||
    window.location.search.includes('test=1');

  if (!shouldShow) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '80px',
        right: '12px',
        zIndex: 99998,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: '6px'
      }}
    >
      {minimized ? (
        <button
          onClick={() => setMinimized(false)}
          title="Inspect Legacy HTML Version"
          style={{
            background: 'rgba(15, 22, 45, 0.85)',
            border: '1px solid var(--accent-main)',
            color: 'var(--accent-main)',
            borderRadius: '50px',
            padding: '6px 12px',
            fontSize: '10px',
            fontWeight: 800,
            cursor: 'pointer',
            backdropFilter: 'blur(10px)',
            boxShadow: '0 4px 15px rgba(0,0,0,0.5)'
          }}
        >
          <i className="fa-solid fa-code-compare"></i> React Mode
        </button>
      ) : (
        <div
          className="glass-card"
          style={{
            padding: '12px',
            marginBottom: 0,
            maxWidth: '220px',
            textAlign: 'left',
            boxShadow: '0 8px 30px rgba(0,0,0,0.8)'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--accent-main)' }}>
              Migration Switch
            </span>
            <button
              onClick={() => setMinimized(true)}
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '12px' }}
            >
              <i className="fa-solid fa-xmark"></i>
            </button>
          </div>
          <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '0 0 10px 0', lineHeight: 1.4 }}>
            Compare React version with the original HTML frontend.
          </p>
          <a
            href="/legacy.html"
            style={{
              display: 'block',
              textDecoration: 'none',
              textAlign: 'center',
              background: 'var(--accent-main)',
              color: '#000',
              fontWeight: 800,
              fontSize: '11px',
              padding: '8px',
              borderRadius: '8px'
            }}
          >
            Switch to Legacy HTML <i className="fa-solid fa-arrow-right"></i>
          </a>
        </div>
      )}
    </div>
  );
}
