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
    return res.status(405).json({ success: false, message: "Method not allowed" });
  }

  const { initData, address, amount } = req.body || {};
  const BOT_TOKEN = process.env.BOT_TOKEN;

  if (!BOT_TOKEN || !supabase) {
    return res.status(500).json({ success: false, message: "Server configuration error: missing environment variables" });
  }

  const rawInitData = initData || req.headers['x-telegram-init-data'];
  if (!rawInitData || typeof rawInitData !== 'string') {
    return res.status(401).json({ success: false, message: "Unauthorized: Missing Telegram WebApp security context" });
  }

  let targetUserId = null;
  let userName = 'User';
  let userPhoto = null;

  try {
    const params = new URLSearchParams(rawInitData);
    const hash = params.get('hash');

    if (!hash) {
      return res.status(401).json({ success: false, message: "Unauthorized: Missing signature hash" });
    }

    params.delete('hash');
    params.sort();

    const dataCheckArr = [];
    for (const [key, value] of params.entries()) {
      dataCheckArr.push(key + '=' + value);
    }
    const dataCheckString = dataCheckArr.join('\n');

    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
    const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

    if (calculatedHash !== hash) {
      return res.status(403).json({ success: false, message: "Forbidden: Invalid Telegram signature" });
    }

    const userStr = params.get('user');
    if (userStr) {
      const parsed = JSON.parse(userStr);
      if (parsed && parsed.id) {
        targetUserId = String(parsed.id);
        userName = (parsed.first_name || '') + ' ' + (parsed.last_name || '');
        userName = userName.trim() || 'User';
        userPhoto = parsed.photo_url || null;
      }
    }
  } catch (e) {
    return res.status(400).json({ success: false, message: "Bad Request: " + e.message });
  }

  if (!targetUserId) {
    return res.status(400).json({ success: false, message: "Missing user identification within validated context" });
  }

  const reqAmount = parseInt(amount, 10);
  if (!address || isNaN(reqAmount) || reqAmount < 1500) {
    return res.status(400).json({ success: false, message: "Invalid request. Minimum withdrawal is 1,500 HOWL." });
  }

  try {
    // FETCH EXACT BALANCE FROM USERS TABLE (Single Source of Truth)
    const { data: userRecord, error: userFetchError } = await supabase
      .from('users')
      .select('coins, balance')
      .eq('user_id', targetUserId)
      .maybeSingle();

    if (userFetchError || !userRecord) {
      return res.status(500).json({ success: false, message: "Failed to fetch user profile." });
    }

    const currentCoins = parseFloat(userRecord.coins) || 0;
    const currentBalance = parseFloat(userRecord.balance) || 0;

    if (currentCoins < reqAmount) {
      return res.status(400).json({ success: false, message: "Insufficient HOWL balance. You have " + Math.round(currentCoins) + " HOWL." });
    }

    const usdtValue = reqAmount * 0.00002;
    const payoutUsdt = usdtValue - 0.01;

    if (payoutUsdt <= 0) {
      return res.status(400).json({ success: false, message: "Amount too low to cover $0.01 network fee." });
    }

    // IMMEDIATELY DEDUCT FROM USERS TABLE TO PREVENT INFINITE WITHDRAWALS
    const newCoins = currentCoins - reqAmount;
    const newBalance = currentBalance - usdtValue;

    const { error: updateError } = await supabase
      .from('users')
      .update({ coins: newCoins, balance: newBalance })
      .eq('user_id', targetUserId);

    if (updateError) {
      return res.status(500).json({ success: false, message: "Failed to deduct balance: " + updateError.message });
    }

    const timestampId = Date.now();

    // Log the transaction
    const { error: insertError } = await supabase.from('transactions').insert([{
      user_id: targetUserId,
      reward_amount: -usdtValue, 
      transaction_id: 'W_' + timestampId + '_' + targetUserId,
      task_type: 'BEP20 Withdrawal: ' + address, 
      status: 'pending',
      created_at: new Date().toISOString()
    }]);

    if (insertError) {
      // If logging fails, try to reverse the deduction to be safe
      await supabase.from('users').update({ coins: currentCoins, balance: currentBalance }).eq('user_id', targetUserId);
      return res.status(500).json({ success: false, message: "Transaction logging error: " + insertError.message });
    }

    const adminMsg = "🚨 *New Withdrawal Request*\n\nUser ID: `" + targetUserId + "`\nAmount: *" + reqAmount + " HOWL* ($" + usdtValue.toFixed(4) + ")\nFee: $0.0100\nPayout: *$" + payoutUsdt.toFixed(4) + " USDT*\n\nAddress: `" + address + "`";

    await fetch('https://api.telegram.org/bot' + BOT_TOKEN + '/sendMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: '8026237972',
        text: adminMsg,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: "✅ Approve & Pay", callback_data: "A_" + timestampId }],
            [{ text: "❌ Reject & Refund", callback_data: "R_" + timestampId }],
            [{ text: "❌ Reject (No Refund)", callback_data: "NR_" + timestampId }]
          ]
        }
      })
    });

    return res.status(200).json({ success: true });

  } catch (err) {
    return res.status(500).json({ success: false, message: "Server error: " + err.message });
  }
}
