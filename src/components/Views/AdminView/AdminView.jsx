import React, { useState, useEffect } from 'react';
import { useApp } from '../../../context/AppContext';
import { adminCall, ADSR_BLOCK_ID } from '../../../services/api';

export default function AdminView() {
  const { setActiveView, triggerHaptic, showTopNotification } = useApp();

  // Active admin tab
  const [activeTab, setActiveTab] = useState('lookup');

  // User Lookup State
  const [lookupId, setLookupId] = useState('');
  const [searching, setSearching] = useState(false);
  const [userResult, setUserResult] = useState(null);

  // Ad Settings State
  const [adConfig, setAdConfig] = useState({
    monetag: { start: '100', step: '5', limit: '10' },
    adsgram: { start: '170', step: '10', limit: '5' }
  });
  const [adSaving, setAdSaving] = useState(false);

  // AdsGram Reward Block (adsr) State
  const [adsrConfig, setAdsrConfig] = useState({
    start: '180',
    step: '10',
    limit: '5',
    cooldown_hours: '1',
    noclick_pct: '25',
    tier1_pct: '33',
    tier2_pct: '75',
    click_window_sec: '300'
  });
  const [adsrSaving, setAdsrSaving] = useState(false);

  // Quick Tasks Admin State
  const [qtConfig, setQtConfig] = useState({
    comment: { enabled: true, reward: 50, cooldown_hours: 1, chat_id: '', group_link: '', texts: [] },
    bio: { enabled: true, reward: 200 }
  });
  const [commentTextsStr, setCommentTextsStr] = useState('');
  const [qtSaving, setQtSaving] = useState(false);

  // Featured Tasks Admin State
  const [ftSubTab, setFtSubTab] = useState('channel');
  const [ftChat, setFtChat] = useState('');
  const [ftChatReward, setFtChatReward] = useState('150');
  const [ftChatMaxUsers, setFtChatMaxUsers] = useState('2000');
  const [ftAppTitle, setFtAppTitle] = useState('');
  const [ftAppLink, setFtAppLink] = useState('');
  const [ftAppIcon, setFtAppIcon] = useState('');
  const [ftAppReward, setFtAppReward] = useState('100');
  const [ftAppMaxUsers, setFtAppMaxUsers] = useState('2000');
  const [ftTasksList, setFtTasksList] = useState([]);
  const [ftLoading, setFtLoading] = useState(false);

  // Boinkers Admin State
  const [boinkersEnabled, setBoinkersEnabled] = useState(true);
  const [boinkersOpenReward, setBoinkersOpenReward] = useState('50');
  const [boinkersSpinsReward, setBoinkersSpinsReward] = useState('100');
  const [boinkersMoonReward, setBoinkersMoonReward] = useState('200');
  const [boinkersStats, setBoinkersStats] = useState({
    inbound: [],
    outbound: [],
    totals: {}
  });

  // Load initial admin configs
  useEffect(() => {
    loadAdConfig();
    loadAdsrConfig();
    loadQtConfig();
    loadFtAdminTasks();
    loadBoinkersAdmin();
  }, []);

  const loadAdConfig = async () => {
    try {
      const res = await adminCall('get_ad_config');
      if (res?.success && res.config) {
        setAdConfig({
          monetag: res.config.monetag || { start: '100', step: '5', limit: '10' },
          adsgram: res.config.adsgram || { start: '170', step: '10', limit: '5' }
        });
      }
    } catch (e) {}
  };

  const saveAdConfig = async () => {
    setAdSaving(true);
    triggerHaptic('medium');
    try {
      const res = await adminCall('set_ad_config', {
        config: {
          monetag: {
            start: Number(adConfig.monetag.start),
            step: Number(adConfig.monetag.step),
            limit: Number(adConfig.monetag.limit)
          },
          adsgram: {
            start: Number(adConfig.adsgram.start),
            step: Number(adConfig.adsgram.step),
            limit: Number(adConfig.adsgram.limit)
          }
        }
      });
      if (res?.success) {
        showTopNotification('SAVED', 'Ad settings updated successfully', 'success');
      } else {
        showTopNotification('ERROR', res?.error || 'Failed to save settings', 'error');
      }
    } catch (e) {
      showTopNotification('ERROR', 'Network error', 'error');
    } finally {
      setAdSaving(false);
    }
  };

  const loadAdsrConfig = async () => {
    try {
      const res = await adminCall('get_ad_config');
      if (res?.success && res.config?.adsreward) {
        const c = res.config.adsreward;
        setAdsrConfig({
          start: String(c.start != null ? c.start : 180),
          step: String(c.step != null ? c.step : 10),
          limit: String(c.limit != null ? c.limit : 5),
          cooldown_hours: String((c.cooldown_min != null ? c.cooldown_min : 60) / 60),
          noclick_pct: String(c.noclick_pct != null ? c.noclick_pct : 25),
          tier1_pct: String(c.tier1_pct != null ? c.tier1_pct : 33),
          tier2_pct: String(c.tier2_pct != null ? c.tier2_pct : 75),
          click_window_sec: String(c.click_window_sec != null ? c.click_window_sec : 300)
        });
      }
    } catch (e) {}
  };

  const saveAdsrConfig = async () => {
    setAdsrSaving(true);
    triggerHaptic('medium');
    try {
      const res = await adminCall('set_ad_config', {
        config: {
          adsreward: {
            start: Number(adsrConfig.start),
            step: Number(adsrConfig.step),
            limit: Number(adsrConfig.limit),
            cooldown_min: Math.round(Number(adsrConfig.cooldown_hours) * 60),
            noclick_pct: Number(adsrConfig.noclick_pct),
            tier1_pct: Number(adsrConfig.tier1_pct),
            tier2_pct: Number(adsrConfig.tier2_pct),
            click_window_sec: Number(adsrConfig.click_window_sec)
          }
        }
      });
      if (res?.success) {
        showTopNotification('SAVED', 'Reward block settings saved', 'success');
      } else {
        showTopNotification('ERROR', res?.error || 'Could not save reward settings', 'error');
      }
    } catch (e) {
      showTopNotification('ERROR', 'Network error', 'error');
    } finally {
      setAdsrSaving(false);
    }
  };

  const loadQtConfig = async () => {
    try {
      const res = await adminCall('get_quick_tasks');
      if (res?.success && res.config) {
        const c = res.config.comment || {};
        const b = res.config.bio || {};
        setQtConfig({
          comment: {
            enabled: !!c.enabled,
            reward: c.reward || 50,
            cooldown_hours: (c.cooldown_min || 60) / 60,
            chat_id: c.chat_id || '',
            group_link: c.group_link || '',
            texts: c.texts || []
          },
          bio: {
            enabled: !!b.enabled,
            reward: b.reward || 200
          }
        });
        if (Array.isArray(c.texts)) {
          setCommentTextsStr(c.texts.join('\n'));
        }
      }
    } catch (e) {}
  };

  const saveQtConfig = async () => {
    setQtSaving(true);
    triggerHaptic('medium');
    try {
      const texts = commentTextsStr
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
      const updated = {
        comment: {
          enabled: qtConfig.comment.enabled,
          reward: Number(qtConfig.comment.reward),
          cooldown_hours: Number(qtConfig.comment.cooldown_hours),
          chat_id: qtConfig.comment.chat_id.trim(),
          group_link: qtConfig.comment.group_link.trim(),
          texts
        },
        bio: {
          enabled: qtConfig.bio.enabled,
          reward: Number(qtConfig.bio.reward)
        }
      };
      const res = await adminCall('set_quick_tasks', { config: updated });
      if (res?.success) {
        showTopNotification('SAVED', 'Quick tasks settings saved', 'success');
      } else {
        showTopNotification('ERROR', res?.error || 'Could not save quick task settings', 'error');
      }
    } catch (e) {
      showTopNotification('ERROR', 'Network error', 'error');
    } finally {
      setQtSaving(false);
    }
  };

  const loadFtAdminTasks = async () => {
    setFtLoading(true);
    try {
      const res = await adminCall('get_featured_tasks');
      if (res?.success && Array.isArray(res.tasks)) {
        setFtTasksList(res.tasks);
      }
    } catch (e) {} finally {
      setFtLoading(false);
    }
  };

  const handleAddChannelTask = async () => {
    if (!ftChat.trim()) return;
    triggerHaptic('medium');
    try {
      const res = await adminCall('add_featured_task', {
        taskData: {
          type: 'channel',
          chat_identifier: ftChat.trim(),
          reward: Number(ftChatReward) || 150,
          max_users: Number(ftChatMaxUsers) || 2000
        }
      });
      if (res?.success) {
        showTopNotification('ADDED', 'Channel task added successfully', 'success');
        setFtChat('');
        loadFtAdminTasks();
      } else {
        showTopNotification('ERROR', res?.error || 'Failed to add channel task', 'error');
      }
    } catch (e) {
      showTopNotification('ERROR', 'Request failed', 'error');
    }
  };

  const handleAddMiniAppTask = async () => {
    if (!ftAppTitle.trim() || !ftAppLink.trim()) return;
    triggerHaptic('medium');
    try {
      const res = await adminCall('add_featured_task', {
        taskData: {
          type: 'miniapp',
          title: ftAppTitle.trim(),
          link: ftAppLink.trim(),
          icon_url: ftAppIcon.trim() || '',
          reward: Number(ftAppReward) || 100,
          max_users: Number(ftAppMaxUsers) || 2000
        }
      });
      if (res?.success) {
        showTopNotification('ADDED', 'Mini app task added successfully', 'success');
        setFtAppTitle('');
        setFtAppLink('');
        setFtAppIcon('');
        loadFtAdminTasks();
      } else {
        showTopNotification('ERROR', res?.error || 'Failed to add mini app task', 'error');
      }
    } catch (e) {
      showTopNotification('ERROR', 'Request failed', 'error');
    }
  };

  const handleToggleFt = async (taskId) => {
    triggerHaptic('light');
    try {
      const res = await adminCall('toggle_featured_task', { taskId });
      if (res?.success) loadFtAdminTasks();
    } catch (e) {}
  };

  const handleDeleteFt = async (taskId) => {
    if (!confirm('Are you sure you want to delete this featured task?')) return;
    triggerHaptic('medium');
    try {
      const res = await adminCall('delete_featured_task', { taskId });
      if (res?.success) {
        showTopNotification('DELETED', 'Task deleted', 'gold');
        loadFtAdminTasks();
      }
    } catch (e) {}
  };

  const handleAddSlots = async (taskId, currentMax, currentClaimed) => {
    const promptMsg = `Current Limit: ${Number(currentMax).toLocaleString()} users\nClaimed so far: ${Number(currentClaimed).toLocaleString()} users\n\nEnter ADDITIONAL users/slots to add (e.g. 800):`;
    const val = prompt(promptMsg, '500');
    if (!val) return;
    const extra = parseInt(val.trim(), 10);
    if (isNaN(extra) || extra <= 0) {
      alert('Please enter a valid positive number of slots to add (e.g. 500 or 800).');
      return;
    }
    triggerHaptic('medium');
    try {
      const res = await adminCall('add_slots_featured_task', { taskId, extraSlots: extra });
      if (res?.success) {
        showTopNotification('SLOTS ADDED', res.message || 'Slots added successfully!', 'success');
        loadFtAdminTasks();
      } else {
        showTopNotification('ERROR', res?.error || 'Failed to add slots', 'error');
      }
    } catch (e) {
      showTopNotification('ERROR', 'Network error', 'error');
    }
  };

  const loadBoinkersAdmin = async () => {
    try {
      const res = await adminCall('boinkers_get_config');
      if (res?.success) {
        if (res.config) {
          setBoinkersEnabled(res.config.enabled !== false);
          setBoinkersOpenReward(String(res.config.open_reward || 50));
          setBoinkersSpinsReward(String(res.config.spin_reward || res.config.spins_reward || 100));
          setBoinkersMoonReward(String(res.config.moon_reward || 200));
        }
        if (res.stats) {
          setBoinkersStats(res.stats);
        }
      }
    } catch (e) {}
  };

  const saveBoinkersAdmin = async () => {
    triggerHaptic('medium');
    try {
      const res = await adminCall('boinkers_set_config', {
        boinkers_config: {
          enabled: boinkersEnabled,
          open_reward: Number(boinkersOpenReward) || 50,
          spin_reward: Number(boinkersSpinsReward) || 100,
          moon_reward: Number(boinkersMoonReward) || 200
        }
      });
      if (res?.success) {
        showTopNotification('SAVED', 'Boinkers campaign settings updated', 'success');
        loadBoinkersAdmin();
      } else {
        showTopNotification('ERROR', res?.error || 'Failed to save campaign', 'error');
      }
    } catch (e) {
      showTopNotification('ERROR', 'Network error', 'error');
    }
  };

  const handleLookup = async () => {
    if (!lookupId.trim()) return;
    setSearching(true);
    triggerHaptic('light');
    try {
      const res = await adminCall('lookup', { targetUserId: lookupId.trim() });
      if (res && res.success) {
        if (!res.found) {
          showTopNotification('NOT FOUND', `No account registered with ID ${lookupId.trim()}`, 'error');
          setUserResult(null);
        } else {
          setUserResult(res);
        }
      } else {
        showTopNotification('ERROR', res?.error || 'Failed to lookup user', 'error');
        setUserResult(null);
      }
    } catch (e) {
      showTopNotification('ERROR', 'Lookup request failed', 'error');
    } finally {
      setSearching(false);
    }
  };

  const handleUserAction = async (action) => {
    if (!userResult || !userResult.user) return;
    const targetUserId = userResult.user.user_id;
    const verb = action === 'ban' ? 'BAN' : 'UNBAN';
    if (!confirm(`Are you sure you want to ${verb} user ${targetUserId}?`)) return;

    triggerHaptic('medium');
    try {
      const res = await adminCall(action, { targetUserId });
      if (res && res.success) {
        showTopNotification('SUCCESS', res.message || 'Action executed successfully', 'success');
        handleLookup();
      } else {
        showTopNotification('FAILED', res?.error || 'Could not execute action', 'error');
      }
    } catch (e) {
      showTopNotification('ERROR', 'Request failed', 'error');
    }
  };

  // Helper stats formatters
  const inOpened = (boinkersStats.inbound || []).find((s) => s.endpoint === 'app-opened');
  const inAds = (boinkersStats.inbound || []).find((s) => s.endpoint === 'ads-watched');
  const inWith = (boinkersStats.inbound || []).find((s) => s.endpoint === 'withdrawal');
  const bTotals = boinkersStats.totals || {};

  return (
    <div id="admin-view" className="view active">
      {/* Admin Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
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
              Moderation &amp; Configuration
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

      {/* Admin Section Tabs */}
      <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', marginBottom: '16px', paddingBottom: '4px' }}>
        {[
          { id: 'lookup', label: 'User Lookup', icon: 'fa-solid fa-magnifying-glass' },
          { id: 'ads', label: 'Ad Rewards', icon: 'fa-solid fa-sliders' },
          { id: 'adsr', label: 'AdsGram Block', icon: 'fa-solid fa-gift' },
          { id: 'featured', label: 'Featured Tasks', icon: 'fa-solid fa-star' },
          { id: 'boinkers', label: 'Boinkers', icon: 'fa-solid fa-handshake' },
          { id: 'quick', label: 'Quick Tasks', icon: 'fa-solid fa-bolt' }
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => {
              triggerHaptic('light');
              setActiveTab(tab.id);
            }}
            style={{
              padding: '8px 14px',
              borderRadius: '10px',
              fontSize: '11px',
              fontWeight: 800,
              border: activeTab === tab.id ? '1px solid var(--accent-main)' : '1px solid var(--border-soft)',
              background: activeTab === tab.id ? 'var(--accent-dim)' : 'rgba(0,0,0,0.3)',
              color: activeTab === tab.id ? 'var(--accent-main)' : 'var(--text-muted)',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <i className={tab.icon}></i> {tab.label}
          </button>
        ))}
      </div>

      {/* TAB 1: User Lookup */}
      {activeTab === 'lookup' && (
        <div className="glass-card">
          <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '10px' }}>
            Lookup User by Telegram ID
          </label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              placeholder="e.g. 6563880391"
              value={lookupId}
              onChange={(e) => setLookupId(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleLookup();
              }}
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

          {userResult && userResult.user && (
            <div style={{ marginTop: '16px', borderTop: '1px solid var(--border-soft)', paddingTop: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <div>
                  <h4 style={{ margin: 0, fontSize: '16px', color: '#fff' }}>
                    {userResult.user.name || 'No Name'}
                  </h4>
                  <p style={{ margin: '2px 0 0', fontSize: '11px', color: 'var(--text-muted)' }}>
                    Telegram ID: <code>{userResult.user.user_id}</code>
                  </p>
                </div>
                <span
                  style={{
                    fontSize: '10px',
                    fontWeight: 800,
                    padding: '4px 10px',
                    borderRadius: '50px',
                    background: userResult.is_manually_banned || userResult.status?.includes('banned') ? 'rgba(239,68,68,0.2)' : 'rgba(34,197,94,0.2)',
                    color: userResult.is_manually_banned || userResult.status?.includes('banned') ? 'var(--accent-red)' : '#22c55e',
                    border: `1px solid ${userResult.is_manually_banned || userResult.status?.includes('banned') ? 'rgba(239,68,68,0.4)' : 'rgba(34,197,94,0.4)'}`
                  }}
                >
                  {userResult.status || (userResult.is_manually_banned ? 'BANNED' : 'ACTIVE')}
                </span>
              </div>

              {/* Balances */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '14px', fontSize: '12px' }}>
                <div style={{ background: 'rgba(0,0,0,0.3)', padding: '10px', borderRadius: '10px' }}>
                  <div style={{ color: 'var(--text-muted)', fontSize: '10px', fontWeight: 700 }}>HOWL BALANCE</div>
                  <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--accent-orange)', marginTop: '2px' }}>
                    {Number(userResult.user.total_howl || 0).toLocaleString()} HOWL
                  </div>
                </div>
                <div style={{ background: 'rgba(0,0,0,0.3)', padding: '10px', borderRadius: '10px' }}>
                  <div style={{ color: 'var(--text-muted)', fontSize: '10px', fontWeight: 700 }}>USD BALANCE</div>
                  <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--accent-main)', marginTop: '2px' }}>
                    ${Number(userResult.user.total_usd || 0).toFixed(4)}
                  </div>
                </div>
              </div>

              {/* Referral info */}
              {userResult.referrals && (
                <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-soft)', borderRadius: '10px', padding: '12px', marginBottom: '12px', fontSize: '12px' }}>
                  <div style={{ fontWeight: 800, color: 'var(--accent-main)', marginBottom: '6px', fontSize: '11px', textTransform: 'uppercase' }}>
                    <i className="fa-solid fa-users"></i> Referrals
                  </div>
                  <div>Total Referrals: <b>{userResult.referrals.total || 0}</b> (Active: <b>{userResult.referrals.active || 0}</b>)</div>
                  <div>Referred by: <code>{userResult.referrals.referrer?.user_id || userResult.user.referred_by || 'None'}</code></div>
                  <div>Referral HOWL: <b>{Number(userResult.referrals.howl_earned || 0).toLocaleString()} HOWL</b></div>
                  <div>Referral USDT: <b>${Number(userResult.referrals.usdt_earned || 0).toFixed(4)}</b></div>
                </div>
              )}

              {/* Activity info */}
              {userResult.activity && (
                <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-soft)', borderRadius: '10px', padding: '12px', marginBottom: '12px', fontSize: '12px' }}>
                  <div style={{ fontWeight: 800, color: 'var(--accent-orange)', marginBottom: '6px', fontSize: '11px', textTransform: 'uppercase' }}>
                    <i className="fa-solid fa-chart-line"></i> Activity &amp; Device
                  </div>
                  <div>Ads Today: <b>{userResult.activity.ads_today} / {userResult.activity.ads_daily_limit || 10}</b></div>
                  <div>Total Ads Watched: <b>{userResult.activity.ads_total || 0}</b></div>
                  <div>Device ID: <span style={{ fontFamily: 'monospace' }}>{userResult.user.fingerprint ? String(userResult.user.fingerprint).slice(0, 18) : 'None'}</span></div>
                  <div>Joined: {userResult.user.created_at ? new Date(userResult.user.created_at).toLocaleDateString() : 'N/A'}</div>
                </div>
              )}

              {/* Collisions */}
              {userResult.device_collisions && userResult.device_collisions.length > 0 && (
                <div style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: '10px', padding: '10px', marginBottom: '14px', fontSize: '12px' }}>
                  <div style={{ fontWeight: 800, color: 'var(--accent-orange)', marginBottom: '4px' }}>
                    Colliding Accounts (Same Device):
                  </div>
                  {userResult.device_collisions.map((c, idx) => (
                    <div key={idx}>• ID: <code>{c.user_id}</code> ({c.name || 'No name'})</div>
                  ))}
                </div>
              )}

              {/* Action buttons */}
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => handleUserAction('ban')}
                  style={{
                    flex: 1,
                    background: 'rgba(239,68,68,0.15)',
                    border: '1px solid rgba(239,68,68,0.4)',
                    color: 'var(--accent-red)',
                    padding: '12px',
                    borderRadius: '10px',
                    fontWeight: 800,
                    fontSize: '13px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px'
                  }}
                >
                  <i className="fa-solid fa-ban"></i> Ban User
                </button>
                <button
                  onClick={() => handleUserAction('unban')}
                  style={{
                    flex: 1,
                    background: 'rgba(94, 179, 255, 0.15)',
                    border: '1px solid rgba(94, 179, 255, 0.4)',
                    color: 'var(--accent-main)',
                    padding: '12px',
                    borderRadius: '10px',
                    fontWeight: 800,
                    fontSize: '13px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px'
                  }}
                >
                  <i className="fa-solid fa-unlock"></i> Unban User
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: Ad Settings */}
      {activeTab === 'ads' && (
        <div className="glass-card">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '15px', margin: '0 0 4px 0' }}>
            <i className="fa-solid fa-sliders" style={{ color: 'var(--accent-main)' }}></i> Ad Rewards
          </h3>
          <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '0 0 14px 0', lineHeight: 1.5 }}>
            Reward per ad = Start − Step × Watched. Daily limit 0 turns ad off.
          </p>

          <div style={{ fontSize: '12px', fontWeight: 800, color: '#fff', marginBottom: '8px' }}>Monetag</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '14px' }}>
            <label style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 700 }}>
              START
              <input
                type="number"
                value={adConfig.monetag?.start || 100}
                onChange={(e) => setAdConfig({ ...adConfig, monetag: { ...adConfig.monetag, start: e.target.value } })}
                style={{ width: '100%', marginTop: '4px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-soft)', color: '#fff', padding: '10px', borderRadius: '10px', fontSize: '14px', fontWeight: 700, outline: 'none' }}
              />
            </label>
            <label style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 700 }}>
              REDUCE BY
              <input
                type="number"
                value={adConfig.monetag?.step || 5}
                onChange={(e) => setAdConfig({ ...adConfig, monetag: { ...adConfig.monetag, step: e.target.value } })}
                style={{ width: '100%', marginTop: '4px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-soft)', color: '#fff', padding: '10px', borderRadius: '10px', fontSize: '14px', fontWeight: 700, outline: 'none' }}
              />
            </label>
            <label style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 700 }}>
              DAILY LIMIT
              <input
                type="number"
                value={adConfig.monetag?.limit || 10}
                onChange={(e) => setAdConfig({ ...adConfig, monetag: { ...adConfig.monetag, limit: e.target.value } })}
                style={{ width: '100%', marginTop: '4px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-soft)', color: '#fff', padding: '10px', borderRadius: '10px', fontSize: '14px', fontWeight: 700, outline: 'none' }}
              />
            </label>
          </div>

          <div style={{ fontSize: '12px', fontWeight: 800, color: '#fff', marginBottom: '8px' }}>AdsGram Tasks</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '14px' }}>
            <label style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 700 }}>
              START
              <input
                type="number"
                value={adConfig.adsgram?.start || 170}
                onChange={(e) => setAdConfig({ ...adConfig, adsgram: { ...adConfig.adsgram, start: e.target.value } })}
                style={{ width: '100%', marginTop: '4px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-soft)', color: '#fff', padding: '10px', borderRadius: '10px', fontSize: '14px', fontWeight: 700, outline: 'none' }}
              />
            </label>
            <label style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 700 }}>
              REDUCE BY
              <input
                type="number"
                value={adConfig.adsgram?.step || 10}
                onChange={(e) => setAdConfig({ ...adConfig, adsgram: { ...adConfig.adsgram, step: e.target.value } })}
                style={{ width: '100%', marginTop: '4px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-soft)', color: '#fff', padding: '10px', borderRadius: '10px', fontSize: '14px', fontWeight: 700, outline: 'none' }}
              />
            </label>
            <label style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 700 }}>
              DAILY LIMIT
              <input
                type="number"
                value={adConfig.adsgram?.limit || 5}
                onChange={(e) => setAdConfig({ ...adConfig, adsgram: { ...adConfig.adsgram, limit: e.target.value } })}
                style={{ width: '100%', marginTop: '4px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-soft)', color: '#fff', padding: '10px', borderRadius: '10px', fontSize: '14px', fontWeight: 700, outline: 'none' }}
              />
            </label>
          </div>

          <button
            onClick={saveAdConfig}
            disabled={adSaving}
            style={{ width: '100%', background: 'var(--accent-main)', color: '#000', border: 'none', padding: '14px', borderRadius: '12px', fontWeight: 800, fontSize: '14px', cursor: 'pointer' }}
          >
            {adSaving ? 'Saving...' : 'Save Ad Settings'}
          </button>
        </div>
      )}

      {/* TAB 3: AdsGram Reward Block */}
      {activeTab === 'adsr' && (
        <div className="glass-card">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '15px', margin: '0 0 4px 0' }}>
            <i className="fa-solid fa-gift" style={{ color: 'var(--accent-main)' }}></i> AdsGram Reward Block
          </h3>
          <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '0 0 14px 0', lineHeight: 1.5 }}>
            Block ID: {ADSR_BLOCK_ID}. Configure rewards, click tiers, and cooldowns.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '14px' }}>
            <label style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 700 }}>
              START (HOWL)
              <input
                type="number"
                value={adsrConfig.start}
                onChange={(e) => setAdsrConfig({ ...adsrConfig, start: e.target.value })}
                style={{ width: '100%', marginTop: '4px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-soft)', color: '#fff', padding: '10px', borderRadius: '10px', fontSize: '14px', fontWeight: 700, outline: 'none' }}
              />
            </label>
            <label style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 700 }}>
              REDUCE BY
              <input
                type="number"
                value={adsrConfig.step}
                onChange={(e) => setAdsrConfig({ ...adsrConfig, step: e.target.value })}
                style={{ width: '100%', marginTop: '4px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-soft)', color: '#fff', padding: '10px', borderRadius: '10px', fontSize: '14px', fontWeight: 700, outline: 'none' }}
              />
            </label>
            <label style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 700 }}>
              ADS PER CYCLE
              <input
                type="number"
                value={adsrConfig.limit}
                onChange={(e) => setAdsrConfig({ ...adsrConfig, limit: e.target.value })}
                style={{ width: '100%', marginTop: '4px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-soft)', color: '#fff', padding: '10px', borderRadius: '10px', fontSize: '14px', fontWeight: 700, outline: 'none' }}
              />
            </label>
            <label style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 700 }}>
              COOLDOWN (HOURS)
              <input
                type="number"
                step="0.25"
                value={adsrConfig.cooldown_hours}
                onChange={(e) => setAdsrConfig({ ...adsrConfig, cooldown_hours: e.target.value })}
                style={{ width: '100%', marginTop: '4px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-soft)', color: '#fff', padding: '10px', borderRadius: '10px', fontSize: '14px', fontWeight: 700, outline: 'none' }}
              />
            </label>
            <label style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 700 }}>
              NO CLICK PAYS (%)
              <input
                type="number"
                value={adsrConfig.noclick_pct}
                onChange={(e) => setAdsrConfig({ ...adsrConfig, noclick_pct: e.target.value })}
                style={{ width: '100%', marginTop: '4px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-soft)', color: '#fff', padding: '10px', borderRadius: '10px', fontSize: '14px', fontWeight: 700, outline: 'none' }}
              />
            </label>
            <label style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 700 }}>
              1-CLICK TIER (%)
              <input
                type="number"
                value={adsrConfig.tier1_pct}
                onChange={(e) => setAdsrConfig({ ...adsrConfig, tier1_pct: e.target.value })}
                style={{ width: '100%', marginTop: '4px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-soft)', color: '#fff', padding: '10px', borderRadius: '10px', fontSize: '14px', fontWeight: 700, outline: 'none' }}
              />
            </label>
            <label style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 700 }}>
              2-CLICKS TIER (%)
              <input
                type="number"
                value={adsrConfig.tier2_pct}
                onChange={(e) => setAdsrConfig({ ...adsrConfig, tier2_pct: e.target.value })}
                style={{ width: '100%', marginTop: '4px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-soft)', color: '#fff', padding: '10px', borderRadius: '10px', fontSize: '14px', fontWeight: 700, outline: 'none' }}
              />
            </label>
            <label style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 700 }}>
              CLICK WINDOW (SEC)
              <input
                type="number"
                value={adsrConfig.click_window_sec}
                onChange={(e) => setAdsrConfig({ ...adsrConfig, click_window_sec: e.target.value })}
                style={{ width: '100%', marginTop: '4px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-soft)', color: '#fff', padding: '10px', borderRadius: '10px', fontSize: '14px', fontWeight: 700, outline: 'none' }}
              />
            </label>
          </div>

          <button
            onClick={saveAdsrConfig}
            disabled={adsrSaving}
            style={{ width: '100%', background: 'var(--accent-main)', color: '#000', border: 'none', padding: '14px', borderRadius: '12px', fontWeight: 800, fontSize: '14px', cursor: 'pointer' }}
          >
            {adsrSaving ? 'Saving...' : 'Save Reward Block Settings'}
          </button>
        </div>
      )}

      {/* TAB 4: Featured Tasks Management */}
      {activeTab === 'featured' && (
        <div className="glass-card">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '15px', margin: '0 0 4px 0' }}>
            <i className="fa-solid fa-star" style={{ color: 'var(--accent-main)' }}></i> Featured Tasks Management
          </h3>
          <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '0 0 14px 0', lineHeight: 1.5 }}>
            Add Channel/Group tasks or Mini App visits.
          </p>

          <div style={{ display: 'flex', gap: '8px', margin: '12px 0' }}>
            <button
              onClick={() => setFtSubTab('channel')}
              style={{
                flex: 1,
                padding: '10px',
                borderRadius: '10px',
                fontSize: '12px',
                fontWeight: 800,
                border: ftSubTab === 'channel' ? 'none' : '1px solid var(--border-soft)',
                background: ftSubTab === 'channel' ? 'var(--accent-main)' : 'rgba(0,0,0,0.3)',
                color: ftSubTab === 'channel' ? '#000' : 'var(--text-muted)',
                cursor: 'pointer'
              }}
            >
              <i className="fa-brands fa-telegram"></i> Telegram Channel
            </button>
            <button
              onClick={() => setFtSubTab('miniapp')}
              style={{
                flex: 1,
                padding: '10px',
                borderRadius: '10px',
                fontSize: '12px',
                fontWeight: 800,
                border: ftSubTab === 'miniapp' ? 'none' : '1px solid var(--border-soft)',
                background: ftSubTab === 'miniapp' ? 'var(--accent-main)' : 'rgba(0,0,0,0.3)',
                color: ftSubTab === 'miniapp' ? '#000' : 'var(--text-muted)',
                cursor: 'pointer'
              }}
            >
              <i className="fa-solid fa-gamepad"></i> Mini App / Bot
            </button>
          </div>

          {ftSubTab === 'channel' ? (
            <div>
              <label style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 700, display: 'block', marginBottom: '4px' }}>
                CHANNEL/GROUP @USERNAME OR CHAT ID
                <input
                  type="text"
                  placeholder="@yourchannel or -100..."
                  value={ftChat}
                  onChange={(e) => setFtChat(e.target.value)}
                  style={{ width: '100%', marginTop: '4px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-soft)', color: '#fff', padding: '10px', borderRadius: '10px', fontSize: '14px', fontWeight: 700, outline: 'none' }}
                />
              </label>
              <label style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 700, display: 'block', margin: '8px 0' }}>
                REWARD (HOWL)
                <input
                  type="number"
                  value={ftChatReward}
                  onChange={(e) => setFtChatReward(e.target.value)}
                  style={{ width: '100%', marginTop: '4px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-soft)', color: '#fff', padding: '10px', borderRadius: '10px', fontSize: '14px', fontWeight: 700, outline: 'none' }}
                />
              </label>
              <label style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 700, display: 'block', marginBottom: '12px' }}>
                TARGET USERS (MAX COMPLETIONS)
                <input
                  type="number"
                  value={ftChatMaxUsers}
                  onChange={(e) => setFtChatMaxUsers(e.target.value)}
                  style={{ width: '100%', marginTop: '4px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-soft)', color: '#fff', padding: '10px', borderRadius: '10px', fontSize: '14px', fontWeight: 700, outline: 'none' }}
                />
              </label>
              <button
                onClick={handleAddChannelTask}
                style={{ width: '100%', background: 'var(--accent-main)', color: '#000', border: 'none', padding: '12px', borderRadius: '10px', fontWeight: 800, fontSize: '13px', cursor: 'pointer' }}
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
                  style={{ width: '100%', marginTop: '4px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-soft)', color: '#fff', padding: '10px', borderRadius: '10px', fontSize: '14px', fontWeight: 700, outline: 'none' }}
                />
              </label>
              <label style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 700, display: 'block', marginBottom: '8px' }}>
                REDIRECT LINK
                <input
                  type="text"
                  placeholder="https://t.me/..."
                  value={ftAppLink}
                  onChange={(e) => setFtAppLink(e.target.value)}
                  style={{ width: '100%', marginTop: '4px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-soft)', color: '#fff', padding: '10px', borderRadius: '10px', fontSize: '14px', fontWeight: 700, outline: 'none' }}
                />
              </label>
              <label style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 700, display: 'block', marginBottom: '8px' }}>
                ICON PHOTO URL (OPTIONAL)
                <input
                  type="text"
                  placeholder="https://..."
                  value={ftAppIcon}
                  onChange={(e) => setFtAppIcon(e.target.value)}
                  style={{ width: '100%', marginTop: '4px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-soft)', color: '#fff', padding: '10px', borderRadius: '10px', fontSize: '14px', fontWeight: 700, outline: 'none' }}
                />
              </label>
              <label style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 700, display: 'block', marginBottom: '8px' }}>
                REWARD (HOWL)
                <input
                  type="number"
                  value={ftAppReward}
                  onChange={(e) => setFtAppReward(e.target.value)}
                  style={{ width: '100%', marginTop: '4px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-soft)', color: '#fff', padding: '10px', borderRadius: '10px', fontSize: '14px', fontWeight: 700, outline: 'none' }}
                />
              </label>
              <label style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 700, display: 'block', marginBottom: '12px' }}>
                TARGET USERS (MAX COMPLETIONS)
                <input
                  type="number"
                  value={ftAppMaxUsers}
                  onChange={(e) => setFtAppMaxUsers(e.target.value)}
                  style={{ width: '100%', marginTop: '4px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-soft)', color: '#fff', padding: '10px', borderRadius: '10px', fontSize: '14px', fontWeight: 700, outline: 'none' }}
                />
              </label>
              <button
                onClick={handleAddMiniAppTask}
                style={{ width: '100%', background: 'var(--accent-main)', color: '#000', border: 'none', padding: '12px', borderRadius: '10px', fontWeight: 800, fontSize: '13px', cursor: 'pointer' }}
              >
                Add Mini App Task
              </button>
            </div>
          )}

          {/* Configured tasks list */}
          <div style={{ marginTop: '16px', borderTop: '1px solid var(--border-soft)', paddingTop: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--accent-main)' }}>
                CONFIGURED TASKS ({ftTasksList.length})
              </span>
              <button
                onClick={loadFtAdminTasks}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '11px', cursor: 'pointer', fontWeight: 700 }}
              >
                <i className="fa-solid fa-arrows-rotate"></i> Refresh
              </button>
            </div>

            {ftLoading ? (
              <div style={{ textAlign: 'center', padding: '14px', color: 'var(--text-muted)', fontSize: '12px' }}>
                Loading tasks...
              </div>
            ) : ftTasksList.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '14px', color: 'var(--text-muted)', fontSize: '12px' }}>
                No featured tasks created yet.
              </div>
            ) : (
              ftTasksList.map((t) => {
                const max = Number(t.max_users) || 0;
                const claimed = Number(t.claimed_count) || 0;
                const pct = max > 0 ? Math.min(100, Math.round((claimed / max) * 100)) : 100;
                const isCh = t.type === 'channel';

                return (
                  <div
                    key={t.id}
                    style={{
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid var(--border-soft)',
                      borderRadius: '10px',
                      padding: '12px',
                      marginBottom: '8px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span
                          style={{
                            fontSize: '10px',
                            fontWeight: 800,
                            padding: '2px 8px',
                            borderRadius: '6px',
                            background: isCh ? 'rgba(94,179,255,0.15)' : 'rgba(245,158,11,0.15)',
                            color: isCh ? 'var(--accent-main)' : '#f59e0b'
                          }}
                        >
                          {isCh ? 'CHANNEL' : 'MINI APP'}
                        </span>
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 800,
                            color: t.enabled ? '#22c55e' : 'var(--text-muted)'
                          }}
                        >
                          {t.enabled ? 'ACTIVE' : 'INACTIVE'}
                        </span>
                      </div>
                      <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--accent-main)' }}>
                        +{Number(t.reward).toLocaleString()} HOWL
                      </div>
                    </div>

                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#fff', wordBreak: 'break-word' }}>
                      {t.title}
                    </div>

                    {/* Progress bar */}
                    <div style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid var(--border-soft)', borderRadius: '8px', padding: '8px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', marginBottom: '4px' }}>
                        <span style={{ color: 'var(--text-muted)', fontWeight: 700 }}>
                          Target: <b style={{ color: '#fff' }}>{max ? max.toLocaleString() : 'Unlimited'}</b>
                        </span>
                        <span style={{ color: 'var(--accent-main)', fontWeight: 800 }}>
                          {claimed.toLocaleString()} claimed ({pct}%)
                        </span>
                      </div>
                      <div style={{ width: '100%', height: '5px', background: 'rgba(255,255,255,0.1)', borderRadius: '3px', overflow: 'hidden' }}>
                        <div style={{ width: `${pct}%`, height: '100%', background: 'var(--accent-main)', transition: 'width 0.3s' }}></div>
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '4px', flexWrap: 'wrap' }}>
                      <button
                        onClick={() => handleAddSlots(t.id, max, claimed)}
                        style={{
                          background: 'rgba(94,179,255,0.15)',
                          color: 'var(--accent-main)',
                          border: '1px solid rgba(94,179,255,0.3)',
                          borderRadius: '8px',
                          padding: '6px 12px',
                          fontSize: '11px',
                          fontWeight: 700,
                          cursor: 'pointer'
                        }}
                      >
                        <i className="fa-solid fa-user-plus"></i> + Add Slots
                      </button>
                      <button
                        onClick={() => handleToggleFt(t.id)}
                        style={{
                          background: t.enabled ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.06)',
                          color: t.enabled ? '#22c55e' : 'var(--text-muted)',
                          border: '1px solid var(--border-soft)',
                          borderRadius: '8px',
                          padding: '6px 12px',
                          fontSize: '11px',
                          fontWeight: 700,
                          cursor: 'pointer'
                        }}
                      >
                        {t.enabled ? 'Pause' : 'Activate'}
                      </button>
                      <button
                        onClick={() => handleDeleteFt(t.id)}
                        style={{
                          background: 'rgba(239,68,68,0.15)',
                          color: 'var(--accent-red)',
                          border: '1px solid rgba(239,68,68,0.3)',
                          borderRadius: '8px',
                          padding: '6px 12px',
                          fontSize: '11px',
                          fontWeight: 700,
                          cursor: 'pointer'
                        }}
                      >
                        <i className="fa-solid fa-trash"></i> Delete
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* TAB 5: Boinkers Collaboration */}
      {activeTab === 'boinkers' && (
        <div className="glass-card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '15px', margin: 0 }}>
              <i className="fa-solid fa-handshake" style={{ color: 'var(--accent-main)' }}></i> Boinkers Campaign
            </h3>
            <span
              style={{
                fontSize: '10px',
                fontWeight: 800,
                padding: '4px 10px',
                borderRadius: '20px',
                background: boinkersEnabled ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
                color: boinkersEnabled ? '#22c55e' : 'var(--accent-red)'
              }}
            >
              {boinkersEnabled ? 'ACTIVE' : 'INACTIVE'}
            </span>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#fff', fontWeight: 700, marginBottom: '14px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={boinkersEnabled}
              onChange={(e) => setBoinkersEnabled(e.target.checked)}
            />{' '}
            Enable Boinkers Campaign
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px', marginBottom: '14px' }}>
            <label style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 700 }}>
              OPEN REWARD
              <input
                type="number"
                value={boinkersOpenReward}
                onChange={(e) => setBoinkersOpenReward(e.target.value)}
                style={{ width: '100%', marginTop: '4px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-soft)', color: '#fff', padding: '8px', borderRadius: '8px', fontSize: '13px', fontWeight: 700, outline: 'none' }}
              />
            </label>
            <label style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 700 }}>
              SPINS REWARD
              <input
                type="number"
                value={boinkersSpinsReward}
                onChange={(e) => setBoinkersSpinsReward(e.target.value)}
                style={{ width: '100%', marginTop: '4px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-soft)', color: '#fff', padding: '8px', borderRadius: '8px', fontSize: '13px', fontWeight: 700, outline: 'none' }}
              />
            </label>
            <label style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 700 }}>
              MOON REWARD
              <input
                type="number"
                value={boinkersMoonReward}
                onChange={(e) => setBoinkersMoonReward(e.target.value)}
                style={{ width: '100%', marginTop: '4px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-soft)', color: '#fff', padding: '8px', borderRadius: '8px', fontSize: '13px', fontWeight: 700, outline: 'none' }}
              />
            </label>
          </div>

          <button
            onClick={saveBoinkersAdmin}
            style={{ width: '100%', background: 'var(--accent-main)', color: '#000', border: 'none', padding: '12px', borderRadius: '10px', fontWeight: 800, fontSize: '13px', cursor: 'pointer', marginBottom: '16px' }}
          >
            Save Campaign Settings
          </button>

          {/* Live Conversion Stats */}
          <div style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid var(--border-soft)', borderRadius: '12px', padding: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontSize: '11px', fontWeight: 800, color: '#fff' }}>Live Conversion Stats</span>
              <button
                onClick={loadBoinkersAdmin}
                style={{ background: 'none', border: 'none', color: 'var(--accent-main)', fontSize: '11px', cursor: 'pointer' }}
              >
                <i className="fa-solid fa-rotate"></i> Refresh
              </button>
            </div>

            {/* Inbound stats */}
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 800, marginBottom: '6px' }}>
              INBOUND (BOINKERS → HOWL)
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px', marginBottom: '10px' }}>
              <div style={{ background: 'rgba(255,255,255,0.04)', padding: '8px', borderRadius: '8px', textAlign: 'center' }}>
                <div style={{ color: 'var(--text-muted)', fontSize: '9px' }}>App Opened</div>
                <div style={{ fontWeight: 800, color: '#fff', marginTop: '2px' }}>
                  {inOpened ? `${inOpened.success_calls} / ${inOpened.total_calls}` : '0 / 0'}
                </div>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.04)', padding: '8px', borderRadius: '8px', textAlign: 'center' }}>
                <div style={{ color: 'var(--text-muted)', fontSize: '9px' }}>10+ Ads</div>
                <div style={{ fontWeight: 800, color: '#fff', marginTop: '2px' }}>
                  {inAds ? `${inAds.success_calls} / ${inAds.total_calls}` : '0 / 0'}
                </div>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.04)', padding: '8px', borderRadius: '8px', textAlign: 'center' }}>
                <div style={{ color: 'var(--text-muted)', fontSize: '9px' }}>Withdrawals</div>
                <div style={{ fontWeight: 800, color: '#fff', marginTop: '2px' }}>
                  {inWith ? `${inWith.success_calls} / ${inWith.total_calls}` : '0 / 0'}
                </div>
              </div>
            </div>

            {/* Outbound stats */}
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 800, marginBottom: '6px' }}>
              OUTBOUND (HOWL → BOINKERS)
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px' }}>
              <div style={{ background: 'rgba(255,255,255,0.04)', padding: '8px', borderRadius: '8px', textAlign: 'center' }}>
                <div style={{ color: 'var(--text-muted)', fontSize: '9px' }}>Open Claims</div>
                <div style={{ fontWeight: 800, color: '#fff', marginTop: '2px' }}>
                  {bTotals.open_verified || 0} ({(bTotals.open_howl || 0).toLocaleString()} HOWL)
                </div>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.04)', padding: '8px', borderRadius: '8px', textAlign: 'center' }}>
                <div style={{ color: 'var(--text-muted)', fontSize: '9px' }}>10 Spins Claims</div>
                <div style={{ fontWeight: 800, color: '#fff', marginTop: '2px' }}>
                  {bTotals.spins_verified || 0} ({(bTotals.spins_howl || 0).toLocaleString()} HOWL)
                </div>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.04)', padding: '8px', borderRadius: '8px', textAlign: 'center' }}>
                <div style={{ color: 'var(--text-muted)', fontSize: '9px' }}>Spend Stars</div>
                <div style={{ fontWeight: 800, color: '#fff', marginTop: '2px' }}>
                  {bTotals.moon_verified || 0} ({(bTotals.moon_howl || 0).toLocaleString()} HOWL)
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 6: Quick Tasks */}
      {activeTab === 'quick' && (
        <div className="glass-card">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '15px', margin: '0 0 4px 0' }}>
            <i className="fa-solid fa-bolt" style={{ color: 'var(--accent-main)' }}></i> Quick Tasks Settings
          </h3>

          <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--accent-main)', margin: '14px 0 8px 0' }}>
            COMMUNITY COMMENT TASK
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#fff', fontWeight: 700, margin: '8px 0', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={qtConfig.comment?.enabled}
              onChange={(e) => setQtConfig({ ...qtConfig, comment: { ...qtConfig.comment, enabled: e.target.checked } })}
            />{' '}
            Enabled
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
            <label style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 700 }}>
              REWARD (HOWL)
              <input
                type="number"
                value={qtConfig.comment?.reward || 50}
                onChange={(e) => setQtConfig({ ...qtConfig, comment: { ...qtConfig.comment, reward: e.target.value } })}
                style={{ width: '100%', marginTop: '4px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-soft)', color: '#fff', padding: '10px', borderRadius: '10px', fontSize: '14px', fontWeight: 700, outline: 'none' }}
              />
            </label>
            <label style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 700 }}>
              COOLDOWN (HOURS)
              <input
                type="number"
                step="0.25"
                value={qtConfig.comment?.cooldown_hours || 1}
                onChange={(e) => setQtConfig({ ...qtConfig, comment: { ...qtConfig.comment, cooldown_hours: e.target.value } })}
                style={{ width: '100%', marginTop: '4px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-soft)', color: '#fff', padding: '10px', borderRadius: '10px', fontSize: '14px', fontWeight: 700, outline: 'none' }}
              />
            </label>
          </div>

          <label style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 700, display: 'block', marginBottom: '8px' }}>
            COMMUNITY CHAT ID
            <input
              type="text"
              placeholder="-100..."
              value={qtConfig.comment?.chat_id || ''}
              onChange={(e) => setQtConfig({ ...qtConfig, comment: { ...qtConfig.comment, chat_id: e.target.value } })}
              style={{ width: '100%', marginTop: '4px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-soft)', color: '#fff', padding: '10px', borderRadius: '10px', fontSize: '14px', fontWeight: 700, outline: 'none' }}
            />
          </label>

          <label style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 700, display: 'block', marginBottom: '8px' }}>
            GROUP LINK
            <input
              type="text"
              placeholder="https://t.me/..."
              value={qtConfig.comment?.group_link || ''}
              onChange={(e) => setQtConfig({ ...qtConfig, comment: { ...qtConfig.comment, group_link: e.target.value } })}
              style={{ width: '100%', marginTop: '4px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-soft)', color: '#fff', padding: '10px', borderRadius: '10px', fontSize: '14px', fontWeight: 700, outline: 'none' }}
            />
          </label>

          <label style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 700, display: 'block', marginBottom: '14px' }}>
            TEXTS USERS MUST POST (ONE PER LINE)
            <textarea
              rows="4"
              value={commentTextsStr}
              onChange={(e) => setCommentTextsStr(e.target.value)}
              style={{ width: '100%', marginTop: '4px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-soft)', color: '#fff', padding: '10px', borderRadius: '10px', fontSize: '13px', outline: 'none', resize: 'vertical' }}
            ></textarea>
          </label>

          <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--accent-main)', margin: '14px 0 8px 0' }}>
            BIO LINK TASK (ONE TIME)
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#fff', fontWeight: 700, margin: '8px 0', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={qtConfig.bio?.enabled}
              onChange={(e) => setQtConfig({ ...qtConfig, bio: { ...qtConfig.bio, enabled: e.target.checked } })}
            />{' '}
            Enabled
          </label>

          <label style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 700, display: 'block', marginBottom: '16px' }}>
            REWARD (HOWL)
            <input
              type="number"
              value={qtConfig.bio?.reward || 200}
              onChange={(e) => setQtConfig({ ...qtConfig, bio: { ...qtConfig.bio, reward: e.target.value } })}
              style={{ width: '100%', marginTop: '4px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-soft)', color: '#fff', padding: '10px', borderRadius: '10px', fontSize: '14px', fontWeight: 700, outline: 'none' }}
            />
          </label>

          <button
            onClick={saveQtConfig}
            disabled={qtSaving}
            style={{ width: '100%', background: 'var(--accent-main)', color: '#000', border: 'none', padding: '12px', borderRadius: '10px', fontWeight: 800, fontSize: '13px', cursor: 'pointer' }}
          >
            {qtSaving ? 'Saving...' : 'Save Quick Tasks Settings'}
          </button>
        </div>
      )}
    </div>
  );
}
