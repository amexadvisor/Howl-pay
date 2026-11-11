import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../../../context/AppContext';
import { quickTasksCall } from '../../../services/api';

export default function QuickView({ isActive = false }) {
  const { setActiveView, triggerHaptic, showTopNotification, refreshBalance } = useApp();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [bioClaiming, setBioClaiming] = useState(false);
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

  const comment = data?.comment;
  const bio = data?.bio;

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

          {(!comment?.enabled && !bio?.enabled) && (
            <div className="glass-card" style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
              No quick tasks are available right now. Check back soon!
            </div>
          )}
        </>
      )}
    </div>
  );
}
