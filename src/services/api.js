// HOWL Mini App API Service
export const API_BASE_URL = (typeof window !== 'undefined' && window.API_BASE_URL) || 'https://howlearn.duckdns.org';

function getInitData() {
  try {
    return (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initData) || '';
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

export async function verifyUser(payload = {}) {
  const initData = getInitData();
  const res = await fetch(`${API_BASE_URL}/api/verify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Telegram-Init-Data': initData
    },
    body: JSON.stringify({ ...payload, initData })
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

export async function claimAdReward(userId, endpoint, clicks, total) {
  const initData = getInitData();
  const res = await fetch(`${API_BASE_URL}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Telegram-Init-Data': initData
    },
    body: JSON.stringify({ userId, clicks, total })
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
    body: JSON.stringify({ action, ...extra })
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
