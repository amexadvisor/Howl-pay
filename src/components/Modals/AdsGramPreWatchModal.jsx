import React, { useState } from 'react';

export default function AdsGramPreWatchModal({ isOpen, onClose, onConfirm }) {
  const [dontShowAgain, setDontShowAgain] = useState(false);

  if (!isOpen) return null;

  const handleConfirm = () => {
    if (dontShowAgain) {
      localStorage.setItem('adsr_hide_pre_tutorial', '1');
    }
    onConfirm();
  };

  return (
    <div
      id="adsrPreWatchModal"
      className="full-screen-modal active"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="modal-content"
        style={{
          maxWidth: '320px',
          maxHeight: '90vh',
          overflowY: 'auto',
          padding: '22px 18px',
          borderRadius: '24px',
          position: 'relative',
          background: 'rgba(8, 14, 32, 0.97)',
          border: '1px solid rgba(94, 179, 255, 0.35)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.85), 0 0 30px rgba(94, 179, 255, 0.2)',
          textAlign: 'center'
        }}
      >
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '14px',
            right: '16px',
            background: 'none',
            border: 'none',
            color: 'var(--text-muted)',
            fontSize: '16px',
            cursor: 'pointer',
            padding: '4px',
            lineHeight: 1
          }}
        >
          <i className="fa-solid fa-xmark"></i>
        </button>

        <div
          style={{
            display: 'inline-block',
            background: 'rgba(94, 179, 255, 0.12)',
            border: '1px solid rgba(94, 179, 255, 0.3)',
            color: 'var(--accent-main)',
            padding: '4px 14px',
            borderRadius: '50px',
            fontSize: '11px',
            fontWeight: 800,
            textTransform: 'uppercase',
            letterSpacing: '0.8px',
            marginBottom: '10px'
          }}
        >
          <i className="fa-solid fa-circle-info"></i> How to Earn Max HOWL
        </div>

        <h3 style={{ fontSize: '18px', fontWeight: 900, margin: '0 0 6px 0', color: '#fff' }}>
          Tap the Button Inside Each Ad
        </h3>
        <p style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.8)', lineHeight: 1.45, margin: '0 0 12px 0' }}>
          During each ad, tap the blue button at the bottom (like <b>Join Now</b> or <b>Play Now</b>) to unlock your full{' '}
          <b>3-click bonus reward</b>!
        </p>

        <div
          style={{
            borderRadius: '12px',
            overflow: 'hidden',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            background: '#000',
            marginBottom: '14px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)'
          }}
        >
          <video
            src="/assets/ad-click-tutorial.mp4"
            poster="/assets/ad-click-tutorial.jpg"
            autoPlay
            loop
            muted
            playsInline
            style={{ width: '100%', maxHeight: '140px', objectFit: 'contain', display: 'block' }}
          ></video>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            marginBottom: '14px',
            fontSize: '12px',
            color: 'var(--text-muted)',
            cursor: 'pointer'
          }}
          onClick={() => setDontShowAgain(!dontShowAgain)}
        >
          <input
            type="checkbox"
            id="adsrPreHideCheck"
            checked={dontShowAgain}
            onChange={(e) => setDontShowAgain(e.target.checked)}
            style={{ cursor: 'pointer', accentColor: 'var(--accent-main)', width: '15px', height: '15px' }}
          />
          <label htmlFor="adsrPreHideCheck" style={{ cursor: 'pointer' }}>
            Don't show this before watching again
          </label>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={handleConfirm}
            style={{
              flex: 1,
              borderRadius: '14px',
              padding: '13px',
              fontSize: '14px',
              fontWeight: 800,
              background: 'var(--accent-main)',
              color: '#000',
              border: 'none',
              boxShadow: '0 4px 15px rgba(94, 179, 255, 0.4)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px'
            }}
          >
            <i className="fa-solid fa-play"></i> START WATCHING
          </button>
        </div>
      </div>
    </div>
  );
}
