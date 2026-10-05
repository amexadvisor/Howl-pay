import { createClient } from '@supabase/supabase-js';
import { ethers } from 'ethers';
import { HOWL_USD_RATE, creditHowl, verifyCallback } from '../lib/balance.js';

const SUPABASE_URL = (process.env.SUPABASE_URL || '').trim();
const SUPABASE_SERVICE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || '').trim(); 
const supabase = (SUPABASE_URL && SUPABASE_SERVICE_KEY) ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY) : null;
const BOT_TOKEN = process.env.BOT_TOKEN;

// Give the HOWL back to the  user's real balance (same logic as every other endpoint)
async function refundToBalance(userId, usd) {
  const howl = Math.round(usd / HOWL_USD_RATE);
  try {
    const r = await creditHowl(supabase, userId, howl, { lifetime: false });
    return !!(r && r.ok);
  } catch (e) {
    console.error('Refund failed:', e.message);
    return false;
  }
}

async function answerCb(callbackId, text) {
  await fetch('https://api.telegram.org/bot' + BOT_TOKEN + '/answerCallbackQuery', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callback_query_id: callbackId, text })
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).end();

  try {
    const body = req.body;

    if (body.callback_query) {
      const callbackId = body.callback_query.id;
      const clickerId = String(body.callback_query.from.id);
      const data = body.callback_query.data;
      const messageId = body.callback_query.message.message_id;

      // SECURITY: Only process your specific admin button clicks
      if (clickerId !== '8026237972' || (!data.startsWith('A_') && !data.startsWith('R_') && !data.startsWith('NR_'))) {
        return res.status(200).json({ success: true }); 
      }

      const action = data.startsWith('NR_') ? 'NR' : data.split('_')[0]; 
      const timestampId = data.split('_')[1];

      // SECURITY: the button must carry a signature only this server can create.
      // A forged request that merely claims to be the admin has no valid signature.
      const cbParts = data.split('_');
      const cbSig = cbParts[cbParts.length - 1];
      if (cbParts.length < 3 || !/^\d{10,15}$/.test(String(timestampId)) || !verifyCallback(action, timestampId, cbSig, BOT_TOKEN)) {
          await answerCb(callbackId, "Invalid or outdated button.");
          return res.status(200).json({ success: true });
      }

      // Retrieve pending withdrawal transaction data
      const { data: txRow } = await supabase.from('transactions')
          .select('*').like('transaction_id', 'W_' + timestampId + '_%').single();

      if (!txRow || txRow.status !== 'pending') {
          await answerCb(callbackId, "Already processed or invalid.");
          return res.status(200).json({ success: true });
      }

      // ATOMIC CLAIM: only one click can move the request out of 'pending'.
      // Prevents double refunds / double payouts on a double tap.
      const { data: claimed } = await supabase.from('transactions')
          .update({ status: 'processing' })
          .eq('transaction_id', txRow.transaction_id)
          .eq('status', 'pending')
          .select('transaction_id');

      if (!claimed || claimed.length === 0) {
          await answerCb(callbackId, "Already processed or invalid.");
          return res.status(200).json({ success: true });
      }

      const userId = txRow.user_id;
      
      const rawTaskType = String(txRow.task_type || '');
      const addressPart = rawTaskType.includes(':') ? rawTaskType.split(':')[1] : rawTaskType;
      const address = addressPart.replace(/\s+/g, '').trim();

      const usdtDeducted = Math.abs(parseFloat(txRow.reward_amount));
      const payoutUsdt = usdtDeducted - 0.01;

      // Fetch User's First Name for the public notification
      let firstName = "User";
      const { data: userRecord } = await supabase.from('users').select('name').eq('user_id', userId).maybeSingle();
      if (userRecord && userRecord.name) {
          firstName = userRecord.name.split(' ')[0];
      }

      if (action === 'R') {
          // Refund FIRST. If it fails, put the request back to pending so you can retry.
          const refunded = await refundToBalance(userId, usdtDeducted);
          if (!refunded) {
              await supabase.from('transactions').update({ status: 'pending' }).eq('transaction_id', txRow.transaction_id);
              await answerCb(callbackId, "Refund failed. Nothing changed, try again.");
              return res.status(200).json({ success: true });
          }

          await supabase.from('transactions').update({ status: 'rejected' }).eq('transaction_id', txRow.transaction_id);

          await supabase.from('transactions').insert([{
              user_id: userId,
              reward_amount: usdtDeducted,
              transaction_id: 'REF_' + Date.now() + '_' + userId,
              task_type: 'Withdrawal Refund (Rejected by Admin)',
              status: '1',
              created_at: new Date().toISOString()
          }]);
          
          await editAdminMessage(messageId, "❌ *Rejected & Refunded*\nUser was refunded $" + usdtDeducted.toFixed(4) + ".");
          await notifyUserRaw(userId, "❌ Your withdrawal request was rejected. $" + usdtDeducted.toFixed(4) + " has been refunded to your balance.");

      } else if (action === 'NR') {
          await supabase.from('transactions').update({ status: 'rejected_norefund' }).eq('transaction_id', txRow.transaction_id);

          await supabase.from('transactions').insert([{
              user_id: userId,
              reward_amount: 0,
              transaction_id: 'REJ_' + Date.now() + '_' + userId,
              task_type: 'Withdrawal Rejected (No Refund)',
              status: '1',
              created_at: new Date().toISOString()
          }]);
          
          await editAdminMessage(messageId, "❌ *Rejected (No Refund)*\nRequest closed without balance restoration.");
          await notifyUserRaw(userId, "❌ Your withdrawal request was rejected by administration.");

      } else if (action === 'A') {
          await answerCb(callbackId, "Processing Blockchain Payout...");

          // --- Only the blockchain transfer is inside this try. ---
          // If it fails, the money was NOT sent, so refunding is safe.
          let tx;
          try {
              const provider = new ethers.JsonRpcProvider("https://bsc-dataseed.binance.org/");
              const wallet = new ethers.Wallet(process.env.HOT_WALLET_PRIVATE_KEY, provider);
              const contract = new ethers.Contract("0x55d398326f99059fF775485246999027B3197955", ["function transfer(address to, uint256 amount) returns (bool)"], wallet);
              
              const amountInWei = ethers.parseUnits(payoutUsdt.toFixed(4), 18);
              tx = await contract.transfer(address, amountInWei);
          } catch (err) {
              await supabase.from('transactions').update({ status: 'blockchain_failed' }).eq('transaction_id', txRow.transaction_id);

              const refunded = await refundToBalance(userId, usdtDeducted);
              const shortErr = err.message ? err.message.substring(0, 40) : "Unknown error";

              if (refunded) {
                  await supabase.from('transactions').insert([{
                      user_id: userId,
                      reward_amount: usdtDeducted,
                      transaction_id: 'REF_ERR_' + Date.now() + '_' + userId,
                      task_type: 'Withdrawal Auto-Refund (Network Error)',
                      status: '1',
                      created_at: new Date().toISOString()
                  }]);
                  await editAdminMessage(messageId, "⚠️ *Blockchain Failed & Auto-Refunded*\nError: " + shortErr + "\n\nFunds have been returned to user.");
                  await notifyUserRaw(userId, "⚠️ Your withdrawal encountered a blockchain network error. Your $" + usdtDeducted.toFixed(4) + " balance has been automatically refunded.");
              } else {
                  await editAdminMessage(messageId, "🚨 *Blockchain Failed AND auto-refund failed*\nError: " + shortErr + "\n\nUser ID: `" + userId + "`\nRefund manually: $" + usdtDeducted.toFixed(4));
              }
              return res.status(200).json({ success: true });
          }

          // --- Payment is sent. Nothing below may ever trigger a refund. ---
          try {
              await supabase.from('transactions').update({ status: 'approved' }).eq('transaction_id', txRow.transaction_id);

              await supabase.from('transactions').insert([{
                  user_id: userId,
                  reward_amount: -payoutUsdt,
                  transaction_id: tx.hash,
                  task_type: 'USDT Payout (BEP-20)',
                  status: '1',
                  created_at: new Date().toISOString()
              }]);
              
              await editAdminMessage(messageId, "✅ *Paid Successfully*\nAmount: $" + payoutUsdt.toFixed(4) + "\nTxHash: [" + tx.hash + "](https://bscscan.com/tx/" + tx.hash + ")");
              
              // 1. PRIVATE USER MESSAGE (No Name, No App Link)
              const userHtml = 
                '<tg-emoji emoji-id="6267107057304868214">⚡</tg-emoji> <b>Withdrawal Successful!</b>\n\n' +
                '<tg-emoji emoji-id="5409048419211682843">💵</tg-emoji> Amount: <b>$' + payoutUsdt.toFixed(4) + ' USDT</b> (after $0.01 fee)\n' +
                '<tg-emoji emoji-id="5280944517027998187">🪙</tg-emoji> Gateway: <b>USDT BEP20</b>\n' +
                '<tg-emoji emoji-id="5445221832074483553">📦</tg-emoji> Address: <code>' + address + '</code>\n\n' +
                '<tg-emoji emoji-id="5188481279963715781">🚀</tg-emoji> Your funds have been sent successfully!';

              // 2. PUBLIC GROUP MESSAGE (Includes Name and App Link)
              const groupHtml = 
                '<tg-emoji emoji-id="6267107057304868214">⚡</tg-emoji> <b>Withdrawal Successful!</b>\n\n' +
                '<tg-emoji emoji-id="5316989025037334866">👤</tg-emoji> User: <b>' + firstName + '</b>\n' +
                '<tg-emoji emoji-id="5409048419211682843">💵</tg-emoji> Amount: <b>$' + payoutUsdt.toFixed(4) + ' USDT</b> (after $0.01 fee)\n' +
                '<tg-emoji emoji-id="5280944517027998187">🪙</tg-emoji> Gateway: <b>USDT BEP20</b>\n' +
                '<tg-emoji emoji-id="5445221832074483553">📦</tg-emoji> Address: <code>' + address + '</code>\n\n' +
                '<tg-emoji emoji-id="5188481279963715781">🚀</tg-emoji> App: <a href="https://t.me/howl_paybot/app?startapp=ref_8026237972">HOWL</a>';

              const replyMarkup = {
                  inline_keyboard: [
                      [{ 
                          text: "View on BscScan", 
                          url: "https://bscscan.com/tx/" + tx.hash,
                          icon_custom_emoji_id: "5280944517027998187"
                      }]
                  ]
              };

              // SEND TO PRIVATE CHAT (USER)
              await fetch('https://api.telegram.org/bot' + BOT_TOKEN + '/sendMessage', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                      chat_id: userId,
                      text: userHtml,
                      parse_mode: 'HTML',
                      disable_web_page_preview: true,
                      reply_markup: replyMarkup
                  })
              });

              // SEND TO PUBLIC PAYOUT CHANNEL (@howlpayout)
              await fetch('https://api.telegram.org/bot' + BOT_TOKEN + '/sendMessage', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                      chat_id: '@howlpayout',
                      text: groupHtml,
                      parse_mode: 'HTML',
                      disable_web_page_preview: true,
                      reply_markup: replyMarkup
                  })
              });
          } catch (postErr) {
              console.error('Post-payment step failed (payout already sent):', postErr.message, 'tx:', tx && tx.hash);
          }
      }
    }
    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(200).end();
  }
}

async function editAdminMessage(messageId, newText) {
    await fetch('https://api.telegram.org/bot' + BOT_TOKEN + '/editMessageText', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: '8026237972', message_id: messageId, text: newText, parse_mode: 'Markdown', disable_web_page_preview: true })
    });
}

async function notifyUserRaw(userId, text) {
    await fetch('https://api.telegram.org/bot' + BOT_TOKEN + '/sendMessage', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: userId, text: text, disable_web_page_preview: true })
    });
    }
