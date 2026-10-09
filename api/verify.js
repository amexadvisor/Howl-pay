import { createClient } from '@supabase/supabase-js';
import { HOWL_USD_RATE, verifyInitData, creditHowl, getUserBalance } from '../lib/balance.js';

const SUPABASE_URL = (process.env.SUPABASE_URL || 'https://knrgbyezxjunjysaaukx.supabase.co').trim();
const SUPABASE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || '').trim();
const supabase = (SUPABASE_URL && SUPABASE_KEY) ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;
const ADMIN_IDS = ['8026237972', '1928631932'];

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
  if (ip && ip.startsWith('::ffff:')) ip = ip.substring(7);
  return ip || null;
}

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
  if (!isNaN(currentNum) && !isNaN(otherNum)) return currentNum < otherNum;
  return false;
}

const DEVICE_LOG = 'SYSTEM_DEVICE_LOG';
const HW_IP_WINDOW_HOURS = 48;   // hardware-only matches must share a network prefix seen within this window

// Coarse network prefix: IPv4 /16, IPv6 /32. Survives airplane-mode IP changes on the same carrier.
function ipPrefix(ip) {
  if (!ip) return null;
  if (ip.includes(':')) return 'v6:' + ip.split(':').slice(0, 2).join(':').toLowerCase();
  const p = ip.split('.');
  return p.length === 4 ? 'v4:' + p[0] + '.' + p[1] : null;
}

// Permanently remember which device keys an account has used (idempotent)
async function recordDeviceKeys(userId, keys) {
  try {
    if (!keys.length) return;
    const { data: existing } = await supabase.from('transactions').select('status')
      .eq('user_id', userId).eq('task_type', DEVICE_LOG).in('status', keys);
    const have = new Set((existing || []).map(r => r.status));
    const rows = keys.filter(k => !have.has(k)).map((k, i) => ({
      user_id: userId,
      reward_amount: 0,
      transaction_id: `devlog_${userId}_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`,
      task_type: DEVICE_LOG,
      status: k,
      created_at: new Date().toISOString()
    }));
    if (rows.length) await supabase.from('transactions').insert(rows);
  } catch (e) {
    console.error('[Device Log Error]', e.message);
  }
}

