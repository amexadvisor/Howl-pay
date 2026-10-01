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

  try {
    const { initData, address, amount } = req.body || {};
    const BOT_TOKEN = process.env.BOT_TOKEN;

    if (!initData || !address || isNaN(amount) || amount < 1500) {
      return res.status(400).json({ success: false, message: "Invalid request. Minimum withdrawal is 1500 HOWL." });
    }

    // Cryptographic validation
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) return res.status(401).json({ success: false, message: "Missing hash" });

    params.delete('hash');
    params.sort();
    const dataCheckArr = Array.from(params.entries()).map(([k, v]) => `${k}=${v}`);
    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
    const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckArr.join('\n')).digest('hex');

    if (calculatedHash !== hash) return res.status(403).json({ success: false, message: "Invalid signature" });

    const userObj = JSON.parse(params.get('user'));
    const targetUserId = String(userObj.id);

    // Fetch user and check balance
    const { data: user } = await supabase.from('users').select('balance, coins').eq('user_id', targetUserId).single();
    
    if (!user || parseFloat(user.coins) < amount) {
        return res.status(400).json({ success: false, message: "Insufficient HOWL balance." });
    }

    const usdtValue = amount * 0.00002;
    const payoutUsdt = usdtValue - 0.01;

    if (payoutUsdt <= 0) {
        return res.status(400).json({ success: false, message: "Amount too low to cover $0.01 network fee." });
    }

    // Deduct balances safely
    const newCoins = parseFloat(user.coins) - amount;
    const newBalance = parseFloat(user.balance) - usdtValue;
    await supabase.from('users').update({ coins: newCoins, balance: newBalance }).eq('user_id', targetUserId);

    const timestampId = Date.now();

    // Log the withdrawal in the transactions table (No new tables needed!)
    await supabase.from('transactions').insert([{
        user_id: targetUserId,
        reward_amount: -usdtValue, 
        transaction_id: `W_${timestampId}_${targetUserId}`,
        task_type: `BEP20: ${address}`, 
        status: 'pending',
        created_at: new Date().toISOString()
    }]);

    // Message Admin
    const msg = `🚨 *New Withdrawal*\n\nUser: \`${targetUserId}\`\nAmount: *${amount} HOWL* ($${usdtValue.toFixed(4)})\nFee: $0.0100\nPayout: *$${payoutUsdt.toFixed(4)} USDT*\n\nAddress: \`${address}\``;

    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            chat_id: '8026237972',
            text: msg,
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

  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}
