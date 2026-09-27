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

  try {
    const { initData, startParam, fingerprint, isLocalMulti, syncOnly } = req.body || {};
    const BOT_TOKEN = process.env.BOT_TOKEN;

    // Hard fail responses as 200 OK so the frontend catch block doesn't explode and freeze.
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

    // 2. Fetch User Record
    const { data: existingUser } = await supabase.from('users').select('*').eq('user_id', targetUserId).single();
    const { count } = await supabase.from('users').select('*', { count: 'exact', head: true }).eq('referred_by', targetUserId);
    const activeFriends = count || 0;

    if (syncOnly && existingUser) {
        return res.status(200).json({
            success: true,
            user_data: {
                user_id: existingUser.user_id,
                balance: existingUser.balance || 0,
                coins: existingUser.coins || 0, 
                total_earned: existingUser.total_earned || 0,
                active_friends: activeFriends
            }
        });
    }

    // 3. Parallel Telegram Channel Verification (Protected from hangs)
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
        return res.status(200).json({ 
            success: false, 
            message: `Please join ${missingChannel.channel} first.` 
        });
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
        if (!isNaN(currentNum) && !isNaN(otherNum)) {
            return currentNum < otherNum;
        }
        return false;
    }

    // 4. Anti-Cheat Device Fingerprint Verification
    let isMultiAccount = Boolean(isLocalMulti);
    if (fingerprint && !fingerprint.startsWith('hw_err_') && !fingerprint.startsWith('hw_catch') && !fingerprint.startsWith('hw_timeout')) {
        const { data: primaryAccount } = await supabase
            .from('users')
            .select('user_id, created_at')
            .eq('fingerprint', fingerprint)
            .neq('user_id', targetUserId)
            .order('created_at', { ascending: true })
            .limit(1)
            .maybeSingle();
            
        if (primaryAccount) {
            const isCurrentOlder = isOlderAccount(existingUser, primaryAccount);
            if (!isCurrentOlder) {
                return res.status(200).json({ 
                    success: false, 
                    banned: true,
                    message: "Multiple accounts detected on this device. Only your original account is permitted." 
                });
            }
            isMultiAccount = true;
        }
    }

    let finalUserData = null;

    if (!existingUser) {
        let cleanRef = startParam ? String(startParam).trim() : null;
        if (cleanRef && cleanRef.startsWith('ref_')) cleanRef = cleanRef.substring(4);
        const finalReferrer = (isMultiAccount || cleanRef === targetUserId) ? null : cleanRef;

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

        finalUserData = { user_id: targetUserId, balance: 0.0000, coins: 0.00, total_earned: 0.0000, active_friends: 0 };
    } else {
        await supabase.from('users').update({ 
            name: fullName, 
            photo_url: photoUrl, 
            fingerprint: fingerprint || existingUser.fingerprint 
        }).eq('user_id', targetUserId);

        finalUserData = { 
            user_id: existingUser.user_id, 
            balance: existingUser.balance || 0, 
            coins: existingUser.coins || 0, 
            total_earned: existingUser.total_earned || 0, 
            active_friends: activeFriends 
        };
    }

    return res.status(200).json({ success: true, message: "Verified", user_data: finalUserData });

  } catch (error) {
    return res.status(200).json({ success: false, message: error.message });
  }
}