// Find the oldest OTHER account that shares this device.
//   strong signals : our stored device id, legacy users.fingerprint, local "owner" marker
//   soft signal    : hardware fingerprint (can collide on identical phone models), so it only
//                    counts when that account was also seen on the same network prefix recently
async function findDevicePrimary({ userIdStr, fingerprint, hw, ownerId, clientIp }) {
  // NOTE: admin accounts are allowed to be the PRIMARY (original) account on a device.
  // They are still never banned themselves (checked in the handler).
  const strong = new Set();
  const soft = new Set();

  if (fingerprint) {
    const { data } = await supabase.from('users').select('user_id')
      .eq('fingerprint', fingerprint).neq('user_id', userIdStr).limit(20);
    (data || []).forEach(r => strong.add(String(r.user_id)));
  }

  const keys = [];
  if (fingerprint) keys.push('did:' + fingerprint);
  if (hw) keys.push('hw:' + hw);
  if (keys.length) {
    const { data } = await supabase.from('transactions').select('user_id, status')
      .eq('task_type', DEVICE_LOG).in('status', keys)
      .neq('user_id', userIdStr).limit(50);
    (data || []).forEach(r => (String(r.status).startsWith('did:') ? strong : soft).add(String(r.user_id)));
  }

  if (ownerId && String(ownerId) !== userIdStr) {
    strong.add(String(ownerId));   // must exist in DB to count (checked below)
  }

  const confirmedSoft = [];
  const prefix = ipPrefix(clientIp);
  if (soft.size && prefix) {
    const since = new Date(Date.now() - HW_IP_WINDOW_HOURS * 3600 * 1000).toISOString();
    const { data: ipRows } = await supabase.from('transactions').select('user_id, status')
      .eq('task_type', 'SYSTEM_IP_LOG').in('user_id', [...soft]).gt('created_at', since).limit(300);
    (ipRows || []).forEach(r => { if (ipPrefix(r.status) === prefix) confirmedSoft.push(String(r.user_id)); });
  }

  const ids = [...new Set([...strong, ...confirmedSoft])];
  if (!ids.length) return null;

  const { data: accounts } = await supabase.from('users').select('user_id, created_at, fingerprint').in('user_id', ids);
  if (!accounts || !accounts.length) return null;
  accounts.sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));
  // An admin account on the device is always treated as the original account
  const adminAcc = accounts.find(a => ADMIN_IDS.includes(String(a.user_id)));
  if (adminAcc) accounts.unshift(adminAcc);
  return { ...accounts[0], via: strong.has(String(accounts[0].user_id)) ? 'device' : 'hardware' };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { initData, fingerprint, hwFingerprint, startParam, ownerId } = req.body || {};
  const BOT_TOKEN = (process.env.BOT_TOKEN || '').trim();

  if (!initData) return res.status(200).json({ success: false, error: 'Missing Telegram initData' });
  if (!BOT_TOKEN) return res.status(200).json({ success: false, error: 'Server misconfigured: BOT_TOKEN is missing.' });
  if (!supabase) return res.status(200).json({ success: false, error: 'Server misconfigured: Supabase connection missing.' });

  try {
    const verified = verifyInitData(initData, BOT_TOKEN);
    if (!verified) {
      return res.status(200).json({ success: false, error: 'Invalid Telegram security signature.' });
    }
    const { user: userObj, params } = verified;

    const userIdStr = String(userObj.id);
    const fullName = ((userObj.first_name || '') + ' ' + (userObj.last_name || '')).trim() || 'Telegram User';
    const photoUrl = userObj.photo_url || null;

    const clientIp = getClientIp(req);
    const IP_WINDOW_MINUTES = 20;
    const ipWindowThreshold = new Date(Date.now() - IP_WINDOW_MINUTES * 60 * 1000).toISOString();
    const clientFingerprint = typeof fingerprint === 'string' ? fingerprint.trim() : null;
    const clientHw = typeof hwFingerprint === 'string' && hwFingerprint.trim() ? hwFingerprint.trim().slice(0, 64) : null;
    const deviceKeys = [];
    if (clientFingerprint) deviceKeys.push('did:' + clientFingerprint.slice(0, 128));
    if (clientHw) deviceKeys.push('hw:' + clientHw);

    const { data: existingUser } = await supabase
      .from('users')
      .select('*')
      .eq('user_id', userIdStr)
      .maybeSingle();

    const isAdmin = ADMIN_IDS.includes(userIdStr);

    // Multi-Account & Ban Verification (Admins are 100% exempt)
    if (!isAdmin) {
      // 1. Manual admin ban
      const { data: adminBanRows } = await supabase
        .from('transactions')
        .select('status')
        .eq('user_id', userIdStr)
        .eq('task_type', 'ADMIN_BAN')
        .order('created_at', { ascending: false })
        .limit(1);

      const latestBanStatus = adminBanRows && adminBanRows[0] ? adminBanRows[0].status : null;
      if (latestBanStatus === 'BANNED') {
        const msg = 'Your account has been suspended by an administrator.';
        return res.status(200).json({ success: false, banned: true, ban_reason: msg, message: msg });
      }

      // 2. Multi-account detection (device id + hardware + local owner marker, then 20-min IP window)
      if (latestBanStatus !== 'UNBANNED') {
        let primaryAccount = await findDevicePrimary({
          userIdStr, fingerprint: clientFingerprint, hw: clientHw, ownerId, clientIp
        });
        let isIpMatch = false;

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
          // original account wins; an admin primary always wins regardless of creation date
          const isCurrentOlder = isOlderAccount(existingUser, primaryAccount) && !ADMIN_IDS.includes(String(primaryAccount.user_id));
          if (!isCurrentOlder) {
            const reason = isIpMatch
              ? 'Multiple accounts detected from this network/device within the cooldown window (20 mins). Only your original account is permitted.'
              : 'Multiple accounts detected on this device. Only your original account is permitted.';
            console.log(`[Anti-Fraud] Ban: ${userIdStr} blocked (primary ${primaryAccount.user_id}, via ${isIpMatch ? 'ip' : primaryAccount.via})`);

            await recordDeviceKeys(userIdStr, deviceKeys);
            try {
              await supabase.from('users').upsert({
                user_id: userIdStr,
                name: fullName,
                photo_url: photoUrl,
                // copy the primary's fingerprint so claim-bonus.js keeps blocking this account too
                fingerprint: primaryAccount.fingerprint || clientFingerprint,
                last_seen: new Date().toISOString()
              }, { onConflict: 'user_id' });
            } catch (e) {}

            return res.status(200).json({ success: false, banned: true, ban_reason: reason, message: reason });
          }
        }
      }
    }

    let finalReferrer = null;

    if (!existingUser) {
      // BRAND NEW USER
      const rawStartParam = params.get('start_param') || startParam || '';
      let cleanRef = String(rawStartParam).trim();
      if (cleanRef.startsWith('ref_')) cleanRef = cleanRef.substring(4);

      if (cleanRef && cleanRef !== userIdStr) {
        const { data: referrer } = await supabase
          .from('users')
          .select('user_id, fingerprint')
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

          if (isSameDevice || isSameIpRecent) {
            console.log(`[Anti-Fraud] Self-referral blocked: same device/IP (${cleanRef} -> ${userIdStr})`);
            finalReferrer = null;
          } else {
            finalReferrer = cleanRef;

            // Reward referrer: +250 HOWL via the shared balance logic
            const credit = await creditHowl(supabase, cleanRef, 250, { lifetime: false });
            if (credit.ok) {
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
      }

      await supabase.from('users').insert([{
        user_id: userIdStr,
        name: fullName,
        photo_url: photoUrl,
        referred_by: finalReferrer,
        fingerprint: clientFingerprint,
        balance: 0,
        coins: 0,
        total_earned: 0,
        created_at: new Date().toISOString(),
        last_seen: new Date().toISOString()
      }]);

    } else {
      // RETURNING USER - profile & presence only (never touches balance)
      const updatePayload = {
        name: fullName,
        photo_url: photoUrl || existingUser.photo_url,
        last_seen: new Date().toISOString()
      };
      if (clientFingerprint) updatePayload.fingerprint = clientFingerprint;
      await supabase.from('users').update(updatePayload).eq('user_id', userIdStr);
    }

    await recordDeviceKeys(userIdStr, deviceKeys);   // admins too, so their device can be matched

    // IP session log (at most once every 10 minutes)
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
      } catch (ipLogErr) {
        console.error('[IP Log Error]', ipLogErr.message);
      }
    }

    // REFERRAL STATS
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
    (refTxs || []).forEach(tx => {
      const amt = parseFloat(tx.reward_amount) || 0;
      if (tx.task_type.includes('HOWL')) totalHowlEarned += amt;
      else totalUsdtEarned += amt;
    });
    const totalReferralUsdtEquivalent = (totalHowlEarned * HOWL_USD_RATE) + totalUsdtEarned;

    // BALANCE - same function every other endpoint uses
    const user_balance = await getUserBalance(supabase, userIdStr);

    return res.status(200).json({
      success: true,
      is_admin: isAdmin,
      user_balance,
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
