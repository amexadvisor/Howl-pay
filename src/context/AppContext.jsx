import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { verifyUser, fetchBalanceOnly, ADMIN_IDS } from '../services/api';

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
          is_admin: ADMIN_IDS.includes(String(u.id)),
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
  const [isAdmin, setIsAdmin] = useState(() => {
    try {
      const u = window.Telegram?.WebApp?.initDataUnsafe?.user;
      return u && ADMIN_IDS.includes(String(u.id));
    } catch (e) {
      return false;
    }
  });
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

  const [referralStats, setReferralStats] = useState({ friends_count: 0, total_howl: 0, total_usdt: 0 });

  // AdsGram watch handler callback ref
  const adsrWatchHandlerRef = useRef(null);
  const setAdsrWatchHandler = useCallback((fn) => {
    adsrWatchHandlerRef.current = fn;
  }, []);
  const triggerAdsrStartWatch = useCallback(() => {
    if (adsrWatchHandlerRef.current) {
      adsrWatchHandlerRef.current();
    }
  }, []);

  // Top Notification Popup Banner
  const [notification, setNotification] = useState({
    show: false,
    title: '',
    message: '',
    type: 'gold',
    icon: null,
    duration: 4500
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

  // Top Notification Trigger supporting both (title, message, type) and ({ title, message, type, icon, duration })
  const showTopNotification = useCallback((firstArg, messageArg, typeArg = 'gold') => {
    let opts = {};
    if (typeof firstArg === 'string') {
      opts = {
        title: firstArg,
        message: messageArg || '',
        type: typeArg
      };
    } else if (firstArg && typeof firstArg === 'object') {
      opts = firstArg;
    }

    const title = opts.title || 'NOTIFICATION';
    const message = opts.message || '';
    const rawMsg = message.toLowerCase();
    const isError =
      opts.type === 'error' ||
      message.includes('❌') ||
      rawMsg.includes('fail') ||
      rawMsg.includes('error');
    const isCyan = opts.type === 'cyan';
    const type = isError ? 'error' : isCyan ? 'cyan' : opts.type || 'gold';

    triggerHaptic(type === 'error' ? 'error' : 'light');

    setNotification({
      show: true,
      title,
      message,
      type,
      icon: opts.icon || null,
      duration: opts.duration || 4500
    });
  }, [triggerHaptic]);

  const dismissTopNotification = useCallback(() => {
    setNotification((prev) => ({ ...prev, show: false }));
  }, []);

  // Audio Trigger
  const playHowlAudio = useCallback(() => {
    try {
      const audio = new Audio('/assets/howl.mp3');
      audio.volume = 1.0;
      audio.play().catch(() => {});
    } catch (e) {}
  }, []);

  // Balance applicator
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
        try {
          window.Telegram.WebApp.setHeaderColor('#02040f');
        } catch (e) {}
      }

      const u = window.Telegram?.WebApp?.initDataUnsafe?.user;
      let device = null;
      try {
        if (window.HowlDevice && u?.id) {
          device = await window.HowlDevice.collect(u.id, { ignoreOwners: ADMIN_IDS });
        }
      } catch (e) {}

      const res = await verifyUser(device);
      if (res) {
        if (res.banned) {
          const reason = res.message || res.ban_reason || 'Access suspended due to multi-account policy.';
          if (window.HowlDevice && u?.id) {
            window.HowlDevice.setBan(u.id, reason);
          }
          setIsBanned(true);
          setBanReason(reason);
          return;
        }

        if (res.success && window.HowlDevice && u?.id) {
          window.HowlDevice.clearBan(u.id);
        }

        if (res.user) {
          const usr = res.user;
          const isUserAdmin = !!usr.is_admin || (u && ADMIN_IDS.includes(String(u.id)));
          setUser((prev) => ({
            ...prev,
            id: String(usr.id || prev.id),
            username: usr.username || prev.username,
            first_name: usr.first_name || prev.first_name,
            photo_url: usr.photo_url || prev.photo_url,
            is_admin: isUserAdmin,
            banned: false
          }));

          if (isUserAdmin) {
            setIsAdmin(true);
            try {
              if (!sessionStorage.getItem('howl_admin_mode_chosen')) {
                setAdminChoiceModal(true);
              }
            } catch (e) {
              setAdminChoiceModal(true);
            }
          }
        }

        if (res.balance) {
          applyBalance(res.balance.total_howl, res.balance.total_usd, res.balance.hold);
        } else if (res.user_balance) {
          applyBalance(res.user_balance.total_howl, res.user_balance.total_usd, res.user_balance.hold);
        }

        if (res.referral_stats) {
          setReferralStats(res.referral_stats);
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
    window.applyBalance = (b) => {
      if (!b) return;
      applyBalance(b.total_howl ?? b.howl, b.total_usd ?? b.usd, b.hold_howl ?? b.hold);
    };
    window.updateBalanceUI = window.applyBalance;
    window.refreshBalance = refreshBalance;

    const interval = setInterval(() => {
      refreshBalance();
    }, 5000);
    return () => clearInterval(interval);
  }, [applyBalance, refreshBalance]);

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
    playHowlAudio,
    referralStats,
    setReferralStats,
    setAdsrWatchHandler,
    triggerAdsrStartWatch
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
