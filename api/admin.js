import { createClient } from '@supabase/supabase-js';
import { HOWL_USD_RATE, verifyInitData, computeBalance } from '../lib/balance.js';

const SUPABASE_URL = (process.env.SUPABASE_URL || 'https://knrgbyezxjunjysaaukx.supabase.co').trim();
const SUPABASE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || '').trim();
const supabase = (SUPABASE_URL && SUPABASE_KEY) ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;

const ADMIN_IDS = ['8026237972'];

// Sum every Referral* ledger row for a user (paged, because Supabase caps a query at 1000 rows).
// HOWL-labelled rows are stored in HOWL, everything else in USD.
async function sumReferralEarnings(userId) {
  let howl = 0, usdt = 0, commissions = 0, signups = 0, milestones = 0;
  const size = 1000;
  for (let from = 0; from < 50000; from += size) {
    const { data, error } = await supabase
      .from('transactions')
      .select('reward_amount, task_type')
      .eq('user_id', userId)
      .ilike('task_type', 'Referral%')
      .order('id', { ascending: true })
      .range(from, from + size - 1);
    if (error || !data || data.length === 0) break;

    for (const tx of data) {
      const amt = parseFloat(tx.reward_amount) || 0;
      const type = String(tx.task_type || '');
      if (type.includes('HOWL')) {
        howl += amt;
        if (type.includes('Signup')) signups++;
        if (type.includes('Milestone')) milestones++;
      } else {
        usdt += amt;
        commissions++;
      }
    }
    if (data.length < size) break;
  }
  return { howl, usdt, commissions, signups, milestones };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { initData, action, targetUserId } = req.body || {};
  const BOT_TOKEN = (process.env.BOT_TOKEN || '').trim();

  if (!initData) return res.status(400).json({ success: false, error: 'Missing Telegram initData' });
  if (!BOT_TOKEN) return res.status(500).json({ success: false, error: 'Server misconfigured: BOT_TOKEN is missing.' });
  if (!supabase) return res.status(500).json({ success: false, error: 'Server misconfigured: Database connection missing.' });

  try {
    // 1. Verify Telegram signature (shared helper)
    const verified = verifyInitData(initData, BOT_TOKEN);
    if (!verified) return res.status(403).json({ success: false, error: 'Invalid security signature.' });

    // 2. Strict admin authorization
    const callerIdStr = String(verified.user.id);
    if (!ADMIN_IDS.includes(callerIdStr)) {
      return res.status(403).json({ success: false, error: 'Access denied: Admin credentials required.' });
    }

    if (!action) return res.status(400).json({ success: false, error: 'Missing action parameter.' });

    // 3. Actions
    if (action === 'lookup') {
      if (!targetUserId) return res.status(400).json({ success: false, error: 'Missing targetUserId.' });
      const targetStr = String(targetUserId).trim();

      const { data: user, error: userErr } = await supabase
        .from('users').select('*').eq('user_id', targetStr).maybeSingle();

      if (userErr) return res.status(500).json({ success: false, error: userErr.message });
      if (!user) {
        return res.status(200).json({
          success: true, found: false,
          message: `User ${targetStr} was not found in the database.`
        });
      }

      const startOfDay = new Date();
      startOfDay.setUTCHours(0, 0, 0, 0);

      // Everything else in parallel
      const [
        banRes, collRes, refCountRes, refUsersRes, adsTotalRes, adsTodayRes,
        wdRes, recentTxRes, referrerRes, refEarnings
      ] = await Promise.all([
        supabase.from('transactions').select('status, created_at')
          .eq('user_id', targetStr).eq('task_type', 'ADMIN_BAN')
          .order('created_at', { ascending: false }).limit(1),

        user.fingerprint
          ? supabase.from('users').select('user_id, name, created_at')
              .eq('fingerprint', user.fingerprint).neq('user_id', targetStr)
          : Promise.resolve({ data: [] }),

        supabase.from('users').select('*', { count: 'exact', head: true }).eq('referred_by', targetStr),

        supabase.from('users').select('user_id, name, created_at')
          .eq('referred_by', targetStr).order('created_at', { ascending: false }).limit(200),

        supabase.from('transactions').select('*', { count: 'exact', head: true })
          .eq('user_id', targetStr).eq('task_type', 'Monetag Rewarded Ad'),

        supabase.from('transactions').select('*', { count: 'exact', head: true })
          .eq('user_id', targetStr).eq('task_type', 'Monetag Rewarded Ad')
          .gte('created_at', startOfDay.toISOString()),

        supabase.from('transactions').select('reward_amount, status')
          .eq('user_id', targetStr).like('task_type', 'BEP20 Withdrawal%'),

        supabase.from('transactions').select('task_type, reward_amount, status, created_at')
          .eq('user_id', targetStr)
          .not('task_type', 'eq', 'ADMIN_BAN')
          .not('task_type', 'like', 'SYSTEM_%')
          .order('created_at', { ascending: false }).limit(8),

        user.referred_by
          ? supabase.from('users').select('user_id, name').eq('user_id', String(user.referred_by)).maybeSingle()
          : Promise.resolve({ data: null }),

        sumReferralEarnings(targetStr)
      ]);

      // --- Ban / collision status ---
      const latestBanRecord = banRes.data && banRes.data[0] ? banRes.data[0] : null;
      const isManuallyBanned = !!(latestBanRecord && latestBanRecord.status === 'BANNED');
      const isManuallyUnbanned = !!(latestBanRecord && latestBanRecord.status === 'UNBANNED');
      const deviceCollisions = collRes.data || [];

      let effectiveStatus = 'active';
      if (ADMIN_IDS.includes(targetStr)) effectiveStatus = 'admin_protected';
      else if (isManuallyBanned) effectiveStatus = 'banned_manual';
      else if (isManuallyUnbanned) effectiveStatus = 'unbanned_override';
      else if (deviceCollisions.length > 0) effectiveStatus = 'banned_multiaccount';

      // --- Balance: SAME formula as every other endpoint ---
      const bal = computeBalance(user);

      // --- Referrals ---
      const referredUsers = refUsersRes.data || [];
      let activeReferrals = 0;
      if (referredUsers.length > 0) {
        const ids = referredUsers.map(r => String(r.user_id));
        const { data: adRows } = await supabase
          .from('transactions').select('user_id')
          .in('user_id', ids).eq('task_type', 'Monetag Rewarded Ad').limit(5000);
        activeReferrals = new Set((adRows || []).map(r => String(r.user_id))).size;
      }
      const refTotalUsd = (refEarnings.howl * HOWL_USD_RATE) + refEarnings.usdt;

      // --- Withdrawals ---
      let wdPendingUsd = 0, wdPaidUsd = 0, wdRejected = 0;
      const wdRows = wdRes.data || [];
      wdRows.forEach(w => {
        const usd = Math.abs(parseFloat(w.reward_amount) || 0);
        if (w.status === 'pending' || w.status === 'processing') wdPendingUsd += usd;
        else if (w.status === 'approved') wdPaidUsd += usd;
        else wdRejected++;
      });

      return res.status(200).json({
        success: true,
        found: true,
        user: {
          user_id: user.user_id,
          name: user.name,
          photo_url: user.photo_url,
          // spendable balance (single source of truth)
          total_howl: bal.total_howl,
          total_usd: bal.total_usd,
          coins: bal.coins,
          balance: bal.usdt_earnings,
          // lifetime counters
          lifetime_howl: parseFloat(user.total_howl) || 0,
          total_earned: parseFloat(user.total_earned) || 0,
          created_at: user.created_at,
          last_seen: user.last_seen,
          fingerprint: user.fingerprint,
          referred_by: user.referred_by
        },
        referrals: {
          total: refCountRes.count || 0,
          active: activeReferrals,
          active_sample_size: referredUsers.length,
          referrer: referrerRes.data ? { user_id: referrerRes.data.user_id, name: referrerRes.data.name } : null,
          howl_earned: Math.round(refEarnings.howl),
          usdt_earned: +refEarnings.usdt.toFixed(4),
          total_usd_earned: +refTotalUsd.toFixed(4),
          commission_count: refEarnings.commissions,
          signup_bonuses: refEarnings.signups,
          milestones: refEarnings.milestones,
          recent: referredUsers.slice(0, 5)
        },
        activity: {
          ads_today: adsTodayRes.count || 0,
          ads_total: adsTotalRes.count || 0,
          ads_daily_limit: 10
        },
        withdrawals: {
          requests: wdRows.length,
          pending_usd: +wdPendingUsd.toFixed(4),
          paid_usd: +wdPaidUsd.toFixed(4),
          rejected: wdRejected
        },
        recent_transactions: recentTxRes.data || [],
        status: effectiveStatus,
        is_manually_banned: isManuallyBanned,
        is_manually_unbanned: isManuallyUnbanned,
        device_collisions: deviceCollisions
      });
    }

    if (action === 'ban') {
      if (!targetUserId) return res.status(400).json({ success: false, error: 'Missing targetUserId.' });
      const targetStr = String(targetUserId).trim();

      if (ADMIN_IDS.includes(targetStr)) {
        return res.status(400).json({ success: false, error: 'Cannot ban an administrator account.' });
      }

      const { error: banErr } = await supabase.from('transactions').insert([{
        user_id: targetStr,
        reward_amount: 0,
        transaction_id: `admin_ban_${Date.now()}_${targetStr}`,
        task_type: 'ADMIN_BAN',
        status: 'BANNED',
        created_at: new Date().toISOString()
      }]);

      if (banErr) return res.status(500).json({ success: false, error: banErr.message });

      return res.status(200).json({ success: true, message: `User ${targetStr} has been successfully banned.` });
    }

    if (action === 'unban') {
      if (!targetUserId) return res.status(400).json({ success: false, error: 'Missing targetUserId.' });
      const targetStr = String(targetUserId).trim();

      const { error: unbanErr } = await supabase.from('transactions').insert([{
        user_id: targetStr,
        reward_amount: 0,
        transaction_id: `admin_unban_${Date.now()}_${targetStr}`,
        task_type: 'ADMIN_BAN',
        status: 'UNBANNED',
        created_at: new Date().toISOString()
      }]);

      if (unbanErr) return res.status(500).json({ success: false, error: unbanErr.message });

      // Reset device fingerprint so the collision is completely cleared
      try {
        await supabase.from('users')
          .update({ fingerprint: `unbanned_${Date.now()}_${targetStr}` })
          .eq('user_id', targetStr);
      } catch (e) {}

      return res.status(200).json({ success: true, message: `User ${targetStr} has been unbanned and restored successfully.` });
    }

    return res.status(400).json({ success: false, error: `Unknown action: ${action}` });

  } catch (err) {
    console.error('[Admin Action Error]', err);
    return res.status(500).json({ success: false, error: err.message || 'Internal server error' });
  }
    }
