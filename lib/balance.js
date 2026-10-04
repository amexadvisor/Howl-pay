import crypto from 'crypto';
import { notifyTimewall } from './notify.js';

export const HOWL_USD_RATE = 0.00002;

const round4 = (n) => Math.round((Number(n) || 0) * 10000) / 10000;
const round6 = (n) => Math.round((Number(n) || 0) * 1e6) / 1e6;
const round8 = (n) => Math.round((Number(n) || 0) * 1e8) / 1e8;

/* ------------------------------------------------------------------ */
/* Telegram initData verification (shared by every endpoint)           */
/* ------------------------------------------------------------------ */
export function verifyInitData(initData, botToken, maxAgeSec = 0) {
  try {
    if (!initData || typeof initData !== 'string' || !botToken) return null;

    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) return null;

    params.delete('hash');
    params.sort();
    const dataCheckString = Array.from(params.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join('\n');

    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
    const calculated = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

    const a = Buffer.from(calculated);
    const b = Buffer.from(hash);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

    // Optional freshness check (used for withdrawals): reject sessions older than maxAgeSec
    if (maxAgeSec > 0) {
      const authDate = parseInt(params.get('auth_date') || '0', 10);
      if (!authDate || (Date.now() / 1000 - authDate) > maxAgeSec) return null;
    }

    const userParam = params.get('user');
    if (!userParam) return null;
    const user = JSON.parse(userParam);
    if (!user || !user.id) return null;

    return { user, params };
  } catch (e) {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* THE balance formula. Nothing else in the project may compute it.    */
/*   coins   = HOWL-denominated credits                                */
/*   balance = USD-denominated credits (offerwall, commissions)        */
/* ------------------------------------------------------------------ */
export function computeBalance(row) {
  const coins = parseFloat(row?.coins) || 0;
  const usd = parseFloat(row?.balance) || 0;
  const holdUsd = Math.max(0, parseFloat(row?.hold_balance) || 0);
  const total_howl = Math.max(0, Math.round(coins + usd / HOWL_USD_RATE));
  return {
    total_howl,
    total_usd: +(total_howl * HOWL_USD_RATE).toFixed(4),
    coins,
    usdt_earnings: +usd.toFixed(4),
    hold_usd: +holdUsd.toFixed(6),
    hold_howl: Math.max(0, Math.round(holdUsd / HOWL_USD_RATE)),
    rate: HOWL_USD_RATE
  };
}

export async function getUserBalance(supabase, userId) {
  const read = async () => {
    const { data, error } = await supabase
      .from('users').select('*').eq('user_id', String(userId)).maybeSingle();
    if (error) throw error;
    return data;
  };

  let row = await read();
  // Lazy release: if this user has held money, move anything older than HOLD_DAYS to the main balance
  if (row && (parseFloat(row.hold_balance) || 0) > 0) {
    try {
      const r = await releaseDueHolds(supabase, userId);
      if (r.releasedUsd > 0) row = await read();
    } catch (e) {
      console.error('[releaseDueHolds]', e.message);
    }
  }
  return computeBalance(row);
}

/* ------------------------------------------------------------------ */
/* Compare-and-set updater: safe against simultaneous requests         */
/* ------------------------------------------------------------------ */
async function casUpdate(supabase, userId, build) {
  const uid = String(userId);

  for (let attempt = 0; attempt < 6; attempt++) {
    const { data: row, error } = await supabase
      .from('users')
      .select('*')
      .eq('user_id', uid)
      .maybeSingle();
    if (error) throw error;
    if (!row) return { ok: false, reason: 'no_user', balance: computeBalance(null) };

    const result = build(row);
    if (result.error) return { ok: false, reason: result.error, balance: computeBalance(row) };

    let q = supabase.from('users').update(result.patch).eq('user_id', uid);
    q = row.coins === null || row.coins === undefined ? q.is('coins', null) : q.eq('coins', row.coins);
    q = row.balance === null || row.balance === undefined ? q.is('balance', null) : q.eq('balance', row.balance);
    if ('hold_balance' in row) {
      q = row.hold_balance === null ? q.is('hold_balance', null) : q.eq('hold_balance', row.hold_balance);
    }

    const { data: updated, error: upErr } = await q.select('*').maybeSingle();
    if (upErr) throw upErr;
    if (updated) return { ok: true, balance: computeBalance(updated), meta: result.meta };

    // Someone else changed the row between our read and write - retry.
    await new Promise((r) => setTimeout(r, 30 * (attempt + 1)));
  }
  throw new Error('Balance update conflict, please retry.');
}

/** Add HOWL coins. lifetime=true also bumps the lifetime `total_howl` counter. */
export function creditHowl(supabase, userId, howl, { lifetime = true } = {}) {
  const amount = Number(howl) || 0;
  return casUpdate(supabase, userId, (row) => {
    const patch = { coins: round4((parseFloat(row.coins) || 0) + amount) };
    if (lifetime) patch.total_howl = round4((parseFloat(row.total_howl) || 0) + amount);
    return { patch };
  });
}

/** Add USD (offerwalls, commissions, etc). earned=true also bumps `total_earned`. */
export function creditUsd(supabase, userId, usd, { earned = false } = {}) {
  const amount = Number(usd) || 0;
  return casUpdate(supabase, userId, (row) => {
    const patch = { balance: round6((parseFloat(row.balance) || 0) + amount) };
    if (earned) patch.total_earned = round4((parseFloat(row.total_earned) || 0) + amount);
    return { patch };
  });
}

/** Remove HOWL. Takes from coins first, then from the USD balance. Fails if insufficient. */
export function debitHowl(supabase, userId, howl) {
  const amount = Number(howl) || 0;
  return casUpdate(supabase, userId, (row) => {
    const coins = parseFloat(row.coins) || 0;
    const usd = parseFloat(row.balance) || 0;
    const total = Math.round(coins + usd / HOWL_USD_RATE);
    if (amount <= 0 || total < amount) return { error: 'insufficient' };

    const fromCoins = Math.min(coins, amount);
    const fromUsd = (amount - fromCoins) * HOWL_USD_RATE;
    return {
      patch: {
        coins: round4(coins - fromCoins),
        balance: round4(Math.max(0, usd - fromUsd))
      }
    };
  });
}


/* ------------------------------------------------------------------ */
/* HOLD SYSTEM (offerwall earnings are held HOLD_DAYS before release)  */
/*   users.hold_balance  = USD currently on hold (cache of hold rows)  */
/*   transactions status 'hold' = one row per held task completion     */
/* ------------------------------------------------------------------ */
export const HOLD_DAYS = 7;

/** Put USD on hold. */
export function creditHold(supabase, userId, usd) {
  const amount = Number(usd) || 0;
  return casUpdate(supabase, userId, (row) => ({
    patch: { hold_balance: round8((parseFloat(row.hold_balance) || 0) + amount) }
  }));
}

/** Remove USD from the held amount (reversal inside the hold window). */
export function reduceHold(supabase, userId, usd) {
  const amount = Number(usd) || 0;
  return casUpdate(supabase, userId, (row) => ({
    patch: { hold_balance: round8(Math.max(0, (parseFloat(row.hold_balance) || 0) - amount)) }
  }));
}

/** Atomically move a held amount (USD value) into the spendable HOWL balance (coins). */
export function releaseHold(supabase, userId, usd) {
  const amount = Number(usd) || 0;
  const howl = amount / HOWL_USD_RATE;
  return casUpdate(supabase, userId, (row) => ({
    patch: {
      hold_balance: round8(Math.max(0, (parseFloat(row.hold_balance) || 0) - amount)),
      coins: round4((parseFloat(row.coins) || 0) + howl),
      total_howl: round4((parseFloat(row.total_howl) || 0) + howl)
    }
  }));
}

/** Take back up to `howl` from the spendable balance (never goes negative). meta.taken = HOWL actually removed. */
export function debitHowlUpTo(supabase, userId, howl) {
  const want = Number(howl) || 0;
  return casUpdate(supabase, userId, (row) => {
    const coins = parseFloat(row.coins) || 0;
    const usd = parseFloat(row.balance) || 0;
    const available = coins + usd / HOWL_USD_RATE;
    const take = Math.min(want, Math.max(0, available));
    if (take <= 0) return { error: 'nothing_to_take', meta: { taken: 0 } };

    const fromCoins = Math.min(coins, take);
    const fromUsd = (take - fromCoins) * HOWL_USD_RATE;
    return {
      patch: { coins: round4(coins - fromCoins), balance: round4(Math.max(0, usd - fromUsd)) },
      meta: { taken: take }
    };
  });
}

/**
 * Release every held task older than HOLD_DAYS. Safe to call any time and from several
 * requests at once: each row is claimed atomically ('hold' -> 'releasing') so it is paid once.
 * The referrer's 10% commission is paid at release time (so it never needs clawing back).
 */
export async function releaseDueHolds(supabase, userId) {
  const uid = String(userId);
  const cutoff = new Date(Date.now() - HOLD_DAYS * 86400000).toISOString();

  const { data: due, error } = await supabase
    .from('transactions')
    .select('transaction_id')
    .eq('user_id', uid)
    .eq('status', 'hold')
    .lte('created_at', cutoff)
    .limit(50);
  if (error) throw error;
  if (!due || due.length === 0) return { releasedUsd: 0, count: 0 };

  let releasedUsd = 0, count = 0, referrerId = undefined;

  for (const d of due) {
    const { data: claimed } = await supabase
      .from('transactions')
      .update({ status: 'releasing' })
      .eq('user_id', uid).eq('transaction_id', d.transaction_id).eq('status', 'hold')
      .select('transaction_id, reward_amount');
    if (!claimed || claimed.length === 0) continue;          // someone else got it

    const usd = Math.abs(parseFloat(claimed[0].reward_amount) || 0);

    let ok = false;
    try { ok = (await releaseHold(supabase, uid, usd)).ok; } catch (e) { ok = false; }
    if (!ok) {                                               // undo the claim, try again later
      await supabase.from('transactions').update({ status: 'hold' })
        .eq('user_id', uid).eq('transaction_id', d.transaction_id).eq('status', 'releasing');
      continue;
    }

    await supabase.from('transactions')
      .update({ status: '1', task_type: 'TimeWall Survey' })
      .eq('user_id', uid).eq('transaction_id', d.transaction_id);

    releasedUsd += usd; count++;

    // Tell the user + the channel that the reward is approved
    await notifyTimewall({ userId: uid, kind: 'approved', howl: usd / HOWL_USD_RATE, txid: d.transaction_id, holdDays: HOLD_DAYS });

    // Referral commission (10%) now that the earning is final
    try {
      if (referrerId === undefined) {
        const { data: u } = await supabase.from('users').select('referred_by').eq('user_id', uid).maybeSingle();
        referrerId = u && u.referred_by ? String(u.referred_by) : null;
      }
      const commission = +(usd * 0.10).toFixed(6);
      if (referrerId && commission > 0) {
        const refTxId = `ref_timewall_${d.transaction_id}_${uid}`;
        const { data: dup } = await supabase.from('transactions').select('transaction_id')
          .eq('user_id', referrerId).eq('transaction_id', refTxId).maybeSingle();
        if (!dup) {
          const c = await creditUsd(supabase, referrerId, commission, { earned: true });
          if (c.ok) {
            await supabase.from('transactions').insert([{
              user_id: referrerId,
              reward_amount: commission,
              transaction_id: refTxId,
              task_type: 'Referral Offerwall Commission (10%)',
              status: '1',
              created_at: new Date().toISOString()
            }]);
          }
        }
      }
    } catch (e) {
      console.error('[release commission]', e.message);
    }
  }

  return { releasedUsd: +releasedUsd.toFixed(6), count };
}


/** Release due holds for every user (called by the daily cron). Stops after maxMs to stay inside the function timeout. */
export async function releaseAllDueHolds(supabase, { maxMs = 8000 } = {}) {
  const started = Date.now();
  const cutoff = new Date(Date.now() - HOLD_DAYS * 86400000).toISOString();

  const { data: rows, error } = await supabase
    .from('transactions').select('user_id')
    .eq('status', 'hold').lte('created_at', cutoff).limit(500);
  if (error) throw error;

  const users = [...new Set((rows || []).map(r => String(r.user_id)))];
  let processed = 0, released = 0, releasedUsd = 0;

  for (const uid of users) {
    if (Date.now() - started > maxMs) break;
    try {
      const r = await releaseDueHolds(supabase, uid);
      released += r.count; releasedUsd += r.releasedUsd; processed++;
    } catch (e) {
      console.error('[releaseAllDueHolds]', uid, e.message);
    }
  }
  return { usersWaiting: users.length, usersProcessed: processed, released, releasedUsd: +releasedUsd.toFixed(6) };
}


/* ------------------------------------------------------------------ */
/* Signed admin buttons: only this server (which knows BOT_TOKEN) can   */
/* create a valid Approve / Reject button, so a forged webhook call     */
/* pretending to be the admin is rejected.                              */
/* ------------------------------------------------------------------ */
export function signCallback(action, ts, botToken) {
  return crypto.createHmac('sha256', String(botToken)).update(`${action}_${ts}`).digest('hex').slice(0, 12);
}

export function verifyCallback(action, ts, sig, botToken) {
  if (!sig || !botToken) return false;
  const a = Buffer.from(signCallback(action, ts, botToken));
  const b = Buffer.from(String(sig));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
  }
