import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = (process.env.SUPABASE_URL || '').trim();
const SUPABASE_SERVICE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || '').trim(); 
const supabase = (SUPABASE_URL && SUPABASE_SERVICE_KEY) ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY) : null;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Telegram-Init-Data');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { initData } = req.body || {};
  const BOT_TOKEN = process.env.BOT_TOKEN;

  if (!BOT_TOKEN || !supabase) {
    return res.status(500).json({ error: "Server configuration error." });
  }

  const rawInitData = initData || req.headers['x-telegram-init-data'];
  let targetUserIdStr = null;

  // 1. SECURITY: Telegram Signature Validation
  if (!rawInitData || typeof rawInitData !== 'string') {
    return res.status(401).json({ error: "Unauthorized: Missing Telegram WebApp security context" });
  }

  try {
    const params = new URLSearchParams(rawInitData);
    const hash = params.get('hash');

    if (!hash) return res.status(401).json({ error: "Unauthorized: Missing signature hash" });

    params.delete('hash');
    params.sort();

    const dataCheckArr = [];
    for (const [key, value] of params.entries()) {
      dataCheckArr.push(`${key}=${value}`);
    }
    const dataCheckString = dataCheckArr.join('\n');

    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
    const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

    if (calculatedHash !== hash) {
      return res.status(403).json({ error: "Forbidden: Invalid Telegram signature" });
    }

    const userStr = params.get('user');
    if (userStr) {
      const parsed = JSON.parse(userStr);
      if (parsed && parsed.id) {
        targetUserIdStr = String(parsed.id);
      }
    }
  } catch (e) {
    return res.status(400).json({ error: "Bad Request: " + e.message });
  }

  if (!targetUserIdStr) {
    return res.status(400).json({ error: "Missing user identification." });
  }

  let currentRewardHowl = 0;
  let currentRewardUsd = 0;

  try {
    // 2. ANTI-FRAUD & BAN CHECKS
    const ADMIN_IDS = ['8026237972'];
    
    if (!ADMIN_IDS.includes(targetUserIdStr)) {
      const { data: adminBanRows } = await supabase
        .from('transactions')
        .select('status')
        .eq('user_id', targetUserIdStr)
        .eq('task_type', 'ADMIN_BAN')
        .order('created_at', { ascending: false })
        .limit(1);

      if (adminBanRows && adminBanRows[0] && adminBanRows[0].status === 'BANNED') {
        return res.status(403).json({ error: "Account suspended by administrator." });
      }

      const { data: currentAccount } = await supabase.from('users').select('user_id, fingerprint, created_at').eq('user_id', targetUserIdStr).maybeSingle();
      if (currentAccount && currentAccount.fingerprint) {
        const { data: primaryAccount } = await supabase.from('users')
          .select('user_id, created_at')
          .eq('fingerprint', currentAccount.fingerprint)
          .neq('user_id', targetUserIdStr)
          .not('user_id', 'in', `(${ADMIN_IDS.join(',')})`)
          .order('created_at', { ascending: true })
          .limit(1).maybeSingle();

        if (primaryAccount && (new Date(currentAccount.created_at) >= new Date(primaryAccount.created_at))) {
          return res.status(403).json({ error: "Account suspended due to multi-account policy." });
        }
      }
    }

    // 3. CALCULATE DAILY REWARD LIMIT (100 down to 10 HOWL)
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);
    const endOfDay = new Date();
    endOfDay.setUTCHours(23, 59, 59, 999);

    const { data: todaysAds } = await supabase
      .from('transactions')
      .select('id')
      .eq('user_id', targetUserIdStr)
      .eq('task_type', 'Monetag Rewarded Ad')
      .gte('created_at', startOfDay.toISOString())
      .lte('created_at', endOfDay.toISOString());

    const todaysAdCount = todaysAds ? todaysAds.length : 0;

    if (todaysAdCount >= 10) {
      return res.status(400).json({ error: "Daily limit reached. Come back tomorrow!" });
    }

    // Math: 100 for 0th ad, 90 for 1st ad, etc.
    currentRewardHowl = 100 - (todaysAdCount * 10);
    currentRewardUsd = currentRewardHowl * 0.00002;

    // 4. UPDATE USER BALANCE
    const { data: userRecord } = await supabase.from('users').select('*').eq('user_id', targetUserIdStr).maybeSingle();
    if (userRecord) {
        await supabase.from('users').update({
            coins: (parseFloat(userRecord.coins || 0) + currentRewardHowl),
            total_howl: (parseFloat(userRecord.total_howl || 0) + currentRewardHowl),
            balance: (parseFloat(userRecord.balance || 0) + currentRewardUsd)
        }).eq('user_id', targetUserIdStr);
    } else {
        await supabase.from('users').insert([{
            user_id: targetUserIdStr,
            coins: currentRewardHowl,
            total_howl: currentRewardHowl,
            balance: currentRewardUsd
        }]);
    }

    // 5. INSERT TRANSACTION
    await supabase.from('transactions').insert([{
      user_id: targetUserIdStr,
      reward_amount: currentRewardUsd,
      transaction_id: `ad_${Date.now()}_${targetUserIdStr}`,
      task_type: 'Monetag Rewarded Ad',
      status: '1',
      created_at: new Date().toISOString()
    }]);

    // 6. REFERRAL COMMISSIONS & MILESTONES
    if (userRecord && userRecord.referred_by) {
      const referrerId = String(userRecord.referred_by);
      const commissionUsd = currentRewardUsd * 0.10; // 10% lifetime

      const { data: refUser } = await supabase.from('users').select('user_id, balance, total_earned, coins').eq('user_id', referrerId).maybeSingle();
      if (refUser) {
        await supabase.from('users').update({
          balance: (parseFloat(refUser.balance) || 0) + commissionUsd,
          total_earned: (parseFloat(refUser.total_earned) || 0) + commissionUsd
        }).eq('user_id', referrerId);

        await supabase.from('transactions').insert([{
          user_id: referrerId,
          reward_amount: commissionUsd,
          transaction_id: `ref_ad_comm_${Date.now()}_${targetUserIdStr}`,
          task_type: 'Referral Ad Commission (10%)',
          status: '1',
          created_at: new Date().toISOString()
        }]);

        const { count: completedAdsCount } = await supabase.from('transactions').select('*', { count: 'exact', head: true }).eq('user_id', targetUserIdStr).eq('task_type', 'Monetag Rewarded Ad');
        const { data: milestoneTx } = await supabase.from('transactions').select('user_id').eq('user_id', referrerId).ilike('task_type', '%10 Ads Milestone%').ilike('transaction_id', `%${targetUserIdStr}%`).maybeSingle();

        if ((completedAdsCount || 0) >= 10 && !milestoneTx) {
          await supabase.from('users').update({ coins: (parseFloat(refUser.coins) || 0) + 500 }).eq('user_id', referrerId);
          await supabase.from('transactions').insert([{
            user_id: referrerId,
            reward_amount: 0.01, // 500 HOWL = $0.01
            transaction_id: `ref_milestone_10ads_${Date.now()}_${targetUserIdStr}`,
            task_type: 'Referral 10 Ads Milestone (500 HOWL)',
            status: '1',
            created_at: new Date().toISOString()
          }]);
        }
      }
    }
  } catch (dbErr) {
    return res.status(500).json({ error: "Database error: " + dbErr.message });
  }

  // 7. RETURN DYNAMIC REWARD TO FRONTEND
  return res.status(200).json({
    success: true,
    reward_howl: currentRewardHowl,
    reward_usd: currentRewardUsd
  });
}
