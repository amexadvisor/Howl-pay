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
  
  const { initData, fingerprint, startParam, isLocalMulti, syncOnly } = req.body || {};
  const BOT_TOKEN = (process.env.BOT_TOKEN || '').trim();

  if (!initData) return res.status(200).json({ success: false, error: 'Missing Telegram initData' });
  if (!BOT_TOKEN) return res.status(200).json({ success: false, error: 'Server misconfigured: BOT_TOKEN is missing.' });
  if (!supabase) return res.status(200).json({ success: false, error: 'Server misconfigured: Supabase connection missing.' });

  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    params.delete('hash');
    params.sort();
    
    const dataCheckString = Array.from(params.entries()).map(([k, v]) => `${k}=${v}`).join('\n');
    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
    const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

    if (calculatedHash !== hash) {
      return res.status(200).json({ success: false, error: 'Invalid Telegram security signature.' });
    }

    const userParam = params.get('user');
    if (!userParam) return res.status(400).json({ error: 'Missing user payload' });

    const userObj = JSON.parse(userParam);
    const userIdStr = String(userObj.id);
    const fullName = (userObj.first_name + ' ' + (userObj.last_name || '')).trim() || 'Telegram User';
    const photoUrl = userObj.photo_url || null;

    function getClientIp(req) {
      let ip = null;
      const forwarded = req.headers['x-forwarded-for'];
      if (forwarded) {
        ip = forwarded.split(',')[0].trim();
      } else if (req.headers['x-real-ip']) {
        ip = req.headers['x-real-ip'].trim();
      } else if (req.socket?.remoteAddress) {
        ip = req.socket.remoteAddress.trim();
      }
      if (ip && ip.startsWith('::ffff:')) {
        ip = ip.substring(7);
      }
      return ip || null;
    }

    const clientIp = getClientIp(req);
    const IP_WINDOW_MINUTES = 20;
    const ipWindowThreshold = new Date(Date.now() - IP_WINDOW_MINUTES * 60 * 1000).toISOString();

    const clientFingerprint = typeof fingerprint === 'string' ? fingerprint.trim() : null;

    // Check if user already exists in DB
    const { data: existingUser } = await supabase
      .from('users')
      .select('*')
      .eq('user_id', userIdStr)
      .maybeSingle();

    function isOlderAccount(current, other) {
      if (!current) return false;
      if (!other) return true;
      const currentCreated = current.created_at ? new Date(current.created_at).getTime() : null;
      const otherCreated = other.created_at ? new Date(other.created_at).getTime() : null;
      if (currentCreated && otherCreated && !isNaN(currentCreated) && !isNaN(otherCreated)) {
        return currentCreated < otherCreated;
      }
      if (currentCreated && !isNaN(currentCreated)) return true;
      if (otherCreated && !isNaN(otherCreated)) return false;
      const currentNum = parseInt(current.user_id, 10);
      const otherNum = parseInt(other.user_id, 10);
      if (!isNaN(currentNum) && !isNaN(otherNum)) {
        return currentNum < otherNum;
      }
      return false;
    }

    const isAdmin = ADMIN_IDS.includes(userIdStr);

    if (!syncOnly) {
      // Multi-Account & Ban Verification (Admins are 100% exempt)
      if (!isAdmin) {
        // 1. Manual Admin Ban Check from transactions table
        const { data: adminBanRows } = await supabase
          .from('transactions')
          .select('status')
          .eq('user_id', userIdStr)
          .eq('task_type', 'ADMIN_BAN')
          .order('created_at', { ascending: false })
          .limit(1);

        const latestBanStatus = adminBanRows && adminBanRows[0] ? adminBanRows[0].status : null;
        if (latestBanStatus === 'BANNED') {
          return res.status(200).json({
            success: false,
            banned: true,
            ban_reason: 'Your account has been suspended by an administrator.'
          });
        }

        // 2. Multi-Account Device & 20-min IP Verification
        if (latestBanStatus !== 'UNBANNED') {
          if (isLocalMulti) {
            return res.status(200).json({
              success: false,
              banned: true,
              ban_reason: 'Multiple accounts detected on this device. Only your original account is permitted.'
            });
          }

          let primaryAccount = null;
          let isIpMatch = false;

          if (clientFingerprint) {
            const { data: deviceMatch } = await supabase
              .from('users')
              .select('user_id, created_at')
              .eq('fingerprint', clientFingerprint)
              .neq('user_id', userIdStr)
              .not('user_id', 'in', `(${ADMIN_IDS.join(',')})`)
              .order('created_at', { ascending: true })
              .limit(1)
              .maybeSingle();

            if (deviceMatch) primaryAccount = deviceMatch;
          }

          if (!primaryAccount && clientIp && clientIp !== '127.0.0.1' && clientIp !== 'localhost') {
            const { data: recentIpTxs } = await supabase
              .from('transactions')
              .select('user_id, created_at')
              .eq('task_type', 'SYSTEM_IP_LOG')
              .eq('status', clientIp)
              .neq('user_id', userIdStr)
              .not('user_id', 'in', `(${ADMIN_IDS.join(',')})`)
              .gt('created_at', ipWindowThreshold)
              .order('created_at', { ascending: true })
              .limit(1);

            if (recentIpTxs && recentIpTxs.length > 0) {
              primaryAccount = recentIpTxs[0];
              isIpMatch = true;
            }
          }

          if (primaryAccount) {
            const isCurrentOlder = isOlderAccount(existingUser, primaryAccount);
            if (!isCurrentOlder) {
              const reason = isIpMatch
                ? 'Multiple accounts detected from this network/device within the cooldown window (20 mins). Only your original account is permitted.'
                : 'Multiple accounts detected on this device. Only your original account is permitted.';
              
              try {
                await supabase.from('users').upsert({
                  user_id: userIdStr,
                  name: fullName,
                  photo_url: photoUrl,
                  fingerprint: clientFingerprint,
                  last_seen: new Date().toISOString()
                }, { onConflict: 'user_id' });
              } catch (e) {}

              return res.status(200).json({
                success: false,
                banned: true,
                ban_reason: reason
              });
            }
          }
        }
      }

      let finalReferrer = null;

      if (!existingUser) {
        const rawStartParam = params.get('start_param') || startParam || '';
        let cleanRef = String(rawStartParam).trim();
        if (cleanRef.startsWith('ref_')) cleanRef = cleanRef.substring(4);

        if (cleanRef && cleanRef !== userIdStr) {
          const { data: referrer } = await supabase
            .from('users')
            .select('user_id, last_seen, fingerprint, coins')
            .eq('user_id', cleanRef)
            .maybeSingle();

          if (referrer) {
            const isSameDevice = Boolean(clientFingerprint && referrer.fingerprint && clientFingerprint === referrer.fingerprint);

            let isSameIpRecent = false;
            if (clientIp && clientIp !== '127.0.0.1' && clientIp !== 'localhost') {
              const { data: refIpTxs } = await supabase
                .from('transactions')
                .select('id')
                .eq('task_type', 'SYSTEM_IP_LOG')
                .eq('status', clientIp)
                .eq('user_id', cleanRef)
                .gt('created_at', ipWindowThreshold)
                .limit(1);
              if (refIpTxs && refIpTxs.length > 0) isSameIpRecent = true;
            }

            if (!isSameDevice && !isSameIpRecent) {
              finalReferrer = cleanRef;
              const currentCoins = parseFloat(referrer.coins) || 0;
              await supabase.from('users').update({ coins: currentCoins + 250 }).eq('user_id', cleanRef);

              await supabase.from('transactions').insert([{
                user_id: String(cleanRef),
                reward_amount: 250,
                transaction_id: `ref_join_${Date.now()}_${userIdStr}`,
                task_type: 'Referral Signup Bonus (250 HOWL)',
                status: '1',
                created_at: new Date().toISOString()
              }]);
            }
          }
        }

        await supabase.from('users').insert([{
          user_id: userIdStr,
          name: fullName,
          photo_url: photoUrl,
          referred_by: finalReferrer,
          fingerprint: clientFingerprint,
          balance: 0.0000,
          coins: 0.00,
          total_earned: 0.0000,
          created_at: new Date().toISOString(),
          last_seen: new Date().toISOString()
        }]);

      } else {
        const updatePayload = {
          name: fullName,
          photo_url: photoUrl || existingUser.photo_url,
          last_seen: new Date().toISOString()
        };
        if (clientFingerprint) updatePayload.fingerprint = clientFingerprint;

        await supabase.from('users').update(updatePayload).eq('user_id', userIdStr);
      }
    }

    if (clientIp && clientIp !== '127.0.0.1' && clientIp !== 'localhost') {
      try {
        const tenMinsAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
        const { data: selfIpLog } = await supabase
          .from('transactions')
          .select('id')
          .eq('user_id', userIdStr)
          .eq('task_type', 'SYSTEM_IP_LOG')
          .gt('created_at', tenMinsAgo)
          .limit(1);

        if (!selfIpLog || selfIpLog.length === 0) {
          await supabase.from('transactions').insert([{
            user_id: userIdStr,
            reward_amount: 0,
            transaction_id: `ip_${userIdStr}_${Date.now()}`,
            task_type: 'SYSTEM_IP_LOG',
            status: clientIp,
            created_at: new Date().toISOString()
          }]);
        }
      } catch (ipLogErr) {}
    }

    // 3. FETCH REFERRAL STATS FOR THIS USER
    const { count: friendsCount } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true })
      .eq('referred_by', userIdStr);

    const { data: refTxs } = await supabase
      .from('transactions')
      .select('reward_amount, task_type')
      .eq('user_id', userIdStr)
      .ilike('task_type', 'Referral%');

    let totalHowlEarned = 0;
    let totalUsdtEarned = 0;

    if (refTxs && refTxs.length > 0) {
      refTxs.forEach(tx => {
        const amt = parseFloat(tx.reward_amount) || 0;
        if (tx.task_type.includes('HOWL')) {
          totalHowlEarned += amt;
        } else {
          totalUsdtEarned += amt;
        }
      });
    }

    const HOWL_USD_RATE = 0.00002;
    const totalReferralUsdtEquivalent = (totalHowlEarned * HOWL_USD_RATE) + totalUsdtEarned;

    // 4. FETCH USER BALANCE & COINS (FIXED: Uses actual current database record safely without forcing historical max)
    const { data: currentUserData } = await supabase
      .from('users')
      .select('balance, coins, total_earned')
      .eq('user_id', userIdStr)
      .maybeSingle();

    const storedCoins = parseFloat(currentUserData?.coins) || 0;
    const storedBalance = parseFloat(currentUserData?.balance) || 0;

    const convertedFromUsdt = storedBalance > 0 ? (storedBalance / HOWL_USD_RATE) : 0;
    const totalHowlBalance = Math.round(storedCoins + convertedFromUsdt);
    const totalUsdValue = +( (totalHowlBalance * HOWL_USD_RATE).toFixed(4) );

    return res.status(200).json({
      success: true,
      message: "Verified",
      is_admin: isAdmin,
      user_balance: {
        total_howl: totalHowlBalance,
        total_usd: totalUsdValue,
        coins: storedCoins,
        usdt_earnings: +(storedBalance.toFixed(4)),
        rate: HOWL_USD_RATE
      },
      referral_stats: {
        friends_count: friendsCount || 0,
        total_howl: totalHowlEarned,
        total_usdt: +(totalReferralUsdtEquivalent.toFixed(4)),
        direct_usdt: +(totalUsdtEarned.toFixed(4))
      }
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
