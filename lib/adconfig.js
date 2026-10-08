// Admin-adjustable ad rewards (amounts in HOWL): reward for the Nth ad = max(0, start - step * (N - 1))
//   monetag / adsgram : N = ads watched today (daily limit)
//   adsreward         : N = position in the current cycle; after `limit` ads the block locks for `cooldown_min`
//                       noclick_pct      = % of the reward paid when the ad view completes (1-100)
//                                          the remaining % is paid as a "click bonus" when the app detects the user opened the ad
//                                          100 = everything is paid on view, click bonus is OFF
//                       click_window_sec = how long after the view a click bonus can still be claimed (30-3600)
//
// Stored as a hidden ledger row (task_type SYSTEM_AD_CONFIG). The newest row wins.
// Old rows (before the reward block / noclick_pct / click_window_sec existed) are still understood.

import { HOWL_USD_RATE } from './balance.js';

export const AD_PROVIDERS = {
  monetag: { label: 'Monetag', taskType: 'Monetag Rewarded Ad' },
  adsgram: { label: 'AdsGram', taskType: 'Adsgram Task Ad' }
};

// Deliberately NOT in AD_PROVIDERS: claim-bonus.js loops over that list, and this block works per cycle, not per day.
export const REWARD_BLOCK = { key: 'adsreward', label: 'AdsGram Reward', taskType: 'Adsgram Reward Ad' };

export const DEFAULT_AD_CONFIG = {
  monetag:   { start: 100, step: 10, limit: 10 },
  adsgram:   { start: 170, step: 30, limit: 5 },
  adsreward: { start: 180, step: 30, limit: 5, cooldown_min: 180, noclick_pct: 100, click_window_sec: 300 }
};

const LABELS = { monetag: 'Monetag', adsgram: 'AdsGram', adsreward: 'AdsGram Reward' };

const CONFIG_TYPE = 'SYSTEM_AD_CONFIG';
const CACHE_MS = 10000;
let cache = { at: 0, cfg: null };

/** Full reward (HOWL) for the next ad, given how many were already watched. */
export function rewardFor(p, watched) {
  return Math.max(0, Math.floor(p.start - p.step * watched));
}

/** % paid when the view completes (1-100). Missing / invalid = 100 (click bonus off). */
export function noClickPct(p) {
  const n = Number(p && p.noclick_pct);
  if (!Number.isFinite(n)) return 100;
  return Math.min(100, Math.max(1, Math.round(n)));
}

/** Seconds after a view during which a click bonus can still be claimed (30-3600). */
export function clickWindowSec(p) {
  const n = Number(p && p.click_window_sec);
  if (!Number.isFinite(n)) return 300;
  return Math.min(3600, Math.max(30, Math.round(n)));
}

/** What is paid immediately when the view completes (HOWL). The rest (full - this) is the click bonus. */
export function viewReward(p, watched) {
  const full = rewardFor(p, watched);
  if (full <= 0) return 0;
  return Math.max(1, Math.floor(full * noClickPct(p) / 100));
}

export function adStatusFor(cfg, provider, watchedToday) {
  const p = cfg[provider];
  const done = p.limit <= 0 || watchedToday >= p.limit;
  return {
    watched: watchedToday,
    limit: p.limit,
    start: p.start,
    step: p.step,
    next_reward: done ? 0 : rewardFor(p, watchedToday),
    reward_usd_rate: HOWL_USD_RATE
  };
}

/** Strict validation for the admin panel. Providers missing from `input` keep their current values. */
export function validateAdConfig(input, current = DEFAULT_AD_CONFIG) {
  if (!input || typeof input !== 'object') return { ok: false, error: 'Missing settings.' };
  const parse = (v) => (typeof v === 'number' || (typeof v === 'string' && v.trim() !== '')) ? Number(v) : NaN;
  const blank = (v) => v === undefined || v === null || v === '';
  const config = {};

  for (const key of Object.keys(DEFAULT_AD_CONFIG)) {
    const src = input[key];
    if (src === undefined || src === null) {
      config[key] = current[key] || DEFAULT_AD_CONFIG[key];
      continue;
    }
    const label = LABELS[key];
    const start = parse(src.start), step = parse(src.step), limit = parse(src.limit);

    if (![start, step, limit].every(Number.isInteger)) return { ok: false, error: `${label}: all values must be whole numbers.` };
    if (start < 1 || start > 100000) return { ok: false, error: `${label}: starting reward must be between 1 and 100,000 HOWL.` };
    if (step < 0 || step > start) return { ok: false, error: `${label}: reduction must be between 0 and the starting reward.` };
    if (limit < 0 || limit > 100) return { ok: false, error: `${label}: ads per cycle/day must be between 0 and 100 (0 turns it off).` };
    config[key] = { start, step, limit };

    if (key === 'adsreward') {
      const prev = current[key] || DEFAULT_AD_CONFIG[key];

      const hours = parse(src.cooldown_hours);
      if (!Number.isFinite(hours) || hours < 0.1 || hours > 168) {
        return { ok: false, error: `${label}: cooldown must be between 0.1 and 168 hours.` };
      }
      config[key].cooldown_min = Math.round(hours * 60);

      // Click-based reward. If the panel doesn't send these, the current values are kept.
      const pct = blank(src.noclick_pct) ? noClickPct(prev) : parse(src.noclick_pct);
      if (!Number.isInteger(pct) || pct < 1 || pct > 100) {
        return { ok: false, error: `${label}: "no click pays" must be a whole number between 1 and 100 (%).` };
      }
      config[key].noclick_pct = pct;

      const win = blank(src.click_window_sec) ? clickWindowSec(prev) : parse(src.click_window_sec);
      if (!Number.isInteger(win) || win < 30 || win > 3600) {
        return { ok: false, error: `${label}: click window must be a whole number between 30 and 3600 seconds.` };
      }
      config[key].click_window_sec = win;
    }
  }
  return { ok: true, config };
}

