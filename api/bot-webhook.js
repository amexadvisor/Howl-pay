import { createClient } from '@supabase/supabase-js';
import { ethers } from 'ethers';
import { HOWL_USD_RATE, creditHowl, verifyCallback } from '../lib/balance.js';

const SUPABASE_URL = (process.env.SUPABASE_URL || '').trim();
const SUPABASE_SERVICE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || '').trim(); 
const supabase = (SUPABASE_URL && SUPABASE_SERVICE_KEY) ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY) : null;
const BOT_TOKEN = (process.env.BOT_TOKEN || '').trim();
const ADMIN_CHAT_ID = '8026237972';

// Intercepts errors and forwards them to the Admin Telegram
async function sendAdminLog(context, err) {
  try {
    const errorDetail = err instanceof Error ? (err.stack || err.message) : String(err);
    const logText = `🚨 *Vercel Log:* \`${context}\`\n\n\`\`\`\n${errorDetail.substring(0, 3800)}\n\`\`\``;
    
    await fetch('[https://api.telegram.org/bot](https://api.telegram.org/bot)' + BOT_TOKEN + '/sendMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: ADMIN_CHAT_ID, text: logText, parse_mode: 'Markdown' })
    });
  } catch (e) {
    console.error('[Admin Log Dispatch Failed]:', e);
  }
}

async function refundToBalance(userId, usd) {
  const howl = Math.round(usd / HOWL_USD_RATE);
  try {
    const r = await creditHowl(supabase, userId, howl, { lifetime: false });
    return !!(r && r.ok);
  } catch (e) {
    console.error('[Refund Error]:', e.message);
    await sendAdminLog('refundToBalance() Exception', e);
    return false;
  }
}

