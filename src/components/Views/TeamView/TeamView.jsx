import React, { useState, useEffect } from 'react';
import { useApp } from '../../../context/AppContext';
import { fetchReferralList, BOT_USERNAME } from '../../../services/api';

const qtAgo = (ts) => {
  if (!ts) return 'never';
  const s = Math.max(0, (Date.now() - new Date(ts).getTime()) / 1000);
  if (s < 3600) return Math.max(1, Math.round(s / 60)) + 'm ago';
  if (s < 86400) return Math.round(s / 3600) + 'h ago';
  return Math.round(s / 86400) + 'd ago';
};

export default function TeamView({ isActive = false }) {
  const { user, triggerHaptic, showTopNotification, referralStats } = useApp();
  const [stats, setStats] = useState({
    active: 0,
    inactive: 0,
    bonus: 0,
    total: 0,
    listed: 0
  });
  const [friendsList, setFriendsList] = useState([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  const refLink =
    user.id && user.id !== 'guest_user'
      ? `https://t.me/${BOT_USERNAME}/app?startapp=ref_${user.id}`
      : `https://t.me/${BOT_USERNAME}/app`;

  const loadReferrals = async () => {
    try {
      const res = await fetchReferralList();
      if (res && res.success) {
        setStats({
          active: res.active || 0,
          inactive: res.inactive || 0,
          bonus: res.bonuses || 0,
          total: res.total || 0,
          listed: res.listed || 0
        });
        if (Array.isArray(res.friends)) {
          setFriendsList(res.friends);
        }
      }
    } catch (e) {
      console.error('Failed to load referrals:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isActive) {
      loadReferrals();
    }
  }, [isActive]);

  const handleCopyLink = () => {
    triggerHaptic('light');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(refLink);
    } else {
      const ta = document.createElement('textarea');
      ta.value = refLink;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    showTopNotification('COPIED!', 'Referral link copied to clipboard', 'cyan');
  };

  const handleShare = () => {
    triggerHaptic('light');
    const text = encodeURIComponent('Join HOWL, complete simple tasks & earn USDT directly to your bot!');
    const url = `https://t.me/share/url?url=${encodeURIComponent(refLink)}&text=${text}`;
    if (window.Telegram?.WebApp?.openTelegramLink) {
      window.Telegram.WebApp.openTelegramLink(url);
    } else {
      window.open(url, '_blank');
    }
  };

  const filteredFriends = friendsList.filter((f) => {
    if (filter === 'active') return f.active;
    if (filter === 'inactive') return !f.active;
    return true;
  });

  const friendsCount = referralStats?.friends_count || 0;
  const howlEarned = Number(referralStats?.total_howl || 0);
  const usdtEarned = Number(referralStats?.total_usdt || (howlEarned * 0.00002));


  return (
    <div id="team-view" className={`view ${isActive ? 'active' : ''}`}>
      <h2 style={{ fontSize: '24px', fontWeight: 800, margin: '0 0 8px 0' }}>Friends</h2>
      <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '20px' }}>
        Invite friends to earn 750 HOWL + 10% USDT lifetime commission.
      </p>

      {/* Reward Breakdown Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '16px' }}>
        <div className="glass-card" style={{ padding: '16px 8px', textAlign: 'center', marginBottom: 0 }}>
          <div style={{ color: 'var(--accent-main)', fontWeight: 900, fontSize: '16px', marginBottom: '4px' }}>
            +250
          </div>
          <div style={{ fontSize: '10px', color: '#fff', fontWeight: 700 }}>HOWL Coins</div>
          <div style={{ fontSize: '9px', color: 'var(--text-muted)', marginTop: '4px' }}>On Join</div>
        </div>
        <div className="glass-card" style={{ padding: '16px 8px', textAlign: 'center', marginBottom: 0 }}>
          <div style={{ color: 'var(--accent-orange)', fontWeight: 900, fontSize: '16px', marginBottom: '4px' }}>
            +500
          </div>
          <div style={{ fontSize: '10px', color: '#fff', fontWeight: 700 }}>HOWL Coins</div>
          <div style={{ fontSize: '9px', color: 'var(--text-muted)', marginTop: '4px' }}>On 10 Ads</div>
        </div>
        <div className="glass-card" style={{ padding: '16px 8px', textAlign: 'center', marginBottom: 0 }}>
          <div style={{ color: '#a855f7', fontWeight: 900, fontSize: '16px', marginBottom: '4px' }}>10%</div>
          <div style={{ fontSize: '10px', color: '#fff', fontWeight: 700 }}>USDT Split</div>
          <div style={{ fontSize: '9px', color: 'var(--text-muted)', marginTop: '4px' }}>Lifetime</div>
        </div>
      </div>

      {/* Your Referral Stats */}
      <div className="glass-card" style={{ marginBottom: '16px' }}>
        <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '15px', margin: '0 0 16px 0' }}>
          <i className="fa-solid fa-chart-pie" style={{ color: 'var(--accent-main)' }}></i> Your Referral Stats
        </h3>
        <div style={{ display: 'flex', gap: '8px' }}>
          <div
            style={{
              flex: 1,
              background: 'rgba(0,0,0,0.2)',
              border: '1px solid var(--border-soft)',
              borderRadius: '12px',
              padding: '12px 6px',
              textAlign: 'center'
            }}
          >
            <div style={{ fontSize: '9px', color: 'var(--text-muted)', fontWeight: 700, marginBottom: '6px' }}>
              FRIENDS
            </div>
            <div id="ref-friends-count" style={{ color: 'var(--accent-main)', fontWeight: 800, fontSize: '16px' }}>
              {friendsCount.toLocaleString()}
            </div>
          </div>
          <div
            style={{
              flex: 1,
              background: 'rgba(0,0,0,0.2)',
              border: '1px solid var(--border-soft)',
              borderRadius: '12px',
              padding: '12px 6px',
              textAlign: 'center'
            }}
          >
            <div style={{ fontSize: '9px', color: 'var(--text-muted)', fontWeight: 700, marginBottom: '6px' }}>
              HOWL
            </div>
            <div id="ref-howl-earned" style={{ color: 'var(--accent-orange)', fontWeight: 800, fontSize: '14px' }}>
              {howlEarned.toLocaleString()} HOWL
            </div>
          </div>
          <div
            style={{
              flex: 1,
              background: 'rgba(0,0,0,0.2)',
              border: '1px solid var(--border-soft)',
              borderRadius: '12px',
              padding: '12px 6px',
              textAlign: 'center'
            }}
          >
            <div style={{ fontSize: '9px', color: 'var(--text-muted)', fontWeight: 700, marginBottom: '6px' }}>
              USDT
            </div>
            <div id="ref-usdt-earned" style={{ color: '#a855f7', fontWeight: 800, fontSize: '14px' }}>
              ${usdtEarned.toFixed(4)}
            </div>
          </div>
        </div>
      </div>

      {/* Referral Activity List */}
      <div className="glass-card" id="ref-activity-card" style={{ marginBottom: '16px' }}>
        <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '15px', margin: '0 0 6px 0' }}>
          <i className="fa-solid fa-user-check" style={{ color: 'var(--accent-main)' }}></i> Referral Activity
        </h3>
        <div className="qt-muted" style={{ marginBottom: '12px' }}>
          Active = watched at least one ad. Inactive = joined but has not watched an ad yet.
        </div>

        <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
          <div
            style={{
              flex: 1,
              background: 'rgba(0,0,0,0.2)',
              border: '1px solid var(--border-soft)',
              borderRadius: '12px',
              padding: '12px 6px',
              textAlign: 'center'
            }}
          >
            <div style={{ fontSize: '9px', color: 'var(--text-muted)', fontWeight: 700, marginBottom: '6px' }}>
              ACTIVE
            </div>
            <div id="ref-act-active" style={{ color: '#22c55e', fontWeight: 800, fontSize: '16px' }}>
              {stats.active.toLocaleString()}
            </div>
          </div>
          <div
            style={{
              flex: 1,
              background: 'rgba(0,0,0,0.2)',
              border: '1px solid var(--border-soft)',
              borderRadius: '12px',
              padding: '12px 6px',
              textAlign: 'center'
            }}
          >
            <div style={{ fontSize: '9px', color: 'var(--text-muted)', fontWeight: 700, marginBottom: '6px' }}>
              INACTIVE
            </div>
            <div id="ref-act-inactive" style={{ color: '#f59e0b', fontWeight: 800, fontSize: '16px' }}>
              {stats.inactive.toLocaleString()}
            </div>
          </div>
          <div
            style={{
              flex: 1,
              background: 'rgba(0,0,0,0.2)',
              border: '1px solid var(--border-soft)',
              borderRadius: '12px',
              padding: '12px 6px',
              textAlign: 'center'
            }}
          >
            <div style={{ fontSize: '9px', color: 'var(--text-muted)', fontWeight: 700, marginBottom: '6px' }}>
              10-AD BONUSES
            </div>
            <div id="ref-act-bonus" style={{ color: 'var(--accent-main)', fontWeight: 800, fontSize: '16px' }}>
              {stats.bonus.toLocaleString()}
            </div>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="ref-tabs">
          <button
            className={`ref-tab ${filter === 'all' ? 'active' : ''}`}
            onClick={() => {
              triggerHaptic('light');
              setFilter('all');
            }}
          >
            ALL
          </button>
          <button
            className={`ref-tab ${filter === 'active' ? 'active' : ''}`}
            onClick={() => {
              triggerHaptic('light');
              setFilter('active');
            }}
          >
            ACTIVE
          </button>
          <button
            className={`ref-tab ${filter === 'inactive' ? 'active' : ''}`}
            onClick={() => {
              triggerHaptic('light');
              setFilter('inactive');
            }}
          >
            INACTIVE
          </button>
        </div>

        {/* List items */}
        <div id="ref-list">
          {loading ? (
            <div className="qt-muted" style={{ margin: '10px 0 0 0' }}>
              Loading...
            </div>
          ) : filteredFriends.length === 0 ? (
            <div className="qt-muted" style={{ margin: '10px 0 0 0', textAlign: 'center' }}>
              No friends here yet.
            </div>
          ) : (
            filteredFriends.map((f, i) => {
              const initial = (Array.from(String(f.name || '').trim())[0] || '?').toUpperCase();
              const sub = f.active
                ? `${f.ads} ${f.ads === 1 ? 'ad' : 'ads'} watched${f.bonus_reached ? ' · 10-ad bonus earned' : ''}`
                : `Joined ${qtAgo(f.joined_at)} · has not watched an ad yet`;

              return (
                <div key={i} className="ref-row">
                  <div className="ref-avatar">{initial}</div>
                  <div className="ref-info">
                    <div className="ref-name">{f.name}</div>
                    <div className="ref-sub">{sub}</div>
                  </div>
                  <span className={`ref-chip ${f.active ? 'on' : 'off'}`}>
                    {f.active ? 'ACTIVE' : 'INACTIVE'}
                  </span>
                </div>
              );
            })
          )}
        </div>

        {stats.total > stats.listed && (
          <div id="ref-more" className="qt-muted" style={{ margin: '8px 0 0 0' }}>
            Showing your latest {stats.listed} of {stats.total} friends.
          </div>
        )}
      </div>


      {/* Referral Link Box */}
      <div className="glass-card">
        <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '15px', margin: '0 0 10px 0' }}>
          <i className="fa-solid fa-link" style={{ color: 'var(--accent-main)' }}></i> Your Referral Link
        </h3>
        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px' }}>
          Share with friends to automatically credit your rewards.
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <input
            type="text"
            id="ref-link-input"
            readOnly
            value={refLink}
            style={{
              flex: 1,
              background: 'rgba(0,0,0,0.3)',
              border: '1px solid var(--border-soft)',
              color: 'var(--text-main)',
              padding: '14px',
              borderRadius: '12px',
              outline: 'none',
              fontFamily: 'monospace',
              fontSize: '12px'
            }}
          />
          <button
            onClick={handleCopyLink}
            style={{
              background: 'var(--card-bg-light)',
              border: '1px solid var(--border-soft)',
              color: '#fff',
              borderRadius: '12px',
              padding: '0 18px',
              cursor: 'pointer',
              transition: '0.2s'
            }}
          >
            <i className="fa-regular fa-copy"></i>
          </button>
        </div>
        <button
          onClick={handleShare}
          style={{
            width: '100%',
            background: 'var(--accent-main)',
            color: '#000',
            border: 'none',
            padding: '16px',
            borderRadius: 'var(--radius-lg)',
            fontWeight: 800,
            fontSize: '14px',
            marginTop: '16px',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: '8px',
            cursor: 'pointer'
          }}
        >
          <i className="fa-brands fa-telegram"></i> Share via Telegram
        </button>
      </div>
    </div>
  );
}
