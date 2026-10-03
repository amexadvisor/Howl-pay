import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = (process.env.SUPABASE_URL || '').trim();
const SUPABASE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || '').trim();
const supabase = (SUPABASE_URL && SUPABASE_KEY) ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { initData, startParam, fingerprint, isLocalMulti, syncOnly } = req.body || {};
    const BOT_TOKEN = process.env.BOT_TOKEN;

    if (!BOT_TOKEN) return res.status(200).json({ success: false, message: "Server misconfigured: Bot token missing." });
    if (!supabase) return res.status(200).json({ success: false, message: "Server misconfigured: DB connection missing." });
    if (!initData || typeof initData !== 'string') return res.status(200).json({ success: false, message: "Please open this app inside Telegram." });

    let targetUserId = null;
    let fullName = "Anonymous User";
    let photoUrl = null;

    // 1. Cryptographic Validation
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) return res.status(200).json({ success: false, message: "Invalid access: Missing hash." });

    params.delete('hash');
    params.sort();
    const dataCheckArr = [];
    for (const [key, value] of params.entries()) {
      dataCheckArr.push(`${key}=${value}`);
    }
    
    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
    const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckArr.join('\n')).digest('hex');

    if (calculatedHash !== hash) return res.status(200).json({ success: false, message: "Security failure: Invalid Telegram signature." });

    const userStr = params.get('user');
    if (userStr) {
      const parsed = JSON.parse(userStr);
      if (parsed && parsed.id) {
        targetUserId = String(parsed.id);
        fullName = `${parsed.first_name || ''} ${parsed.last_name || ''}`.trim() || 'Telegram User';
        photoUrl = parsed.photo_url || null;
      }
    }

    if (!targetUserId) return res.status(200).json({ success: false, message: "Missing Telegram User ID." });

    // Exception for Admins
    const ADMIN_IDS = ['8026237972'];
    const isAdmin = ADMIN_IDS.includes(targetUserId);

    // 2. Fetch User Record
    const { data: existingUser } = await supabase.from('users').select('*').eq('user_id', targetUserId).maybeSingle();

    function getClientIp(req) {
      let ip = null;
      const forwarded = req.headers['x-forwarded-for'];
      if (forwarded) ip = forwarded.split(',')[0].trim();
      else if (req.headers['x-real-ip']) ip = req.headers['x-real-ip'].trim();
      else if (req.socket?.remoteAddress) ip = req.socket.remoteAddress.trim();
      if (ip && ip.startsWith('::ffff:')) ip = ip.substring(7);
      return ip || null;
    }

    const clientIp = getClientIp(req);
    const IP_WINDOW_MINUTES = 20;
    const ipWindowThreshold = new Date(Date.now() - IP_WINDOW_MINUTES * 60 * 1000).toISOString();

    if (!syncOnly) {
        // 3. Parallel Telegram Channel Verification
        const requiredChannels = [
          { id: '@howlnews', name: 'HOWL News' },
          { id: '@howl_community', name: 'Community' },
          { id: '@howlnotification', name: 'Notifications' }
        ];

        const channelChecks = await Promise.all(
          requiredChannels.map(async (ch) => {
            try {
                const tgRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getChatMember?chat_id=${ch.id}&user_id=${targetUserId}`);
                const tgData = await tgRes.json();
                const isMember = tgData.ok && ['member', 'administrator', 'creator'].includes(tgData.result?.status);
                return { channel: ch.name, ok: isMember };
            } catch (e) {
                return { channel: ch.name, ok: false };
            }
          })
        );

        const missingChannel = channelChecks.find(c => !c.ok);
        if (missingChannel) {
            return res.status(200).json({ success: false, message: `Please join ${missingChannel.channel} first.` });
        }

        // 4. Strict Anti-Cheat Device Fingerprint & IP Verification
        if (!isAdmin) {
            // INSTANT REJECT if local Telegram CloudStorage caught them
            if (isLocalMulti) {
                return res.status(200).json({ 
                    success: false, 
                    banned: true,
                    message: "Multiple accounts detected on this device. Only your original account is permitted."
                });
            }

            let primaryAccount = null;
            let isIpMatch = false;

            if (fingerprint && !fingerprint.startsWith('hw_err_')) {
                const { data: deviceMatch } = await supabase.from('users').select('user_id, created_at').eq('fingerprint', fingerprint).neq('user_id', targetUserId).order('created_at', { ascending: true }).limit(1).maybeSingle();
                if (deviceMatch) primaryAccount = deviceMatch;
            }

            if (!primaryAccount && clientIp && clientIp !== '127.0.0.1' && clientIp !== 'localhost') {
                const { data: recentIpTxs } = await supabase.from('transactions').select('user_id, created_at').eq('task_type', 'SYSTEM_IP_LOG').eq('status', clientIp).neq('user_id', targetUserId).gt('created_at', ipWindowThreshold).order('created_at', { ascending: true }).limit(1);
                if (recentIpTxs && recentIpTxs.length > 0) {
                    primaryAccount = recentIpTxs[0];
                    isIpMatch = true;
                }
            }

            if (primaryAccount) {
                const currentCreated = existingUser?.created_at ? new Date(existingUser.created_at).getTime() : Date.now();
                const primaryCreated = new Date(primaryAccount.created_at).getTime();
                
                if (currentCreated > primaryCreated) {
                    const reason = isIpMatch
                        ? "Multiple accounts detected from this network/device within the cooldown window (20 mins). Only your original account is permitted."
                        : "Multiple accounts detected on this device. Only your original account is permitted.";
                    return res.status(200).json({ success: false, banned: true, message: reason });
                }
            }

            // Log IP for future collision checks
            if (clientIp && clientIp !== '127.0.0.1') {
                await supabase.from('transactions').insert([{
                    user_id: targetUserId,
                    reward_amount: 0,
                    transaction_id: `ip_${Date.now()}_${targetUserId}`,
                    task_type: 'SYSTEM_IP_LOG',
                    status: clientIp,
                    created_at: new Date().toISOString()
                }]);
            }
        }

        // 5. Registration / Update
        if (!existingUser) {
            let cleanRef = startParam ? String(startParam).trim() : null;
            if (cleanRef && cleanRef.startsWith('ref_')) cleanRef = cleanRef.substring(4);

            let isSameIpRecent = false;
            if (clientIp && clientIp !== '127.0.0.1' && clientIp !== 'localhost' && cleanRef) {
                const { data: refIpTxs } = await supabase.from('transactions').select('id').eq('task_type', 'SYSTEM_IP_LOG').eq('status', clientIp).eq('user_id', cleanRef).gt('created_at', ipWindowThreshold).limit(1);
                if (refIpTxs && refIpTxs.length > 0) isSameIpRecent = true;
            }

            const finalReferrer = (isLocalMulti || isSameIpRecent || cleanRef === targetUserId) ? null : cleanRef;

            if (finalReferrer) {
                const { data: refUser } = await supabase.from('users').select('coins').eq('user_id', finalReferrer).maybeSingle();
                if (refUser) {
                    await supabase.from('users').update({ coins: (parseFloat(refUser.coins) || 0) + 250 }).eq('user_id', finalReferrer);
                    await supabase.from('transactions').insert([{
                        user_id: String(finalReferrer),
                        reward_amount: 250,
                        transaction_id: `ref_join_${Date.now()}_${targetUserId}`,
                        task_type: 'Referral Signup Bonus (250 HOWL)',
                        status: '1',
                        created_at: new Date().toISOString()
                    }]);
                }
            }

            await supabase.from('users').insert([{
                user_id: targetUserId,
                name: fullName,
                photo_url: photoUrl,
                referred_by: finalReferrer,
                fingerprint: fingerprint || null,
                balance: 0.0000,
                coins: 0.00,
                total_earned: 0.0000
            }]);
        } else {
            await supabase.from('users').update({ 
                name: fullName, 
                photo_url: photoUrl, 
                fingerprint: fingerprint || existingUser.fingerprint 
            }).eq('user_id', targetUserId);
        }
    }

    // -----------------------------------------------------------
    // 6. EXACT BALANCE AND REFERRAL STATS
    // -----------------------------------------------------------
    const { count: friendsCount } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true })
      .eq('referred_by', targetUserId);

    const { data: refTxs } = await supabase
      .from('transactions')
      .select('reward_amount, task_type')
      .eq('user_id', targetUserId)
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

    // Fetch User Balance EXACTLY as stored in DB (No Math.max trap!)
    const { data: currentUserData } = await supabase
      .from('users')
      .select('balance, coins')
      .eq('user_id', targetUserId)
      .maybeSingle();

    const userCoins = parseFloat(currentUserData?.coins) || 0;
    const userBalanceUsd = parseFloat(currentUserData?.balance) || 0;

    const convertedFromUsdt = userBalanceUsd > 0 ? (userBalanceUsd / HOWL_USD_RATE) : 0;
    const totalHowlBalance = Math.round(userCoins + convertedFromUsdt);
    const totalUsdValue = +( (totalHowlBalance * HOWL_USD_RATE).toFixed(4) );

    return res.status(200).json({
      success: true,
      message: "Verified",
      is_admin: isAdmin,
      user_balance: {
        total_howl: totalHowlBalance,
        total_usd: totalUsdValue,
        coins: userCoins,
        usdt_earnings: +(userBalanceUsd.toFixed(4)),
        rate: HOWL_USD_RATE
      },
      referral_stats: {
        friends_count: friendsCount || 0,
        total_howl: totalHowlEarned,
        total_usdt: +(totalReferralUsdtEquivalent.toFixed(4)),
        direct_usdt: +(totalUsdtEarned.toFixed(4))
      }
    });

  } catch (error) {
    return res.status(200).json({ success: false, message: error.message });
  }
}