async function answerCb(callbackId, text) {
  try {
    await fetch('[https://api.telegram.org/bot](https://api.telegram.org/bot)' + BOT_TOKEN + '/answerCallbackQuery', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callback_query_id: callbackId, text })
    });
  } catch (err) {
    console.error('[AnswerCb Error]:', err.message);
    await sendAdminLog('answerCb() Network Failure', err);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).end();

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { return res.status(200).end(); }
  }

  try {
    if (body.callback_query) {
      const callbackId = body.callback_query.id;
      const clickerId = String(body.callback_query.from.id);
      const data = body.callback_query.data;
      const messageId = body.callback_query.message.message_id;

      if (clickerId !== ADMIN_CHAT_ID || (!data.startsWith('A_') && !data.startsWith('R_') && !data.startsWith('NR_'))) {
        return res.status(200).json({ success: true }); 
      }

      const action = data.startsWith('NR_') ? 'NR' : data.split('_')[0]; 
      const timestampId = data.split('_')[1];
      const cbParts = data.split('_');
      const cbSig = cbParts[cbParts.length - 1];

      if (typeof verifyCallback !== 'function') {
        await answerCb(callbackId, "Server Error: verifyCallback missing.");
        await sendAdminLog('Module Import Error', "verifyCallback is undefined in lib/balance.js");
        return res.status(200).json({ success: true });
      }

      if (cbParts.length < 3 || !/^\d{10,15}$/.test(String(timestampId)) || !verifyCallback(action, timestampId, cbSig, BOT_TOKEN)) {
          await answerCb(callbackId, "Invalid or outdated button.");
          return res.status(200).json({ success: true });
      }

      const { data: txRow, error: fetchErr } = await supabase.from('transactions')
          .select('*').like('transaction_id', 'W_' + timestampId + '_%').maybeSingle();

      if (fetchErr) {
          await sendAdminLog('Supabase Fetch Error (Transaction)', fetchErr);
          await answerCb(callbackId, "Database fetch error.");
          return res.status(200).json({ success: true });
      }

      if (!txRow || txRow.status !== 'pending') {
          await answerCb(callbackId, "Already processed or invalid.");
          return res.status(200).json({ success: true });
      }

      const { data: claimed, error: updateErr } = await supabase.from('transactions')
          .update({ status: 'processing' })
          .eq('transaction_id', txRow.transaction_id)
          .eq('status', 'pending')
          .select('transaction_id');

      if (updateErr) await sendAdminLog('Supabase Update Error (Processing Claim)', updateErr);

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

      let firstName = "User";
      const { data: userRecord } = await supabase.from('users').select('name').eq('user_id', userId).maybeSingle();
      if (userRecord && userRecord.name) {
          firstName = userRecord.name.split(' ')[0];
      }

      if (action === 'R') {
          await answerCb(callbackId, "Processing Refund..."); 
          const refunded = await refundToBalance(userId, usdtDeducted);
          if (!refunded) {
              await supabase.from('transactions').update({ status: 'pending' }).eq('transaction_id', txRow.transaction_id);
              await answerCb(callbackId, "Refund failed. Put back to pending.");
              return res.status(200).json({ success: true });
          }

          await supabase.from('transactions').update({ status: 'rejected' }).eq('transaction_id', txRow.transaction_id);
          await supabase.from('transactions').insert([{
              user_id: userId, reward_amount: usdtDeducted,
              transaction_id: 'REF_' + Date.now() + '_' + userId,
              task_type: 'Withdrawal Refund (Rejected by Admin)',
              status: '1', created_at: new Date().toISOString()
          }]);
          
          await editAdminMessage(messageId, "❌ *Rejected & Refunded*\nUser was refunded $" + usdtDeducted.toFixed(4) + ".");
          await notifyUserRaw(userId, "❌ Your withdrawal request was rejected. $" + usdtDeducted.toFixed(4) + " has been refunded to your balance.");

      } else if (action === 'NR') {
          await answerCb(callbackId, "Rejecting Request (No Refund)..."); 
          await supabase.from('transactions').update({ status: 'rejected_norefund' }).eq('transaction_id', txRow.transaction_id);
          await supabase.from('transactions').insert([{
              user_id: userId, reward_amount: 0,
              transaction_id: 'REJ_' + Date.now() + '_' + userId,
              task_type: 'Withdrawal Rejected (No Refund)',
              status: '1', created_at: new Date().toISOString()
          }]);
          
          await editAdminMessage(messageId, "❌ *Rejected (No Refund)*\nRequest closed without balance restoration.");
          await notifyUserRaw(userId, "❌ Your withdrawal request was rejected by administration.");

      } else if (action === 'A') {
          await answerCb(callbackId, "Processing Blockchain Payout...");
          let tx;
          try {
              const provider = new ethers.JsonRpcProvider("[https://bsc-dataseed.binance.org/](https://bsc-dataseed.binance.org/)");
              const wallet = new ethers.Wallet(process.env.HOT_WALLET_PRIVATE_KEY, provider);
              const contract = new ethers.Contract("0x55d398326f99059fF775485246999027B3197955", ["function transfer(address to, uint256 amount) returns (bool)"], wallet);
              const amountInWei = ethers.parseUnits(payoutUsdt.toFixed(4), 18);
              tx = await contract.transfer(address, amountInWei);
          } catch (err) {
              await sendAdminLog('Ethers.js / Blockchain Transaction Failure', err);
              await supabase.from('transactions').update({ status: 'blockchain_failed' }).eq('transaction_id', txRow.transaction_id);
              const refunded = await refundToBalance(userId, usdtDeducted);
              const shortErr = err.message ? err.message.substring(0, 40) : "Unknown error";

              if (refunded) {
                  await supabase.from('transactions').insert([{
                      user_id: userId, reward_amount: usdtDeducted,
                      transaction_id: 'REF_ERR_' + Date.now() + '_' + userId,
                      task_type: 'Withdrawal Auto-Refund (Network Error)',
                      status: '1', created_at: new Date().toISOString()
                  }]);
                  await editAdminMessage(messageId, "⚠️ *Blockchain Failed & Auto-Refunded*\nError: " + shortErr + "\n\nFunds have been returned to user.");
                  await notifyUserRaw(userId, "⚠️ Your withdrawal encountered a blockchain network error. Your $" + usdtDeducted.toFixed(4) + " balance has been automatically refunded.");
              } else {
                  await editAdminMessage(messageId, "🚨 *Blockchain Failed AND auto-refund failed*\nError: " + shortErr + "\n\nUser ID: `" + userId + "`\nRefund manually: $" + usdtDeducted.toFixed(4));
              }
              return res.status(200).json({ success: true });
          }

          try {
              await supabase.from('transactions').update({ status: 'approved' }).eq('transaction_id', txRow.transaction_id);
              await supabase.from('transactions').insert([{
                  user_id: userId, reward_amount: -payoutUsdt,
                  transaction_id: tx.hash, task_type: 'USDT Payout (BEP-20)',
                  status: '1', created_at: new Date().toISOString()
              }]);
              
              await editAdminMessage(messageId, "✅ *Paid Successfully*\nAmount: $" + payoutUsdt.toFixed(4) + "\nTxHash: [" + tx.hash + "](https://bscscan.com/tx/" + tx.hash + ")");
              
              const userHtml = 
                '<tg-emoji emoji-id="6267107057304868214">⚡</tg-emoji> <b>Withdrawal Successful!</b>\n\n' +
                '<tg-emoji emoji-id="5409048419211682843">💵</tg-emoji> Amount: <b>$' + payoutUsdt.toFixed(4) + ' USDT</b> (after $0.01 fee)\n' +
                '<tg-emoji emoji-id="5280944517027998187">🪙</tg-emoji> Gateway: <b>USDT BEP20</b>\n' +
                '<tg-emoji emoji-id="5445221832074483553">📦</tg-emoji> Address: <code>' + address + '</code>\n\n' +
                '<tg-emoji emoji-id="5188481279963715781">🚀</tg-emoji> Your funds have been sent successfully!';

              const groupHtml = 
                '<tg-emoji emoji-id="6267107057304868214">⚡</tg-emoji> <b>Withdrawal Successful!</b>\n\n' +
                '<tg-emoji emoji-id="5316989025037334866">👤</tg-emoji> User: <b>' + firstName + '</b>\n' +
                '<tg-emoji emoji-id="5409048419211682843">💵</tg-emoji> Amount: <b>$' + payoutUsdt.toFixed(4) + ' USDT</b> (after $0.01 fee)\n' +
                '<tg-emoji emoji-id="5280944517027998187">🪙</tg-emoji> Gateway: <b>USDT BEP20</b>\n' +
                '<tg-emoji emoji-id="5445221832074483553">📦</tg-emoji> Address: <code>' + address + '</code>\n\n' +
                '<tg-emoji emoji-id="5188481279963715781">🚀</tg-emoji> App: <a href="[https://t.me/howl_paybot/app?startapp=ref_8026237972](https://t.me/howl_paybot/app?startapp=ref_8026237972)">HOWL</a>';

              const replyMarkup = { inline_keyboard: [[{ text: "View on BscScan", url: "[https://bscscan.com/tx/](https://bscscan.com/tx/)" + tx.hash }]] };

              await fetch('[https://api.telegram.org/bot](https://api.telegram.org/bot)' + BOT_TOKEN + '/sendMessage', {
                  method: 'POST', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ chat_id: userId, text: userHtml, parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: replyMarkup })
              });
              await fetch('[https://api.telegram.org/bot](https://api.telegram.org/bot)' + BOT_TOKEN + '/sendMessage', {
                  method: 'POST', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ chat_id: '@howlpayout', text: groupHtml, parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: replyMarkup })
              });
          } catch (postErr) {
              await sendAdminLog('Post-Payment Messaging Error', postErr);
              console.error('Post-payment step failed:', postErr.message);
          }
      }
    }
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[Webhook Uncaught Error]:', err);
    await sendAdminLog('Fatal Webhook Crash', err);
    return res.status(200).end();
  }
}

async function editAdminMessage(messageId, newText) {
    try {
        await fetch('[https://api.telegram.org/bot](https://api.telegram.org/bot)' + BOT_TOKEN + '/editMessageText', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: ADMIN_CHAT_ID, message_id: messageId, text: newText, parse_mode: 'Markdown', disable_web_page_preview: true })
        });
    } catch(e) { await sendAdminLog('editAdminMessage Failed', e); }
}

async function notifyUserRaw(userId, text) {
    try {
        await fetch('[https://api.telegram.org/bot](https://api.telegram.org/bot)' + BOT_TOKEN + '/sendMessage', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: userId, text: text, disable_web_page_preview: true })
        });
    } catch(e) { await sendAdminLog('notifyUserRaw Failed', e); }
}
