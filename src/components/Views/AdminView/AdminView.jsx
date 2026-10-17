import React, { useState, useEffect } from 'react';
import { useApp } from '../../../context/AppContext';
import { adminCall } from '../../../services/api';

export default function AdminView() {
  const { setActiveView, triggerHaptic, showTopNotification } = useApp();
  
  // User Lookup
  const [lookupId, setLookupId] = useState('');
  const [searching, setSearching] = useState(false);
  const [userResult, setUserResult] = useState(null);

  // Ad settings
  const [adConfig, setAdConfig] = useState({
    monetag_start: 20,
    monetag_step: 1,
    monetag_limit: 10,
    adsgram_start: 50,
    adsgram_step: 5,
    adsgram_limit: 5
  });

  // Featured tasks admin tab
  const [ftTab, setFtTab] = useState('channel');
  const [ftChat, setFtChat] = useState('');
  const [ftChatReward, setFtChatReward] = useState('150');
  const [ftChatMaxUsers, setFtChatMaxUsers] = useState('2000');
  const [ftAppTitle, setFtAppTitle] = useState('');
  const [ftAppLink, setFtAppLink] = useState('');
  const [ftAppIcon, setFtAppIcon] = useState('');
  const [ftAppReward, setFtAppReward] = useState('100');
  const [ftAppMaxUsers, setFtAppMaxUsers] = useState('2000');
  const [ftAdminTasks, setFtAdminTasks] = useState([]);

  // Boinkers Admin
  const [boinkersEnabled, setBoinkersEnabled] = useState(true);
  const [boinkersOpenReward, setBoinkersOpenReward] = useState('100');
  const [boinkersSpinsReward, setBoinkersSpinsReward] = useState('300');
  const [boinkersMoonReward, setBoinkersMoonReward] = useState('1500');
  const [boinkersStats, setBoinkersStats] = useState({
    in_opened: 0,
    in_ads: 0,
    in_withdrawn: 0,
    out_open: 0,
    out_spins: 0,
    out_moon: 0
  });

  const handleLookup = async () => {
    if (!lookupId.trim()) return;
    setSearching(true);
    triggerHaptic('light');
    try {
      const res = await adminCall('lookup_user', { targetId: lookupId.trim() });
      if (res && res.success) {
        setUserResult(res.user);
      } else {
        showTopNotification('NOT FOUND', res?.message || 'User not found', 'error');
        setUserResult(null);
      }
    } catch (e) {
      showTopNotification('ERROR', 'Lookup request failed', 'error');
    } finally {
      setSearching(false);
    }
  };

  const handleUserAction = async (action, extra = {}) => {
    if (!userResult) return;
    triggerHaptic('medium');
    try {
      const res = await adminCall(action, { targetId: userResult.id, ...extra });
      if (res && res.success) {
        showTopNotification('SUCCESS', 'Action executed successfully', 'success');
        handleLookup();
      } else {
        showTopNotification('FAILED', res?.message || 'Could not execute action', 'error');
      }
    } catch (e) {
      showTopNotification('ERROR', 'Request failed', 'error');
    }
  };

  return (
    <div id="admin-view" className="view active">
      {/* Admin Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '14px',
              background: 'var(--accent-dim)',
              color: 'var(--accent-main)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '20px',
              border: '1px solid rgba(94, 179, 255, 0.3)'
            }}
          >
            <i className="fa-solid fa-shield-halved"></i>
          </div>
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 800, margin: 0 }}>Admin Panel</h2>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>
              User Moderation &amp; Security
            </p>
          </div>
        </div>
        <button
          onClick={() => {
            triggerHaptic('light');
            setActiveView('home-view');
          }}
          style={{
            background: 'rgba(255,255,255,0.08)',
            border: '1px solid var(--border-soft)',
            color: '#fff',
            padding: '10px 16px',
            borderRadius: '50px',
            fontSize: '12px',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}
        >
          <i className="fa-solid fa-arrow-right-from-bracket"></i> Exit Mode
        </button>
      </div>

      {/* User Lookup */}
      <div className="glass-card">
        <label
          style={{
            display: 'block',
            fontSize: '12px',
            fontWeight: 700,
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
            letterSpacing: '1px',
            marginBottom: '10px'
          }}
        >
          Lookup User by Telegram ID
        </label>
        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            type="text"
            id="admin-user-input"
            placeholder="e.g. 6563880391"
            value={lookupId}
            onChange={(e) => setLookupId(e.target.value)}
            style={{
              flex: 1,
              background: 'rgba(0,0,0,0.3)',
              border: '1px solid var(--border-soft)',
              borderRadius: '12px',
              padding: '14px',
              color: '#fff',
              fontSize: '14px',
              outline: 'none'
            }}
          />
          <button
            id="admin-search-btn"
            onClick={handleLookup}
            disabled={searching}
            style={{
              background: 'var(--accent-main)',
              border: 'none',
              color: '#000',
              padding: '0 20px',
              borderRadius: '12px',
              fontWeight: 800,
              fontSize: '14px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            {searching ? (
              <div className="loader-spinner" style={{ width: '16px', height: '16px', borderWidth: '2px' }}></div>
            ) : (
              <>
                <i className="fa-solid fa-magnifying-glass"></i> Search
              </>
            )}
          </button>
        </div>

        {/* User Lookup Details */}
        {userResult && (
          <div style={{ marginTop: '16px', borderTop: '1px solid var(--border-soft)', paddingTop: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <h4 style={{ margin: 0, fontSize: '15px', color: '#fff' }}>
                {userResult.first_name || userResult.username} (#{userResult.id})
              </h4>
              <span
                style={{
                  fontSize: '10px',
                  fontWeight: 800,
                  padding: '3px 8px',
                  borderRadius: '20px',
                  background: userResult.banned ? 'rgba(239,68,68,0.2)' : 'rgba(34,197,94,0.2)',
                  color: userResult.banned ? 'var(--accent-red)' : '#22c55e'
                }}
              >
                {userResult.banned ? 'BANNED' : 'ACTIVE'}
              </span>
            </div>

            <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: '14px' }}>
              <div>Balance: <b>{Number(userResult.total_howl || 0).toLocaleString()} HOWL</b> (${Number(userResult.total_usd || 0).toFixed(4)})</div>
              <div>Device ID: <span style={{ fontFamily: 'monospace' }}>{userResult.device_id || 'None'}</span></div>
              <div>IP: <span style={{ fontFamily: 'monospace' }}>{userResult.last_ip || 'None'}</span></div>
            </div>

            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {userResult.banned ? (
                <button
                  onClick={() => handleUserAction('unban')}
                  style={{
                    background: '#22c55e',
                    color: '#fff',
                    border: 'none',
                    padding: '8px 14px',
                    borderRadius: '8px',
                    fontWeight: 800,
                    fontSize: '12px',
                    cursor: 'pointer'
                  }}
                >
                  Unban User
                </button>
              ) : (
                <button
                  onClick={() => handleUserAction('ban')}
                  style={{
                    background: 'var(--accent-red)',
                    color: '#fff',
                    border: 'none',
                    padding: '8px 14px',
                    borderRadius: '8px',
                    fontWeight: 800,
                    fontSize: '12px',
                    cursor: 'pointer'
                  }}
                >
                  Ban User
                </button>
              )}

              <button
                onClick={() => {
                  const amt = prompt('Enter amount of HOWL to credit:');
                  if (amt && Number(amt) > 0) handleUserAction('adjust_balance', { amount: Number(amt) });
                }}
                style={{
                  background: 'var(--card-bg-light)',
                  border: '1px solid var(--border-soft)',
                  color: '#fff',
                  padding: '8px 14px',
                  borderRadius: '8px',
                  fontWeight: 800,
                  fontSize: '12px',
                  cursor: 'pointer'
                }}
              >
                + Credit HOWL
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Featured Tasks Management Card */}
      <div className="glass-card" id="ft-admin-card">
        <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '15px', margin: '0 0 4px 0' }}>
          <i className="fa-solid fa-star" style={{ color: 'var(--accent-main)' }}></i> Featured Tasks Management
        </h3>
        <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '0 0 14px 0', lineHeight: 1.5 }}>
          Add Telegram Channel / Group join tasks or Mini App / Bot visit tasks.
        </p>

        <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
          <button
            type="button"
            onClick={() => setFtTab('channel')}
            style={{
              flex: 1,
              padding: '10px',
              borderRadius: '10px',
              fontSize: '12px',
              fontWeight: 800,
              border: ftTab === 'channel' ? 'none' : '1px solid var(--border-soft)',
              cursor: 'pointer',
              background: ftTab === 'channel' ? 'var(--accent-main)' : 'rgba(0,0,0,0.3)',
              color: ftTab === 'channel' ? '#000' : 'var(--text-muted)'
            }}
          >
            <i className="fa-brands fa-telegram"></i> Telegram Channel
          </button>
          <button
            type="button"
            onClick={() => setFtTab('miniapp')}
            style={{
              flex: 1,
              padding: '10px',
              borderRadius: '10px',
              fontSize: '12px',
              fontWeight: 800,
              border: ftTab === 'miniapp' ? 'none' : '1px solid var(--border-soft)',
              cursor: 'pointer',
              background: ftTab === 'miniapp' ? 'var(--accent-main)' : 'rgba(0,0,0,0.3)',
              color: ftTab === 'miniapp' ? '#000' : 'var(--text-muted)'
            }}
          >
            <i className="fa-solid fa-gamepad"></i> Mini App / Bot
          </button>
        </div>

        {ftTab === 'channel' ? (
          <div>
            <label style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 700, display: 'block', marginBottom: '4px' }}>
              CHANNEL/GROUP @USERNAME OR CHAT ID
              <input
                type="text"
                placeholder="@yourchannel or -1001234567890"
                value={ftChat}
                onChange={(e) => setFtChat(e.target.value)}
                style={{
                  width: '100%',
                  marginTop: '4px',
                  background: 'rgba(0,0,0,0.3)',
                  border: '1px solid var(--border-soft)',
                  color: '#fff',
                  padding: '10px',
                  borderRadius: '10px',
                  fontSize: '14px',
                  fontWeight: 700,
                  outline: 'none'
                }}
              />
            </label>
            <label style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 700, display: 'block', marginBottom: '8px' }}>
              REWARD (HOWL)
              <input
                type="number"
                placeholder="150"
                value={ftChatReward}
                onChange={(e) => setFtChatReward(e.target.value)}
                style={{
                  width: '100%',
                  marginTop: '4px',
                  background: 'rgba(0,0,0,0.3)',
                  border: '1px solid var(--border-soft)',
                  color: '#fff',
                  padding: '10px',
                  borderRadius: '10px',
                  fontSize: '14px',
                  fontWeight: 700,
                  outline: 'none'
                }}
              />
            </label>
            <button
              onClick={() => showTopNotification('FEATURED TASK', 'Task added successfully', 'success')}
              style={{
                width: '100%',
                background: 'var(--accent-main)',
                color: '#000',
                border: 'none',
                padding: '12px',
                borderRadius: '10px',
                fontWeight: 800,
                fontSize: '13px',
                cursor: 'pointer'
              }}
            >
              Verify &amp; Add Channel Task
            </button>
          </div>
        ) : (
          <div>
            <label style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 700, display: 'block', marginBottom: '8px' }}>
              TASK TITLE
              <input
                type="text"
                placeholder="e.g. Play Mini App"
                value={ftAppTitle}
                onChange={(e) => setFtAppTitle(e.target.value)}
                style={{
                  width: '100%',
                  marginTop: '4px',
                  background: 'rgba(0,0,0,0.3)',
                  border: '1px solid var(--border-soft)',
                  color: '#fff',
                  padding: '10px',
                  borderRadius: '10px',
                  fontSize: '14px',
                  fontWeight: 700,
                  outline: 'none'
                }}
              />
            </label>
            <label style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 700, display: 'block', marginBottom: '8px' }}>
              REDIRECT LINK
              <input
                type="text"
                placeholder="https://t.me/..."
                value={ftAppLink}
                onChange={(e) => setFtAppLink(e.target.value)}
                style={{
                  width: '100%',
                  marginTop: '4px',
                  background: 'rgba(0,0,0,0.3)',
                  border: '1px solid var(--border-soft)',
                  color: '#fff',
                  padding: '10px',
                  borderRadius: '10px',
                  fontSize: '14px',
                  fontWeight: 700,
                  outline: 'none'
                }}
              />
            </label>
            <button
              onClick={() => showTopNotification('FEATURED TASK', 'Task added successfully', 'success')}
              style={{
                width: '100%',
                background: 'var(--accent-main)',
                color: '#000',
                border: 'none',
                padding: '12px',
                borderRadius: '10px',
                fontWeight: 800,
                fontSize: '13px',
                cursor: 'pointer'
              }}
            >
              Add Mini App Task
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
