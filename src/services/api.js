// HOWL Mini App API Service & Configuration
export const API_BASE_URL = (typeof window !== 'undefined' && window.API_BASE_URL) || 'https://howlearn.duckdns.org';
export const BOT_USERNAME = 'howl_paybot';
export const ADMIN_IDS = ['8026237972'];
export const ADSR_BLOCK_ID = '51923';
export const ADSGRAM_BLOCK_ID = 'task-51892';

export function getInitData() {
  try {
    return (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initData) || '';
  } catch (e) {
    return '';
  }
}

export function getStartParam() {
  try {
    const urlParams = new URLSearchParams(window.location.search);
    return (
      (window.Telegram?.WebApp?.initDataUnsafe && window.Telegram.WebApp.initDataUnsafe.start_param) ||
      urlParams.get('startapp') ||
      ''
    );
  } catch (e) {
    return '';
  }
}

export async function logError(category, detail) {
  try {
    let userInfo = 'User: Unknown/Guest';
    try {
      const u = window.Telegram?.WebApp?.initDataUnsafe?.user;
      if (u) userInfo = `User: ${u.id} (@${u.username || 'no_user'})`;
    } catch (e) {}

    const payload = {
      category,
      userInfo,
      platform: window.Telegram?.WebApp?.platform || 'web',
      url: window.location.href,
      ua: navigator.userAgent,
      details: typeof detail === 'string' ? detail : JSON.stringify(detail, null, 2)
    };

    await fetch(`${API_BASE_URL}/api/log-error`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } catch (e) {}
}

export async function verifyUser(device = null) {
  const initData = getInitData();
  const startParam = getStartParam();

  const payload = {
    initData,
    startParam,
    fingerprint: device ? device.fingerprint : null,
    hwFingerprint: device ? device.hw : null,
    ownerId: device ? device.ownerId : null,
    isLocalMulti: device ? device.isLocalMulti : false
  };

  const res = await fetch(`${API_BASE_URL}/api/verify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Telegram-Init-Data': initData
    },
    body: JSON.stringify(payload)
  });
  return res.json();
}

export async function checkChannels(userId) {
  const res = await fetch(`${API_BASE_URL}/api/check-channels?userId=${encodeURIComponent(userId)}`, {
    headers: { 'Content-Type': 'application/json' }
  });
  return res.json();
}

export async function fetchBalanceOnly(userId) {
  const initData = getInitData();
  const res = await fetch(`${API_BASE_URL}/api/claim-bonus`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Telegram-Init-Data': initData
    },
    body: JSON.stringify({ userId, balance_only: true })
  });
  return res.json();
}

export async function syncAdStatusFromServer() {
  const initData = getInitData();
  if (!initData) return null;
  const res = await fetch(`${API_BASE_URL}/api/claim-bonus`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Telegram-Init-Data': initData
    },
    body: JSON.stringify({ check_status: true, initData })
  });
  return res.json();
}

export async function fetchReferralList() {
  const initData = getInitData();
  if (!initData) return null;
  const res = await fetch(`${API_BASE_URL}/api/claim-bonus`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Telegram-Init-Data': initData
    },
    body: JSON.stringify({ referral_list: true, initData }),
    cache: 'no-store'
  });
  return res.json();
}

export async function claimMonetagReward() {
  const initData = getInitData();
  const res = await fetch(`${API_BASE_URL}/api/claim-bonus`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Telegram-Init-Data': initData
    },
    body: JSON.stringify({ completed: true, provider: 'monetag', initData })
  });
  return res.json();
}

export async function claimAdsgramTaskReward() {
  const initData = getInitData();
  const res = await fetch(`${API_BASE_URL}/api/claim-bonus`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Telegram-Init-Data': initData
    },
    body: JSON.stringify({ completed: true, provider: 'adsgram', initData })
  });
  return res.json();
}

export async function syncAdsr() {
  const initData = getInitData();
  if (!initData) return null;
  const res = await fetch(`${API_BASE_URL}/api/adsgram-reward`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ initData }),
    cache: 'no-store'
  });
  return res.json();
}

export async function sendAdsrClick(clicks, total) {
  const initData = getInitData();
  if (!initData) return null;
  const res = await fetch(`${API_BASE_URL}/api/adsgram-reward`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      initData,
      action: 'click',
      clicks: Number(clicks) || 0,
      total: Number(total) || 1
    }),
    cache: 'no-store'
  });
  return res.json();
}

export async function submitWithdrawal(data) {
  const initData = getInitData();
  const res = await fetch(`${API_BASE_URL}/api/withdraw`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Telegram-Init-Data': initData
    },
    body: JSON.stringify({ ...data, initData })
  });
  return res.json();
}

export async function fetchHistory(userId) {
  const res = await fetch(`${API_BASE_URL}/api/history?userId=${encodeURIComponent(userId)}`, {
    headers: { 'Content-Type': 'application/json' }
  });
  return res.json();
}

export async function fetchLeaderboard() {
  const res = await fetch(`${API_BASE_URL}/api/leaderboard`, {
    headers: { 'Content-Type': 'application/json' }
  });
  return res.json();
}

export async function quickTasksCall(action, extra = {}) {
  const initData = getInitData();
  const res = await fetch(`${API_BASE_URL}/api/quick-tasks`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Telegram-Init-Data': initData
    },
    body: JSON.stringify({ action, ...extra, initData })
  });
  return res.json();
}

export async function adminCall(action, data = {}) {
  const initData = getInitData();
  const res = await fetch(`${API_BASE_URL}/api/admin`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Telegram-Init-Data': initData
    },
    body: JSON.stringify({ action, ...data, initData })
  });
  return res.json();
}

export async function checkPromoCode(code, userId) {
  const initData = getInitData();
  const res = await fetch(`${API_BASE_URL}/api/promo-code?code=${encodeURIComponent(code)}&userId=${encodeURIComponent(userId || '')}`, {
    headers: {
      'Content-Type': 'application/json',
      'X-Telegram-Init-Data': initData
    }
  });
  return res.json();
}

export async function claimPromoCode({ code, adType, adClicked }) {
  const initData = getInitData();
  const res = await fetch(`${API_BASE_URL}/api/promo-code`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Telegram-Init-Data': initData
    },
    body: JSON.stringify({ code, adType, adClicked: !!adClicked, initData })
  });
  return res.json();
}
