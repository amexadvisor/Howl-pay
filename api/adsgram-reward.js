// AdsGram reward block (block id 51923)
//   GET  ?userid=<telegram id>&secret=<ADSGRAM_REWARD_SECRET>  -> called by AdsGram's servers after a completed view; credits the reward
//   POST { initData }                                           -> the Mini App reads its cycle state (read-only, never credits)
//
// Rules: ad N of a cycle pays start - step * (N - 1). After `limit` ads the block locks for the cooldown.
// A cycle also resets once the cooldown has passed since the user's last ad.
// Needs a UNIQUE index on transactions.transaction_id (slot reservation relies on it).

import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { HOWL_USD_RATE, verifyInitData, creditHowl, creditUsd } from '../lib/balance.js';
import { getAdConfig, rewardFor, REWARD_BLOCK } from '../lib/adconfig.js';

const SUPABASE_URL = (process.env.SUPABASE_URL || '').trim();
const SUPABASE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || '').trim();
const supabase = (SUPABASE_URL && SUPABASE_KEY) ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;

const ADMIN_IDS = ['8026237972'];
const TASK = REWARD_BLOCK.taskType;
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
  return {
    enabled: p.limit > 0,
    watched: s.watched,
    limit: p.limit,
    start: p.start,
    step: p.step,
    cooldown_hours: p.cooldown_min / 60,
    locked,
    next_reward: (p.limit <= 0 || locked) ? 0 : rewardFor(p, s.watched),
    seconds_left: locked ? Math.ceil((s.lockedUntil - now) / 1000) : 0,
    last_at: s.lastAt
  };
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
  const rewardHowl = rewardFor(p, s.watched);
  if (rewardHowl <= 0) return ignore('no_reward');
  const rewardUsd = rewardHowl * HOWL_USD_RATE;

  // Reserve the slot first. The unique transaction_id makes two simultaneous callbacks collide.
  const txId = `adsr_${uid}_${s.cycleStart}_${n}`;
  const { error: txErr } = await supabase.from('transactions').insert([{
    user_id: uid,
    reward_amount: rewardUsd,
    transaction_id: txId,
    task_type: TASK,
    status: '1',
    created_at: new Date(now).toISOString()
  }]);
  if (txErr) return txErr.code === '23505' ? ignore('duplicate') : res.status(500).json({ success: false });

  let credit;
  try { credit = await creditHowl(supabase, uid, rewardHowl); } catch (e) { credit = { ok: false }; }
  if (!credit.ok) {
    await supabase.from('transactions').delete().eq('transaction_id', txId);   // free the slot so a retry works
    return res.status(500).json({ success: false });
  }

  // 10% referral commission, idempotent through its own unique id
  if (user.referred_by) {
    const referrerId = String(user.referred_by);
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

  return res.status(200).json({ success: true });
}

// ---- POST: the Mini App asks for its current state ----
async function handleStatus(req, res) {
  const { initData } = req.body || {};
  const verified = verifyInitData(initData || req.headers['x-telegram-init-data'], process.env.BOT_TOKEN, 86400);
  if (!verified) return res.status(403).json({ success: false, error: 'Invalid signature' });

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
    if (req.method === 'POST') return await handleStatus(req, res);
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error('[adsgram-reward]', e && e.message);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
                   }
