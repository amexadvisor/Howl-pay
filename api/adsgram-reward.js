// AdsGram reward block (block id 51923)
//   GET  ?userid=<telegram id>&secret=<ADSGRAM_REWARD_SECRET>
//        -> called by AdsGram's servers after a completed view; credits the VIEW reward
//   POST { initData }
//        -> the Mini App reads its cycle state (read-only, never credits)
//   POST { initData, action: 'click' }
//        -> the Mini App says it detected the user opening the ad; credits the CLICK BONUS for the latest view
//
// Rules: ad N of a cycle pays start - step * (N - 1). After `limit` ads the block locks for the cooldown.
// A cycle also resets once the cooldown has passed since the user's last ad.
//
// CLICK-BASED REWARD (AdsGram sends no click data, so this is our own method):
//   * When the view completes, AdsGram's callback pays `noclick_pct`% of the reward.
//   * If the Mini App then detects that the user opened the ad (see index.html), it calls action 'click'
//     and the remaining (100 - noclick_pct)% is paid as a bonus. One bonus per view, only inside `click_window_sec`.
//   * noclick_pct = 100 turns the click bonus off (everything is paid on view).
//   Note: the click signal comes from the user's device, so the server cannot prove it. The limits above
//   (one bonus per view, only after a real credited view, time window) are what keep it bounded.
//
// Needs a UNIQUE index on transactions.transaction_id (slot reservation relies on it).

import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { HOWL_USD_RATE, verifyInitData, creditHowl, creditUsd } from '../lib/balance.js';
import { getAdConfig, rewardFor, viewReward, tieredRewardFor, noClickPct, tier1Pct, tier2Pct, clickWindowSec, REWARD_BLOCK } from '../lib/adconfig.js';

const SUPABASE_URL = (process.env.SUPABASE_URL || '').trim();
const SUPABASE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || '').trim();
const supabase = (SUPABASE_URL && SUPABASE_KEY) ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;

const ADMIN_IDS = ['8026237972'];
const TASK = REWARD_BLOCK.taskType;
const BONUS_TASK = `${TASK} Click Bonus`;   // different task_type so cycle tracking (getState) never sees it
const MIN_GAP_MS = 12000;   // a real ad takes longer than this; it also swallows AdsGram retries

