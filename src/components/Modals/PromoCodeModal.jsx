import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import {
  checkPromoCode,
  claimPromoCode,
  ADSGRAM_BLOCK_ID,
  ADSR_BLOCK_ID,
  API_BASE_URL
} from '../../services/api';
import { adsrWatchClicks } from '../../utils/adsrClicks';

export default function PromoCodeModal({ isOpen, onClose }) {
  const {
    user,
    applyBalance,
    refreshBalance,
    triggerHaptic,
    playHowlAudio,
    showTopNotification
  } = useApp();

  const [inputCode, setInputCode] = useState('');
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState('');
  const [promoData, setPromoData] = useState(null);

  // Ad and claim lifecycle: 'idle' | 'watching' | 'claiming' | 'success' | 'error'
  const [adState, setAdState] = useState('idle');
  const [adError, setAdError] = useState('');
  const [claimResult, setClaimResult] = useState(null);
  const [adClickDetected, setAdClickDetected] = useState(false);

  const adsgramSlotRef = useRef(null);
  const watcherRef = useRef(null);
  const fallbackTimerRef = useRef(null);

  // Clean up watchers and timers on unmount or close
  useEffect(() => {
    return () => {
      if (watcherRef.current) {
        watcherRef.current.stop();
        watcherRef.current = null;
      }
      if (fallbackTimerRef.current) {
        clearTimeout(fallbackTimerRef.current);
      }
    };
  }, []);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (!isOpen) {
      setInputCode('');
      setChecking(false);
      setCheckError('');
      setPromoData(null);
      setAdState('idle');
      setAdError('');
      setClaimResult(null);
      setAdClickDetected(false);
      if (watcherRef.current) {
        watcherRef.current.stop();
        watcherRef.current = null;
      }
      if (fallbackTimerRef.current) {
        clearTimeout(fallbackTimerRef.current);
      }
      if (adsgramSlotRef.current) {
        adsgramSlotRef.current.innerHTML = '';
      }
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // 1. Verify Promo Code
  const handleCheckCode = async (e) => {
    if (e) e.preventDefault();
    const cleanCode = inputCode.trim().toUpperCase();
    if (!cleanCode) {
      setCheckError('Please enter a promo code');
      triggerHaptic('error');
      return;
    }

    setChecking(true);
    setCheckError('');
    triggerHaptic('light');

    try {
      const res = await checkPromoCode(cleanCode, user.id);
      if (res && res.success && res.promo) {
        setPromoData(res.promo);
        triggerHaptic('success');
      } else {
        setCheckError(res?.error || 'Invalid promo code');
        triggerHaptic('error');
      }
    } catch (err) {
      setCheckError('Network error checking code. Please try again.');
      triggerHaptic('error');
    } finally {
      setChecking(false);
    }
  };

  // 2. Finalize Claim with Server
  const handleClaim = async (adType, wasClicked) => {
    setAdState('claiming');
    try {
      const res = await claimPromoCode({
        code: promoData.code,
        adType,
        adClicked: wasClicked
      });

      if (res && res.success) {
        if (res.balance) {
          applyBalance(res.balance.total_howl, res.balance.total_usd, res.balance.hold);
        } else {
          refreshBalance();
        }

        playHowlAudio();
        triggerHaptic('success');
        setClaimResult(res);
        setAdState('success');

        showTopNotification({
          title: 'PROMO CODE CLAIMED!',
          message: `+${res.reward_howl} HOWL credited to your balance!`,
          type: 'gold'
        });
      } else {
        setAdError(res?.error || 'Failed to claim promo reward.');
        setAdState('error');
        triggerHaptic('error');
      }
    } catch (err) {
      setAdError('Failed to verify claim with server. Please try again.');
      setAdState('error');
      triggerHaptic('error');
    }
  };

  // 3. Fallback to Rewarded Video Block (ADSR_BLOCK_ID)
  const triggerRewardedFallback = async () => {
    if (fallbackTimerRef.current) {
      clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }

    if (adsgramSlotRef.current) {
      adsgramSlotRef.current.innerHTML = '';
    }

    let ctrl = null;
    if (window.Adsgram) {
      try {
        ctrl = window.Adsgram.init({ blockId: ADSR_BLOCK_ID });
      } catch (e) {}
    }

    if (!ctrl) {
      setAdError('Sponsor ad services are currently unavailable. Please try again in a few moments.');
      setAdState('error');
      if (watcherRef.current) watcherRef.current.stop();
      return;
    }

    try {
      await ctrl.show();
      // Wait a moment for any outbound click event to finish processing
      await new Promise((r) => setTimeout(r, 400));
      const clicked = watcherRef.current ? (watcherRef.current.clicks > 0 || watcherRef.current.clicked) : false;
      if (watcherRef.current) watcherRef.current.stop();

      await handleClaim('rewarded_video', clicked);
    } catch (err) {
      if (watcherRef.current) watcherRef.current.stop();
      setAdError(err?.description || 'Ad was closed early. Watch the full ad to claim giveaway.');
      setAdState('error');
    }
  };

  // 4. Start Ad Watch Flow (Task Block -> Fallback to Rewarded Video)
  const handleStartAdFlow = () => {
    if (!promoData) return;

    setAdState('watching');
    setAdError('');
    setAdClickDetected(false);
    triggerHaptic('medium');

    // Start watching clicks for higher click-bonus reward
    if (watcherRef.current) watcherRef.current.stop();
    const watcher = adsrWatchClicks(() => {
      setAdClickDetected(true);
    });
    watcherRef.current = watcher;

    // Check if custom elements / AdsGram Task Block is available
    const supportsTaskBlock =
      typeof window !== 'undefined' &&
      window.customElements &&
      window.customElements.get('adsgram-task');

    if (!supportsTaskBlock) {
      // Fallback immediately to AdsGram rewarded video
      triggerRewardedFallback();
      return;
    }

    // Mount task block
    if (adsgramSlotRef.current) {
      adsgramSlotRef.current.innerHTML = '';
      const taskEl = document.createElement('adsgram-task');
      taskEl.setAttribute('data-block-id', ADSGRAM_BLOCK_ID);

      let handled = false;

      // Event: User completed task ad
      taskEl.addEventListener('reward', async () => {
        if (handled) return;
        handled = true;
        if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);
        await new Promise((r) => setTimeout(r, 400));
        const clicked = watcher.clicks > 0 || watcher.clicked;
        watcher.stop();
        await handleClaim('task_block', clicked);
      });

      // Event: Task ad not available -> Fallback to Rewarded
      taskEl.addEventListener('onBannerNotFound', () => {
        if (handled) return;
        handled = true;
        triggerRewardedFallback();
      });

      // Event: Error loading task ad -> Fallback to Rewarded
      taskEl.addEventListener('onError', () => {
        if (handled) return;
        handled = true;
        triggerRewardedFallback();
      });

      adsgramSlotRef.current.appendChild(taskEl);

      // Safety timeout: If task block neither fires reward nor errors within 5 seconds, fallback
      fallbackTimerRef.current = setTimeout(() => {
        if (!handled) {
          handled = true;
          triggerRewardedFallback();
        }
      }, 5000);
    } else {
      triggerRewardedFallback();
    }
  };

  // Compute banner image URL with fallback
  const getBannerUrl = (img) => {
    if (!img) return '/assets/boinkers.jpg';
    if (img.startsWith('http://') || img.startsWith('https://')) return img;
    return `${API_BASE_URL}${img.startsWith('/') ? '' : '/'}${img}`;
  };

  return (
    <div
      className="full-screen-modal active"
      style={{
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(2, 6, 18, 0.88)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)'
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && adState !== 'watching' && adState !== 'claiming') {
          onClose();
        }
      }}
    >
      <div
        className="modal-content"
        style={{
          width: '92%',
          maxWidth: '380px',
          maxHeight: '90vh',
          overflowY: 'auto',
          background: 'rgba(10, 15, 30, 0.98)',
          border: '1px solid rgba(234, 179, 8, 0.35)',
          borderRadius: '24px',
          padding: '22px 18px',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.9), 0 0 30px rgba(234, 179, 8, 0.15)',
          position: 'relative',
          color: '#fff',
          textAlign: 'center'
        }}
      >
        {/* Close Button */}
        {adState !== 'watching' && adState !== 'claiming' && (
          <button
            onClick={() => {
              triggerHaptic('light');
              onClose();
            }}
            style={{
              position: 'absolute',
              top: '14px',
              right: '16px',
              background: 'rgba(255, 255, 255, 0.08)',
              border: 'none',
              borderRadius: '50%',
              width: '32px',
              height: '32px',
              color: 'var(--text-muted)',
              fontSize: '15px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s'
            }}
          >
            <i className="fa-solid fa-xmark"></i>
          </button>
        )}

        {/* Modal Header Icon */}
        <div
          style={{
            width: '54px',
            height: '54px',
            borderRadius: '16px',
            background: 'linear-gradient(135deg, rgba(234, 179, 8, 0.2), rgba(14, 165, 233, 0.2))',
            border: '1px solid rgba(234, 179, 8, 0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 12px auto',
            color: '#eab308',
            fontSize: '24px',
            boxShadow: '0 0 20px rgba(234, 179, 8, 0.25)'
          }}
        >
          <i className="fa-solid fa-gift"></i>
        </div>

        <h3
          style={{
            margin: '0 0 6px 0',
            fontSize: '19px',
            fontWeight: 800,
            letterSpacing: '0.5px',
            background: 'linear-gradient(135deg, #ffffff, #eab308)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent'
          }}
        >
          PROMO GIVEAWAY
        </h3>

        {/* ----------------- STATE 1: SUCCESS VIEW ----------------- */}
        {adState === 'success' && claimResult && (
          <div style={{ marginTop: '16px', animation: 'fadeIn 0.3s ease' }}>
            <div
              style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                background: 'rgba(34, 197, 94, 0.15)',
                border: '1px solid rgba(34, 197, 94, 0.5)',
                color: '#22c55e',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '28px',
                margin: '10px auto 14px auto',
                boxShadow: '0 0 25px rgba(34, 197, 94, 0.3)'
              }}
            >
              <i className="fa-solid fa-check"></i>
            </div>

            <h4 style={{ margin: '0 0 8px 0', fontSize: '18px', color: '#fff' }}>
              Giveaway Claimed!
            </h4>

            <div
              style={{
                fontSize: '28px',
                fontWeight: 900,
                color: '#eab308',
                marginBottom: '10px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px'
              }}
            >
              <i className="fa-solid fa-paw" style={{ fontSize: '20px' }}></i>
              +{claimResult.reward_howl} HOWL
            </div>

            {claimResult.ad_clicked ? (
              <div
                style={{
                  background: 'rgba(234, 179, 8, 0.12)',
                  border: '1px solid rgba(234, 179, 8, 0.3)',
                  borderRadius: '12px',
                  padding: '10px',
                  fontSize: '12px',
                  color: '#fbbf24',
                  margin: '12px 0 16px 0',
                  lineHeight: '1.4'
                }}
              >
                <i className="fa-solid fa-fire" style={{ marginRight: '6px' }}></i>
                <b>Max Click Bonus Unlocked!</b> You engaged with the sponsor ad and earned the higher giveaway tier.
              </div>
            ) : (
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '10px 0 16px 0' }}>
                Your reward has been added to your live balance!
              </p>
            )}

            <button
              onClick={() => {
                triggerHaptic('light');
                onClose();
              }}
              style={{
                width: '100%',
                padding: '13px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, #eab308, #ca8a04)',
                border: 'none',
                color: '#000',
                fontSize: '14px',
                fontWeight: 800,
                cursor: 'pointer'
              }}
            >
              Collect &amp; Close
            </button>
          </div>
        )}

        {/* ----------------- STATE 2: VERIFIED PROMO DETAILS ----------------- */}
        {adState !== 'success' && promoData && (
          <div style={{ marginTop: '12px', textAlign: 'left', animation: 'fadeIn 0.25s ease' }}>
            {/* Promo Banner Image */}
            <div
              style={{
                width: '100%',
                height: '140px',
                borderRadius: '16px',
                overflow: 'hidden',
                position: 'relative',
                border: '1px solid rgba(234, 179, 8, 0.35)',
                marginBottom: '14px',
                background: 'rgba(0,0,0,0.5)'
              }}
            >
              <img
                src={getBannerUrl(promoData.image_url)}
                alt={promoData.title || 'Promo Banner'}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  display: 'block'
                }}
                onError={(e) => {
                  e.currentTarget.src = '/assets/boinkers.jpg';
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'linear-gradient(to top, rgba(10, 15, 30, 0.9) 0%, transparent 60%)'
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  bottom: '10px',
                  left: '12px',
                  right: '12px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-end'
                }}
              >
                <span
                  style={{
                    background: 'rgba(0, 0, 0, 0.75)',
                    backdropFilter: 'blur(4px)',
                    color: '#eab308',
                    padding: '3px 8px',
                    borderRadius: '8px',
                    fontSize: '11px',
                    fontWeight: 800,
                    border: '1px solid rgba(234, 179, 8, 0.4)'
                  }}
                >
                  <code>{promoData.code}</code>
                </span>

                {promoData.max_claims > 0 && (
                  <span
                    style={{
                      background: 'rgba(0,0,0,0.7)',
                      color: 'var(--text-muted)',
                      fontSize: '10px',
                      padding: '2px 6px',
                      borderRadius: '6px'
                    }}
                  >
                    {promoData.claimed_count} / {promoData.max_claims} claimed
                  </span>
                )}
              </div>
            </div>

            {/* Title & Description */}
            <h4 style={{ margin: '0 0 6px 0', fontSize: '16px', color: '#fff', fontWeight: 800 }}>
              {promoData.title || 'Special Giveaway Code'}
            </h4>
            <p style={{ margin: '0 0 14px 0', fontSize: '12px', color: 'var(--text-muted)', lineHeight: '1.4' }}>
              {promoData.description || 'Watch the sponsor ad to claim your HOWL coins!'}
            </p>

            {/* Reward Card */}
            <div
              style={{
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '14px',
                padding: '12px',
                marginBottom: '14px'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 700 }}>
                  <i className="fa-solid fa-eye" style={{ marginRight: '5px', color: 'var(--accent-main)' }}></i> Base Ad View Reward:
                </span>
                <span style={{ fontSize: '13px', fontWeight: 800, color: '#eab308' }}>
                  +{promoData.reward_howl} HOWL
                </span>
              </div>

              {Number(promoData.reward_click_howl) > 0 && (
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    paddingTop: '8px',
                    borderTop: '1px solid rgba(255, 255, 255, 0.06)'
                  }}
                >
                  <span style={{ fontSize: '11px', color: '#38bdf8', fontWeight: 700 }}>
                    <i className="fa-solid fa-arrow-pointer" style={{ marginRight: '5px' }}></i> Ad Click Bonus:
                  </span>
                  <span style={{ fontSize: '13px', fontWeight: 800, color: '#38bdf8' }}>
                    +{promoData.reward_click_howl} HOWL
                  </span>
                </div>
              )}
            </div>

            {/* Sponsor Ad requirement notice */}
            <div
              style={{
                fontSize: '11px',
                color: 'var(--text-muted)',
                lineHeight: '1.4',
                marginBottom: '16px',
                background: 'rgba(14, 165, 233, 0.06)',
                border: '1px solid rgba(14, 165, 233, 0.2)',
                borderRadius: '10px',
                padding: '8px 10px'
              }}
            >
              <i className="fa-solid fa-circle-info" style={{ color: '#38bdf8', marginRight: '6px' }}></i>
              Clicking the sponsor ad inside the view earns the <b>full click bonus</b>!
            </div>

            {/* AdsGram Task Block hidden mount slot */}
            <div
              ref={adsgramSlotRef}
              style={{
                width: '100%',
                minHeight: adState === 'watching' ? '120px' : '0px',
                marginBottom: adState === 'watching' ? '14px' : '0px',
                display: adState === 'watching' ? 'block' : 'none'
              }}
            />

            {/* Error Message */}
            {adError && (
              <div
                style={{
                  background: 'rgba(239, 68, 68, 0.12)',
                  border: '1px solid rgba(239, 68, 68, 0.4)',
                  borderRadius: '10px',
                  padding: '9px 12px',
                  color: '#ef4444',
                  fontSize: '12px',
                  marginBottom: '12px',
                  lineHeight: '1.4'
                }}
              >
                <i className="fa-solid fa-triangle-exclamation" style={{ marginRight: '6px' }}></i>
                {adError}
              </div>
            )}

            {/* Action Buttons */}
            {adState === 'watching' || adState === 'claiming' ? (
              <button
                disabled
                style={{
                  width: '100%',
                  padding: '13px',
                  borderRadius: '12px',
                  background: 'rgba(234, 179, 8, 0.2)',
                  border: '1px solid rgba(234, 179, 8, 0.4)',
                  color: '#eab308',
                  fontSize: '14px',
                  fontWeight: 800,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '10px',
                  cursor: 'wait'
                }}
              >
                <div className="loader-spinner" style={{ width: '16px', height: '16px', borderWidth: '2px' }}></div>
                {adState === 'claiming' ? 'Verifying & Claiming...' : 'Watching Sponsor Ad...'}
              </button>
            ) : (
              <button
                onClick={handleStartAdFlow}
                style={{
                  width: '100%',
                  padding: '13px',
                  borderRadius: '12px',
                  background: 'linear-gradient(135deg, #eab308, #ca8a04)',
                  border: 'none',
                  color: '#000',
                  fontSize: '14px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  boxShadow: '0 4px 15px rgba(234, 179, 8, 0.3)'
                }}
              >
                <i className="fa-solid fa-play"></i> Watch Ad &amp; Claim Giveaway
              </button>
            )}

            {adState !== 'watching' && adState !== 'claiming' && (
              <button
                onClick={() => {
                  triggerHaptic('light');
                  setPromoData(null);
                  setAdError('');
                }}
                style={{
                  width: '100%',
                  marginTop: '10px',
                  padding: '8px',
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  fontSize: '12px',
                  cursor: 'pointer',
                  textDecoration: 'underline'
                }}
              >
                Enter a different promo code
              </button>
            )}
          </div>
        )}

        {/* ----------------- STATE 3: INPUT CODE FORM ----------------- */}
        {adState !== 'success' && !promoData && (
          <form onSubmit={handleCheckCode} style={{ marginTop: '14px' }}>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 16px 0', lineHeight: '1.4' }}>
              Enter an official promo code to unlock exclusive giveaway coins!
            </p>

            <div style={{ position: 'relative', marginBottom: '12px' }}>
              <input
                type="text"
                placeholder="PROMO CODE"
                value={inputCode}
                onChange={(e) => {
                  setInputCode(e.target.value.toUpperCase());
                  if (checkError) setCheckError('');
                }}
                style={{
                  width: '100%',
                  padding: '14px 16px',
                  background: 'rgba(0, 0, 0, 0.4)',
                  border: checkError ? '1px solid #ef4444' : '1px solid rgba(234, 179, 8, 0.35)',
                  borderRadius: '12px',
                  color: '#fff',
                  fontSize: '15px',
                  fontWeight: 800,
                  letterSpacing: '1px',
                  textAlign: 'center',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            {checkError && (
              <div
                style={{
                  background: 'rgba(239, 68, 68, 0.12)',
                  border: '1px solid rgba(239, 68, 68, 0.4)',
                  borderRadius: '10px',
                  padding: '9px 12px',
                  color: '#ef4444',
                  fontSize: '12px',
                  marginBottom: '14px',
                  lineHeight: '1.4',
                  textAlign: 'left'
                }}
              >
                <i className="fa-solid fa-triangle-exclamation" style={{ marginRight: '6px' }}></i>
                {checkError}
              </div>
            )}

            <button
              type="submit"
              disabled={checking || !inputCode.trim()}
              style={{
                width: '100%',
                padding: '13px',
                borderRadius: '12px',
                background: checking || !inputCode.trim()
                  ? 'rgba(255, 255, 255, 0.1)'
                  : 'linear-gradient(135deg, #eab308, #ca8a04)',
                border: 'none',
                color: checking || !inputCode.trim() ? 'var(--text-muted)' : '#000',
                fontSize: '14px',
                fontWeight: 800,
                cursor: checking || !inputCode.trim() ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                transition: 'all 0.2s',
                boxShadow: !inputCode.trim() ? 'none' : '0 4px 15px rgba(234, 179, 8, 0.3)'
              }}
            >
              {checking ? (
                <>
                  <div className="loader-spinner" style={{ width: '16px', height: '16px', borderWidth: '2px' }}></div>
                  Checking...
                </>
              ) : (
                <>
                  <i className="fa-solid fa-magnifying-glass"></i> Verify Code
                </>
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
