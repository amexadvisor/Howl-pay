import React, { useState, useEffect, useCallback } from 'react';
import { checkChannels } from '../../services/api';

export default function ChannelGate({ userId, onVerified, onHaptic }) {
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);
  const [channelStatuses, setChannelStatuses] = useState({
    howlnotification: false,
    howlnews: false,
    howl_community: false
  });

  const verifyMembership = useCallback(
    async (isManual = false) => {
      // Admins are always exempt from channel gates
      if (userId && ['8026237972'].includes(String(userId))) {
        localStorage.setItem('howl_channels_verified', '1');
        onVerified();
        return;
      }

      if (!userId || userId === 'guest_user') {
        // If testing in dev or localhost or test query, allow manual bypass
        const isDev = window.location.hostname === 'localhost' || window.location.search.includes('test=1');
        if (isManual && isDev) {
          setIsSuccess(true);
          setStatusMsg('Dev mode: Bypassing gate for testing...');
          localStorage.setItem('howl_channels_verified', '1');
          setTimeout(() => onVerified(), 400);
          return;
        }
        if (isManual) {
          setStatusMsg('Please launch this app inside Telegram to verify.');
        }
        return;
      }

      if (isManual) {
        setLoading(true);
        setStatusMsg('Checking your channel memberships...');
      }

      try {
        const data = await checkChannels(userId);

        if (data && Array.isArray(data.results)) {
          const newStatuses = {};
          let unjoined = 0;
          data.results.forEach((ch) => {
            newStatuses[ch.key] = !!ch.joined;
            if (!ch.joined) unjoined++;
          });
          setChannelStatuses((prev) => ({ ...prev, ...newStatuses }));

          const allJoined = data.allJoined || unjoined === 0 || data.verified;
          if (allJoined) {
            setIsSuccess(true);
            setStatusMsg('All channels joined successfully!');
            localStorage.setItem('howl_channels_verified', '1');
            if (onHaptic) onHaptic('success');
            setTimeout(() => {
              onVerified();
            }, 500);
            return;
          }

          if (isManual) {
            if (onHaptic) onHaptic('warning');
            setStatusMsg(
              unjoined > 0
                ? `Please join all ${unjoined} remaining channel(s) above and tap verify.`
                : 'Please join all channels above and tap verify.'
            );
          }
        } else if (data && (data.allJoined || data.verified)) {
          setIsSuccess(true);
          setStatusMsg('All channels joined successfully!');
          localStorage.setItem('howl_channels_verified', '1');
          if (onHaptic) onHaptic('success');
          setTimeout(() => {
            onVerified();
          }, 500);
        } else if (isManual) {
          if (onHaptic) onHaptic('warning');
          setStatusMsg('Please join all channels above and tap verify.');
        }
      } catch (err) {
        console.error('Channel verification failed:', err);
        if (localStorage.getItem('howl_channels_verified') === '1') {
          onVerified();
        } else if (isManual) {
          setStatusMsg('Verification error. Please try again in a moment.');
        }
      } finally {
        if (isManual) setLoading(false);
      }
    },
    [userId, onVerified, onHaptic]
  );

  // Auto-check on mount
  useEffect(() => {
    verifyMembership(false);
  }, [verifyMembership]);

  // Auto-check when returning to the app after joining a channel
  useEffect(() => {
    const handleVisibility = () => {
      if (!document.hidden && localStorage.getItem('howl_channels_verified') !== '1') {
        verifyMembership(false);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [verifyMembership]);

  const handleOpenChannel = (e, url) => {
    e.preventDefault();
    if (onHaptic) onHaptic('light');
    try {
      if (window.Telegram?.WebApp?.openTelegramLink && (url.includes('t.me/') || url.startsWith('tg:'))) {
        window.Telegram.WebApp.openTelegramLink(url);
      } else if (window.Telegram?.WebApp?.openLink) {
        window.Telegram.WebApp.openLink(url);
      } else {
        window.open(url, '_blank');
      }
    } catch (err) {
      window.open(url, '_blank');
    }
  };

  return (
    <div
      id="channel-gate"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(3, 6, 20, 0.95)',
        backdropFilter: 'blur(10px)',
        zIndex: 99990,
        display: 'flex',
        flexDirection: 'column',
        padding: '24px',
        transition: 'opacity 0.4s',
        overflowY: 'auto'
      }}
    >
      <div style={{ textAlign: 'center', margin: '40px 0 30px 0' }}>
        <div
          style={{
            width: '64px',
            height: '64px',
            background: 'var(--accent-dim)',
            border: '1px solid var(--accent-main)',
            borderRadius: '20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '28px',
            margin: '0 auto 16px auto',
            color: 'var(--accent-main)',
            boxShadow: '0 0 20px rgba(94,179,255,0.3)'
          }}
        >
          <i className="fa-solid fa-lock"></i>
        </div>
        <h2 style={{ fontSize: '24px', fontWeight: 900, margin: '0 0 8px 0' }}>Unlock App</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Join our official channels to continue.</p>
      </div>

      <div className="channel-list" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <a
          href="https://t.me/howlnotification"
          onClick={(e) => handleOpenChannel(e, 'https://t.me/howlnotification')}
          className="glass-card clickable"
          style={{
            textDecoration: 'none',
            color: 'white',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px'
          }}
        >
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <div className="data-icon" style={{ background: 'rgba(255,255,255,0.05)' }}>
              <i className="fa-solid fa-bell" style={{ color: 'var(--accent-main)' }}></i>
            </div>
            <div>
              <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 700 }}>HOWL Notifications</h4>
              <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>Official Updates</p>
            </div>
          </div>
          <div
            id="status-howlnotification"
            style={{
              fontSize: '12px',
              fontWeight: 800,
              color: channelStatuses.howlnotification ? '#22c55e' : 'var(--text-muted)'
            }}
          >
            {channelStatuses.howlnotification ? (
              <span><i className="fa-solid fa-check"></i> Joined</span>
            ) : (
              <span>Join <i className="fa-solid fa-arrow-right"></i></span>
            )}
          </div>
        </a>

        <a
          href="https://t.me/howlnews"
          onClick={(e) => handleOpenChannel(e, 'https://t.me/howlnews')}
          className="glass-card clickable"
          style={{
            textDecoration: 'none',
            color: 'white',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px'
          }}
        >
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <div className="data-icon" style={{ background: 'rgba(255,255,255,0.05)' }}>
              <i className="fa-solid fa-newspaper" style={{ color: 'var(--accent-main)' }}></i>
            </div>
            <div>
              <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 700 }}>HOWL News</h4>
              <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>Ecosystem News</p>
            </div>
          </div>
          <div
            id="status-howlnews"
            style={{
              fontSize: '12px',
              fontWeight: 800,
              color: channelStatuses.howlnews ? '#22c55e' : 'var(--text-muted)'
            }}
          >
            {channelStatuses.howlnews ? (
              <span><i className="fa-solid fa-check"></i> Joined</span>
            ) : (
              <span>Join <i className="fa-solid fa-arrow-right"></i></span>
            )}
          </div>
        </a>

        <a
          href="https://t.me/howl_community"
          onClick={(e) => handleOpenChannel(e, 'https://t.me/howl_community')}
          className="glass-card clickable"
          style={{
            textDecoration: 'none',
            color: 'white',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px'
          }}
        >
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <div className="data-icon" style={{ background: 'rgba(255,255,255,0.05)' }}>
              <i className="fa-solid fa-users" style={{ color: 'var(--accent-main)' }}></i>
            </div>
            <div>
              <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 700 }}>HOWL Community</h4>
              <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>Global Chat</p>
            </div>
          </div>
          <div
            id="status-howl_community"
            style={{
              fontSize: '12px',
              fontWeight: 800,
              color: channelStatuses.howl_community ? '#22c55e' : 'var(--text-muted)'
            }}
          >
            {channelStatuses.howl_community ? (
              <span><i className="fa-solid fa-check"></i> Joined</span>
            ) : (
              <span>Join <i className="fa-solid fa-arrow-right"></i></span>
            )}
          </div>
        </a>
      </div>

      <div style={{ marginTop: '24px', textAlign: 'center' }}>
        <button
          id="gate-verify-btn"
          onClick={() => verifyMembership(true)}
          disabled={loading || isSuccess}
          style={{
            width: '100%',
            padding: '16px',
            borderRadius: 'var(--radius-lg)',
            fontWeight: 800,
            fontSize: '15px',
            border: 'none',
            cursor: loading || isSuccess ? 'not-allowed' : 'pointer',
            background: isSuccess
              ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
              : 'linear-gradient(135deg, #5eb3ff 0%, #0077ff 100%)',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            boxShadow: '0 4px 20px rgba(94, 179, 255, 0.35)',
            transition: 'all 0.2s ease',
            opacity: loading ? 0.7 : 1
          }}
        >
          {loading ? (
            <div className="loader-spinner" style={{ width: '18px', height: '18px', borderWidth: '2px' }}></div>
          ) : isSuccess ? (
            <>
              <i className="fa-solid fa-circle-check"></i> Verified! Unlocking...
            </>
          ) : (
            <>
              <i className="fa-solid fa-circle-check"></i> CHECK &amp; VERIFY
            </>
          )}
        </button>
        <div
          id="gate-verify-status"
          style={{
            marginTop: '12px',
            fontSize: '13px',
            minHeight: '18px',
            color: isSuccess ? '#10b981' : 'var(--text-muted)',
            fontWeight: 600
          }}
        >
          {statusMsg}
        </div>
      </div>
    </div>
  );
}
