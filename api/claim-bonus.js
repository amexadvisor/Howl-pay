import { createClient } from '@supabase/supabase-js';
import { HOWL_USD_RATE, verifyInitData, creditHowl, creditUsd, getUserBalance } from '../lib/balance.js';
import { AD_PROVIDERS, getAdConfig, rewardFor, adStatusFor } from '../lib/adconfig.js';

const SUPABASE_URL = (process.env.SUPABASE_URL || '').trim();
const SUPABASE_SERVICE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || '').trim();
const supabase = (SUPABASE_URL && SUPABASE_SERVICE_KEY) ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY) : null;

const ADMIN_IDS = ['8026237972'];
const MIN_GAP_MS = 4000;   // minimum time between two claims of the same ad type

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Telegram-Init-Data');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { initData, check_status, provider: rawProvider } = req.body || {};
  const provider = rawProvider === 'adsgram' ? 'adsgram' : 'monetag';
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

      const adminOverride = !!(adminBanRows && adminBanRows[0] && adminBanRows[0].status === 'UNBANNED');
      const { data: currentAccount } = await supabase.from('users')
        .select('user_id, fingerprint, created_at').eq('user_id', targetUserIdStr).maybeSingle();
      if (!adminOverride && currentAccount && currentAccount.fingerprint) {
        const { data: primaryAccount } = await supabase.from('users')
          .select('user_id, created_at')
          .eq('fingerprint', currentAccount.fingerprint)
          .neq('user_id', targetUserIdStr)
          .order('created_at', { ascending: true })
          .limit(1).maybeSingle();

        if (primaryAccount && (ADMIN_IDS.includes(String(primaryAccount.user_id)) || new Date(currentAccount.created_at) >= new Date(primaryAccount.created_at))) {
          return res.status(403).json({ error: 'Account suspended due to multi-account policy.' });
        }
      }
    }

    // ---- Admin-controlled settings: start / step / daily limit for each ad type ----
    const cfg = await getAdConfig(supabase);

    const startOfDay = new Date(); startOfDay.setUTCHours(0, 0, 0, 0);
    const countToday = async (taskType) => {
      const { count } = await supabase.from('transactions').select('*', { count: 'exact', head: true })
        .eq('user_id', targetUserIdStr).eq('task_type', taskType)
        .gte('created_at', startOfDay.toISOString());
      return count || 0;
    };

    const keys = Object.keys(AD_PROVIDERS);
    const counts = await Promise.all(keys.map(k => countToday(AD_PROVIDERS[k].taskType)));
    const ads = {};
    keys.forEach((k, i) => { ads[k] = adStatusFor(cfg, k, counts[i]); });

    // ---- Status sync (no reward) ----
    if (check_status) {
      return res.status(200).json({
        success: true,
        ads,
        ads_watched: ads.monetag.watched,          // kept for older clients
        next_reward: ads.monetag.next_reward,
        user_balance: await getUserBalance(supabase, targetUserIdStr)
      });
    }

    const p = cfg[provider];
    const taskType = AD_PROVIDERS[provider].taskType;
    const limitReached = () => res.status(400).json({ error: 'Daily limit reached. Come back tomorrow!', ads });

    if (p.limit <= 0 || ads[provider].watched >= p.limit || rewardFor(p, ads[provider].watched) <= 0) {
      return res.status(400).json({ error: 'Daily limit reached. Come back tomorrow!', ads });
    }

    // ---- Too-fast guard (scripts hammering the endpoint) ----
    const { data: lastRows } = await supabase.from('transactions').select('created_at')
      .eq('user_id', targetUserIdStr).eq('task_type', taskType)
      .order('created_at', { ascending: false }).limit(1);
    if (lastRows && lastRows[0] && (Date.now() - new Date(lastRows[0].created_at).getTime()) < MIN_GAP_MS) {
      return res.status(429).json({ error: 'Too fast. Please wait a few seconds.', ads });
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

    // ---- Reserve the slot FIRST, then re-count. Many simultaneous requests can never get past the daily limit:
    //      if the re-count is above the limit this request is cancelled. ----
    const txId = `ad_${provider}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}_${targetUserIdStr}`;
    const { error: txErr } = await supabase.from('transactions').insert([{
      user_id: targetUserIdStr,
      reward_amount: 0,                 // filled in below once the slot position is final
      transaction_id: txId,
      task_type: taskType,
      status: '1',
      created_at: new Date().toISOString()
    }]);
    if (txErr) return res.status(500).json({ error: 'Ledger error: ' + txErr.message });

    const position = await countToday(taskType);              // includes this request
    const rewardHowl = rewardFor(p, position - 1);            // 1st ad = start, 2nd = start - step, ...
    if (position > p.limit || rewardHowl <= 0) {
      await supabase.from('transactions').delete().eq('transaction_id', txId);
      return limitReached();
    }
    const rewardUsd = rewardHowl * HOWL_USD_RATE;
    await supabase.from('transactions').update({ reward_amount: rewardUsd }).eq('transaction_id', txId);

    // ---- ONE credit, in HOWL ----
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

    // ---- Referral commission (10%, paid in USD to the referrer) - both ad types ----
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

        // "10 ads" milestone keeps counting Monetag ads only (unchanged behaviour)
        if (provider === 'monetag') {
          const { count: completedAdsCount } = await supabase.from('transactions')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', targetUserIdStr).eq('task_type', AD_PROVIDERS.monetag.taskType);

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
    }

    ads[provider] = adStatusFor(cfg, provider, position);

    return res.status(200).json({
      success: true,
      provider,
      reward_howl: rewardHowl,
      reward_usd: rewardUsd,
      ads_watched: position,
      ads,
      user_balance: credit.balance   // authoritative balance straight from the DB
    });
  } catch (dbErr) {
    return res.status(500).json({ error: 'Database error: ' + dbErr.message });
  }
      }
