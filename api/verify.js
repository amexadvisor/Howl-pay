import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = (SUPABASE_URL && SUPABASE_KEY) ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { initData, startParam, fingerprint, isLocalMulti, syncOnly } = req.body;
    const BOT_TOKEN = process.env.BOT_TOKEN;

    if (!BOT_TOKEN || !supabase) {
      return res.status(500).json({ error: "Server configuration error." });
    }

    if (!initData || typeof initData !== 'string') {
      return res.status(401).json({ error: "Missing Telegram WebApp context" });
    }

    let targetUserId = null;
    let fullName = "Anonymous User";
    let photoUrl = null;

    // 1. Cryptographic Validation
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) return res.status(401).json({ error: "Missing signature hash" });

    params.delete('hash');
    params.sort();
    const dataCheckArr = [];
    for (const [key, value] of params.entries()) {
      dataCheckArr.push(`${key}=${value}`);
    }
    
    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
    const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckArr.join('\n')).digest('hex');

    if (calculatedHash !== hash) return res.status(403).json({ error: "Invalid Telegram signature" });

    const userStr = params.get('user');
    if (userStr) {
      const parsed = JSON.parse(userStr);
      if (parsed && parsed.id) {
        targetUserId = String(parsed.id);
        fullName = `${parsed.first_name} ${parsed.last_name || ''}`.trim();
        photoUrl = parsed.photo_url || null;
      }
    }

    if (!targetUserId) return res.status(400).json({ error: "Missing user identification" });

    // 2. Fetch or Create User from Supabase
    let userData = null;
    const { data: existingUser } = await supabase.from('users').select('*').eq('user_id', targetUserId).single();
    
    // Check active friends count
    const { count } = await supabase.from('users').select('*', { count: 'exact', head: true }).eq('referred_by', targetUserId);
    const activeFriends = count || 0;

    // If it's just a background sync (user is already verified locally), skip the slow API checks
    if (syncOnly && existingUser) {
        return res.status(200).json({
            success: true,
            user_data: {
                user_id: existingUser.user_id, balance: existingUser.balance, coins: existingUser.coins, 
                total_earned: existingUser.total_earned, active_friends: activeFriends
            }
        });
    }

    // 3. Strict Channel Verification (Using Bot Token)
    const requiredChannels = ['@howlnews', '@howl_community', '@howlnotification'];
    for (let channel of requiredChannels) {
        const tgRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getChatMember?chat_id=${channel}&user_id=${targetUserId}`);
        const tgData = await tgRes.json();
        const status = tgData.result?.status;
        
        if (!tgData.ok || !['member', 'administrator', 'creator'].includes(status)) {
            let neatName = channel.replace('@', '');
            if (neatName === 'howlnotification') neatName = "HOWL Notifications";
            return res.status(200).json({ success: false, message: `Please join ${neatName} to continue.` });
        }
    }

    // 4. VPN Check
    const clientIp = req.headers['x-forwarded-for'] || '127.0.0.1';
    let isVpn = 'N';
    try {
        const vpnCheckResponse = await fetch(`https://blackbox.ipinfo.app/lookup/${clientIp}`);
        isVpn = await vpnCheckResponse.text();
    } catch (e) { isVpn = 'N'; }

    if (isVpn.trim() === 'Y') {
        return res.status(200).json({ success: false, message: "VPN or Proxy detected. Please disable to continue." });
    }

    // 5. Anti-Cheat Fingerprint Check & DB Execution
    let isMultiAccount = isLocalMulti;
    if (fingerprint) {
        const { data: fpMatch } = await supabase.from('users').select('user_id').eq('fingerprint', fingerprint).neq('user_id', targetUserId).limit(1);
        if (fpMatch && fpMatch.length > 0) isMultiAccount = true;
    }

    if (!existingUser) {
        // New User Registration. If they are abusing multi-accounts, nullify the referral!
        const finalReferrer = (isMultiAccount || startParam === targetUserId) ? null : startParam;
        
        await supabase.from('users').insert([{
            user_id: targetUserId,
            name: fullName,
            photo_url: photoUrl,
            referred_by: finalReferrer,
            fingerprint: fingerprint,
            balance: 0.0000,
            total_earned: 0.0000
        }]);

        userData = { user_id: targetUserId, balance: 0.0000, coins: 0, total_earned: 0.0000, active_friends: 0 };
    } else {
        // Update returning user details
        await supabase.from('users').update({ name: fullName, photo_url: photoUrl, fingerprint: fingerprint }).eq('user_id', targetUserId);
        userData = { user_id: existingUser.user_id, balance: existingUser.balance, coins: existingUser.coins, total_earned: existingUser.total_earned, active_friends: activeFriends };
    }

    return res.status(200).json({ success: true, message: "Verified", user_data: userData });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
