import React from 'react';
import LottieAnimation from '../Common/LottieAnimation';

export default function BanScreen({ isBanned, reason }) {
  if (!isBanned) return null;

  const handleClose = () => {
    try {
      if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.close) {
        window.Telegram.WebApp.close();
      } else {
        window.close();
      }
    } catch (e) {}
  };

  return (
    <div
      id="ban-screen"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'var(--bg-dark)',
        zIndex: 999999,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        textAlign: 'center'
      }}
    >
      <div
        id="ban-anim"
        style={{
          width: '140px',
          height: '140px',
          marginBottom: '20px',
          filter: 'drop-shadow(0 0 15px rgba(239,68,68,0.5))'
        }}
      >
        <LottieAnimation
          path="/assets/ban.json"
          style={{ width: '100%', height: '100%' }}
          fallbackIcon="fa-solid fa-ban"
        />
      </div>

      <div
        id="ban-badge"
        style={{
          display: 'inline-block',
          background: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.2)',
          color: 'var(--accent-red)',
          padding: '4px 14px',
          borderRadius: '50px',
          fontSize: '11px',
          fontWeight: 800,
          textTransform: 'uppercase',
          letterSpacing: '1px',
          marginBottom: '16px'
        }}
      >
        Multi-Account Prohibited
      </div>

      <h2 style={{ fontSize: '24px', fontWeight: 900, margin: '0 0 10px 0', color: '#ffffff' }}>
        Access Suspended
      </h2>

      <p
        id="ban-reason-text"
        style={{
          color: 'var(--text-muted)',
          fontSize: '14px',
          lineHeight: 1.6,
          margin: '0 0 24px 0',
          maxWidth: '340px'
        }}
      >
        {reason || 'Multiple accounts have been detected on this physical device. Only one account per device is permitted.'}
      </p>

      <div className="glass-card" style={{ textAlign: 'left', marginBottom: '24px', maxWidth: '340px', width: '100%' }}>
        <div style={{ fontSize: '12px', fontWeight: 700, color: '#fff', marginBottom: '6px' }}>
          <i className="fa-solid fa-circle-info" style={{ color: 'var(--accent-main)' }}></i> How to resolve:
        </div>
        <div id="ban-help-text" style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
          Your original account on this device remains active. Please switch back to your primary Telegram account to continue using HOWL.
        </div>
      </div>

      <button
        onClick={handleClose}
        style={{
          background: 'rgba(255,255,255,0.08)',
          border: '1px solid var(--border-soft)',
          color: '#fff',
          padding: '14px 28px',
          borderRadius: '50px',
          fontWeight: 700,
          fontSize: '14px',
          cursor: 'pointer',
          maxWidth: '340px',
          width: '100%'
        }}
      >
        Close App
      </button>
    </div>
  );
}
