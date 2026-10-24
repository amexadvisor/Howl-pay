import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../../../context/AppContext';
import {
  claimMonetagReward,
  claimAdsgramTaskReward,
  syncAdStatusFromServer,
  syncAdsr,
  sendAdsrClick,
  ADSR_BLOCK_ID,
  ADSGRAM_BLOCK_ID
} from '../../../services/api';
import { adsrWatchClicks } from '../../../utils/adsrClicks';
import LottieAnimation from '../../Common/LottieAnimation';

// Temporary toggle: set to true to restore AdsGram earn blocks on Home screen
const SHOW_ADSGRAM = true;

export default function WatchAndEarn() {
  const {
    user,
    triggerHaptic,
    showTopNotification,
    refreshBalance,
    applyBalance,
    setAdsrPreModalOpen,
    setAdsrCompletedModal,
    setAdsrWatchHandler
  } = useApp();


  // Monetag State
  const [monetagWatched, setMonetagWatched] = useState(0);
  const [monetagLimit, setMonetagLimit] = useState(10);
  const [monetagReward, setMonetagReward] = useState(100);
  const [monetagCooldown, setMonetagCooldown] = useState(0);
  const [monetagCooldownSec, setMonetagCooldownSec] = useState(15);
  const [monetagInFlight, setMonetagInFlight] = useState(false);

  // AdsGram Reward State (adsr)
  const [adsrState, setAdsrState] = useState({
    watched: 0,
    limit: 5,
    start: 180,
    next_reward: 180,
    next_reward_noclick: 45,
    noclick_pct: 25,
    enabled: true,
    locked: false,
    seconds_left: 0,
    last_at: 0
  });
  const [adsrBusy, setAdsrBusy] = useState(false);
  const [adsrTimerStr, setAdsrTimerStr] = useState('');
  const [adsrCooldownSec, setAdsrCooldownSec] = useState(15);
  const [adsrInterCooldown, setAdsrInterCooldown] = useState(0);
  const adsrWatcherRef = useRef(null);

  // AdsGram Tasks State (widget)
  const [adsgramWatched, setAdsgramWatched] = useState(0);
  const [adsgramLimit, setAdsgramLimit] = useState(5); // Defaults to 5 (or synced limit)
  const [adsgramReward, setAdsgramReward] = useState(170);
  const [adsgramMsg, setAdsgramMsg] = useState('');
  const adsgramSlotRef = useRef(null);

  // Midnight reset countdown
  const [resetTimerStr, setResetTimerStr] = useState('');

  // 1. Initial Sync
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const data = await syncAdStatusFromServer();
        if (data && data.success) {
          if (data.user_balance) {
            applyBalance(data.user_balance.total_howl, data.user_balance.total_usd, data.user_balance.hold);
          }
          if (data.ads?.monetag) {
            setMonetagWatched(data.ads.monetag.watched || 0);
            if (Number.isFinite(data.ads.monetag.limit)) setMonetagLimit(data.ads.monetag.limit);
            if (data.ads.monetag.next_reward) setMonetagReward(data.ads.monetag.next_reward);
            if (data.ads.monetag.cooldown_sec) setMonetagCooldownSec(data.ads.monetag.cooldown_sec);
          }
          if (data.ads?.adsgram) {
            setAdsgramWatched(data.ads.adsgram.watched || 0);
            if (Number.isFinite(data.ads.adsgram.limit)) setAdsgramLimit(data.ads.adsgram.limit);
            if (data.ads.adsgram.next_reward) setAdsgramReward(data.ads.adsgram.next_reward);
          }
        }
      } catch (e) {}

      try {
        const rData = await syncAdsr();
        if (rData && rData.success && rData.reward) {
          setAdsrState(rData.reward);
          if (rData.reward.cooldown_sec) setAdsrCooldownSec(rData.reward.cooldown_sec);
        }
      } catch (e) {}
    };

    fetchStatus();
  }, [applyBalance]);

  // 2. Midnight countdown
  useEffect(() => {
    const updateMidnight = () => {
      const now = new Date();
      const midnight = new Date(now);
      midnight.setUTCHours(24, 0, 0, 0);
      const diff = Math.max(0, Math.floor((midnight.getTime() - now.getTime()) / 1000));
      const h = String(Math.floor(diff / 3600)).padStart(2, '0');
      const m = String(Math.floor((diff % 3600) / 60)).padStart(2, '0');
      const s = String(diff % 60).padStart(2, '0');
      setResetTimerStr(`Ads Reset In: ${h}:${m}:${s}`);
    };

    updateMidnight();
    const interval = setInterval(updateMidnight, 1000);
    return () => clearInterval(interval);
  }, []);

  // 3. Monetag cooldown timer
  useEffect(() => {
    if (monetagCooldown <= 0) return;
    const timer = setTimeout(() => {
      setMonetagCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearTimeout(timer);
  }, [monetagCooldown]);

  // 4. AdsGram cooldown timer (adsr)
  useEffect(() => {
    if (!adsrState.locked || adsrState.seconds_left <= 0) {
      setAdsrTimerStr('');
      return;
    }

    const endsAt = Date.now() + adsrState.seconds_left * 1000;
    const tick = () => {
      const left = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
      const h = String(Math.floor(left / 3600)).padStart(2, '0');
      const m = String(Math.floor((left % 3600) / 60)).padStart(2, '0');
      const s = String(left % 60).padStart(2, '0');
      setAdsrTimerStr(`${h}:${m}:${s}`);

      if (left <= 0) {
        clearInterval(interval);
        syncAdsr().then((res) => {
          if (res?.success && res.reward) setAdsrState(res.reward);
        });
      }
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [adsrState.locked, adsrState.seconds_left]);

  // 5. Mount AdsGram task element if enabled
  useEffect(() => {
    if (!SHOW_ADSGRAM || adsgramLimit <= 0 || adsgramWatched >= adsgramLimit) return;
    if (!adsgramSlotRef.current) return;

    let cancelled = false;

    const mountTask = () => {
      if (cancelled || !adsgramSlotRef.current) return;
      adsgramSlotRef.current.innerHTML = '';
      setAdsgramMsg('');
      const el = document.createElement('adsgram-task');
      el.className = 'adsgram-task';
      el.setAttribute('data-block-id', ADSGRAM_BLOCK_ID);
      el.setAttribute('data-debug', 'false');
      el.setAttribute('data-debug-console', 'false');
      el.innerHTML = `
        <span slot="reward" class="adsgram-task__reward">+${adsgramReward} HOWL</span>
        <div slot="button" class="adsgram-task__button">GO</div>
        <div slot="claim" class="adsgram-task__button adsgram-task__button_claim">CLAIM</div>
        <div slot="done" class="adsgram-task__button adsgram-task__button_done">DONE</div>
      `;

      el.addEventListener('reward', async () => {
        try {
          const d = await claimAdsgramTaskReward();
          if (d && d.success) {
            triggerHaptic('success');
            if (d.user_balance) {
              applyBalance(d.user_balance.total_howl, d.user_balance.total_usd, d.user_balance.hold);
            }
            setAdsgramWatched((prev) => prev + 1);
            showTopNotification({
              title: 'TASK COMPLETED!',
              message: `+${d.reward_howl || adsgramReward} HOWL added!`,
              type: 'gold'
            });
          }
        } catch (e) {}
      });

      el.addEventListener('onBannerNotFound', () => {
        if (adsgramSlotRef.current) adsgramSlotRef.current.innerHTML = '';
        setAdsgramMsg('No task is available right now. Please check again in a few minutes.');
      });

      el.addEventListener('onError', () => {
        if (adsgramSlotRef.current) adsgramSlotRef.current.innerHTML = '';
        setAdsgramMsg('Could not load the task. Please try again shortly.');
      });

      el.addEventListener('onTooLongSession', () => {
        setAdsgramMsg('This session is too long. Please restart the app to load new tasks.');
      });

      adsgramSlotRef.current.appendChild(el);
    };

    if (window.customElements) {
      if (customElements.get('adsgram-task')) {
        mountTask();
      } else {
        customElements.whenDefined('adsgram-task').then(() => {
          mountTask();
        }).catch(() => {
          if (!cancelled) setAdsgramMsg('AdsGram task widget is loading or blocked.');
        });
      }
    } else {
      setAdsgramMsg('Custom elements not supported in this browser.');
    }

    return () => {
      cancelled = true;
    };
  }, [adsgramLimit, adsgramWatched, adsgramReward, applyBalance, triggerHaptic, showTopNotification]);

  // Handle Monetag Watch Click
  const handleWatchMonetag = () => {
    if (monetagWatched >= monetagLimit) {
      alert(`Daily limit of ${monetagLimit} ads reached! Come back tomorrow.`);
      return;
    }

    if (monetagInFlight || monetagCooldown > 0) return;

    triggerHaptic('light');

    if (typeof window.show_11935325 === 'function') {
      setMonetagInFlight(true);
      window
        .show_11935325()
        .then(async () => {
          setMonetagInFlight(false);
          setMonetagCooldown(monetagCooldownSec);
          triggerHaptic('medium');

          try {
            const res = await claimMonetagReward();
            if (res && res.success) {
              triggerHaptic('success');
              if (res.user_balance) {
                applyBalance(res.user_balance.total_howl, res.user_balance.total_usd, res.user_balance.hold);
              } else {
                refreshBalance();
              }
              setMonetagWatched((prev) => prev + 1);
              showTopNotification({
                title: 'AD REWARD CREDITED!',
                message: `+${res.reward_howl || monetagReward} HOWL added to your balance!`,
                type: 'gold',
                icon: 'fa-solid fa-coins'
              });
            }
          } catch (e) {}
        })
        .catch((e) => {
          setMonetagInFlight(false);
          setMonetagCooldown(monetagCooldownSec);
          alert('No ads available right now. Please try again later.');
        });
    } else {
      alert('Ad network is still loading or blocked by your browser. Please try again in a few seconds.');
    }
  };

  // Handle AdsGram Rewarded Click (adsr)
  const handleWatchAdsr = () => {
    if (adsrBusy || adsrState.locked || !adsrState.enabled) return;
    triggerHaptic('light');

    const hidePre = localStorage.getItem('adsr_hide_pre_tutorial') === '1';
    if (hidePre) {
      startAdsGramRewardFlow();
    } else {
      setAdsrPreModalOpen(true);
    }
  };

  const startAdsGramRewardFlow = async () => {
    if (adsrBusy) return;

    let ctrl = null;
    if (window.Adsgram) {
      try {
        ctrl = window.Adsgram.init({ blockId: ADSR_BLOCK_ID });
      } catch (e) {}
    }

    if (!ctrl) {
      alert('Ads are not ready yet. Try again in a moment.');
      return;
    }

    setAdsrBusy(true);
    const before = adsrState.last_at || 0;
    const baseViewReward = adsrState.next_reward_noclick || Math.max(1, Math.floor((adsrState.next_reward || 180) * 0.25));

    if (adsrWatcherRef.current) {
      adsrWatcherRef.current.stop();
      adsrWatcherRef.current = null;
    }

    let credited = false;
    let clickSent = false;

    const sendClickBonus = async (clicksCount) => {
      if (clickSent || !credited) return;
      if (!clicksCount || clicksCount <= 0) return;
      clickSent = true;
      const total = Math.max(1, Math.min(3, clicksCount));
      const res = await sendAdsrClick(clicksCount, total);
      if (res && res.bonus > 0) {
        const totalRewarded = res.total_reward || baseViewReward + res.bonus;
        setAdsrCompletedModal({
          open: true,
          adsCount: total,
          clicksCount: clicksCount,
          rewardHowl: totalRewarded
        });
        refreshBalance();
      }
    };

    const watcher = adsrWatchClicks(() => {
      sendClickBonus(watcher.clicks);
    });
    adsrWatcherRef.current = watcher;

    try {
      await ctrl.show();
      // Wait for server callback to credit the view reward
      for (let i = 0; i < 10; i++) {
        await new Promise((r) => setTimeout(r, 1500));
        const sData = await syncAdsr();
        if (sData?.success && sData.reward && sData.reward.last_at !== before) {
          credited = true;
          setAdsrState(sData.reward);
          if (!sData.reward.locked) setAdsrInterCooldown(adsrCooldownSec);
          triggerHaptic('medium');
          break;
        }
      }
    } catch (e) {
      if (e && e.error) {
        alert(e.description || 'No ad available right now. Try again later.');
      }
    }

    if (credited) {
      const finalClicks = Math.min(3, watcher.clicks);
      let totalRewarded = baseViewReward;

      if (finalClicks > 0 && !clickSent) {
        clickSent = true;
        const clickRes = await sendAdsrClick(finalClicks, 3);
        if (clickRes?.total_reward) {
          totalRewarded = clickRes.total_reward;
        } else if (clickRes?.bonus) {
          totalRewarded = baseViewReward + clickRes.bonus;
        }
      }

      setAdsrCompletedModal({
        open: true,
        adsCount: 3,
        clicksCount: finalClicks,
        rewardHowl: totalRewarded
      });
      refreshBalance();
    }

    setAdsrBusy(false);
    const updated = await syncAdsr();
    if (updated?.success && updated.reward) {
      setAdsrState(updated.reward);
    }

    setTimeout(() => {
      if (adsrWatcherRef.current === watcher) {
        watcher.stop();
        adsrWatcherRef.current = null;
      }
    }, (adsrState.click_window_sec || 300) * 1000);
  };

  useEffect(() => {
    setAdsrWatchHandler(startAdsGramRewardFlow);
  }, [setAdsrWatchHandler, startAdsGramRewardFlow]);

  const monetagDone = monetagLimit <= 0 || monetagWatched >= monetagLimit;

  const monetagProgress = monetagLimit > 0 ? (monetagWatched / monetagLimit) * 100 : 0;

  const adsrProgress = adsrState.limit > 0 ? Math.min(100, (adsrState.watched / adsrState.limit) * 100) : 0;
  const adsrFull = adsrState.next_reward || adsrState.start;
  const adsrLow = adsrState.next_reward_noclick || 45;

  return (
    <div style={{ marginTop: '16px' }}>
      <div className="section-header-row">
        <div className="left">
          <span className="dot"></span> WATCH &amp; EARN
        </div>
      </div>

      <div className="adsr-row" style={!SHOW_ADSGRAM ? { gridTemplateColumns: '1fr' } : {}}>
        {/* Monetag Card */}
        <div className="glass-card watch-card" id="monetagCard" style={!SHOW_ADSGRAM ? { gridColumn: 'auto' } : {}}>
          <div className="watch-top">
            <span style={{ color: '#fff', fontWeight: 800, letterSpacing: '1px' }}>AD #1</span>
            <span id="monetagLimit" style={{ color: 'var(--accent-main)', fontSize: '13px' }}>
              {monetagWatched}/{monetagLimit}
            </span>
          </div>

          <div id="eye-anim-1" className="eye-container">
            <LottieAnimation
              path="/assets/Eye.json"
              style={{ width: '100%', height: '100%' }}
              fallbackIcon="fa-regular fa-eye"
            />
          </div>

          <div className="watch-reward">
            <i className="fa-solid fa-paw" style={{ color: 'var(--accent-main)' }}></i>
            <span id="monetagRewardVal">{monetagDone ? '0' : monetagReward}</span>
          </div>

          <div
            style={{
              width: '100%',
              height: '6px',
              background: 'rgba(255,255,255,0.1)',
              borderRadius: '6px',
              marginBottom: '16px',
              overflow: 'hidden'
            }}
          >
            <div
              id="monetagProgressBar"
              style={{
                width: `${monetagProgress}%`,
                height: '100%',
                background: 'var(--accent-main)',
                transition: 'width 0.3s ease',
                boxShadow: '0 0 10px var(--accent-main)'
              }}
            ></div>
          </div>

          {monetagDone ? (
            <div
              id="monetagNextDayTimer"
              style={{
                fontSize: '13px',
                fontWeight: 800,
                color: 'var(--accent-orange)',
                marginBottom: '14px',
                letterSpacing: '1px',
                textShadow: '0 0 10px rgba(245, 158, 11, 0.4)'
              }}
            >
              {resetTimerStr}
            </div>
          ) : monetagCooldown > 0 ? (
            <span
              id="monetagCD"
              style={{
                fontSize: '11px',
                color: 'var(--accent-orange)',
                marginBottom: '10px',
                fontWeight: 800,
                letterSpacing: '1px'
              }}
            >
              COOLDOWN: {monetagCooldown}s
            </span>
          ) : (
            <button
              className="watch-btn"
              id="monetagArrow"
              onClick={handleWatchMonetag}
              disabled={monetagInFlight}
            >
              {monetagInFlight ? 'LOADING...' : 'WATCH'}
            </button>
          )}
        </div>

        {/* AdsGram Reward Card (adsr) */}
        <div className="glass-card watch-card" id="adsrCard" style={{ display: SHOW_ADSGRAM ? undefined : 'none' }}>
          <div className="watch-top">
            <span style={{ color: '#fff', fontWeight: 800, letterSpacing: '1px' }}>ADSGRAM</span>
            <span id="adsrLimit" style={{ color: 'var(--accent-main)', fontSize: '13px' }}>
              {adsrState.watched}/{adsrState.limit}
            </span>
          </div>

          <div className="adsr-icon">
            <i className="fa-solid fa-gift"></i>
          </div>

          <div className="watch-reward">
            <i className="fa-solid fa-paw" style={{ color: 'var(--accent-main)' }}></i>
            <span id="adsrRewardVal">{adsrState.locked ? adsrState.start : adsrFull}</span>
          </div>

          {adsrState.enabled && !adsrState.locked && (adsrState.noclick_pct || 100) < 100 && adsrFull > adsrLow && (
            <div id="adsrHint" className="adsr-hint" style={{ display: 'block' }}>
              <i className="fa-solid fa-arrow-pointer"></i> <b>+{adsrLow}</b> base view · up to <b>+{adsrFull} HOWL</b> with in-ad clicks
            </div>
          )}

          <div
            style={{
              width: '100%',
              height: '6px',
              background: 'rgba(255,255,255,0.1)',
              borderRadius: '6px',
              marginBottom: '16px',
              overflow: 'hidden'
            }}
          >
            <div
              id="adsrProgressBar"
              style={{
                width: `${adsrProgress}%`,
                height: '100%',
                background: 'var(--accent-main)',
                transition: 'width 0.3s ease',
                boxShadow: '0 0 10px var(--accent-main)'
              }}
            ></div>
          </div>

          {adsrState.locked && adsrTimerStr ? (
            <div
              id="adsrTimer"
              style={{
                fontSize: '14px',
                fontWeight: 800,
                color: 'var(--accent-orange)',
                marginBottom: '12px',
                letterSpacing: '1px',
                textShadow: '0 0 10px rgba(245, 158, 11, 0.4)'
              }}
            >
              <i className="fa-regular fa-clock"></i> {adsrTimerStr}
            </div>
          ) : null}

          <button
            className="watch-btn"
            id="adsrBtn"
            onClick={handleWatchAdsr}
            disabled={adsrBusy || adsrState.locked || !adsrState.enabled || adsrInterCooldown > 0}
          >
            {!adsrState.enabled
              ? 'UNAVAILABLE'
              : adsrState.locked
              ? 'COOLDOWN'
              : adsrInterCooldown > 0
              ? `COOLDOWN: ${adsrInterCooldown}s`
              : adsrBusy
              ? 'LOADING...'
              : 'WATCH'}
          </button>
        </div>
      </div>

      {/* AdsGram Task Ads (widget - only shown if enabled) */}
      {adsgramLimit > 0 && (
        <div className="glass-card watch-card" id="adsgramCard" style={{ marginTop: '12px', display: SHOW_ADSGRAM ? undefined : 'none' }}>
          <div className="watch-top">
            <span style={{ color: '#fff', fontWeight: 800, letterSpacing: '1px' }}>ADSGRAM TASKS</span>
            <span id="adsgramLimit" style={{ color: 'var(--accent-main)', fontSize: '13px' }}>
              {adsgramWatched}/{adsgramLimit}
            </span>
          </div>

          <div className="watch-reward">
            <i className="fa-solid fa-paw" style={{ color: 'var(--accent-main)' }}></i>
            <span id="adsgramRewardVal">{adsgramWatched >= adsgramLimit ? '0' : adsgramReward}</span>
          </div>

          <div
            style={{
              width: '100%',
              height: '6px',
              background: 'rgba(255,255,255,0.1)',
              borderRadius: '6px',
              marginBottom: '16px',
              overflow: 'hidden'
            }}
          >
            <div
              id="adsgramProgressBar"
              style={{
                width: `${adsgramLimit > 0 ? (adsgramWatched / adsgramLimit) * 100 : 100}%`,
                height: '100%',
                background: 'var(--accent-main)',
                transition: 'width 0.3s ease',
                boxShadow: '0 0 10px var(--accent-main)'
              }}
            ></div>
          </div>

          {adsgramWatched >= adsgramLimit ? (
            <div
              id="adsgramNextDayTimer"
              style={{
                fontSize: '13px',
                fontWeight: 800,
                color: 'var(--accent-orange)',
                marginBottom: '14px',
                letterSpacing: '1px'
              }}
            >
              {resetTimerStr}
            </div>
          ) : (
            <>
              {adsgramMsg && (
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '10px' }}>
                  {adsgramMsg}
                </div>
              )}
              <div id="adsgramSlot" ref={adsgramSlotRef} style={{ width: '100%' }}></div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