const safeEqual = (a, b) => {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

// Same ban / multi-account rules as claim-bonus.js
async function accountBlocked(uid) {
  if (ADMIN_IDS.includes(uid)) return false;

  const { data: banRows } = await supabase.from('transactions').select('status')
    .eq('user_id', uid).eq('task_type', 'ADMIN_BAN')
    .order('created_at', { ascending: false }).limit(1);
  const last = banRows && banRows[0] && banRows[0].status;
  if (last === 'BANNED') return true;
  if (last === 'UNBANNED') return false;

  const { data: me } = await supabase.from('users').select('fingerprint, created_at').eq('user_id', uid).maybeSingle();
  if (!me || !me.fingerprint) return false;

  const { data: other } = await supabase.from('users').select('user_id, created_at')
    .eq('fingerprint', me.fingerprint).neq('user_id', uid)
    .order('created_at', { ascending: true }).limit(1).maybeSingle();

  return !!(other && (ADMIN_IDS.includes(String(other.user_id)) || new Date(me.created_at) >= new Date(other.created_at)));
}

// Cycle state, derived from the user's latest reward row. Row id format: adsr_<uid>_<cycleStartMs>_<n>
async function getState(uid, p, now = Date.now()) {
  const cooldownMs = p.cooldown_min * 60000;
  const { data } = await supabase.from('transactions').select('transaction_id, created_at')
    .eq('user_id', uid).eq('task_type', TASK).eq('status', '1')
    .order('created_at', { ascending: false }).limit(1);

  const row = data && data[0];
  const m = row && /_(\d+)_(\d+)$/.exec(row.transaction_id);
  const s = { watched: 0, cycleStart: now, lastAt: 0, lockedUntil: 0 };
  if (!row || !m) return s;

  s.lastAt = new Date(row.created_at).getTime();
  if (now - s.lastAt >= cooldownMs) return s;           // cooldown is over -> fresh cycle

  s.cycleStart = Number(m[1]);
  s.watched = Number(m[2]);
  if (s.watched >= p.limit) s.lockedUntil = s.lastAt + cooldownMs;
  return s;
}

function publicState(p, s, now = Date.now()) {
  const locked = s.lockedUntil > now;
  const off = (p.limit <= 0 || locked);
  return {
    enabled: p.limit > 0,
    watched: s.watched,
    limit: p.limit,
    start: p.start,
    step: p.step,
    cooldown_hours: p.cooldown_min / 60,
    locked,
    next_reward: off ? 0 : rewardFor(p, s.watched),             // full reward (all in-ad clicks)
    next_reward_noclick: off ? 0 : viewReward(p, s.watched),    // paid on view alone (0 clicks)
    next_reward_tier1: off ? 0 : tieredRewardFor(p, s.watched, 1, 3), // 1 click on 3 ads
    next_reward_tier2: off ? 0 : tieredRewardFor(p, s.watched, 2, 3), // 2 clicks on 3 ads
    noclick_pct: noClickPct(p),
    tier1_pct: tier1Pct(p),
    tier2_pct: tier2Pct(p),
    click_window_sec: clickWindowSec(p),
    seconds_left: locked ? Math.ceil((s.lockedUntil - now) / 1000) : 0,
    last_at: s.lastAt
  };
}

// Reserve a ledger row first (unique transaction_id makes simultaneous requests collide), then credit HOWL.
// If crediting fails the row is removed so a retry can work.
async function creditOnce(uid, txId, taskType, howl, nowMs) {
  const rewardUsd = howl * HOWL_USD_RATE;
  const { error: txErr } = await supabase.from('transactions').insert([{
    user_id: uid,
    reward_amount: rewardUsd,
    transaction_id: txId,
    task_type: taskType,
    status: '1',
    created_at: new Date(nowMs).toISOString()
  }]);
  if (txErr) return { ok: false, duplicate: txErr.code === '23505' };

  let credit;
  try { credit = await creditHowl(supabase, uid, howl); } catch (e) { credit = { ok: false }; }
  if (!credit.ok) {
    await supabase.from('transactions').delete().eq('transaction_id', txId);
    return { ok: false, duplicate: false };
  }
  return { ok: true, rewardUsd };
}

// 10% referral commission, idempotent through its own unique id
async function payReferral(referredBy, rewardUsd, txId) {
  if (!referredBy) return;
  const referrerId = String(referredBy);
  const commissionUsd = rewardUsd * 0.10;
  const refTx = `ref_${txId}`;
  const { error: refErr } = await supabase.from('transactions').insert([{
    user_id: referrerId,
    reward_amount: commissionUsd,
    transaction_id: refTx,
    task_type: 'Referral Ad Commission (10%)',
    status: '1',
    created_at: new Date().toISOString()
  }]);
  if (!refErr) {
    const c = await creditUsd(supabase, referrerId, commissionUsd, { earned: true }).catch(() => ({ ok: false }));
    if (!c.ok) await supabase.from('transactions').delete().eq('transaction_id', refTx);
  }
}

// ---- GET: AdsGram's servers call this after a completed view ----
async function handleCallback(req, res) {
  const SECRET = process.env.ADSGRAM_REWARD_SECRET;
  if (!SECRET) return res.status(500).json({ success: false });
  if (!safeEqual(req.query.secret, SECRET)) return res.status(403).json({ success: false });

  const uid = String(req.query.userid || '').trim();
  if (!/^\d{1,20}$/.test(uid)) return res.status(400).json({ success: false });
  const ignore = (reason) => res.status(200).json({ success: false, ignored: reason });

  const { data: user } = await supabase.from('users').select('user_id, referred_by').eq('user_id', uid).maybeSingle();
  if (!user) return ignore('no_user');
  if (await accountBlocked(uid)) return ignore('blocked');

  const p = (await getAdConfig(supabase)).adsreward;
  if (!p || p.limit <= 0) return ignore('disabled');

  const now = Date.now();
  const s = await getState(uid, p, now);
  if (s.lockedUntil > now) return ignore('cooldown');
  if (s.lastAt && now - s.lastAt < MIN_GAP_MS) return ignore('too_fast');

  const n = s.watched + 1;
  const rewardHowl = viewReward(p, s.watched);     // noclick_pct % of the full reward
  if (rewardHowl <= 0) return ignore('no_reward');

  const txId = `adsr_${uid}_${s.cycleStart}_${n}`;
  const r = await creditOnce(uid, txId, TASK, rewardHowl, now);
  if (!r.ok) return r.duplicate ? ignore('duplicate') : res.status(500).json({ success: false });

  await payReferral(user.referred_by, r.rewardUsd, txId);
  return res.status(200).json({ success: true, credited_howl: rewardHowl });
}

// ---- POST (action 'click'): the Mini App detected that the user opened in-ad button(s) ----
async function handleClick(req, res, verified) {
  const uid = String(verified.user.id);
  const { clicks: rawClicks, total: rawTotal } = req.body || {};
  const fail = (error) => res.status(200).json({ success: false, error });

  const p = (await getAdConfig(supabase)).adsreward;
  if (!p || p.limit <= 0) return fail('disabled');
  if (noClickPct(p) >= 100) return res.status(200).json({ success: true, bonus: 0, reason: 'bonus_off' });

  const total = Math.max(1, Math.min(3, Number(rawTotal) || 1));
  const clicks = Math.max(0, Math.min(total, Number(rawClicks) || 0));
  if (clicks <= 0) return res.status(200).json({ success: true, bonus: 0, reason: 'no_clicks' });

  const { data: user } = await supabase.from('users').select('user_id, referred_by').eq('user_id', uid).maybeSingle();
  if (!user) return fail('no_user');
  if (await accountBlocked(uid)) return fail('blocked');

  // The bonus belongs to the LATEST credited view and only to it
  const { data } = await supabase.from('transactions').select('transaction_id, created_at')
    .eq('user_id', uid).eq('task_type', TASK).eq('status', '1')
    .order('created_at', { ascending: false }).limit(1);
  const row = data && data[0];
  const m = row && /^adsr_(\d+)_(\d+)_(\d+)$/.exec(row.transaction_id);
  if (!m) return fail('no_view');

  const now = Date.now();
  if (now - new Date(row.created_at).getTime() > clickWindowSec(p) * 1000) return fail('too_late');

  const n = Number(m[3]);
  const basePaid = viewReward(p, n - 1);
  const totalEarned = tieredRewardFor(p, n - 1, clicks, total);
  const bonusHowl = Math.max(0, totalEarned - basePaid);
  if (bonusHowl <= 0) return res.status(200).json({ success: true, bonus: 0, clicks, total, total_reward: totalEarned });

  const bonusTx = `adsrc_${uid}_${m[2]}_${n}`;     // unique per view -> a view can only be bonused once
  const r = await creditOnce(uid, bonusTx, BONUS_TASK, bonusHowl, now);
  if (!r.ok) return r.duplicate ? fail('already_claimed') : res.status(500).json({ success: false });

  await payReferral(user.referred_by, r.rewardUsd, bonusTx);
  return res.status(200).json({ success: true, bonus: bonusHowl, clicks, total, total_reward: totalEarned });
}

// ---- POST: status (default) or click bonus ----
async function handlePost(req, res) {
  const { initData, action } = req.body || {};
  const verified = verifyInitData(initData || req.headers['x-telegram-init-data'], process.env.BOT_TOKEN, 86400);
  if (!verified) return res.status(403).json({ success: false, error: 'Invalid signature' });

  if (action === 'click') return handleClick(req, res, verified);

  const p = (await getAdConfig(supabase)).adsreward;
  const s = await getState(String(verified.user.id), p);
  return res.status(200).json({ success: true, reward: publicState(p, s) });
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!supabase || !process.env.BOT_TOKEN) {
    return res.status(500).json({ success: false, error: 'Server configuration error.' });
  }
  try {
    if (req.method === 'GET') return await handleCallback(req, res);
    if (req.method === 'POST') return await handlePost(req, res);
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error('[adsgram-reward]', e && e.message);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
    }
