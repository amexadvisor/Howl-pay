import React from 'react';

export default function AdsGramCompletedModal({ data, onClose }) {
  if (!data || !data.open) return null;

  const { adsCount = 3, clicksCount = 0, rewardHowl = 45 } = data;
  const showTutorial = clicksCount < 3;

  return (
    <div
      id="adsrCompletedModal"
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
          background: 'rgba(8, 14, 32, 0.96)',
          border: '1px solid rgba(94, 179, 255, 0.25)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.8), 0 0 30px rgba(94, 179, 255, 0.15)',
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

        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', margin: '2px auto 10px auto' }}>
          <div
            id="adsr-modal-wolf"
            style={{
              width: '75px',
              height: '75px',
              filter: 'drop-shadow(0 0 20px rgba(94, 179, 255, 0.6))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <i className="fa-solid fa-paw" style={{ fontSize: '38px', color: 'var(--accent-main)' }}></i>
          </div>
        </div>

        <h3 style={{ fontSize: '19px', fontWeight: 900, margin: '0 0 4px 0', color: '#fff', letterSpacing: '0.5px' }}>
          Reward Claimed!
        </h3>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 14px 0' }}>AdsGram Task Summary</p>

        <div
          style={{
            background: 'rgba(255, 255, 255, 0.04)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '16px',
            padding: '12px 16px',
            marginBottom: '14px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            textAlign: 'left'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px' }}>
            <span style={{ color: 'var(--text-muted)' }}>
              <i className="fa-solid fa-film" style={{ color: 'var(--accent-main)', marginRight: '6px' }}></i> Ads Watched
            </span>
            <span id="adsrModalAdsCount" style={{ color: '#fff', fontWeight: 800 }}>
              {adsCount} {adsCount === 1 ? 'Ad' : 'Ads'}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px' }}>
            <span style={{ color: 'var(--text-muted)' }}>
              <i className="fa-solid fa-arrow-pointer" style={{ color: 'var(--accent-main)', marginRight: '6px' }}></i> In-Ad Clicks
            </span>
            <span id="adsrModalClicksCount" style={{ color: '#fff', fontWeight: 800 }}>
              {clicksCount} / 3 Clicks
            </span>
          </div>
          <div style={{ height: '1px', background: 'rgba(255,255,255,0.06)', margin: '2px 0' }}></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '14px' }}>
            <span style={{ color: '#fff', fontWeight: 800 }}>
              <i className="fa-solid fa-paw" style={{ color: 'var(--accent-main)', marginRight: '6px' }}></i> Total Reward
            </span>
            <span
              id="adsrModalRewardVal"
              style={{
                color: 'var(--accent-main)',
                fontWeight: 900,
                fontSize: '16px',
                textShadow: '0 0 10px rgba(94, 179, 255, 0.5)'
              }}
            >
              +{rewardHowl} HOWL
            </span>
          </div>
        </div>

        {showTutorial && (
          <div
            id="adsrModalTutorialBox"
            style={{
              background: 'rgba(245, 158, 11, 0.08)',
              border: '1px solid rgba(245, 158, 11, 0.25)',
              borderRadius: '16px',
              padding: '12px',
              marginBottom: '14px',
              textAlign: 'left'
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '12px',
                fontWeight: 800,
                color: '#fbbf24',
                marginBottom: '6px'
              }}
            >
              <i className="fa-solid fa-lightbulb"></i> How to unlock up to 3x more HOWL:
            </div>
            <div style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.85)', lineHeight: 1.45, marginBottom: '10px' }}>
              Tap the blue button inside each ad (e.g. <b>Join Now</b> or <b>Play Now</b>) to claim the full 3-click bonus reward!
            </div>
            <div
              style={{
                borderRadius: '10px',
                overflow: 'hidden',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                background: '#000'
              }}
            >
              <video
                src="/assets/ad-click-tutorial.mp4"
                poster="/assets/ad-click-tutorial.jpg"
                autoPlay
                loop
                muted
                playsInline
                style={{ width: '100%', maxHeight: '120px', objectFit: 'contain', display: 'block' }}
              ></video>
            </div>
          </div>
        )}

        <button
          className="modal-btn"
          onClick={onClose}
          style={{
            borderRadius: '14px',
            padding: '13px',
            fontSize: '14px',
            fontWeight: 800,
            background: 'var(--accent-main)',
            color: '#000',
            boxShadow: '0 4px 15px rgba(94, 179, 255, 0.35)',
            cursor: 'pointer'
          }}
        >
          AWESOME
        </button>
      </div>
    </div>
  );
}
