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
      dataCheckArr.push(`${key}=${value}`);
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
    // 1. Fetch user data (checking both coins and total_howl columns to match all sync variations)
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('balance, coins, total_howl')
      .eq('user_id', targetUserId)
      .maybeSingle();

    if (userError || !user) {
      return res.status(400).json({ success: false, message: "User account not found in database." });
    }

    const availableHowl = parseFloat(user.coins || user.total_howl || 0);

    if (availableHowl < reqAmount) {
      return res.status(400).json({ success: false, message: `Insufficient HOWL balance. You have ${availableHowl} HOWL.` });
    }

    const usdtValue = reqAmount * 0.00002;
    const payoutUsdt = usdtValue - 0.01;

    if (payoutUsdt <= 0) {
      return res.status(400).json({ success: false, message: "Amount too low to cover $0.01 network fee." });
    }

    // 2. Deduct safely from both user balances
    const newCoins = Math.max(0, availableHowl - reqAmount);
    const newBalance = Math.max(0, parseFloat(user.balance || 0) - usdtValue);

    const { error: updateError } = await supabase
      .from('users')
      .update({ coins: newCoins, total_howl: newCoins, balance: newBalance })
      .eq('user_id', targetUserId);

    if (updateError) {
      return res.status(500).json({ success: false, message: "Database update error: " + updateError.message });
    }

    const timestampId = Date.now();

    // 3. Insert into existing transactions table (No new tables needed!)
    const { error: txError } = await supabase.from('transactions').insert([{
      user_id: targetUserId,
      reward_amount: -usdtValue, 
      transaction_id: `W_${timestampId}_${targetUserId}`,
      task_type: `BEP20: ${address}`, 
      status: 'pending',
      created_at: new Date().toISOString()
    }]);

    if (txError) {
      return res.status(500).json({ success: false, message: "Transaction logging error: " + txError.message });
    }

    // 4. Message Admin (ID: 8026237972)
    const adminMsg = `🚨 *New Withdrawal Request*\n\nUser ID: \`${targetUserId}\`\nAmount: *${reqAmount} HOWL* ($${usdtValue.toFixed(4)})\nFee: $0.0100\nPayout: *$${payoutUsdt.toFixed(4)} USDT*\n\nAddress: \`${address}\``;

    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: '8026237972',
        text: adminMsg,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: "✅ Approve & Pay", callback_data: `A_${timestampId}` }],
            [{ text: "❌ Reject & Refund", callback_data: `R_${timestampId}` }]
          ]
        }
      })
    });

    return res.status(200).json({ success: true });

  } catch (err) {
    return res.status(500).json({ success: false, message: "Server error: " + err.message });
  }
}
