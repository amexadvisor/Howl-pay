import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { verifyUser, fetchBalanceOnly, logError } from '../services/api';

const AppContext = createContext(null);

export function AppProvider({ children }) {
  // Telegram User & Auth State
  const [user, setUser] = useState(() => {
    try {
      const u = window.Telegram?.WebApp?.initDataUnsafe?.user;
      if (u) {
        return {
          id: String(u.id),
          username: u.username || 'unknown',
          first_name: u.first_name || 'User',
          photo_url: u.photo_url || null,
          is_admin: false,
          banned: false
        };
      }
    } catch (e) {}
    return {
      id: 'guest_user',
      username: 'guest',
      first_name: 'Guest',
      photo_url: null,
      is_admin: false,
      banned: false
    };
  });

  // Balance State
  const [balance, setBalance] = useState({ howl: 0, usd: 0, hold: 0 });
  const balanceAnimRef = useRef(null);

  // Active View Navigation
  const [activeView, setActiveView] = useState('home-view');
  const [leaderboardSource, setLeaderboardSource] = useState('home-view');

  // Channel Gate Status
  const [isGateVerified, setIsGateVerified] = useState(() => {
    try {
      return localStorage.getItem('howl_channels_verified') === '1';
    } catch (e) {
      return false;
    }
  });

  // Ban Status
  const [isBanned, setIsBanned] = useState(false);
  const [banReason, setBanReason] = useState('');

  // Admin Access
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminChoiceModal, setAdminChoiceModal] = useState(false);

  // Modals & Overlays
  const [splashOpen, setSplashOpen] = useState(true);
  const [tosOpen, setTosOpen] = useState(false);
  const [adsrPreModalOpen, setAdsrPreModalOpen] = useState(false);
  const [adsrCompletedModal, setAdsrCompletedModal] = useState({
    open: false,
    adsCount: 3,
    clicksCount: 0,
    rewardHowl: 45
  });
  const [ftModal, setFtModal] = useState({
    open: false,
    task: null,
    errorMsg: ''
  });

  // Top Notification Popup Banner
  const [notification, setNotification] = useState({
    show: false,
    title: '',
    message: '',
    type: 'gold'
  });

  // Haptic Feedback Helper
  const triggerHaptic = useCallback((style = 'light') => {
    try {
      if (window.Telegram?.WebApp?.HapticFeedback) {
        if (style === 'success' || style === 'warning' || style === 'error') {
          window.Telegram.WebApp.HapticFeedback.notificationOccurred(style);
        } else {
          window.Telegram.WebApp.HapticFeedback.impactOccurred(style);
        }
      }
    } catch (e) {}
  }, []);

  // Top Notification Trigger
  const showTopNotification = useCallback((title, message, type = 'gold') => {
    triggerHaptic(type === 'error' ? 'error' : 'light');
    setNotification({
      show: true,
      title: title || 'NOTIFICATION',
      message: message || '',
      type
    });
  }, [triggerHaptic]);

  const dismissTopNotification = useCallback(() => {
    setNotification((prev) => ({ ...prev, show: false }));
  }, []);

  // Audio Trigger
  const playHowlAudio = useCallback(() => {
    try {
      const audio = new Audio('/assets/howl.mp3');
      audio.volume = 0.6;
      audio.play().catch(() => {});
    } catch (e) {}
  }, []);

  // Animate balance changes smoothly
  const applyBalance = useCallback((newHowl, newUsd, newHold = null) => {
    const targetHowl = Math.round(Number(newHowl) || 0);
    const targetUsd = Number(newUsd) || 0;

    setBalance((prev) => {
      return {
        howl: targetHowl,
        usd: targetUsd,
        hold: newHold !== null ? Math.round(Number(newHold) || 0) : prev.hold
      };
    });
  }, []);

  // Polling / refreshing live balance
  const refreshBalance = useCallback(async () => {
    if (!user || !user.id || user.id === 'guest_user') return;
    try {
      const res = await fetchBalanceOnly(user.id);
      if (res && res.success && res.balance) {
        applyBalance(res.balance.total_howl, res.balance.total_usd, res.balance.hold);
      }
    } catch (e) {}
  }, [user, applyBalance]);

  // Initial user verification and Telegram setup
  const syncUser = useCallback(async () => {
    try {
      if (window.Telegram && window.Telegram.WebApp) {
        window.Telegram.WebApp.ready();
        window.Telegram.WebApp.expand();
      }

      // Read device identity from device-vault if available
      let did = null;
      try {
        if (window.HowlVault && window.HowlVault.get) {
          did = await window.HowlVault.get('did');
        }
      } catch (e) {}

      const res = await verifyUser({ did });
      if (res && res.success && res.user) {
        const u = res.user;
        setUser((prev) => ({
          ...prev,
          id: String(u.id || prev.id),
          username: u.username || prev.username,
          first_name: u.first_name || prev.first_name,
          photo_url: u.photo_url || prev.photo_url,
          is_admin: !!u.is_admin,
          banned: !!u.banned
        }));

        if (u.banned) {
          setIsBanned(true);
          setBanReason(u.ban_reason || 'Access suspended due to multi-account policy.');
        }

        if (u.is_admin) {
          setIsAdmin(true);
          setAdminChoiceModal(true);
        }

        if (res.balance) {
          applyBalance(res.balance.total_howl, res.balance.total_usd, res.balance.hold);
        }
      }
    } catch (err) {
      console.error('Failed to sync user profile:', err);
    }
  }, [applyBalance]);

  useEffect(() => {
    syncUser();
  }, [syncUser]);

  // Periodic balance polling every 5 seconds (just like balance-client.js)
  useEffect(() => {
    const interval = setInterval(() => {
      refreshBalance();
    }, 5000);
    return () => clearInterval(interval);
  }, [refreshBalance]);

  // Handle Telegram Back Button when navigating sub-views
  useEffect(() => {
    try {
      const tg = window.Telegram?.WebApp;
      if (!tg || !tg.BackButton) return;

      if (activeView !== 'home-view') {
        tg.BackButton.show();
        const onBack = () => {
          if (activeView === 'leaderboard-view') {
            setActiveView(leaderboardSource || 'home-view');
          } else if (activeView === 'history-view') {
            setActiveView('profile-view');
          } else {
            setActiveView('home-view');
          }
        };
        tg.BackButton.onClick(onBack);
        return () => {
          tg.BackButton.offClick(onBack);
        };
      } else {
        tg.BackButton.hide();
      }
    } catch (e) {}
  }, [activeView, leaderboardSource]);

  const openLeaderboard = (source) => {
    setLeaderboardSource(source || 'home-view');
    setActiveView('leaderboard-view');
    triggerHaptic('light');
  };

  const goBackFromLeaderboard = () => {
    setActiveView(leaderboardSource || 'home-view');
    triggerHaptic('light');
  };

  const value = {
    user,
    setUser,
    balance,
    applyBalance,
    refreshBalance,
    activeView,
    setActiveView,
    leaderboardSource,
    openLeaderboard,
    goBackFromLeaderboard,
    isGateVerified,
    setIsGateVerified,
    isBanned,
    banReason,
    isAdmin,
    adminChoiceModal,
    setAdminChoiceModal,
    splashOpen,
    setSplashOpen,
    tosOpen,
    setTosOpen,
    adsrPreModalOpen,
    setAdsrPreModalOpen,
    adsrCompletedModal,
    setAdsrCompletedModal,
    ftModal,
    setFtModal,
    notification,
    showTopNotification,
    dismissTopNotification,
    triggerHaptic,
    playHowlAudio
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}