// adcfg4: ..._r<start>_<step>_<limit>_<cooldown_min>_<noclick_pct>_<click_window_sec>_<timestamp>
function encode(cfg) {
  const m = cfg.monetag, a = cfg.adsgram, r = cfg.adsreward;
  return `adcfg4_m${m.start}_${m.step}_${m.limit}_a${a.start}_${a.step}_${a.limit}_r${r.start}_${r.step}_${r.limit}_${r.cooldown_min}_${noClickPct(r)}_${clickWindowSec(r)}_${Date.now()}`;
}

function decode(txId) {
  const s = String(txId || '');

  // Newest format (noclick_pct + click_window_sec)
  let m = /^adcfg4_m(\d+)_(\d+)_(\d+)_a(\d+)_(\d+)_(\d+)_r(\d+)_(\d+)_(\d+)_(\d+)_(\d+)_(\d+)_/.exec(s);
  if (m) {
    const n = m.slice(1).map(Number);
    return {
      monetag: { start: n[0], step: n[1], limit: n[2] },
      adsgram: { start: n[3], step: n[4], limit: n[5] },
      adsreward: { start: n[6], step: n[7], limit: n[8], cooldown_min: n[9], noclick_pct: n[10], click_window_sec: n[11] }
    };
  }

  // adcfg3 (noclick_pct only): window defaults to 300 s
  m = /^adcfg3_m(\d+)_(\d+)_(\d+)_a(\d+)_(\d+)_(\d+)_r(\d+)_(\d+)_(\d+)_(\d+)_(\d+)_/.exec(s);
  if (m) {
    const n = m.slice(1).map(Number);
    return {
      monetag: { start: n[0], step: n[1], limit: n[2] },
      adsgram: { start: n[3], step: n[4], limit: n[5] },
      adsreward: { start: n[6], step: n[7], limit: n[8], cooldown_min: n[9], noclick_pct: n[10], click_window_sec: 300 }
    };
  }

  // adcfg2 (before the click bonus existed): everything paid on view
  m = /^adcfg2_m(\d+)_(\d+)_(\d+)_a(\d+)_(\d+)_(\d+)_r(\d+)_(\d+)_(\d+)_(\d+)_/.exec(s);
  if (m) {
    const n = m.slice(1).map(Number);
    return {
      monetag: { start: n[0], step: n[1], limit: n[2] },
      adsgram: { start: n[3], step: n[4], limit: n[5] },
      adsreward: { start: n[6], step: n[7], limit: n[8], cooldown_min: n[9], noclick_pct: 100, click_window_sec: 300 }
    };
  }

  // adcfg (before the reward block existed)
  m = /^adcfg_m(\d+)_(\d+)_(\d+)_a(\d+)_(\d+)_(\d+)_/.exec(s);
  if (!m) return null;
  const n = m.slice(1).map(Number);
  return {
    monetag: { start: n[0], step: n[1], limit: n[2] },
    adsgram: { start: n[3], step: n[4], limit: n[5] },
    adsreward: { ...DEFAULT_AD_CONFIG.adsreward }
  };
}

export async function getAdConfig(supabase, { fresh = false } = {}) {
  if (!fresh && cache.cfg && Date.now() - cache.at < CACHE_MS) return cache.cfg;
  let cfg = DEFAULT_AD_CONFIG;
  try {
    const { data } = await supabase
      .from('transactions')
      .select('transaction_id')
      .eq('task_type', CONFIG_TYPE)
      .order('created_at', { ascending: false })
      .limit(1);
    const parsed = data && data[0] ? decode(data[0].transaction_id) : null;
    if (parsed) cfg = parsed;
  } catch (e) {
    console.error('[adconfig] read failed, using defaults:', e.message);
  }
  cache = { at: Date.now(), cfg };
  return cfg;
}

export async function saveAdConfig(supabase, cfg, adminId) {
  const { error } = await supabase.from('transactions').insert([{
    user_id: String(adminId),
    reward_amount: 0,
    transaction_id: encode(cfg),
    task_type: CONFIG_TYPE,
    status: 'config',
    created_at: new Date().toISOString()
  }]);
  if (error) throw new Error(error.message);
  cache = { at: Date.now(), cfg };
  return cfg;
              }
