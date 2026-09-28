import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = (process.env.SUPABASE_URL || 'https://knrgbyezxjunjysaaukx.supabase.co').trim();
const SUPABASE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || '').trim();
const supabase = (SUPABASE_URL && SUPABASE_KEY) ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;

const ADMIN_IDS = ['8026237972'];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { initData, action, targetUserId, reason } = req.body || {};
  const BOT_TOKEN = (process.env.BOT_TOKEN || '').trim();

  if (!initData) return res.status(400).json({ success: false, error: 'Missing Telegram initData' });
  if (!BOT_TOKEN) return res.status(500).json({ success: false, error: 'Server misconfigured: BOT_TOKEN is missing.' });
  if (!supabase) return res.status(500).json({ success: false, error: 'Server misconfigured: Database connection missing.' });

  try {
    // 1. Verify Telegram signature
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    params.delete('hash');
    params.sort();

    const dataCheckString = Array.from(params.entries()).map(([k, v]) => `${k}=${v}`).join('\n');
    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
    const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

    if (calculatedHash !== hash) {
      return res.status(403).json({ success: false, error: 'Invalid security signature.' });
    }

    const userParam = params.get('user');
    if (!userParam) return res.status(400).json({ success: false, error: 'Missing user payload' });

    const userObj = JSON.parse(userParam);
    const callerIdStr = String(userObj.id);

    // 2. Strict Admin Authorization Check
    if (!ADMIN_IDS.includes(callerIdStr)) {
      return res.status(403).json({ success: false, error: 'Access denied: Admin credentials required.' });
    }

    if (!action) return res.status(400).json({ success: false, error: 'Missing action parameter.' });

    // 3. Handle Actions
    if (action === 'lookup') {
      if (!targetUserId) return res.status(400).json({ success: false, error: 'Missing targetUserId.' });
      const targetStr = String(targetUserId).trim();

      const { data: user, error: userErr } = await supabase
        .from('users')
        .select('*')
        .eq('user_id', targetStr)
        .maybeSingle();

      if (userErr) {
        return res.status(500).json({ success: false, error: userErr.message });
      }

      if (!user) {
        return res.status(200).json({
          success: true,
          found: false,
          message: `User ${targetStr} was not found in the database.`
        });
      }

      // Check latest manual ban record in transactions
      const { data: banRecords } = await supabase
        .from('transactions')
        .select('status, created_at')
        .eq('user_id', targetStr)
        .eq('task_type', 'ADMIN_BAN')
        .order('created_at', { ascending: false })
        .limit(1);

      const latestBanRecord = banRecords && banRecords[0] ? banRecords[0] : null;
      const isManuallyBanned = latestBanRecord && latestBanRecord.status === 'BANNED';
      const isManuallyUnbanned = latestBanRecord && latestBanRecord.status === 'UNBANNED';

      // Check device collision
      let deviceCollisions = [];
      if (user.fingerprint) {
        const { data: collisions } = await supabase
          .from('users')
          .select('user_id, name, created_at')
          .eq('fingerprint', user.fingerprint)
          .neq('user_id', targetStr);
        deviceCollisions = collisions || [];
      }

      const isColliding = deviceCollisions.length > 0;
      let effectiveStatus = 'active';
      if (ADMIN_IDS.includes(targetStr)) {
        effectiveStatus = 'admin_protected';
      } else if (isManuallyBanned) {
        effectiveStatus = 'banned_manual';
      } else if (isManuallyUnbanned) {
        effectiveStatus = 'unbanned_override';
      } else if (isColliding) {
        effectiveStatus = 'banned_multiaccount';
      }

      const HOWL_USD_RATE = 0.00002;
      const { data: allUserTxs } = await supabase
        .from('transactions')
        .select('reward_amount, task_type')
        .eq('user_id', targetStr)
        .not('task_type', 'eq', 'ADMIN_BAN');

      let ledgerHowlCoins = 0;
      let ledgerUsdt = 0;
      if (allUserTxs && allUserTxs.length > 0) {
        allUserTxs.forEach(tx => {
          const amt = parseFloat(tx.reward_amount) || 0;
          if (tx.task_type.includes('HOWL')) {
            ledgerHowlCoins += amt;
          } else {
            ledgerUsdt += amt;
          }
        });
      }

      const effectiveCoins = Math.max(parseFloat(user.coins) || 0, ledgerHowlCoins);
      const effectiveUsdt = Math.max(parseFloat(user.balance) || 0, ledgerUsdt);
      const convertedFromUsdt = effectiveUsdt > 0 ? (effectiveUsdt / HOWL_USD_RATE) : 0;
      const totalHowlBalance = Math.round(effectiveCoins + convertedFromUsdt);
      const totalUsdValue = +( (totalHowlBalance * HOWL_USD_RATE).toFixed(4) );

      return res.status(200).json({
        success: true,
        found: true,
        user: {
          user_id: user.user_id,
          name: user.name,
          photo_url: user.photo_url,
          balance: effectiveUsdt,
          coins: effectiveCoins,
          total_howl: totalHowlBalance,
          total_usd: totalUsdValue,
          total_earned: user.total_earned,
          created_at: user.created_at,
          last_seen: user.last_seen,
          fingerprint: user.fingerprint,
          referred_by: user.referred_by
        },
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

      if (banErr) {
        return res.status(500).json({ success: false, error: banErr.message });
      }

      return res.status(200).json({
        success: true,
        message: `User ${targetStr} has been successfully banned.`
      });
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

      if (unbanErr) {
        return res.status(500).json({ success: false, error: unbanErr.message });
      }

      // Also reset device fingerprint so collision is completely cleared
      try {
        await supabase
          .from('users')
          .update({ fingerprint: `unbanned_${Date.now()}_${targetStr}` })
          .eq('user_id', targetStr);
      } catch (e) {}

      return res.status(200).json({
        success: true,
        message: `User ${targetStr} has been unbanned and restored successfully.`
      });
    }

    return res.status(400).json({ success: false, error: `Unknown action: ${action}` });

  } catch (err) {
    console.error('[Admin Action Error]', err);
    return res.status(500).json({ success: false, error: err.message || 'Internal server error' });
  }
}
