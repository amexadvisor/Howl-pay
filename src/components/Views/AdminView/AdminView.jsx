import React, { useState, useEffect } from 'react';
import { useApp } from '../../../context/AppContext';
import { adminCall, ADSR_BLOCK_ID } from '../../../services/api';

export default function AdminView({ isActive = false }) {
  const { setActiveView, triggerHaptic, showTopNotification } = useApp();

  // Active admin tab
  const [activeTab, setActiveTab] = useState('lookup');

  // User Lookup State
  const [lookupId, setLookupId] = useState('');
  const [searching, setSearching] = useState(false);
  const [userResult, setUserResult] = useState(null);

  // Ad Settings State
  const [adConfig, setAdConfig] = useState({
    monetag: { start: '100', step: '5', limit: '10', cooldown_sec: '15' },
    adsgram: { start: '170', step: '10', limit: '5' }
  });
  const [adSaving, setAdSaving] = useState(false);

  // AdsGram Reward Block (adsr) State
  const [adsrConfig, setAdsrConfig] = useState({
    start: '180',
    step: '10',
    limit: '5',
    cooldown_hours: '1',
    cooldown_sec: '15',
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

  // Promo Codes Admin State
  const [promoList, setPromoList] = useState([]);
  const [promoLoading, setPromoLoading] = useState(false);
  const [promoSpotMode, setPromoSpotMode] = useState('unlimited');
  const [promoExpiryMode, setPromoExpiryMode] = useState('none');
  const [promoExpiryDate, setPromoExpiryDate] = useState('');
  const [editingPromoSpot, setEditingPromoSpot] = useState(null);
  const [newPromo, setNewPromo] = useState({
    code: '',
    title: '',
    description: '',
    reward_howl: '100',
    reward_click_howl: '50',
    image_url: '/assets/boinkers.jpg',
    max_claims: '0'
  });
  const [promoSaving, setPromoSaving] = useState(false);

  const setQuickExpiry = (days) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    const pad = (n) => String(n).padStart(2, '0');
    const str = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    setPromoExpiryDate(str);
    setPromoExpiryMode('custom');
  };

  // Load initial admin configs
  useEffect(() => {
    loadAdConfig();
    loadAdsrConfig();
    loadQtConfig();
    loadFtAdminTasks();
    loadBoinkersAdmin();
    loadPromoCodes();
  }, []);

  const loadAdConfig = async () => {
    try {
      const res = await adminCall('get_ad_config');
      if (res?.success && res.config) {
        setAdConfig({
          monetag: {
            start: String(res.config.monetag?.start ?? 100),
            step: String(res.config.monetag?.step ?? 5),
            limit: String(res.config.monetag?.limit ?? 10),
            cooldown_sec: String(res.config.monetag?.cooldown_sec ?? 15)
          },
          adsgram: {
            start: String(res.config.adsgram?.start ?? 170),
            step: String(res.config.adsgram?.step ?? 10),
            limit: String(res.config.adsgram?.limit ?? 5)
          }
        });
      }
    } catch (e) {}
  };

  const saveAdConfig = async () => {
    const mStart = Number(adConfig.monetag?.start);
    const mStep = Number(adConfig.monetag?.step);
    const mLimit = Number(adConfig.monetag?.limit);
    const mCool = Number(adConfig.monetag?.cooldown_sec);

    const aStart = Number(adConfig.adsgram?.start);
    const aStep = Number(adConfig.adsgram?.step);
    const aLimit = Number(adConfig.adsgram?.limit);

    if (isNaN(mStart) || mStart < 1) {
      showTopNotification('INVALID', 'Monetag starting reward must be at least 1 HOWL', 'error');
      return;
    }
    if (isNaN(mStep) || mStep < 0) {
      showTopNotification('INVALID', 'Monetag reduction must be 0 or more', 'error');
      return;
    }
    if (isNaN(mLimit) || mLimit < 0) {
      showTopNotification('INVALID', 'Monetag daily limit must be 0 or more (0 disables ad)', 'error');
      return;
    }
    if (isNaN(mCool) || mCool < 1 || mCool > 600) {
      showTopNotification('INVALID', 'Monetag cooldown must be between 1 and 600 seconds', 'error');
      return;
    }

    if (isNaN(aStart) || aStart < 1) {
      showTopNotification('INVALID', 'AdsGram task starting reward must be at least 1 HOWL', 'error');
      return;
    }
    if (isNaN(aStep) || aStep < 0) {
      showTopNotification('INVALID', 'AdsGram task reduction must be 0 or more', 'error');
      return;
    }
    if (isNaN(aLimit) || aLimit < 0) {
      showTopNotification('INVALID', 'AdsGram task daily limit must be 0 or more (0 disables ad)', 'error');
      return;
    }

    setAdSaving(true);
    triggerHaptic('medium');
    try {
      const res = await adminCall('set_ad_config', {
        config: {
          monetag: {
            start: mStart,
            step: mStep,
            limit: mLimit,
            cooldown_sec: mCool
          },
          adsgram: {
            start: aStart,
            step: aStep,
            limit: aLimit
          }
        }
      });
      if (res?.success) {
        showTopNotification('SAVED', 'Ad settings updated successfully', 'success');
        await loadAdConfig();
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
          start: String(c.start ?? 180),
          step: String(c.step ?? 10),
          limit: String(c.limit ?? 5),
          cooldown_hours: String((c.cooldown_min != null ? c.cooldown_min : 60) / 60),
          cooldown_sec: String(c.cooldown_sec ?? 15),
          noclick_pct: String(c.noclick_pct ?? 25),
          tier1_pct: String(c.tier1_pct ?? 33),
          tier2_pct: String(c.tier2_pct ?? 75),
          click_window_sec: String(c.click_window_sec ?? 300)
        });
      }
    } catch (e) {}
  };

  const saveAdsrConfig = async () => {
    const start = Number(adsrConfig.start);
    const step = Number(adsrConfig.step);
    const limit = Number(adsrConfig.limit);
    const hours = Number(adsrConfig.cooldown_hours);
    const cSec = Number(adsrConfig.cooldown_sec);
    const noclick = Number(adsrConfig.noclick_pct);
    const tier1 = Number(adsrConfig.tier1_pct);
    const tier2 = Number(adsrConfig.tier2_pct);
    const winSec = Number(adsrConfig.click_window_sec);

    if (isNaN(start) || start < 1) {
      showTopNotification('INVALID', 'AdsGram block starting reward must be at least 1 HOWL', 'error');
      return;
    }
    if (isNaN(limit) || limit < 0) {
      showTopNotification('INVALID', 'Ads per cycle must be 0 or more (0 disables ad)', 'error');
      return;
    }
    if (isNaN(hours) || hours < 0.1 || hours > 168) {
      showTopNotification('INVALID', 'Cycle lock must be between 0.1 and 168 hours', 'error');
      return;
    }

    setAdsrSaving(true);
    triggerHaptic('medium');
    try {
      const res = await adminCall('set_ad_config', {
        config: {
          adsreward: {
            start,
            step: isNaN(step) ? 0 : step,
            limit,
            cooldown_hours: hours,
            cooldown_min: Math.round(hours * 60),
            cooldown_sec: isNaN(cSec) ? 15 : cSec,
            noclick_pct: isNaN(noclick) ? 25 : noclick,
            tier1_pct: isNaN(tier1) ? 33 : tier1,
            tier2_pct: isNaN(tier2) ? 75 : tier2,
            click_window_sec: isNaN(winSec) ? 300 : winSec
          }
        }
      });
      if (res?.success) {
        showTopNotification('SAVED', 'AdsGram block settings saved', 'success');
        await loadAdsrConfig();
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

  // Promo Code Admin Handlers
  const loadPromoCodes = async () => {
    setPromoLoading(true);
    try {
      const res = await adminCall('get_promo_codes');
      if (res?.success && Array.isArray(res.promo_codes)) {
        setPromoList(res.promo_codes);
      }
    } catch (e) {
      console.error('Failed to load promo codes', e);
    } finally {
      setPromoLoading(false);
    }
  };

  const handleCreatePromoCode = async (e) => {
    if (e) e.preventDefault();
    if (!newPromo.code.trim()) {
      showTopNotification('MISSING CODE', 'Please enter a promo code.', 'error');
      return;
    }
    setPromoSaving(true);
    triggerHaptic('medium');
    try {
      const claimsLimit = promoSpotMode === 'unlimited' ? 0 : Math.max(1, Number(newPromo.max_claims) || 100);
      const expiryVal = promoExpiryMode === 'custom' && promoExpiryDate ? new Date(promoExpiryDate).toISOString() : null;

      const res = await adminCall('create_promo_code', {
        promo: {
          code: newPromo.code.trim().toUpperCase(),
          title: newPromo.title.trim() || 'Giveaway Promo',
          description: newPromo.description.trim() || 'Watch sponsor ad to claim your HOWL coins!',
          reward_howl: Number(newPromo.reward_howl) || 50,
          reward_click_howl: Number(newPromo.reward_click_howl) || 0,
          image_url: newPromo.image_url.trim() || '/assets/boinkers.jpg',
          max_claims: claimsLimit,
          expires_at: expiryVal
        }
      });
      if (res?.success) {
        showTopNotification('PROMO CREATED', `Code ${res.promo?.code || newPromo.code} created!`, 'gold');
        setNewPromo({
          code: '',
          title: '',
          description: '',
          reward_howl: '100',
          reward_click_howl: '50',
          image_url: '/assets/boinkers.jpg',
          max_claims: '0'
        });
        setPromoSpotMode('unlimited');
        setPromoExpiryMode('none');
        setPromoExpiryDate('');
        await loadPromoCodes();
      } else {
        showTopNotification('FAILED', res?.error || 'Could not create promo code', 'error');
      }
    } catch (err) {
      showTopNotification('ERROR', err.message || 'Error creating promo code', 'error');
    } finally {
      setPromoSaving(false);
    }
  };

  const handleUpdatePromoLimits = async (id, patch) => {
    triggerHaptic('medium');
    try {
      const res = await adminCall('update_promo_code', {
        id,
        patch
      });
      if (res?.success) {
        setPromoList((prev) =>
          prev.map((item) => (item.id === id ? { ...item, ...patch } : item))
        );
        setEditingPromoSpot(null);
        showTopNotification('UPDATED', 'Promo code settings updated successfully!', 'gold');
      } else {
        showTopNotification('FAILED', res?.error || 'Could not update settings', 'error');
      }
    } catch (err) {
      showTopNotification('ERROR', 'Failed to update promo settings', 'error');
    }
  };

  const handleTogglePromo = async (id, currentStatus) => {
    triggerHaptic('light');
    try {
      const res = await adminCall('toggle_promo_code', { id, is_active: !currentStatus });
      if (res?.success) {
        setPromoList((prev) =>
          prev.map((item) => (item.id === id ? { ...item, is_active: !currentStatus } : item))
        );
        showTopNotification('UPDATED', 'Promo code status updated', 'gold');
      }
    } catch (err) {
      showTopNotification('ERROR', 'Failed to update promo code', 'error');
    }
  };

  const handleDeletePromo = async (id, code) => {
    if (!window.confirm(`Are you sure you want to delete promo code "${code}"?`)) return;
    triggerHaptic('medium');
    try {
      const res = await adminCall('delete_promo_code', { id });
      if (res?.success) {
        setPromoList((prev) => prev.filter((item) => item.id !== id));
        showTopNotification('DELETED', `Promo code ${code} deleted`, 'gold');
      }
    } catch (err) {
      showTopNotification('ERROR', 'Failed to delete promo code', 'error');
    }
  };

  return (
    <div id="admin-view" className={`view ${isActive ? 'active' : ''}`}>
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
          { id: 'promos', label: 'Promo Codes', icon: 'fa-solid fa-ticket' },
          { id: 'ads', label: 'Monetag & Task Ads', icon: 'fa-solid fa-sliders' },
          { id: 'adsr', label: 'AdsGram Video Block', icon: 'fa-solid fa-gift' },
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
            <i className="fa-solid fa-sliders" style={{ color: 'var(--accent-main)' }}></i> Monetag &amp; Task Ads
          </h3>
          <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '0 0 14px 0', lineHeight: 1.5 }}>
            Reward per ad = Start − Step × Watched. Daily limit 0 turns ad off.
          </p>

          <div style={{ fontSize: '13px', fontWeight: 800, color: '#fff', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ color: 'var(--accent-main)' }}>●</span> Monetag Ads (Ad #1)
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '16px' }}>
            <label style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 700 }}>
              START REWARD (HOWL)
              <input
                type="number"
                value={adConfig.monetag?.start ?? ''}
                onChange={(e) => setAdConfig({ ...adConfig, monetag: { ...adConfig.monetag, start: e.target.value } })}
                style={{ width: '100%', marginTop: '4px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-soft)', color: '#fff', padding: '10px', borderRadius: '10px', fontSize: '14px', fontWeight: 700, outline: 'none' }}
              />
            </label>
            <label style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 700 }}>
              REDUCE BY (HOWL)
              <input
                type="number"
                value={adConfig.monetag?.step ?? ''}
                onChange={(e) => setAdConfig({ ...adConfig, monetag: { ...adConfig.monetag, step: e.target.value } })}
                style={{ width: '100%', marginTop: '4px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-soft)', color: '#fff', padding: '10px', borderRadius: '10px', fontSize: '14px', fontWeight: 700, outline: 'none' }}
              />
            </label>
            <label style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 700 }}>
              DAILY ADS LIMIT (0 = OFF)
              <input
                type="number"
                value={adConfig.monetag?.limit ?? ''}
                onChange={(e) => setAdConfig({ ...adConfig, monetag: { ...adConfig.monetag, limit: e.target.value } })}
                style={{ width: '100%', marginTop: '4px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-soft)', color: '#fff', padding: '10px', borderRadius: '10px', fontSize: '14px', fontWeight: 700, outline: 'none' }}
              />
            </label>
            <label style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 700 }}>
              COOLDOWN (SECONDS)
              <input
                type="number"
                value={adConfig.monetag?.cooldown_sec ?? ''}
                onChange={(e) => setAdConfig({ ...adConfig, monetag: { ...adConfig.monetag, cooldown_sec: e.target.value } })}
                style={{ width: '100%', marginTop: '4px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-soft)', color: '#fff', padding: '10px', borderRadius: '10px', fontSize: '14px', fontWeight: 700, outline: 'none' }}
              />
            </label>
          </div>

          <div style={{ fontSize: '13px', fontWeight: 800, color: '#fff', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ color: 'var(--accent-main)' }}>●</span> AdsGram Task Block Ads (Tasks Widget)
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '16px' }}>
            <label style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 700 }}>
              START REWARD (HOWL)
              <input
                type="number"
                value={adConfig.adsgram?.start ?? ''}
                onChange={(e) => setAdConfig({ ...adConfig, adsgram: { ...adConfig.adsgram, start: e.target.value } })}
                style={{ width: '100%', marginTop: '4px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-soft)', color: '#fff', padding: '10px', borderRadius: '10px', fontSize: '14px', fontWeight: 700, outline: 'none' }}
              />
            </label>
            <label style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 700 }}>
              REDUCE BY (HOWL)
              <input
                type="number"
                value={adConfig.adsgram?.step ?? ''}
                onChange={(e) => setAdConfig({ ...adConfig, adsgram: { ...adConfig.adsgram, step: e.target.value } })}
                style={{ width: '100%', marginTop: '4px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-soft)', color: '#fff', padding: '10px', borderRadius: '10px', fontSize: '14px', fontWeight: 700, outline: 'none' }}
              />
            </label>
            <label style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 700 }}>
              DAILY ADS LIMIT (0 = OFF)
              <input
                type="number"
                value={adConfig.adsgram?.limit ?? ''}
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
            <i className="fa-solid fa-gift" style={{ color: 'var(--accent-main)' }}></i> AdsGram Video Block (Rewarded Ads)
          </h3>
          <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '0 0 14px 0', lineHeight: 1.5 }}>
            Block ID: {ADSR_BLOCK_ID}. Controls the main "ADSGRAM" video card on the home screen.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '14px' }}>
            <label style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 700 }}>
              START REWARD (HOWL)
              <input
                type="number"
                value={adsrConfig.start ?? ''}
                onChange={(e) => setAdsrConfig({ ...adsrConfig, start: e.target.value })}
                style={{ width: '100%', marginTop: '4px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-soft)', color: '#fff', padding: '10px', borderRadius: '10px', fontSize: '14px', fontWeight: 700, outline: 'none' }}
              />
            </label>
            <label style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 700 }}>
              REDUCE BY (HOWL)
              <input
                type="number"
                value={adsrConfig.step ?? ''}
                onChange={(e) => setAdsrConfig({ ...adsrConfig, step: e.target.value })}
                style={{ width: '100%', marginTop: '4px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-soft)', color: '#fff', padding: '10px', borderRadius: '10px', fontSize: '14px', fontWeight: 700, outline: 'none' }}
              />
            </label>
            <label style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 700 }}>
              ADS LIMIT PER CYCLE (0 = OFF)
              <input
                type="number"
                value={adsrConfig.limit ?? ''}
                onChange={(e) => setAdsrConfig({ ...adsrConfig, limit: e.target.value })}
                style={{ width: '100%', marginTop: '4px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-soft)', color: '#fff', padding: '10px', borderRadius: '10px', fontSize: '14px', fontWeight: 700, outline: 'none' }}
              />
            </label>
            <label style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 700 }}>
              CYCLE LOCK / RESET (HOURS)
              <input
                type="number"
                step="0.25"
                value={adsrConfig.cooldown_hours ?? ''}
                onChange={(e) => setAdsrConfig({ ...adsrConfig, cooldown_hours: e.target.value })}
                style={{ width: '100%', marginTop: '4px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-soft)', color: '#fff', padding: '10px', borderRadius: '10px', fontSize: '14px', fontWeight: 700, outline: 'none' }}
              />
            </label>
            <label style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 700 }}>
              AD COOLDOWN (SECONDS)
              <input
                type="number"
                value={adsrConfig.cooldown_sec ?? ''}
                onChange={(e) => setAdsrConfig({ ...adsrConfig, cooldown_sec: e.target.value })}
                style={{ width: '100%', marginTop: '4px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-soft)', color: '#fff', padding: '10px', borderRadius: '10px', fontSize: '14px', fontWeight: 700, outline: 'none' }}
              />
            </label>
            <label style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 700 }}>
              NO CLICK PAYS (%)
              <input
                type="number"
                value={adsrConfig.noclick_pct ?? ''}
                onChange={(e) => setAdsrConfig({ ...adsrConfig, noclick_pct: e.target.value })}
                style={{ width: '100%', marginTop: '4px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-soft)', color: '#fff', padding: '10px', borderRadius: '10px', fontSize: '14px', fontWeight: 700, outline: 'none' }}
              />
            </label>
            <label style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 700 }}>
              1-CLICK TIER (%)
              <input
                type="number"
                value={adsrConfig.tier1_pct ?? ''}
                onChange={(e) => setAdsrConfig({ ...adsrConfig, tier1_pct: e.target.value })}
                style={{ width: '100%', marginTop: '4px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-soft)', color: '#fff', padding: '10px', borderRadius: '10px', fontSize: '14px', fontWeight: 700, outline: 'none' }}
              />
            </label>
            <label style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 700 }}>
              2-CLICKS TIER (%)
              <input
                type="number"
                value={adsrConfig.tier2_pct ?? ''}
                onChange={(e) => setAdsrConfig({ ...adsrConfig, tier2_pct: e.target.value })}
                style={{ width: '100%', marginTop: '4px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-soft)', color: '#fff', padding: '10px', borderRadius: '10px', fontSize: '14px', fontWeight: 700, outline: 'none' }}
              />
            </label>
            <label style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 700 }}>
              CLICK WINDOW (SEC)
              <input
                type="number"
                value={adsrConfig.click_window_sec ?? ''}
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

      {/* TAB: Promo Codes Management */}
      {activeTab === 'promos' && (
        <div>
          {/* Create Promo Code Card */}
          <div className="glass-card" style={{ marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
              <i className="fa-solid fa-gift" style={{ color: 'var(--accent-main)', fontSize: '16px' }}></i>
              <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#fff' }}>
                Create Promo Code Giveaway
              </h3>
            </div>

            <form onSubmit={handleCreatePromoCode}>
              <label style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 800, display: 'block', marginBottom: '8px' }}>
                PROMO CODE (UPPERCASE)
                <input
                  type="text"
                  placeholder="e.g. HOWL500"
                  value={newPromo.code}
                  onChange={(e) => setNewPromo({ ...newPromo, code: e.target.value.toUpperCase() })}
                  required
                  style={{
                    width: '100%',
                    marginTop: '4px',
                    background: 'rgba(0,0,0,0.3)',
                    border: '1px solid var(--border-soft)',
                    color: '#fff',
                    padding: '10px',
                    borderRadius: '10px',
                    fontSize: '14px',
                    fontWeight: 800,
                    letterSpacing: '1px',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </label>

              <label style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 800, display: 'block', marginBottom: '8px' }}>
                TITLE
                <input
                  type="text"
                  placeholder="e.g. Community Special Giveaway"
                  value={newPromo.title}
                  onChange={(e) => setNewPromo({ ...newPromo, title: e.target.value })}
                  style={{
                    width: '100%',
                    marginTop: '4px',
                    background: 'rgba(0,0,0,0.3)',
                    border: '1px solid var(--border-soft)',
                    color: '#fff',
                    padding: '10px',
                    borderRadius: '10px',
                    fontSize: '13px',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </label>

              <label style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 800, display: 'block', marginBottom: '8px' }}>
                DESCRIPTION
                <textarea
                  rows="2"
                  placeholder="e.g. Watch sponsor ad & claim 200 HOWL coins!"
                  value={newPromo.description}
                  onChange={(e) => setNewPromo({ ...newPromo, description: e.target.value })}
                  style={{
                    width: '100%',
                    marginTop: '4px',
                    background: 'rgba(0,0,0,0.3)',
                    border: '1px solid var(--border-soft)',
                    color: '#fff',
                    padding: '10px',
                    borderRadius: '10px',
                    fontSize: '13px',
                    outline: 'none',
                    resize: 'vertical',
                    boxSizing: 'border-box'
                  }}
                />
              </label>

              {/* Reward Inputs with Click Count Dependency */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '8px' }}>
                <label style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 800 }}>
                  BASE VIEW REWARD (HOWL)
                  <input
                    type="number"
                    min="1"
                    value={newPromo.reward_howl}
                    onChange={(e) => setNewPromo({ ...newPromo, reward_howl: e.target.value })}
                    required
                    style={{
                      width: '100%',
                      marginTop: '4px',
                      background: 'rgba(0,0,0,0.3)',
                      border: '1px solid var(--border-soft)',
                      color: '#fff',
                      padding: '10px',
                      borderRadius: '10px',
                      fontSize: '14px',
                      fontWeight: 800,
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                  />
                </label>

                <label style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 800 }}>
                  BONUS PER AD CLICK (HOWL)
                  <input
                    type="number"
                    min="0"
                    value={newPromo.reward_click_howl}
                    onChange={(e) => setNewPromo({ ...newPromo, reward_click_howl: e.target.value })}
                    style={{
                      width: '100%',
                      marginTop: '4px',
                      background: 'rgba(0,0,0,0.3)',
                      border: '1px solid var(--border-soft)',
                      color: '#fff',
                      padding: '10px',
                      borderRadius: '10px',
                      fontSize: '14px',
                      fontWeight: 800,
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                  />
                </label>
              </div>

              {/* Click Scaling Live Preview */}
              <div
                style={{
                  background: 'rgba(255, 255, 255, 0.02)',
                  border: '1px solid var(--border-soft)',
                  borderRadius: '10px',
                  padding: '8px 10px',
                  marginBottom: '12px',
                  fontSize: '11px'
                }}
              >
                <div style={{ color: 'var(--text-muted)', fontWeight: 700, marginBottom: '4px' }}>
                  <i className="fa-solid fa-calculator" style={{ marginRight: '5px' }}></i> Click-Reward Scaling Preview (Max 3 Clicks):
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#fff', fontSize: '10px' }}>
                  <span>0 Clicks: <b>+{Number(newPromo.reward_howl) || 0}</b></span>
                  <span>1 Click: <b>+{(Number(newPromo.reward_howl) || 0) + (Number(newPromo.reward_click_howl) || 0)}</b></span>
                  <span>2 Clicks: <b>+{(Number(newPromo.reward_howl) || 0) + ((Number(newPromo.reward_click_howl) || 0) * 2)}</b></span>
                  <span style={{ color: '#eab308' }}>3+ Clicks: <b>+{(Number(newPromo.reward_howl) || 0) + ((Number(newPromo.reward_click_howl) || 0) * 3)}</b></span>
                </div>
              </div>

              <label style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 800, display: 'block', marginBottom: '8px' }}>
                BANNER IMAGE URL
                <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                  <input
                    type="text"
                    placeholder="https://... or /assets/boinkers.jpg"
                    value={newPromo.image_url}
                    onChange={(e) => setNewPromo({ ...newPromo, image_url: e.target.value })}
                    style={{
                      flex: 1,
                      background: 'rgba(0,0,0,0.3)',
                      border: '1px solid var(--border-soft)',
                      color: '#fff',
                      padding: '10px',
                      borderRadius: '10px',
                      fontSize: '13px',
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setNewPromo({ ...newPromo, image_url: '/assets/boinkers.jpg' })}
                    style={{
                      background: 'rgba(255,255,255,0.08)',
                      border: '1px solid var(--border-soft)',
                      color: '#fff',
                      padding: '0 12px',
                      borderRadius: '10px',
                      fontSize: '11px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    Default
                  </button>
                </div>
              </label>

              {/* Banner Preview */}
              {newPromo.image_url && (
                <div style={{ marginBottom: '10px', borderRadius: '10px', overflow: 'hidden', height: '80px', border: '1px solid var(--border-soft)' }}>
                  <img
                    src={newPromo.image_url}
                    alt="Preview"
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    onError={(e) => { e.currentTarget.src = '/assets/boinkers.jpg'; }}
                  />
                </div>
              )}

              {/* Button to Adjust Spot (Unlimited vs Limited Spots) */}
              <div style={{ marginBottom: '14px' }}>
                <label style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 800, display: 'block', marginBottom: '6px' }}>
                  PARTICIPATION SPOTS
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: promoSpotMode === 'limited' ? '8px' : '0' }}>
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('light');
                      setPromoSpotMode('unlimited');
                      setNewPromo({ ...newPromo, max_claims: '0' });
                    }}
                    style={{
                      padding: '10px',
                      borderRadius: '10px',
                      fontSize: '12px',
                      fontWeight: 800,
                      cursor: 'pointer',
                      border: promoSpotMode === 'unlimited' ? '1px solid var(--accent-main)' : '1px solid var(--border-soft)',
                      background: promoSpotMode === 'unlimited' ? 'var(--accent-dim)' : 'rgba(0,0,0,0.3)',
                      color: promoSpotMode === 'unlimited' ? 'var(--accent-main)' : 'var(--text-muted)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px'
                    }}
                  >
                    <i className="fa-solid fa-bolt"></i> Unlimited Spots
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('light');
                      setPromoSpotMode('limited');
                      if (!newPromo.max_claims || newPromo.max_claims === '0') {
                        setNewPromo({ ...newPromo, max_claims: '500' });
                      }
                    }}
                    style={{
                      padding: '10px',
                      borderRadius: '10px',
                      fontSize: '12px',
                      fontWeight: 800,
                      cursor: 'pointer',
                      border: promoSpotMode === 'limited' ? '1px solid var(--accent-main)' : '1px solid var(--border-soft)',
                      background: promoSpotMode === 'limited' ? 'var(--accent-dim)' : 'rgba(0,0,0,0.3)',
                      color: promoSpotMode === 'limited' ? 'var(--accent-main)' : 'var(--text-muted)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px'
                    }}
                  >
                    <i className="fa-solid fa-users"></i> Limited Spots
                  </button>
                </div>

                {promoSpotMode === 'limited' && (
                  <input
                    type="number"
                    min="1"
                    placeholder="Enter maximum spots limit (e.g. 500)"
                    value={newPromo.max_claims}
                    onChange={(e) => setNewPromo({ ...newPromo, max_claims: e.target.value })}
                    required
                    style={{
                      width: '100%',
                      marginTop: '6px',
                      background: 'rgba(0,0,0,0.3)',
                      border: '1px solid var(--border-soft)',
                      color: '#fff',
                      padding: '10px',
                      borderRadius: '10px',
                      fontSize: '14px',
                      fontWeight: 800,
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                  />
                )}
              </div>

              {/* Expiration Date Section */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 800, display: 'block', marginBottom: '6px' }}>
                  EXPIRATION DATE
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: promoExpiryMode === 'custom' ? '8px' : '0' }}>
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('light');
                      setPromoExpiryMode('none');
                      setPromoExpiryDate('');
                    }}
                    style={{
                      padding: '10px',
                      borderRadius: '10px',
                      fontSize: '12px',
                      fontWeight: 800,
                      cursor: 'pointer',
                      border: promoExpiryMode === 'none' ? '1px solid var(--accent-main)' : '1px solid var(--border-soft)',
                      background: promoExpiryMode === 'none' ? 'var(--accent-dim)' : 'rgba(0,0,0,0.3)',
                      color: promoExpiryMode === 'none' ? 'var(--accent-main)' : 'var(--text-muted)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px'
                    }}
                  >
                    <i className="fa-solid fa-infinity"></i> Never Expires
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('light');
                      setPromoExpiryMode('custom');
                      if (!promoExpiryDate) setQuickExpiry(7);
                    }}
                    style={{
                      padding: '10px',
                      borderRadius: '10px',
                      fontSize: '12px',
                      fontWeight: 800,
                      cursor: 'pointer',
                      border: promoExpiryMode === 'custom' ? '1px solid var(--accent-main)' : '1px solid var(--border-soft)',
                      background: promoExpiryMode === 'custom' ? 'var(--accent-dim)' : 'rgba(0,0,0,0.3)',
                      color: promoExpiryMode === 'custom' ? 'var(--accent-main)' : 'var(--text-muted)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px'
                    }}
                  >
                    <i className="fa-regular fa-clock"></i> Set Expiry Date
                  </button>
                </div>

                {promoExpiryMode === 'custom' && (
                  <div>
                    {/* Quick presets */}
                    <div style={{ display: 'flex', gap: '6px', margin: '8px 0', overflowX: 'auto', paddingBottom: '2px' }}>
                      <button
                        type="button"
                        onClick={() => setQuickExpiry(1)}
                        style={{ padding: '4px 10px', borderRadius: '6px', fontSize: '11px', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border-soft)', color: '#fff', cursor: 'pointer' }}
                      >
                        +24 Hours
                      </button>
                      <button
                        type="button"
                        onClick={() => setQuickExpiry(3)}
                        style={{ padding: '4px 10px', borderRadius: '6px', fontSize: '11px', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border-soft)', color: '#fff', cursor: 'pointer' }}
                      >
                        +3 Days
                      </button>
                      <button
                        type="button"
                        onClick={() => setQuickExpiry(7)}
                        style={{ padding: '4px 10px', borderRadius: '6px', fontSize: '11px', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border-soft)', color: '#fff', cursor: 'pointer' }}
                      >
                        +7 Days
                      </button>
                      <button
                        type="button"
                        onClick={() => setQuickExpiry(30)}
                        style={{ padding: '4px 10px', borderRadius: '6px', fontSize: '11px', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border-soft)', color: '#fff', cursor: 'pointer' }}
                      >
                        +30 Days
                      </button>
                    </div>

                    <input
                      type="datetime-local"
                      value={promoExpiryDate}
                      onChange={(e) => setPromoExpiryDate(e.target.value)}
                      required
                      style={{
                        width: '100%',
                        background: 'rgba(0,0,0,0.3)',
                        border: '1px solid var(--border-soft)',
                        color: '#fff',
                        padding: '10px',
                        borderRadius: '10px',
                        fontSize: '13px',
                        fontWeight: 700,
                        outline: 'none',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={promoSaving}
                style={{
                  width: '100%',
                  background: 'var(--accent-main)',
                  color: '#000',
                  border: 'none',
                  padding: '12px',
                  borderRadius: '10px',
                  fontWeight: 800,
                  fontSize: '13px',
                  cursor: promoSaving ? 'wait' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px'
                }}
              >
                {promoSaving ? (
                  <>
                    <div className="loader-spinner" style={{ width: '16px', height: '16px', borderWidth: '2px' }}></div>
                    Creating...
                  </>
                ) : (
                  <>
                    <i className="fa-solid fa-plus"></i> Create Promo Code
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Existing Promo Codes List */}
          <div className="glass-card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <i className="fa-solid fa-list-check" style={{ color: 'var(--accent-main)' }}></i>
                <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 800, color: '#fff' }}>
                  Existing Promo Codes ({promoList.length})
                </h3>
              </div>
              <button
                onClick={loadPromoCodes}
                disabled={promoLoading}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--accent-main)',
                  fontSize: '12px',
                  cursor: 'pointer',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                <i className={`fa-solid fa-rotate-right ${promoLoading ? 'fa-spin' : ''}`}></i> Refresh
              </button>
            </div>

            {promoList.length === 0 ? (
              <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px', padding: '16px 0' }}>
                {promoLoading ? 'Loading promo codes...' : 'No promo codes created yet.'}
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {promoList.map((promo) => (
                  <div
                    key={promo.id}
                    style={{
                      background: 'rgba(0, 0, 0, 0.35)',
                      border: promo.is_active ? '1px solid rgba(234, 179, 8, 0.35)' : '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: '14px',
                      padding: '12px',
                      opacity: promo.is_active ? 1 : 0.65,
                      transition: 'all 0.2s'
                    }}
                  >
                    <div style={{ display: 'flex', gap: '10px' }}>
                      {/* Image Thumbnail */}
                      <div
                        style={{
                          width: '56px',
                          height: '56px',
                          borderRadius: '10px',
                          overflow: 'hidden',
                          flexShrink: 0,
                          background: 'rgba(255, 255, 255, 0.05)',
                          border: '1px solid var(--border-soft)'
                        }}
                      >
                        <img
                          src={promo.image_url || '/assets/boinkers.jpg'}
                          alt=""
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          onError={(e) => { e.currentTarget.src = '/assets/boinkers.jpg'; }}
                        />
                      </div>

                      {/* Info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                          <span
                            style={{
                              background: 'rgba(234, 179, 8, 0.2)',
                              color: '#eab308',
                              fontWeight: 900,
                              fontSize: '12px',
                              padding: '2px 8px',
                              borderRadius: '6px',
                              letterSpacing: '0.5px'
                            }}
                          >
                            <code>{promo.code}</code>
                          </span>

                          <span
                            style={{
                              fontSize: '10px',
                              fontWeight: 800,
                              padding: '2px 6px',
                              borderRadius: '4px',
                              background: promo.is_active ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                              color: promo.is_active ? '#22c55e' : '#ef4444'
                            }}
                          >
                            {promo.is_active ? 'ACTIVE' : 'INACTIVE'}
                          </span>
                        </div>

                        <div style={{ fontSize: '13px', fontWeight: 800, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {promo.title || 'Giveaway'}
                        </div>
                        {promo.description && (
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '2px 0 6px 0', lineHeight: '1.3' }}>
                            {promo.description}
                          </div>
                        )}

                        {/* Badges Row: Spots & Expiration Status */}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '4px', marginBottom: '6px' }}>
                          <span
                            style={{
                              fontSize: '10px',
                              fontWeight: 800,
                              padding: '2px 7px',
                              borderRadius: '6px',
                              background: Number(promo.max_claims) === 0 ? 'rgba(56, 189, 248, 0.15)' : 'rgba(234, 179, 8, 0.15)',
                              color: Number(promo.max_claims) === 0 ? '#38bdf8' : '#eab308'
                            }}
                          >
                            {Number(promo.max_claims) === 0 ? (
                              <><i className="fa-solid fa-bolt" style={{ marginRight: '4px' }}></i> Unlimited Spots ({promo.claimed_count || 0} claimed)</>
                            ) : (
                              <><i className="fa-solid fa-users" style={{ marginRight: '4px' }}></i> Limit: {promo.claimed_count || 0} / {promo.max_claims} spots ({Math.max(0, promo.max_claims - (promo.claimed_count || 0))} left)</>
                            )}
                          </span>

                          {/* Expiry Badge */}
                          {promo.expires_at ? (
                            <span
                              style={{
                                fontSize: '10px',
                                fontWeight: 800,
                                padding: '2px 7px',
                                borderRadius: '6px',
                                background: new Date(promo.expires_at).getTime() < Date.now() ? 'rgba(239, 68, 68, 0.18)' : 'rgba(234, 179, 8, 0.15)',
                                color: new Date(promo.expires_at).getTime() < Date.now() ? '#ef4444' : '#eab308'
                              }}
                            >
                              {new Date(promo.expires_at).getTime() < Date.now() ? (
                                <><i className="fa-solid fa-clock-rotate-left" style={{ marginRight: '4px' }}></i> Expired ({new Date(promo.expires_at).toLocaleDateString()})</>
                              ) : (
                                <><i className="fa-regular fa-clock" style={{ marginRight: '4px' }}></i> Expires {new Date(promo.expires_at).toLocaleDateString()} {new Date(promo.expires_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</>
                              )}
                            </span>
                          ) : (
                            <span
                              style={{
                                fontSize: '10px',
                                fontWeight: 800,
                                padding: '2px 7px',
                                borderRadius: '6px',
                                background: 'rgba(255, 255, 255, 0.06)',
                                color: 'var(--text-muted)'
                              }}
                            >
                              <i className="fa-solid fa-infinity" style={{ marginRight: '4px' }}></i> Never Expires
                            </span>
                          )}
                        </div>

                        {/* Stats Row */}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', fontSize: '11px', marginTop: '4px' }}>
                          <span style={{ color: '#eab308', fontWeight: 700 }}>
                            Base: +{promo.reward_howl} HOWL
                          </span>
                          {Number(promo.reward_click_howl) > 0 && (
                            <span style={{ color: '#38bdf8', fontWeight: 700 }}>
                              Click Bonus: +{promo.reward_click_howl}/click (Max +{Number(promo.reward_click_howl) * 3})
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Inline Spots & Expiry Adjuster Form */}
                    {editingPromoSpot?.id === promo.id && (
                      <div
                        style={{
                          marginTop: '10px',
                          padding: '12px',
                          background: 'rgba(0,0,0,0.45)',
                          borderRadius: '12px',
                          border: '1px solid rgba(56, 189, 248, 0.35)',
                          animation: 'fadeIn 0.2s ease'
                        }}
                      >
                        <div style={{ fontSize: '12px', fontWeight: 800, color: '#38bdf8', marginBottom: '10px' }}>
                          <i className="fa-solid fa-sliders" style={{ marginRight: '6px' }}></i>
                          Adjust Spots &amp; Expiry for <code>{promo.code}</code>:
                        </div>

                        {/* Spots adjustment */}
                        <div style={{ marginBottom: '10px' }}>
                          <label style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 700, display: 'block', marginBottom: '4px' }}>
                            Participation Spots:
                          </label>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '6px' }}>
                            <button
                              type="button"
                              onClick={() => setEditingPromoSpot({ ...editingPromoSpot, spotMode: 'unlimited' })}
                              style={{
                                padding: '7px',
                                borderRadius: '8px',
                                fontSize: '11px',
                                fontWeight: 800,
                                cursor: 'pointer',
                                border: editingPromoSpot.spotMode === 'unlimited' ? '1px solid #38bdf8' : '1px solid var(--border-soft)',
                                background: editingPromoSpot.spotMode === 'unlimited' ? 'rgba(56, 189, 248, 0.2)' : 'rgba(0,0,0,0.2)',
                                color: editingPromoSpot.spotMode === 'unlimited' ? '#38bdf8' : 'var(--text-muted)'
                              }}
                            >
                              <i className="fa-solid fa-bolt"></i> Unlimited
                            </button>

                            <button
                              type="button"
                              onClick={() => setEditingPromoSpot({ ...editingPromoSpot, spotMode: 'limited' })}
                              style={{
                                padding: '7px',
                                borderRadius: '8px',
                                fontSize: '11px',
                                fontWeight: 800,
                                cursor: 'pointer',
                                border: editingPromoSpot.spotMode === 'limited' ? '1px solid #38bdf8' : '1px solid var(--border-soft)',
                                background: editingPromoSpot.spotMode === 'limited' ? 'rgba(56, 189, 248, 0.2)' : 'rgba(0,0,0,0.2)',
                                color: editingPromoSpot.spotMode === 'limited' ? '#38bdf8' : 'var(--text-muted)'
                              }}
                            >
                              <i className="fa-solid fa-users"></i> Limited Spots
                            </button>
                          </div>

                          {editingPromoSpot.spotMode === 'limited' && (
                            <input
                              type="number"
                              min="1"
                              placeholder="Spots limit"
                              value={editingPromoSpot.spots}
                              onChange={(e) => setEditingPromoSpot({ ...editingPromoSpot, spots: e.target.value })}
                              style={{
                                width: '100%',
                                background: 'rgba(0,0,0,0.3)',
                                border: '1px solid var(--border-soft)',
                                color: '#fff',
                                padding: '8px',
                                borderRadius: '8px',
                                fontSize: '13px',
                                fontWeight: 700,
                                outline: 'none',
                                boxSizing: 'border-box'
                              }}
                            />
                          )}
                        </div>

                        {/* Expiry adjustment */}
                        <div style={{ marginBottom: '12px' }}>
                          <label style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 700, display: 'block', marginBottom: '4px' }}>
                            Expiration Date:
                          </label>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '6px' }}>
                            <button
                              type="button"
                              onClick={() => setEditingPromoSpot({ ...editingPromoSpot, expiryMode: 'none', expiryDate: '' })}
                              style={{
                                padding: '7px',
                                borderRadius: '8px',
                                fontSize: '11px',
                                fontWeight: 800,
                                cursor: 'pointer',
                                border: editingPromoSpot.expiryMode === 'none' ? '1px solid #38bdf8' : '1px solid var(--border-soft)',
                                background: editingPromoSpot.expiryMode === 'none' ? 'rgba(56, 189, 248, 0.2)' : 'rgba(0,0,0,0.2)',
                                color: editingPromoSpot.expiryMode === 'none' ? '#38bdf8' : 'var(--text-muted)'
                              }}
                            >
                              <i className="fa-solid fa-infinity"></i> Never Expires
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                const d = new Date();
                                d.setDate(d.getDate() + 7);
                                const pad = (n) => String(n).padStart(2, '0');
                                const str = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
                                setEditingPromoSpot({ ...editingPromoSpot, expiryMode: 'custom', expiryDate: str });
                              }}
                              style={{
                                padding: '7px',
                                borderRadius: '8px',
                                fontSize: '11px',
                                fontWeight: 800,
                                cursor: 'pointer',
                                border: editingPromoSpot.expiryMode === 'custom' ? '1px solid #38bdf8' : '1px solid var(--border-soft)',
                                background: editingPromoSpot.expiryMode === 'custom' ? 'rgba(56, 189, 248, 0.2)' : 'rgba(0,0,0,0.2)',
                                color: editingPromoSpot.expiryMode === 'custom' ? '#38bdf8' : 'var(--text-muted)'
                              }}
                            >
                              <i className="fa-regular fa-clock"></i> Set Expiry
                            </button>
                          </div>

                          {editingPromoSpot.expiryMode === 'custom' && (
                            <input
                              type="datetime-local"
                              value={editingPromoSpot.expiryDate}
                              onChange={(e) => setEditingPromoSpot({ ...editingPromoSpot, expiryDate: e.target.value })}
                              style={{
                                width: '100%',
                                background: 'rgba(0,0,0,0.3)',
                                border: '1px solid var(--border-soft)',
                                color: '#fff',
                                padding: '8px',
                                borderRadius: '8px',
                                fontSize: '12px',
                                fontWeight: 700,
                                outline: 'none',
                                boxSizing: 'border-box'
                              }}
                            />
                          )}
                        </div>

                        {/* Adjuster Action Buttons */}
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                          <button
                            type="button"
                            onClick={() => setEditingPromoSpot(null)}
                            style={{
                              background: 'rgba(255,255,255,0.08)',
                              border: 'none',
                              color: '#fff',
                              padding: '6px 12px',
                              borderRadius: '8px',
                              fontSize: '11px',
                              fontWeight: 700,
                              cursor: 'pointer'
                            }}
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const newMaxClaims = editingPromoSpot.spotMode === 'unlimited' ? 0 : Number(editingPromoSpot.spots) || 100;
                              const newExpiry = editingPromoSpot.expiryMode === 'custom' && editingPromoSpot.expiryDate
                                ? new Date(editingPromoSpot.expiryDate).toISOString()
                                : null;
                              handleUpdatePromoLimits(promo.id, {
                                max_claims: newMaxClaims,
                                expires_at: newExpiry
                              });
                            }}
                            style={{
                              background: 'var(--accent-main)',
                              border: 'none',
                              color: '#000',
                              padding: '6px 14px',
                              borderRadius: '8px',
                              fontSize: '11px',
                              fontWeight: 800,
                              cursor: 'pointer'
                            }}
                          >
                            Save Changes
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Actions row */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '10px', paddingTop: '8px', borderTop: '1px solid rgba(255, 255, 255, 0.06)' }}>
                      {/* Button to Adjust Spots & Expiry */}
                      <button
                        onClick={() => {
                          triggerHaptic('light');
                          if (editingPromoSpot?.id === promo.id) {
                            setEditingPromoSpot(null);
                          } else {
                            const pad = (n) => String(n).padStart(2, '0');
                            let dtLocal = '';
                            if (promo.expires_at) {
                              const d = new Date(promo.expires_at);
                              dtLocal = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
                            }
                            setEditingPromoSpot({
                              id: promo.id,
                              spotMode: Number(promo.max_claims) > 0 ? 'limited' : 'unlimited',
                              spots: Number(promo.max_claims) > 0 ? promo.max_claims : 500,
                              expiryMode: promo.expires_at ? 'custom' : 'none',
                              expiryDate: dtLocal
                            });
                          }
                        }}
                        style={{
                          background: 'rgba(56, 189, 248, 0.15)',
                          border: 'none',
                          color: '#38bdf8',
                          padding: '6px 12px',
                          borderRadius: '8px',
                          fontSize: '11px',
                          fontWeight: 800,
                          cursor: 'pointer'
                        }}
                      >
                        <i className="fa-solid fa-sliders" style={{ marginRight: '4px' }}></i> Adjust
                      </button>

                      <button
                        onClick={() => handleTogglePromo(promo.id, promo.is_active)}
                        style={{
                          background: promo.is_active ? 'rgba(234, 179, 8, 0.15)' : 'rgba(34, 197, 94, 0.15)',
                          border: 'none',
                          color: promo.is_active ? '#eab308' : '#22c55e',
                          padding: '6px 12px',
                          borderRadius: '8px',
                          fontSize: '11px',
                          fontWeight: 800,
                          cursor: 'pointer'
                        }}
                      >
                        {promo.is_active ? 'Deactivate' : 'Activate'}
                      </button>

                      <button
                        onClick={() => handleDeletePromo(promo.id, promo.code)}
                        style={{
                          background: 'rgba(239, 68, 68, 0.12)',
                          border: 'none',
                          color: '#ef4444',
                          padding: '6px 12px',
                          borderRadius: '8px',
                          fontSize: '11px',
                          fontWeight: 800,
                          cursor: 'pointer'
                        }}
                      >
                        <i className="fa-solid fa-trash-can" style={{ marginRight: '4px' }}></i> Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
