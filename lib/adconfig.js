// Admin-adjustable ad rewards (amounts in HOWL): reward for the Nth ad = max(0, start - step * (N - 1))
//   monetag / adsgram : N = ads watched today (daily limit)
//   adsreward         : N = position in the current cycle; after `limit` ads the block locks for `cooldown_min`
//
// Stored as a hidden ledger row (task_type SYSTEM_AD_CONFIG). The newest row wins.
// Old rows (before the reward block existed) are still understood.

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
  adsreward: { start: 180, step: 30, limit: 5, cooldown_min: 180 }
};

const LABELS = { monetag: 'Monetag', adsgram: 'AdsGram', adsreward: 'AdsGram Reward' };

const CONFIG_TYPE = 'SYSTEM_AD_CONFIG';
const CACHE_MS = 10000;
let cache = { at: 0, cfg: null };

/** Reward (HOWL) for the next ad, given how many were already watched. */
export function rewardFor(p, watched) {
  return Math.max(0, Math.floor(p.start - p.step * watched));
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
      const hours = parse(src.cooldown_hours);
      if (!Number.isFinite(hours) || hours < 0.1 || hours > 168) {
        return { ok: false, error: `${label}: cooldown must be between 0.1 and 168 hours.` };
      }
      config[key].cooldown_min = Math.round(hours * 60);
    }
  }
  return { ok: true, config };
}

function encode(cfg) {
  const m = cfg.monetag, a = cfg.adsgram, r = cfg.adsreward;
  return `adcfg2_m${m.start}_${m.step}_${m.limit}_a${a.start}_${a.step}_${a.limit}_r${r.start}_${r.step}_${r.limit}_${r.cooldown_min}_${Date.now()}`;
}

function decode(txId) {
  const s = String(txId || '');
  let m = /^adcfg2_m(\d+)_(\d+)_(\d+)_a(\d+)_(\d+)_(\d+)_r(\d+)_(\d+)_(\d+)_(\d+)_/.exec(s);
  if (m) {
    const n = m.slice(1).map(Number);
    return {
      monetag: { start: n[0], step: n[1], limit: n[2] },
      adsgram: { start: n[3], step: n[4], limit: n[5] },
      adsreward: { start: n[6], step: n[7], limit: n[8], cooldown_min: n[9] }
    };
  }
  m = /^adcfg_m(\d+)_(\d+)_(\d+)_a(\d+)_(\d+)_(\d+)_/.exec(s);   // rows saved before the reward block existed
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
