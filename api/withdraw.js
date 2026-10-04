import { createClient } from '@supabase/supabase-js';
import { HOWL_USD_RATE, verifyInitData, debitHowl, creditHowl } from '../lib/balance.js';

const SUPABASE_URL = (process.env.SUPABASE_URL || '').trim();
const SUPABASE_SERVICE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || '').trim();
const supabase = (SUPABASE_URL && SUPABASE_SERVICE_KEY) ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY) : null;

const MIN_WITHDRAW_HOWL = 1500;
const NETWORK_FEE_USD = 0.01;
const ADMIN_CHAT_ID = '8026237972';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Telegram-Init-Data');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method not allowed' });

  const { initData, address, amount } = req.body || {};
  const BOT_TOKEN = process.env.BOT_TOKEN;

  if (!BOT_TOKEN || !supabase) {
    return res.status(500).json({ success: false, message: 'Server configuration error: missing environment variables' });
  }

  const rawInitData = initData || req.headers['x-telegram-init-data'];
  if (!rawInitData || typeof rawInitData !== 'string') {
    return res.status(401).json({ success: false, message: 'Unauthorized: Missing Telegram WebApp security context' });
  }

  const verified = verifyInitData(rawInitData, BOT_TOKEN);
  if (!verified) return res.status(403).json({ success: false, message: 'Forbidden: Invalid Telegram signature' });
  const targetUserId = String(verified.user.id);

  // Banned or duplicate-device accounts cannot withdraw (admin Unban overrides)
  try {
    if (targetUserId !== '8026237972') {
      const { data: banRows } = await supabase.from('transactions').select('status')
        .eq('user_id', targetUserId).eq('task_type', 'ADMIN_BAN')
        .order('created_at', { ascending: false }).limit(1);
      const banStatus = banRows && banRows[0] ? banRows[0].status : null;
      if (banStatus === 'BANNED') {
        return res.status(403).json({ success: false, message: 'Account suspended by administrator.' });
      }
      if (banStatus !== 'UNBANNED') {
        const { data: me } = await supabase.from('users')
          .select('user_id, fingerprint, created_at').eq('user_id', targetUserId).maybeSingle();
        if (me && me.fingerprint) {
          const { data: primary } = await supabase.from('users')
            .select('user_id, created_at').eq('fingerprint', me.fingerprint)
            .neq('user_id', targetUserId).not('user_id', 'in', '(8026237972)')
            .order('created_at', { ascending: true }).limit(1).maybeSingle();
          if (primary && new Date(me.created_at) >= new Date(primary.created_at)) {
            return res.status(403).json({ success: false, message: 'Account suspended due to multi-account policy.' });
          }
        }
      }
    }
  } catch (banErr) {
    return res.status(500).json({ success: false, message: 'Security check failed. Please try again.' });
  }

  const reqAmount = parseInt(amount, 10);
  const cleanAddress = typeof address === 'string' ? address.trim() : '';

  if (!cleanAddress || isNaN(reqAmount) || reqAmount < MIN_WITHDRAW_HOWL) {
    return res.status(400).json({ success: false, message: 'Invalid request. Minimum withdrawal is 1,500 HOWL.' });
  }
  if (!/^0x[a-fA-F0-9]{40}$/.test(cleanAddress)) {
    return res.status(400).json({ success: false, message: 'Invalid BEP-20 wallet address.' });
  }

  const usdtValue = reqAmount * HOWL_USD_RATE;
  const payoutUsdt = usdtValue - NETWORK_FEE_USD;
  if (payoutUsdt <= 0) {
    return res.status(400).json({ success: false, message: 'Amount too low to cover $0.01 network fee.' });
  }

  try {
    // 1) Atomically take the HOWL out of the user's balance (fails if insufficient)
    const debit = await debitHowl(supabase, targetUserId, reqAmount);
    if (!debit.ok) {
      const have = debit.balance ? debit.balance.total_howl : 0;
      return res.status(400).json({
        success: false,
        message: 'Insufficient HOWL balance. You have ' + have.toLocaleString() + ' HOWL.',
        user_balance: debit.balance
      });
    }

    // 2) Log it. If logging fails, give the HOWL back.
    const timestampId = Date.now();
    const { error: insertError } = await supabase.from('transactions').insert([{
      user_id: targetUserId,
      reward_amount: -usdtValue,
      transaction_id: 'W_' + timestampId + '_' + targetUserId,
      task_type: 'BEP20 Withdrawal: ' + cleanAddress,
      status: 'pending',
      created_at: new Date().toISOString()
    }]);

    if (insertError) {
      const refund = await creditHowl(supabase, targetUserId, reqAmount, { lifetime: false });
      return res.status(500).json({
        success: false,
        message: 'Transaction logging error: ' + insertError.message,
        user_balance: refund.balance
      });
    }

    // 3) Notify admin (a failure here must not undo the request)
    try {
      const adminMsg = '🚨 *New Withdrawal Request*\n\nUser ID: `' + targetUserId + '`\nAmount: *' + reqAmount + ' HOWL* ($' + usdtValue.toFixed(4) + ')\nFee: $0.0100\nPayout: *$' + payoutUsdt.toFixed(4) + ' USDT*\n\nAddress: `' + cleanAddress + '`';
      await fetch('https://api.telegram.org/bot' + BOT_TOKEN + '/sendMessage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: ADMIN_CHAT_ID,
          text: adminMsg,
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '✅ Approve & Pay', callback_data: 'A_' + timestampId }],
              [{ text: '❌ Reject & Refund', callback_data: 'R_' + timestampId }],
              [{ text: '❌ Reject (No Refund)', callback_data: 'NR_' + timestampId }]
            ]
          }
        })
      });
    } catch (notifyErr) {
      console.error('Admin notify failed:', notifyErr.message);
    }

    return res.status(200).json({ success: true, user_balance: debit.balance });

  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server error: ' + err.message });
  }
    }
