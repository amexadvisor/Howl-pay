import { createClient } from '@supabase/supabase-js';
import { HOWL_USD_RATE, verifyInitData, creditHowl, creditUsd, getUserBalance } from '../lib/balance.js';

const SUPABASE_URL = (process.env.SUPABASE_URL || '').trim();
const SUPABASE_SERVICE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || '').trim();
const supabase = (SUPABASE_URL && SUPABASE_SERVICE_KEY) ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY) : null;

const ADMIN_IDS = ['8026237972'];
const DAILY_AD_LIMIT = 10;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Telegram-Init-Data');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { initData, check_status } = req.body || {};
  const BOT_TOKEN = process.env.BOT_TOKEN;
  if (!BOT_TOKEN || !supabase) return res.status(500).json({ error: 'Server configuration error.' });

  const rawInitData = initData || req.headers['x-telegram-init-data'];
  if (!rawInitData || typeof rawInitData !== 'string') {
    return res.status(401).json({ error: 'Unauthorized: Missing Telegram WebApp security context' });
  }

  const verified = verifyInitData(rawInitData, BOT_TOKEN);
  if (!verified) return res.status(403).json({ error: 'Forbidden: Invalid Telegram signature' });
  const targetUserIdStr = String(verified.user.id);

  // Lightweight live-refresh mode (used by balance-client.js polling). No rewards, no ban logic.
  if (req.body && req.body.balance_only) {
    try {
      return res.status(200).json({
        success: true,
        user_balance: await getUserBalance(supabase, targetUserIdStr)
      });
    } catch (e) {
      return res.status(500).json({ success: false, error: e.message });
    }
  }

  try {
    // ---- Ban / multi-account checks (unchanged behaviour) ----
    if (!ADMIN_IDS.includes(targetUserIdStr)) {
      const { data: adminBanRows } = await supabase.from('transactions').select('status')
        .eq('user_id', targetUserIdStr).eq('task_type', 'ADMIN_BAN')
        .order('created_at', { ascending: false }).limit(1);
      if (adminBanRows && adminBanRows[0] && adminBanRows[0].status === 'BANNED') {
        return res.status(403).json({ error: 'Account suspended by administrator.' });
      }

      const { data: currentAccount } = await supabase.from('users')
        .select('user_id, fingerprint, created_at').eq('user_id', targetUserIdStr).maybeSingle();
      if (currentAccount && currentAccount.fingerprint) {
        const { data: primaryAccount } = await supabase.from('users')
          .select('user_id, created_at')
          .eq('fingerprint', currentAccount.fingerprint)
          .neq('user_id', targetUserIdStr)
          .not('user_id', 'in', `(${ADMIN_IDS.join(',')})`)
          .order('created_at', { ascending: true })
          .limit(1).maybeSingle();

        if (primaryAccount && (new Date(currentAccount.created_at) >= new Date(primaryAccount.created_at))) {
          return res.status(403).json({ error: 'Account suspended due to multi-account policy.' });
        }
      }
    }

    // ---- Daily limit from ledger ----
    const startOfDay = new Date(); startOfDay.setUTCHours(0, 0, 0, 0);
    const endOfDay = new Date(); endOfDay.setUTCHours(23, 59, 59, 999);

    const { data: todaysAds } = await supabase.from('transactions').select('id')
      .eq('user_id', targetUserIdStr)
      .eq('task_type', 'Monetag Rewarded Ad')
      .gte('created_at', startOfDay.toISOString())
      .lte('created_at', endOfDay.toISOString());

    const todaysAdCount = todaysAds ? todaysAds.length : 0;

    let rewardHowl = 100 - (todaysAdCount * 10);   // 100, 90, 80 ...
    if (rewardHowl < 0) rewardHowl = 0;
    const rewardUsd = rewardHowl * HOWL_USD_RATE;

    // ---- Status sync (no reward) ----
    if (check_status) {
      return res.status(200).json({
        success: true,
        ads_watched: todaysAdCount,
        next_reward: rewardHowl,
        user_balance: await getUserBalance(supabase, targetUserIdStr)
      });
    }

    if (todaysAdCount >= DAILY_AD_LIMIT || rewardHowl <= 0) {
      return res.status(400).json({ error: 'Daily limit reached. Come back tomorrow!' });
    }

    // ---- Make sure the user row exists ----
    const { data: userRecord } = await supabase.from('users')
      .select('user_id, referred_by').eq('user_id', targetUserIdStr).maybeSingle();

    if (!userRecord) {
      await supabase.from('users').insert([{
        user_id: targetUserIdStr, coins: 0, balance: 0, total_howl: 0, total_earned: 0,
        created_at: new Date().toISOString()
      }]);
    }

    // ---- Reserve the ad slot in the ledger first, then credit ----
    const txId = `ad_${Date.now()}_${targetUserIdStr}`;
    const { error: txErr } = await supabase.from('transactions').insert([{
      user_id: targetUserIdStr,
      reward_amount: rewardUsd,
      transaction_id: txId,
      task_type: 'Monetag Rewarded Ad',
      status: '1',
      created_at: new Date().toISOString()
    }]);
    if (txErr) return res.status(500).json({ error: 'Ledger error: ' + txErr.message });

    // ---- ONE credit, in HOWL only (no more writing both coins AND balance) ----
    let credit;
    try {
      credit = await creditHowl(supabase, targetUserIdStr, rewardHowl);
    } catch (e) {
      console.error('[claim-bonus] credit failed:', e && (e.message || e.details || e));
      credit = { ok: false, reason: (e && (e.message || e.details)) || 'unknown error' };
    }
    if (!credit.ok) {
      await supabase.from('transactions').delete().eq('transaction_id', txId);
      return res.status(500).json({ error: 'Could not credit reward: ' + (credit.reason || 'unknown') });
    }

    // ---- Referral commission (10%, paid in USD to the referrer) ----
    if (userRecord && userRecord.referred_by) {
      const referrerId = String(userRecord.referred_by);
      const commissionUsd = rewardUsd * 0.10;

      const c = await creditUsd(supabase, referrerId, commissionUsd, { earned: true });
      if (c.ok) {
        await supabase.from('transactions').insert([{
          user_id: referrerId,
          reward_amount: commissionUsd,
          transaction_id: `ref_ad_comm_${Date.now()}_${targetUserIdStr}`,
          task_type: 'Referral Ad Commission (10%)',
          status: '1',
          created_at: new Date().toISOString()
        }]);

        const { count: completedAdsCount } = await supabase.from('transactions')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', targetUserIdStr).eq('task_type', 'Monetag Rewarded Ad');

        const { data: milestoneTx } = await supabase.from('transactions').select('user_id')
          .eq('user_id', referrerId)
          .ilike('task_type', '%10 Ads Milestone%')
          .ilike('transaction_id', `%${targetUserIdStr}%`)
          .maybeSingle();

        if ((completedAdsCount || 0) >= 10 && !milestoneTx) {
          const m = await creditHowl(supabase, referrerId, 500, { lifetime: false });
          if (m.ok) {
            await supabase.from('transactions').insert([{
              user_id: referrerId,
              reward_amount: 500, // stored in HOWL, same convention as the signup bonus
              transaction_id: `ref_milestone_10ads_${Date.now()}_${targetUserIdStr}`,
              task_type: 'Referral 10 Ads Milestone (500 HOWL)',
              status: '1',
              created_at: new Date().toISOString()
            }]);
          }
        }
      }
    }

    return res.status(200).json({
      success: true,
      reward_howl: rewardHowl,
      reward_usd: rewardUsd,
      ads_watched: todaysAdCount + 1,
      user_balance: credit.balance   // authoritative balance straight from the DB
    });
  } catch (dbErr) {
    return res.status(500).json({ error: 'Database error: ' + dbErr.message });
  }
      }
