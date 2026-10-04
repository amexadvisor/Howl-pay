// Admin-adjustable ad rewards.
//   reward for the Nth ad of the day = max(0, start - step * (N - 1))   (amounts in HOWL)
//   e.g. start 170, step 30, limit 5  ->  170, 140, 110, 80, 50
//
// Stored as a hidden ledger row (task_type SYSTEM_AD_CONFIG) so no new table / SQL / env var is needed.
// The newest row wins. The numbers live in transaction_id, e.g.  adcfg_m100_10_10_a170_30_5_1759550000000

import { HOWL_USD_RATE } from './balance.js';

export const AD_PROVIDERS = {
  monetag: { label: 'Monetag', taskType: 'Monetag Rewarded Ad' },
  adsgram: { label: 'AdsGram', taskType: 'Adsgram Task Ad' }
};

export const DEFAULT_AD_CONFIG = {
  monetag: { start: 100, step: 10, limit: 10 },
  adsgram: { start: 170, step: 30, limit: 5 }
};

const CONFIG_TYPE = 'SYSTEM_AD_CONFIG';
const CACHE_MS = 10000;
let cache = { at: 0, cfg: null };

/** Reward (HOWL) for the next ad, given how many were already watched today. */
export function rewardFor(p, watchedToday) {
  return Math.max(0, Math.floor(p.start - p.step * watchedToday));
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

/** Strict validation for the admin panel. Returns { ok, error, config }. */
export function validateAdConfig(input) {
  if (!input || typeof input !== 'object') return { ok: false, error: 'Missing settings.' };
  const config = {};
  for (const key of Object.keys(DEFAULT_AD_CONFIG)) {
    const src = input[key];
    if (!src) return { ok: false, error: `Missing ${AD_PROVIDERS[key].label} settings.` };
    const label = AD_PROVIDERS[key].label;

    const parse = (v) => (typeof v === 'number' || (typeof v === 'string' && v.trim() !== '')) ? Number(v) : NaN;
    const start = parse(src.start), step = parse(src.step), limit = parse(src.limit);

    if (![start, step, limit].every(Number.isInteger)) return { ok: false, error: `${label}: all values must be whole numbers.` };
    if (start < 1 || start > 100000) return { ok: false, error: `${label}: starting reward must be between 1 and 100,000 HOWL.` };
    if (step < 0 || step > start) return { ok: false, error: `${label}: reduction must be between 0 and the starting reward.` };
    if (limit < 0 || limit > 100) return { ok: false, error: `${label}: daily limit must be between 0 and 100 (0 turns it off).` };
    config[key] = { start, step, limit };
  }
  return { ok: true, config };
}

function encode(cfg) {
  const m = cfg.monetag, a = cfg.adsgram;
  return `adcfg_m${m.start}_${m.step}_${m.limit}_a${a.start}_${a.step}_${a.limit}_${Date.now()}`;
}

function decode(txId) {
  const m = /^adcfg_m(\d+)_(\d+)_(\d+)_a(\d+)_(\d+)_(\d+)_/.exec(String(txId || ''));
  if (!m) return null;
  const n = m.slice(1).map(Number);
  return {
    monetag: { start: n[0], step: n[1], limit: n[2] },
    adsgram: { start: n[3], step: n[4], limit: n[5] }
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
