import crypto from 'crypto';

export const HOWL_USD_RATE = 0.00002;

const round4 = (n) => Math.round((Number(n) || 0) * 10000) / 10000;

/* ------------------------------------------------------------------ */
/* Telegram initData verification (shared by every endpoint)           */
/* ------------------------------------------------------------------ */
export function verifyInitData(initData, botToken) {
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
  const total_howl = Math.max(0, Math.round(coins + usd / HOWL_USD_RATE));
  return {
    total_howl,
    total_usd: +(total_howl * HOWL_USD_RATE).toFixed(4),
    coins,
    usdt_earnings: +usd.toFixed(4),
    rate: HOWL_USD_RATE
  };
}

export async function getUserBalance(supabase, userId) {
  const { data, error } = await supabase
    .from('users')
    .select('coins, balance')
    .eq('user_id', String(userId))
    .maybeSingle();
  if (error) throw error;
  return computeBalance(data);
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

    const { data: updated, error: upErr } = await q.select('coins, balance').maybeSingle();
    if (upErr) throw upErr;
    if (updated) return { ok: true, balance: computeBalance(updated) };

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
    const patch = { balance: round4((parseFloat(row.balance) || 0) + amount) };
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
