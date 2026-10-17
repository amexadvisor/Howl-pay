import React from 'react';

export default function AdminEntryModal({ isOpen, onEnterUser, onEnterAdmin }) {
  if (!isOpen) return null;

  return (
    <div
      id="admin-entry-modal"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(3, 6, 20, 0.92)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        zIndex: 999999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px'
      }}
    >
      <div className="glass-card" style={{ maxWidth: '360px', width: '100%', textAlign: 'center' }}>
        <div
          style={{
            width: '64px',
            height: '64px',
            borderRadius: '20px',
            background: 'var(--accent-dim)',
            border: '1px solid rgba(94, 179, 255, 0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '28px',
            color: 'var(--accent-main)',
            margin: '0 auto 16px'
          }}
        >
          <i className="fa-solid fa-shield-halved"></i>
        </div>
        <div
          style={{
            display: 'inline-block',
            background: 'var(--accent-dim)',
            color: 'var(--accent-main)',
            border: '1px solid rgba(94, 179, 255, 0.3)',
            fontSize: '11px',
            fontWeight: 800,
            textTransform: 'uppercase',
            letterSpacing: '1px',
            padding: '4px 14px',
            borderRadius: '50px',
            marginBottom: '12px'
          }}
        >
          Admin Session Verified
        </div>
        <h3 style={{ fontSize: '20px', fontWeight: 800, margin: '0 0 8px 0', color: '#fff' }}>
          Choose Session Mode
        </h3>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.5, margin: '0 0 24px 0' }}>
          Welcome back, Administrator. Please choose how you want to enter HOWL:
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <button
            onClick={onEnterUser}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid var(--border-soft)',
              color: '#fff',
              padding: '14px',
              borderRadius: 'var(--radius-lg)',
              fontWeight: 700,
              fontSize: '14px',
              cursor: 'pointer'
            }}
          >
            <i className="fa-regular fa-user" style={{ color: 'var(--accent-main)', fontSize: '16px' }}></i>{' '}
            <span>Enter as User</span>
          </button>
          <button
            onClick={onEnterAdmin}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
              background: 'var(--accent-main)',
              border: 'none',
              color: '#000',
              padding: '14px',
              borderRadius: 'var(--radius-lg)',
              fontWeight: 800,
              fontSize: '14px',
              cursor: 'pointer'
            }}
          >
            <i className="fa-solid fa-shield-halved" style={{ fontSize: '16px' }}></i>{' '}
            <span>Enter Admin Panel</span>
          </button>
        </div>
      </div>
    </div>
  );
}
