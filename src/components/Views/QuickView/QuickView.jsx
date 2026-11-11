import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../../../context/AppContext';
import { quickTasksCall } from '../../../services/api';

export default function QuickView({ isActive = false }) {
  const { setActiveView, triggerHaptic, showTopNotification, refreshBalance } = useApp();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [bioClaiming, setBioClaiming] = useState(false);
  const [ytHandle, setYtHandle] = useState('');
  const [ytClaiming, setYtClaiming] = useState(false);
  const [ytError, setYtError] = useState('');
  const ytOpenedAtRef = useRef(0);
  const [commentTimerStr, setCommentTimerStr] = useState('');
  const timerRef = useRef(null);

  const loadQuickTasks = async () => {
    try {
      const res = await quickTasksCall('status');
      if (res && res.success) {
        setData(res);
      }
    } catch (e) {
      console.error('Failed to load quick tasks:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isActive) {
      loadQuickTasks();
    }
  }, [isActive]);

  // Timer for comment task countdown
  useEffect(() => {
    if (!data?.comment?.seconds_left || data.comment.seconds_left <= 0) {
      setCommentTimerStr('');
      return;
    }

    const targetTime = Date.now() + data.comment.seconds_left * 1000;
    const updateTimer = () => {
      const left = Math.max(0, Math.ceil((targetTime - Date.now()) / 1000));
      const h = String(Math.floor(left / 3600)).padStart(2, '0');
      const m = String(Math.floor((left % 3600) / 60)).padStart(2, '0');
      const s = String(left % 60).padStart(2, '0');
      setCommentTimerStr(`NEXT REWARD IN ${h}:${m}:${s}`);

      if (left <= 0) {
        clearInterval(timerRef.current);
        loadQuickTasks();
      }
    };

    updateTimer();
    timerRef.current = setInterval(updateTimer, 1000);
    return () => clearInterval(timerRef.current);
  }, [data]);

  const copyToClipboard = (text) => {
    triggerHaptic('light');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text);
    } else {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    showTopNotification('COPIED!', 'Text copied to clipboard', 'cyan');
  };

  const handleOpenGroup = () => {
    triggerHaptic('light');
    const link = data?.comment?.group_link || 'https://t.me/howl_community';
    if (window.Telegram?.WebApp?.openTelegramLink) {
      window.Telegram.WebApp.openTelegramLink(link);
    } else {
      window.open(link, '_blank');
    }
  };

  const handleClaimBio = async () => {
    if (bioClaiming) return;
    setBioClaiming(true);
    triggerHaptic('medium');

    try {
      const res = await quickTasksCall('claim_bio');
      if (res && res.success) {
        showTopNotification('BIO REWARD!', `+${data?.bio?.reward || 0} HOWL credited!`, 'gold');
        refreshBalance();
        loadQuickTasks();
      } else {
        showTopNotification('BIO VERIFICATION', res?.message || 'Bio link not detected yet. Please add it and try again.', 'error');
      }
    } catch (err) {
      showTopNotification('ERROR', 'Failed to verify bio link.', 'error');
    } finally {
      setBioClaiming(false);
    }
  };

  const handleOpenYouTube = () => {
    triggerHaptic('light');
    setYtError('');
    ytOpenedAtRef.current = Date.now();
    // Open YouTube app/home without a direct channel referrer link (organic search requirement)
    if (window.Telegram?.WebApp?.openLink) {
      window.Telegram.WebApp.openLink('https://www.youtube.com');
    } else {
      window.open('https://www.youtube.com', '_blank', 'noopener,noreferrer');
    }
  };

  const handleClaimYouTube = async () => {
    if (ytClaiming || youtubeSub?.done) return;
    setYtError('');

    const cleanHandle = ytHandle.trim();
    if (!cleanHandle) {
      triggerHaptic('warning');
      setYtError('Please enter your YouTube @handle first!');
      return;
    }

    // 15-second anti-cheat timer matching Amanuel's spec
    const elapsedMs = ytOpenedAtRef.current ? Date.now() - ytOpenedAtRef.current : 0;
    if (!ytOpenedAtRef.current || elapsedMs < 15000) {
      triggerHaptic('warning');
      const searchHint = youtubeSub?.target_handle || youtubeSub?.target_title || 'our channel';
      const msg = !ytOpenedAtRef.current
        ? `Please tap "1. Open YouTube App" first, search ${searchHint}, and subscribe!`
        : `Please subscribe on YouTube first (${Math.ceil((15000 - elapsedMs) / 1000)}s left).`;
      setYtError(msg);
      return;
    }

    setYtClaiming(true);
    triggerHaptic('medium');

    try {
      const res = await quickTasksCall('claim_youtube', { yt_handle: cleanHandle });
      if (res && res.success) {
        triggerHaptic('success');
        showTopNotification('YOUTUBE REWARD!', `+${res.reward || youtubeSub?.reward || 0} HOWL credited!`, 'gold');
        refreshBalance();
        loadQuickTasks();
      } else {
        triggerHaptic('error');
        const errMsg = res?.error || res?.message || 'Could not verify subscription. Try again.';
        setYtError(errMsg);
        showTopNotification('VERIFICATION FAILED', errMsg, 'error');
      }
    } catch (err) {
      const msg = 'Network error verifying YouTube subscription. Please try again.';
      setYtError(msg);
      showTopNotification('ERROR', msg, 'error');
    } finally {
      setYtClaiming(false);
    }
  };

  const comment = data?.comment;
  const bio = data?.bio;
  const youtubeSub = data?.youtube_sub;

  return (
    <div id="quick-view" className={`view ${isActive ? 'active' : ''}`}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '20px' }}>
        <button
          onClick={() => {
            triggerHaptic('light');
            setActiveView('home-view');
          }}
          style={{
            background: 'var(--card-bg-light)',
            border: '1px solid var(--border-soft)',
            color: '#fff',
            width: '40px',
            height: '40px',
            borderRadius: '12px',
            cursor: 'pointer'
          }}
        >
          <i className="fa-solid fa-arrow-left"></i>
        </button>
        <h2 style={{ fontSize: '20px', fontWeight: 800, margin: 0 }}>Quick Tasks</h2>
      </div>

      {loading ? (
        <div className="glass-card" style={{ textAlign: 'center', padding: '30px' }}>
          <div className="loader-spinner"></div>
        </div>
      ) : (
        <>
          {/* Community Comment Task */}
          {comment && comment.enabled && (
            <div className="glass-card" id="qt-comment-card">
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '10px',
                  marginBottom: '8px'
                }}
              >
                <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '15px', margin: 0 }}>
                  <i className="fa-regular fa-comments" style={{ color: 'var(--accent-main)' }}></i> Community Comment
                </h3>
                <span className="qt-chip" id="qt-comment-reward">
                  +{Number(comment.reward || 0).toLocaleString()} HOWL
                </span>
              </div>

              <p className="qt-muted" id="qt-comment-desc">
                Post one of these texts in our community group. Your reward is credited automatically once every{' '}
                {comment.cooldown_hours >= 1 ? `${comment.cooldown_hours} h` : `${Math.round(comment.cooldown_hours * 60)} min`}.
              </p>

              <div id="qt-comment-texts">
                {comment.texts &&
                  comment.texts.map((txt, idx) => (
                    <div key={idx} className="qt-text-item">
                      <span>{txt}</span>
                      <button className="qt-copy" onClick={() => copyToClipboard(txt)}>
                        <i className="fa-regular fa-copy"></i>
                      </button>
                    </div>
                  ))}
              </div>

              {commentTimerStr && (
                <div className="qt-timer" id="qt-comment-timer">
                  <i className="fa-regular fa-clock"></i> {commentTimerStr}
                </div>
              )}

              <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
                <button className="qt-btn" onClick={handleOpenGroup}>
                  <i className="fa-brands fa-telegram"></i> OPEN GROUP
                </button>
                <button
                  className="qt-btn qt-btn-ghost"
                  onClick={loadQuickTasks}
                  title="Refresh"
                >
                  <i className="fa-solid fa-rotate"></i>
                </button>
              </div>
            </div>
          )}

          {/* Bio Link Task */}
          {bio && bio.enabled && (
            <div className="glass-card" id="qt-bio-card">
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '10px',
                  marginBottom: '8px'
                }}
              >
                <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '15px', margin: 0 }}>
                  <i className="fa-solid fa-id-card" style={{ color: 'var(--accent-main)' }}></i> Bio Link{' '}
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 700 }}>ONE TIME</span>
                </h3>
                <span className="qt-chip" id="qt-bio-reward">
                  +{Number(bio.reward || 0).toLocaleString()} HOWL
                </span>
              </div>

              <p className="qt-muted">
                Add this line to your Telegram bio (Settings &gt; Edit Profile &gt; Bio), save it, then tap Verify. Bios
                are limited to 70 characters, so the link has no https://. Your bio must be visible to everybody.
              </p>

              <div className="qt-text-item">
                <span id="qt-bio-text">{bio.text}</span>
                <button className="qt-copy" onClick={() => copyToClipboard(bio.text)}>
                  <i className="fa-regular fa-copy"></i>
                </button>
              </div>

              <button
                className="qt-btn"
                id="qt-bio-btn"
                style={{ width: '100%', flex: 'none', marginTop: '4px' }}
                disabled={bio.done || bioClaiming}
                onClick={handleClaimBio}
              >
                {bio.done ? (
                  <>
                    <i className="fa-solid fa-circle-check"></i> COMPLETED
                  </>
                ) : bioClaiming ? (
                  'CHECKING...'
                ) : (
                  'VERIFY & CLAIM'
                )}
              </button>
            </div>
          )}

          {/* YouTube Channel Subscription Task */}
          {youtubeSub && youtubeSub.enabled && (
            <div className="glass-card" id="qt-youtube-card">
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '10px',
                  marginBottom: '8px'
                }}
              >
                <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '15px', margin: 0 }}>
                  <i className="fa-brands fa-youtube" style={{ color: '#ef4444' }}></i> Subscribe on YouTube{' '}
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 700 }}>ONE TIME</span>
                </h3>
                <span className="qt-chip" id="qt-yt-reward">
                  +{Number(youtubeSub.reward || 0).toLocaleString()} HOWL
                </span>
              </div>

              <ol
                className="qt-muted"
                style={{ paddingLeft: '18px', margin: '0 0 12px 0', lineHeight: 1.55 }}
              >
                <li>
                  Tap <b>1. Open YouTube App</b> below.
                </li>
                <li>
                  Search{' '}
                  <b style={{ color: '#fff' }}>
                    {youtubeSub.target_handle || youtubeSub.target_title || 'our channel'}
                  </b>{' '}
                  and tap <b>Subscribe</b>.
                </li>
                <li>
                  Make sure <i>&ldquo;Keep all my subscriptions private&rdquo;</i> is turned <b>OFF</b> in your
                  YouTube Privacy Settings.
                </li>
                <li>
                  Enter your own YouTube <b>@handle</b> below and tap <b>Check Subscription</b>.
                </li>
              </ol>

              {youtubeSub.target_handle && (
                <div className="qt-text-item" style={{ marginBottom: '10px' }}>
                  <span>Search: {youtubeSub.target_handle}</span>
                  <button className="qt-copy" onClick={() => copyToClipboard(youtubeSub.target_handle)}>
                    <i className="fa-regular fa-copy"></i>
                  </button>
                </div>
              )}

              {!youtubeSub.done && (
                <>
                  <button
                    className="qt-btn"
                    style={{
                      width: '100%',
                      flex: 'none',
                      marginBottom: '10px',
                      background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                      color: '#fff'
                    }}
                    onClick={handleOpenYouTube}
                  >
                    <i className="fa-brands fa-youtube"></i> 1. OPEN YOUTUBE APP
                  </button>

                  <input
                    type="text"
                    id="qt-yt-handle-input"
                    placeholder="Your YouTube @handle (e.g. @alex123)"
                    value={ytHandle}
                    onChange={(e) => {
                      setYtHandle(e.target.value);
                      if (ytError) setYtError('');
                    }}
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      background: 'rgba(0, 0, 0, 0.35)',
                      border: '1px solid var(--border-soft)',
                      color: '#fff',
                      padding: '11px 12px',
                      borderRadius: '10px',
                      fontSize: '13px',
                      fontWeight: 600,
                      marginBottom: '4px',
                      outline: 'none'
                    }}
                  />
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '8px', lineHeight: 1.35 }}>
                    Tip: In YouTube App, tap <b>You</b> (bottom-right) to see your <b>@handle</b> under your name.
                  </div>
                </>
              )}

              {ytError && (
                <div
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    color: '#fca5a5',
                    background: 'rgba(239, 68, 68, 0.12)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    padding: '8px 10px',
                    borderRadius: '8px',
                    marginBottom: '8px',
                    lineHeight: 1.4
                  }}
                >
                  {ytError}
                </div>
              )}

              <button
                className="qt-btn"
                id="qt-yt-btn"
                style={{ width: '100%', flex: 'none', marginTop: '2px' }}
                disabled={youtubeSub.done || ytClaiming}
                onClick={handleClaimYouTube}
              >
                {youtubeSub.done ? (
                  <>
                    <i className="fa-solid fa-circle-check"></i> COMPLETED
                    {youtubeSub.claimed_handle ? ` (${youtubeSub.claimed_handle})` : ''}
                  </>
                ) : ytClaiming ? (
                  'VERIFYING WITH YOUTUBE...'
                ) : (
                  '2. CHECK SUBSCRIPTION'
                )}
              </button>
            </div>
          )}

          {(!comment?.enabled && !bio?.enabled && !youtubeSub?.enabled) && (
            <div className="glass-card" style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
              No quick tasks are available right now. Check back soon!
            </div>
          )}
        </>
      )}
    </div>
  );
}
