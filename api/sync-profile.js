import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
const supabase = (SUPABASE_URL && SUPABASE_KEY) ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  
  const { initData, fingerprint, startParam } = req.body || {};
  const BOT_TOKEN = process.env.BOT_TOKEN;

  if (!initData || !BOT_TOKEN) return res.status(400).json({ error: 'Missing data' });
  if (!supabase) return res.status(500).json({ error: 'Database connection missing or misconfigured.' });

  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    params.delete('hash');
    params.sort();
    
    const dataCheckString = Array.from(params.entries()).map(([k, v]) => `${k}=${v}`).join('\n');
    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
    const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

    if (calculatedHash !== hash) return res.status(403).json({ error: 'Invalid signature' });

    const userParam = params.get('user');
    if (!userParam) return res.status(400).json({ error: 'Missing user payload' });

    const userObj = JSON.parse(userParam);
    const userIdStr = String(userObj.id);
    const fullName = (userObj.first_name + ' ' + (userObj.last_name || '')).trim() || 'Telegram User';
    const photoUrl = userObj.photo_url || null;

    // Extract client IP (Vercel provides client IP in x-forwarded-for)
    const clientIp = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();
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

    // Multi-Account Device Verification (Ban 2nd+ accounts on same device)
    if (clientFingerprint) {
      const { data: primaryAccount } = await supabase
        .from('users')
        .select('user_id, created_at')
        .eq('fingerprint', clientFingerprint)
        .neq('user_id', userIdStr)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (primaryAccount) {
        const isCurrentOlder = isOlderAccount(existingUser, primaryAccount);
        if (!isCurrentOlder) {
          console.log(`[Anti-Fraud] Multi-account ban triggered: Device owned by ${primaryAccount.user_id}, blocked ${userIdStr}`);
          
          try {
            await supabase.from('users').upsert({
              user_id: userIdStr,
              name: fullName,
              photo_url: photoUrl,
              fingerprint: clientFingerprint,
              last_ip: clientIp || null,
              last_seen: new Date().toISOString()
            }, { onConflict: 'user_id' });
          } catch (e) {}

          return res.status(200).json({
            success: false,
            banned: true,
            ban_reason: 'Multiple accounts detected on this device. Only your original account is permitted.'
          });
        }
      }
    }

    let finalReferrer = null;

    if (!existingUser) {
      // 1. BRAND NEW USER REGISTRATION
      const rawStartParam = params.get('start_param') || startParam || '';
      let cleanRef = String(rawStartParam).trim();
      if (cleanRef.startsWith('ref_')) cleanRef = cleanRef.substring(4);

      if (cleanRef && cleanRef !== userIdStr) {
        // Fetch Referrer details for anti-cheat verification
        const { data: referrer } = await supabase
          .from('users')
          .select('user_id, last_ip, last_seen, fingerprint, coins')
          .eq('user_id', cleanRef)
          .maybeSingle();

        if (referrer) {
          const now = Date.now();
          const referrerLastSeen = referrer.last_seen ? new Date(referrer.last_seen).getTime() : 0;
          const minutesDiff = (now - referrerLastSeen) / (1000 * 60);

          const isSameDevice = Boolean(clientFingerprint && referrer.fingerprint && clientFingerprint === referrer.fingerprint);
          const isSameIp = Boolean(clientIp && referrer.last_ip && clientIp === referrer.last_ip);
          const isWithin15Mins = minutesDiff < 15;

          if (isSameDevice) {
            console.log(`[Anti-Fraud] Self-referral blocked: same device (${cleanRef} -> ${userIdStr})`);
            finalReferrer = null; // Deny referral reward, but allow user to use app
          } else if (isSameIp && isWithin15Mins) {
            console.log(`[Anti-Fraud] Referral blocked: same IP within 15 min (${clientIp})`);
            finalReferrer = null; // Deny referral reward, but allow user to use app
          } else {
            // Valid new referral!
            finalReferrer = cleanRef;

            // Reward Referrer: +250 HOWL Coins for joining and verified
            const currentCoins = parseFloat(referrer.coins) || 0;
            const updatedCoins = currentCoins + 250;
            await supabase.from('users').update({ coins: updatedCoins }).eq('user_id', cleanRef);

            // Record transaction for referrer
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

      // Insert new user record
      await supabase.from('users').insert([{
        user_id: userIdStr,
        name: fullName,
        photo_url: photoUrl,
        referred_by: finalReferrer,
        fingerprint: clientFingerprint,
        last_ip: clientIp || null,
        balance: 0.0000,
        coins: 0.00,
        total_earned: 0.0000,
        created_at: new Date().toISOString(),
        last_seen: new Date().toISOString()
      }]);

    } else {
      // 2. RETURNING USER - Update profile and presence
      const updatePayload = {
        name: fullName,
        photo_url: photoUrl || existingUser.photo_url,
        last_seen: new Date().toISOString()
      };
      if (clientIp) updatePayload.last_ip = clientIp;
      if (clientFingerprint) updatePayload.fingerprint = clientFingerprint;

      await supabase.from('users').update(updatePayload).eq('user_id', userIdStr);
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

    return res.status(200).json({
      success: true,
      referral_stats: {
        friends_count: friendsCount || 0,
        total_howl: totalHowlEarned,
        total_usdt: +(totalUsdtEarned.toFixed(4))
      }
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
