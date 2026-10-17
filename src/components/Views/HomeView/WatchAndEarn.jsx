import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../../../context/AppContext';
import { claimAdReward } from '../../../services/api';
import LottieAnimation from '../../Common/LottieAnimation';

export default function WatchAndEarn() {
  const { user, triggerHaptic, showTopNotification, refreshBalance, setAdsrPreModalOpen, setAdsrCompletedModal } = useApp();

  // Monetag state
  const [monetagWatched, setMonetagWatched] = useState(0);
  const [monetagLimit, setMonetagLimit] = useState(10);
  const [monetagReward, setMonetagReward] = useState(20);
  const [monetagCooldown, setMonetagCooldown] = useState(0);
  const [monetagLoading, setMonetagLoading] = useState(false);

  // AdsGram state
  const [adsrWatched, setAdsrWatched] = useState(1);
  const [adsrLimit, setAdsrLimit] = useState(5);
  const [adsrReward, setAdsrReward] = useState(45);
  const [adsrLoading, setAdsrLoading] = useState(false);

  // Midnight reset countdown
  const [resetTimerStr, setResetTimerStr] = useState('');

  // Countdown to midnight UTC
  useEffect(() => {
    const updateMidnight = () => {
      const now = new Date();
      const midnight = new Date(now);
      midnight.setUTCHours(24, 0, 0, 0);
      const diff = Math.max(0, Math.floor((midnight.getTime() - now.getTime()) / 1000));
      const h = String(Math.floor(diff / 3600)).padStart(2, '0');
      const m = String(Math.floor((diff % 3600) / 60)).padStart(2, '0');
      const s = String(diff % 60).padStart(2, '0');
      setResetTimerStr(`${h}:${m}:${s}`);
    };

    updateMidnight();
    const interval = setInterval(updateMidnight, 1000);
    return () => clearInterval(interval);
  }, []);

  // Cooldown countdown for Monetag (5s interval)
  useEffect(() => {
    if (monetagCooldown <= 0) return;
    const timer = setTimeout(() => {
      setMonetagCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearTimeout(timer);
  }, [monetagCooldown]);

  // Handle Monetag Watch Click
  const handleWatchMonetag = async () => {
    if (monetagCooldown > 0 || monetagLoading) return;
    triggerHaptic('light');

    if (typeof window.show_11935325 === 'function') {
      setMonetagLoading(true);
      window
        .show_11935325()
        .then(async () => {
          try {
            const res = await claimAdReward(user.id, '/api/claim-bonus', 0, 1);
            if (res && res.success) {
              setMonetagWatched((prev) => prev + 1);
              showTopNotification('REWARD CLAIMED!', `+${monetagReward} HOWL added!`, 'gold');
              refreshBalance();
            }
          } catch (e) {}
        })
        .catch((err) => {
          showTopNotification('AD UNAVAILABLE', 'No ads available right now. Try again soon.', 'error');
        })
        .finally(() => {
          setMonetagLoading(false);
          setMonetagCooldown(5);
        });
    } else {
      // Development simulated ad watch
      setMonetagLoading(true);
      setTimeout(async () => {
        try {
          const res = await claimAdReward(user.id, '/api/claim-bonus', 0, 1);
          if (res && res.success) {
            setMonetagWatched((prev) => prev + 1);
            showTopNotification('REWARD CLAIMED!', `+${monetagReward} HOWL added!`, 'gold');
            refreshBalance();
          }
        } catch (e) {}
        setMonetagLoading(false);
        setMonetagCooldown(5);
      }, 1500);
    }
  };

  // Handle AdsGram Watch Click
  const handleWatchAdsgram = () => {
    if (adsrLoading) return;
    triggerHaptic('light');
    const hidePre = localStorage.getItem('adsr_hide_pre_tutorial') === '1';
    if (hidePre) {
      launchAdsgram();
    } else {
      setAdsrPreModalOpen(true);
    }
  };

  const launchAdsgram = () => {
    setAdsrLoading(true);

    if (window.Adsgram) {
      try {
        const AdController = window.Adsgram.init({ blockId: 'int-7557' });
        AdController.show()
          .then(async (result) => {
            const clicks = result?.clicks || 1;
            const reward = 45;
            setAdsrWatched((prev) => Math.min(adsrLimit, prev + 1));
            showTopNotification('AD COMPLETED!', `+${reward} HOWL earned!`, 'gold');
            refreshBalance();
            setAdsrCompletedModal({
              open: true,
              adsCount: 1,
              clicksCount: clicks,
              rewardHowl: reward
            });
          })
          .catch((err) => {
            showTopNotification('AD ERROR', 'Could not load AdsGram ad right now.', 'error');
          })
          .finally(() => {
            setAdsrLoading(false);
          });
      } catch (e) {
        setAdsrLoading(false);
      }
    } else {
      // Simulation for web environment
      setTimeout(() => {
        setAdsrWatched((prev) => Math.min(adsrLimit, prev + 1));
        refreshBalance();
        setAdsrLoading(false);
        setAdsrCompletedModal({
          open: true,
          adsCount: 1,
          clicksCount: 2,
          rewardHowl: 45
        });
      }, 1200);
    }
  };

  const monetagDone = monetagWatched >= monetagLimit;
  const adsrDone = adsrWatched >= adsrLimit;

  return (
    <div style={{ marginTop: '16px' }}>
      <div className="section-header-row">
        <div className="left">
          <span className="dot"></span> WATCH &amp; EARN
        </div>
      </div>

      <div className="adsr-row">
        {/* Monetag Rewarded Ad Card */}
        <div className="glass-card watch-card" id="monetagCard">
          <div className="watch-top">
            <span>MONETAG REWARD</span>
            <span id="monetagLimit">
              {monetagWatched}/{monetagLimit}
            </span>
          </div>

          <div className="eye-container">
            <LottieAnimation
              path="/assets/Eye.json"
              style={{ width: '100%', height: '100%' }}
              fallbackIcon="fa-regular fa-eye"
            />
          </div>

          <div className="watch-reward">
            <i className="fa-solid fa-paw"></i> +
            <span id="monetagRewardVal">{monetagDone ? '0' : monetagReward}</span> HOWL
          </div>

          <div className="adsr-hint">Daily 10-ad watch bonus</div>

          {monetagDone ? (
            <div style={{ fontSize: '11px', color: 'var(--accent-orange)', fontWeight: 800 }}>
              Ads Reset In: {resetTimerStr}
            </div>
          ) : monetagCooldown > 0 ? (
            <div
              style={{
                fontSize: '12px',
                fontWeight: 800,
                color: 'var(--accent-orange)',
                padding: '12px'
              }}
            >
              COOLDOWN: {monetagCooldown}s
            </div>
          ) : (
            <button
              className="watch-btn"
              onClick={handleWatchMonetag}
              disabled={monetagLoading}
            >
              {monetagLoading ? 'LOADING...' : 'WATCH'}
            </button>
          )}
        </div>

        {/* AdsGram Reward Card */}
        <div className="glass-card watch-card" id="adsrCard">
          <div className="watch-top">
            <span>ADSGRAM REWARD</span>
            <span id="adsrCounter">
              {adsrWatched}/{adsrLimit}
            </span>
          </div>

          <div className="adsr-icon">
            <i className="fa-solid fa-paw"></i>
          </div>

          <div className="watch-reward">
            <i className="fa-solid fa-paw"></i> +
            <span id="adsrRewardVal">{adsrDone ? '0' : adsrReward}</span> HOWL
          </div>

          <div className="adsr-hint">In-Ad click bonus up to 3x</div>

          {adsrDone ? (
            <div style={{ fontSize: '11px', color: 'var(--accent-orange)', fontWeight: 800 }}>
              Ads Reset In: {resetTimerStr}
            </div>
          ) : (
            <button
              className="watch-btn"
              onClick={handleWatchAdsgram}
              disabled={adsrLoading}
            >
              {adsrLoading ? 'LOADING...' : 'WATCH ADS'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
