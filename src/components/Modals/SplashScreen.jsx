import React, { useEffect } from 'react';
import LottieAnimation from '../Common/LottieAnimation';

export default function SplashScreen({ onEnter }) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onEnter();
    }, 4500);
    return () => clearTimeout(timer);
  }, [onEnter]);

  return (
    <div
      id="splash-screen"
      onClick={onEnter}
      style={{
        position: 'fixed',
        inset: 0,
        background: '#030614',
        zIndex: 99999,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'opacity 0.5s',
        cursor: 'pointer'
      }}
    >
      <div
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: '30px'
        }}
      >
        <div
          id="splash-wolf-emoji"
          style={{
            width: '110px',
            height: '110px',
            filter: 'drop-shadow(0 0 25px rgba(94,179,255,0.5))'
          }}
        >
          <LottieAnimation
            path="/assets/wolf-emoji.json"
            style={{ width: '100%', height: '100%' }}
            fallbackIcon="fa-solid fa-paw"
          />
        </div>
      </div>

      <h1
        style={{
          fontSize: '34px',
          fontWeight: 900,
          margin: '0 0 8px 0',
          color: '#fff',
          letterSpacing: '2px'
        }}
      >
        HOWL
      </h1>

      <p
        style={{
          color: 'var(--accent-main)',
          fontWeight: 700,
          letterSpacing: '3px',
          fontSize: '13px',
          marginBottom: '24px'
        }}
      >
        ELITE EARNING
      </p>

      <button
        id="audio-trigger-btn"
        onClick={onEnter}
        style={{
          background: 'rgba(94, 179, 255, 0.15)',
          border: '1px solid var(--accent-main)',
          color: '#fff',
          padding: '12px 24px',
          borderRadius: 'var(--radius-pill)',
          fontSize: '12px',
          fontWeight: 800,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}
      >
        <i className="fa-solid fa-volume-high" style={{ color: 'var(--accent-main)' }}></i> TAP TO ENTER
      </button>
    </div>
  );
}
