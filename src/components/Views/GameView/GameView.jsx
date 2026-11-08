import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useApp } from '../../../context/AppContext';
import {
  getGameStatus,
  startGameRun,
  reviveGameRun,
  claimGameReward,
  ADSR_BLOCK_ID,
  ADSGRAM_INTERSTITIAL_BLOCK_ID
} from '../../../services/api';
import LottieAnimation from '../../Common/LottieAnimation';
import './GameView.css';

export default function GameView({ isActive = false, onPlayingChange }) {
  const {
    balance,
    applyBalance,
    refreshBalance,
    triggerHaptic,
    showTopNotification,
    setActiveView
  } = useApp();

  const iframeRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState({
    enabled: true,
    runs_played: 0,
    runs_per_session: 3,
    runs_remaining: 3,
    on_cooldown: false,
    cooldown_seconds_left: 0,
    min_reward: 15,
    max_reward: 100,
    target_score: 50,
    diminishing_pct: 15,
    max_revives: 2
  });

  const [sessionToken, setSessionToken] = useState(null);
  const [currentRunNumber, setCurrentRunNumber] = useState(1);
  const [runActive, setRunActive] = useState(false);
  const [revivesUsed, setRevivesUsed] = useState(0);

  const [cooldownSec, setCooldownSec] = useState(0);
  const [actionBusy, setActionBusy] = useState(false);

  // Modals
  const [gameOverModal, setGameOverModal] = useState({
    open: false,
    score: 0,
    highestTier: 0
  });

  const [claimSuccessModal, setClaimSuccessModal] = useState({
    open: false,
    howlCredited: 0,
    clickBonus: 0,
    score: 0,
    cooldownTriggered: false
  });

  // Sync game playing status with global flag to pause background balance polling
  useEffect(() => {
    window.__HOWL_GAME_RUNNING__ = runActive;
    if (typeof onPlayingChange === 'function') {
      onPlayingChange(runActive);
    }
    return () => {
      window.__HOWL_GAME_RUNNING__ = false;
      if (typeof onPlayingChange === 'function') {
        onPlayingChange(false);
      }
    };
  }, [runActive, onPlayingChange]);

  // Reset run if user navigates away from game view
  useEffect(() => {
    if (!isActive && runActive) {
      setRunActive(false);
      setSessionToken(null);
    }
  }, [isActive, runActive]);

  // Fetch status from server
  const fetchStatus = useCallback(async () => {
    try {
      const data = await getGameStatus();
      if (data && data.success) {
        setStatus(data);
        if (data.cooldown_seconds_left > 0) {
          setCooldownSec(data.cooldown_seconds_left);
        } else {
          setCooldownSec(0);
        }
      }
    } catch (e) {
      console.warn('[GameView] Error fetching status:', e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isActive) {
      fetchStatus();
    }
  }, [isActive, fetchStatus]);

  // Cooldown countdown timer
  useEffect(() => {
    if (cooldownSec <= 0) return;
    const timer = setInterval(() => {
      setCooldownSec((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          fetchStatus();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [cooldownSec, fetchStatus]);

  // Window postMessage event receiver from /wolf-runner.html iframe
  useEffect(() => {
    const handleMessage = (event) => {
      const data = event.data;
      if (!data || typeof data !== 'object') return;

      if (data.type === 'WOLF_GAME_OVER') {
        const finalScore = Math.max(0, parseInt(data.score, 10) || 0);
        setGameOverModal({
          open: true,
          score: finalScore,
          highestTier: data.highestTier || 0
        });
        triggerHaptic('warning');
      } else if (data.type === 'WOLF_REQUEST_START') {
        handleStartRun();
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [sessionToken, status]);

  // Calculate proportional reward preview
  const calculateRewardPreview = (score) => {
    const minR = status.min_reward || 15;
    const maxR = status.max_reward || 100;
    const target = status.target_score || 50;
    const dimPct = status.diminishing_pct || 15;
    const runIdx = Math.max(0, (status.runs_played || 0));

    const diminishingMultiplier = Math.max(0.4, 1 - (runIdx * (dimPct / 100)));
    const scoreRatio = Math.min(1, Math.max(0, score / target));
    const baseReward = minR + scoreRatio * (maxR - minR);
    const finalReward = Math.max(minR, Math.round(baseReward * diminishingMultiplier));
    const clickBonus = Math.max(1, Math.round(finalReward * 0.20));

    return {
      base: finalReward,
      bonus: clickBonus,
      totalWithBonus: finalReward + clickBonus
    };
  };

  // Start Run Handler
  const handleStartRun = async () => {
    if (actionBusy) return;
    if (status.on_cooldown || cooldownSec > 0) {
      showTopNotification({
        title: 'SESSION COOLDOWN',
        message: 'Please wait until cooldown expires to start a new game session.',
        type: 'warning'
      });
      return;
    }

    if (status.runs_remaining <= 0) {
      showTopNotification({
        title: 'RUNS EXHAUSTED',
        message: 'All session runs used. Cooldown timer is activating.',
        type: 'warning'
      });
      fetchStatus();
      return;
    }

    triggerHaptic('medium');
    setActionBusy(true);

    try {
      const res = await startGameRun();
      if (!res || !res.success) {
        showTopNotification({
          title: 'CANNOT START RUN',
          message: res?.error || 'Failed to initialize session. Please try again.',
          type: 'danger'
        });
        setActionBusy(false);
        fetchStatus();
        return;
      }

      setSessionToken(res.session_token);
      setCurrentRunNumber(res.run_number || 1);
      setRevivesUsed(0);
      setRunActive(true);
      setGameOverModal({ open: false, score: 0, highestTier: 0 });

      // Signal iframe to start game loop
      setTimeout(() => {
        if (iframeRef.current && iframeRef.current.contentWindow) {
          iframeRef.current.contentWindow.postMessage({ type: 'START_GAME' }, '*');
        }
      }, 150);
    } catch (err) {
      console.error('[GameView] Start run error:', err);
      showTopNotification({
        title: 'ERROR',
        message: 'Network error starting run.',
        type: 'danger'
      });
    } finally {
      setActionBusy(false);
    }
  };

  // Revive Handler: Interstitial Ad + Monetag
  const handleRevive = async () => {
    if (actionBusy || !sessionToken) return;
    const maxRevives = status.max_revives || 2;
    if (revivesUsed >= maxRevives) {
      showTopNotification({
        title: 'MAX REVIVES REACHED',
        message: `You have used all ${maxRevives} revives for this run. Claim your reward!`,
        type: 'warning'
      });
      return;
    }

    triggerHaptic('light');
    setActionBusy(true);

    try {
      // 1. Trigger AdsGram Interstitial Ad
      if (window.Adsgram && ADSGRAM_INTERSTITIAL_BLOCK_ID) {
        try {
          const intCtrl = window.Adsgram.init({ blockId: ADSGRAM_INTERSTITIAL_BLOCK_ID });
          if (intCtrl) {
            await intCtrl.show();
          }
        } catch (e) {
          console.warn('[AdsGram Interstitial Error]', e);
        }
      }

      // 2. Trigger Monetag Video Ad concurrently/in sequence
      if (typeof window.show_11935325 === 'function') {
        try {
          await window.show_11935325();
        } catch (e) {
          console.warn('[Monetag Revive Ad Error]', e);
        }
      }

      // 3. Record Revive on Server
      const res = await reviveGameRun(sessionToken);
      if (!res || !res.success) {
        showTopNotification({
          title: 'REVIVE FAILED',
          message: res?.error || 'Could not verify revive with server.',
          type: 'danger'
        });
        setActionBusy(false);
        return;
      }

      setRevivesUsed(res.revives_used || (revivesUsed + 1));
      setGameOverModal({ open: false, score: 0, highestTier: 0 });

      // 4. Send revive message to iframe
      if (iframeRef.current && iframeRef.current.contentWindow) {
        iframeRef.current.contentWindow.postMessage({ type: 'REVIVE_WOLF' }, '*');
      }

      triggerHaptic('success');
      showTopNotification({
        title: 'WOLF REVIVED!',
        message: 'Full HP restored with 3-second invulnerability shield!',
        type: 'gold'
      });
    } catch (err) {
      console.error('[GameView] Revive error:', err);
      showTopNotification({
        title: 'REVIVE ERROR',
        message: 'Could not complete revive sequence.',
        type: 'danger'
      });
    } finally {
      setActionBusy(false);
    }
  };

  // Claim Reward Handler: Ad-Gated + Engagement Bonus
  const handleClaim = async (userClickedAd = false) => {
    if (actionBusy || !sessionToken) return;

    triggerHaptic('medium');
    setActionBusy(true);

    let adSuccess = false;
    let clickedAd = userClickedAd;

    try {
      // 1. Show Rewarded Ad (Adsgram with fallback to Monetag)
      if (window.Adsgram && ADSR_BLOCK_ID) {
        try {
          const ctrl = window.Adsgram.init({ blockId: ADSR_BLOCK_ID });
          if (ctrl) {
            const adResult = await ctrl.show();
            adSuccess = true;
            if (adResult && (adResult.done || adResult.state === 'load')) {
              // Ad played successfully
            }
          }
        } catch (e) {
          console.warn('[Adsgram Claim Error]', e);
        }
      }

      // 2. If Adsgram wasn't available or errored, use Monetag
      if (!adSuccess && typeof window.show_11935325 === 'function') {
        try {
          await window.show_11935325();
          adSuccess = true;
        } catch (e) {
          console.warn('[Monetag Claim Error]', e);
        }
      }

      // 3. Claim reward from server
      const res = await claimGameReward(sessionToken, gameOverModal.score, clickedAd);
      if (!res || !res.success) {
        showTopNotification({
          title: 'CLAIM FAILED',
          message: res?.error || 'Could not claim game reward.',
          type: 'danger'
        });
        setActionBusy(false);
        return;
      }

      // 4. Update balance directly in AppContext
      if (res.user_balance) {
        applyBalance(res.user_balance.total_howl, res.user_balance.total_usd, res.user_balance.hold);
      } else {
        refreshBalance();
      }

      triggerHaptic('success');

      // 5. Open Success Splash Modal
      setClaimSuccessModal({
        open: true,
        howlCredited: res.credited_howl || 0,
        clickBonus: res.click_bonus || 0,
        score: res.score || gameOverModal.score,
        cooldownTriggered: Boolean(res.cooldown_activated)
      });

      // Reset run state
      setGameOverModal({ open: false, score: 0, highestTier: 0 });
      setRunActive(false);
      setSessionToken(null);
      fetchStatus();
    } catch (err) {
      console.error('[GameView] Claim error:', err);
      showTopNotification({
        title: 'CLAIM ERROR',
        message: 'Server error processing reward.',
        type: 'danger'
      });
    } finally {
      setActionBusy(false);
    }
  };

  // Format seconds to MM:SS
  const formatTimer = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const rewardPreview = calculateRewardPreview(gameOverModal.score);
  const maxRevives = status.max_revives || 2;
  const revivesLeft = Math.max(0, maxRevives - revivesUsed);

  return (
    <div id="game-view" className={`view ${isActive ? 'active' : ''}`}>
      <div className="game-view-container">
        {/* Top Header Bar (Shown in Lobby, Hidden during active run) */}
        {!runActive && (
          <div className="game-top-bar">
            <button
              className="game-back-btn"
              onClick={() => {
                triggerHaptic('light');
                setActiveView('home-view');
              }}
            >
              <i className="fa-solid fa-arrow-left"></i> Back
            </button>

            <div className="game-title-badge">
              <i className="fa-solid fa-gamepad"></i> Wolf Runner
            </div>

            <div className="game-status-pills">
              {cooldownSec > 0 ? (
                <span className="game-pill cooldown">
                  <i className="fa-solid fa-hourglass-half"></i> {formatTimer(cooldownSec)}
                </span>
              ) : (
                <span className="game-pill runs">
                  <i className="fa-solid fa-bolt"></i> Runs: {status.runs_remaining}/{status.runs_per_session}
                </span>
              )}
            </div>
          </div>
        )}

        {/* State 1: Disabled / Maintenance */}
        {!status.enabled && !runActive && (
          <div className="game-lobby-card">
            <div className="lobby-hero-art">
              <i className="fa-solid fa-screwdriver-wrench" style={{ fontSize: '64px', color: '#f59e0b' }}></i>
            </div>
            <h2 className="lobby-title">Game Maintenance</h2>
            <p className="lobby-desc">
              Wolf Runner is currently undergoing scheduled tuning. Please check back shortly!
            </p>
            <button className="game-start-btn" onClick={() => setActiveView('home-view')}>
              Return to Home
            </button>
          </div>
        )}

        {/* State 2: Cooldown Lockout */}
        {status.enabled && cooldownSec > 0 && !runActive && (
          <div className="game-lobby-card">
            <div className="lobby-hero-art">
              <i className="fa-solid fa-moon" style={{ fontSize: '64px', color: '#38bdf8' }}></i>
            </div>
            <h2 className="lobby-title">Pack Is Resting</h2>
            <p className="lobby-desc">
              You’ve reached your session limit. The timber wolf is resting before the next hunt!
            </p>

            <div
              style={{
                background: 'rgba(30, 41, 59, 0.7)',
                border: '1.5px solid rgba(251, 191, 36, 0.4)',
                borderRadius: '16px',
                padding: '16px 28px',
                marginBottom: '20px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <span style={{ fontSize: '11px', fontWeight: 800, color: '#fbbf24', letterSpacing: '1px' }}>
                COOLDOWN TIMER
              </span>
              <span style={{ fontSize: '32px', fontWeight: 900, color: '#f8fafc', letterSpacing: '1px' }}>
                {formatTimer(cooldownSec)}
              </span>
              <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                New session runs will unlock automatically when timer ends.
              </span>
            </div>

            <button className="game-start-btn" onClick={() => setActiveView('home-view')}>
              <i className="fa-solid fa-house"></i> Return to Home
            </button>
          </div>
        )}

        {/* State 3: Lobby (Runs Available) */}
        {status.enabled && cooldownSec <= 0 && !runActive && (
          <div className="game-lobby-card">
            <div className="lobby-hero-art">
              <LottieAnimation
                path="/assets/wolf-emoji.json"
                style={{ width: '100%', height: '100%' }}
                fallbackIcon="fa-solid fa-paw"
              />
            </div>

            <h2 className="lobby-title">Wolf Runner</h2>
            <p className="lobby-desc">
              Sprint through the wild, dodge traps, swoop under eagles, and score points to unlock real HOWL coins!
            </p>

            {/* Economy Preview Stats */}
            <div className="lobby-stats-grid">
              <div className="lobby-stat-box">
                <div className="stat-label">Min Reward</div>
                <div className="stat-value">{status.min_reward} HOWL</div>
              </div>
              <div className="lobby-stat-box">
                <div className="stat-label">Max Reward</div>
                <div className="stat-value">{status.max_reward} HOWL</div>
              </div>
              <div className="lobby-stat-box">
                <div className="stat-label">Target Score</div>
                <div className="stat-value">{status.target_score} PTS</div>
              </div>
            </div>

            {/* Rules & Mechanics */}
            <div className="lobby-instructions">
              <h4>
                <i className="fa-solid fa-circle-info"></i> How To Play &amp; Earn
              </h4>
              <ul>
                <li>
                  <i className="fa-solid fa-arrow-up"></i>
                  <span>Tap <strong>LEAP</strong> to jump or double-jump over rocks, traps, and logs.</span>
                </li>
                <li>
                  <i className="fa-solid fa-arrow-down"></i>
                  <span>Hold <strong>CROUCH</strong> to duck eagles or fast-dive from the sky.</span>
                </li>
                <li>
                  <i className="fa-solid fa-shield-halved"></i>
                  <span>If you fall, revive with full HP &amp; a 3-second shield (max {status.max_revives} revives).</span>
                </li>
                <li>
                  <i className="fa-solid fa-coins"></i>
                  <span>Watch an ad to unlock your final HOWL reward. <strong>Click the ad for +20% bonus!</strong></span>
                </li>
              </ul>
            </div>

            {/* Start Button */}
            <button
              className="game-start-btn"
              onClick={handleStartRun}
              disabled={actionBusy || status.runs_remaining <= 0}
            >
              {actionBusy ? (
                <>
                  <i className="fa-solid fa-spinner fa-spin"></i> Initializing Run...
                </>
              ) : (
                <>
                  <i className="fa-solid fa-play"></i> Start Run ({status.runs_remaining} Left)
                </>
              )}
            </button>
          </div>
        )}

        {/* State 4: Active Game Iframe (Full-bleed screen, no bottom gap) */}
        {runActive && (
          <div className="game-iframe-wrapper fullscreen-mode">
            <button
              className="game-float-exit-btn"
              onClick={() => {
                triggerHaptic('light');
                if (window.confirm('Leave run? Current game score will be lost.')) {
                  setRunActive(false);
                  setSessionToken(null);
                  fetchStatus();
                }
              }}
            >
              <i className="fa-solid fa-arrow-left"></i> Exit Run
            </button>
            <iframe
              ref={iframeRef}
              src="/wolf-runner.html"
              title="Wolf Runner Game"
              className="game-iframe"
              allow="autoplay; fullscreen"
            />
          </div>
        )}

        {/* Game Over Modal: Claim vs Continue */}
        {gameOverModal.open && (
          <div className="game-modal-backdrop">
            <div className="game-modal-content">
              <div className="game-over-badge">
                <i className="fa-solid fa-skull"></i> Wolf Down
              </div>

              <h2 className="game-modal-title">Run Finished!</h2>

              <div className="game-score-display">
                <span className="score-num">{gameOverModal.score}</span>
                <span className="score-lbl">Points</span>
              </div>

              <div className="reward-preview-card">
                <div className="reward-preview-title">Earned Reward Value</div>
                <div className="reward-preview-amount">
                  <i className="fa-solid fa-paw"></i> +{rewardPreview.base} HOWL
                </div>
                <div className="reward-click-bonus-note">
                  <i className="fa-solid fa-wand-magic-sparkles"></i>
                  Click ad to earn +{rewardPreview.bonus} extra (+20% bonus!)
                </div>
              </div>

              <div className="game-modal-actions">
                {/* Choice B: Revive / Continue */}
                <button
                  className="btn-revive"
                  onClick={handleRevive}
                  disabled={actionBusy || revivesLeft <= 0}
                >
                  {actionBusy ? (
                    <span><i className="fa-solid fa-spinner fa-spin"></i> Reviving...</span>
                  ) : revivesLeft > 0 ? (
                    <>
                      <span><i className="fa-solid fa-heart-pulse"></i> Continue Run ({revivesLeft} Left)</span>
                      <span className="subtext">Watch ad to restore 100% HP &amp; 3s shield</span>
                    </>
                  ) : (
                    <>
                      <span><i className="fa-solid fa-ban"></i> Max Revives Reached</span>
                      <span className="subtext">All {maxRevives} revives used for this run</span>
                    </>
                  )}
                </button>

                {/* Choice A: Claim Reward */}
                <button
                  className="btn-claim"
                  onClick={() => handleClaim(false)}
                  disabled={actionBusy}
                >
                  {actionBusy ? (
                    <span><i className="fa-solid fa-spinner fa-spin"></i> Processing Claim...</span>
                  ) : (
                    <>
                      <span><i className="fa-solid fa-gift"></i> Claim +{rewardPreview.base} HOWL</span>
                      <span className="subtext">Watch ad to credit reward to balance</span>
                    </>
                  )}
                </button>

                {/* Claim with Ad Click Engagement Bonus */}
                <button
                  className="btn-claim"
                  style={{
                    background: 'linear-gradient(135deg, #10b981 0%, #047857 100%)',
                    color: '#ffffff'
                  }}
                  onClick={() => handleClaim(true)}
                  disabled={actionBusy}
                >
                  <span>
                    <i className="fa-solid fa-fire"></i> Claim with Ad Click (+{rewardPreview.totalWithBonus} HOWL)
                  </span>
                  <span className="subtext">Includes +20% engagement bonus</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Claim Success Celebration Splash Modal */}
        {claimSuccessModal.open && (
          <div className="game-modal-backdrop">
            <div className="game-modal-content">
              <div className="success-coin-icon">
                <i className="fa-solid fa-coins"></i>
              </div>

              <h2 className="game-modal-title" style={{ color: '#fbbf24' }}>
                Reward Credited!
              </h2>

              <p style={{ color: '#cbd5e1', fontSize: '14px', marginBottom: '16px' }}>
                Score: <strong>{claimSuccessModal.score} pts</strong>
              </p>

              <div className="reward-preview-card">
                <div className="reward-preview-title">Total HOWL Added</div>
                <div className="reward-preview-amount" style={{ color: '#4ade80' }}>
                  <i className="fa-solid fa-paw"></i> +{claimSuccessModal.howlCredited} HOWL
                </div>
                {claimSuccessModal.clickBonus > 0 && (
                  <div className="reward-click-bonus-note">
                    <i className="fa-solid fa-check"></i>
                    Includes +{claimSuccessModal.clickBonus} HOWL Ad Click Bonus!
                  </div>
                )}
              </div>

              {claimSuccessModal.cooldownTriggered && (
                <div
                  style={{
                    background: 'rgba(245, 158, 11, 0.15)',
                    border: '1px solid rgba(245, 158, 11, 0.35)',
                    borderRadius: '12px',
                    padding: '10px',
                    fontSize: '12px',
                    color: '#fbbf24',
                    marginBottom: '16px'
                  }}
                >
                  <i className="fa-solid fa-hourglass-half"></i> Session runs completed. Cooldown activated!
                </div>
              )}

              <button
                className="game-start-btn"
                onClick={() => {
                  setClaimSuccessModal({ open: false, howlCredited: 0, clickBonus: 0, score: 0, cooldownTriggered: false });
                }}
              >
                Continue
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
