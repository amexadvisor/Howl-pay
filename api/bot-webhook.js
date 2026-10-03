import { createClient } from '@supabase/supabase-js';
import { ethers } from 'ethers';

const SUPABASE_URL = (process.env.SUPABASE_URL || '').trim();
const SUPABASE_SERVICE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || '').trim(); 
const supabase = (SUPABASE_URL && SUPABASE_SERVICE_KEY) ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY) : null;
const BOT_TOKEN = process.env.BOT_TOKEN;

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
      const timestampId = data.startsWith('NR_') ? data.split('_')[1] : data.split('_')[1];

      // Retrieve pending withdrawal transaction data
      const { data: txRow } = await supabase.from('transactions')
          .select('*').like('transaction_id', 'W_' + timestampId + '_%').single();

      if (!txRow || txRow.status !== 'pending') {
          await fetch('https://api.telegram.org/bot' + BOT_TOKEN + '/answerCallbackQuery', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ callback_query_id: callbackId, text: "Already processed or invalid." })
          });
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
      const { data: userRecord } = await supabase.from('users').select('name, coins, balance').eq('user_id', userId).maybeSingle();
      if (userRecord && userRecord.name) {
          firstName = userRecord.name.split(' ')[0]; // Extract just the first name
      }

      if (action === 'R') {
          // Update transaction status
          await supabase.from('transactions').update({ status: 'rejected' }).eq('transaction_id', txRow.transaction_id);

          // Log the refund transaction
          await supabase.from('transactions').insert([{
              user_id: userId,
              reward_amount: usdtDeducted,
              transaction_id: 'REF_' + Date.now() + '_' + userId,
              task_type: 'Withdrawal Refund (Rejected by Admin)',
              status: '1',
              created_at: new Date().toISOString()
          }]);

          // ACTUAL REFUND: Restore the user's database balance
          if (userRecord) {
              const howlRefund = Math.round(usdtDeducted / 0.00002);
              await supabase.from('users').update({
                  coins: (parseFloat(userRecord.coins) || 0) + howlRefund,
                  balance: (parseFloat(userRecord.balance) || 0) + usdtDeducted
              }).eq('user_id', userId);
          }
          
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
          await fetch('https://api.telegram.org/bot' + BOT_TOKEN + '/answerCallbackQuery', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ callback_query_id: callbackId, text: "Processing Blockchain Payout..." })
          });

          try {
              // Connect and Execute Auto Web3 Payment via BSC
              const provider = new ethers.JsonRpcProvider("https://bsc-dataseed.binance.org/");
              const wallet = new ethers.Wallet(process.env.HOT_WALLET_PRIVATE_KEY, provider);
              const contract = new ethers.Contract("0x55d398326f99059fF775485246999027B3197955", ["function transfer(address to, uint256 amount) returns (bool)"], wallet);
              
              const amountInWei = ethers.parseUnits(payoutUsdt.toFixed(4), 18);
              const tx = await contract.transfer(address, amountInWei);
              
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
          
          } catch (err) {
              await supabase.from('transactions').update({ status: 'blockchain_failed' }).eq('transaction_id', txRow.transaction_id);

              await supabase.from('transactions').insert([{
                  user_id: userId,
                  reward_amount: usdtDeducted,
                  transaction_id: 'REF_ERR_' + Date.now() + '_' + userId,
                  task_type: 'Withdrawal Auto-Refund (Network Error)',
                  status: '1',
                  created_at: new Date().toISOString()
              }]);

              // ACTUAL AUTO-REFUND: Restore the user's database balance on blockchain failure
              if (userRecord) {
                  const howlRefund = Math.round(usdtDeducted / 0.00002);
                  await supabase.from('users').update({
                      coins: (parseFloat(userRecord.coins) || 0) + howlRefund,
                      balance: (parseFloat(userRecord.balance) || 0) + usdtDeducted
                  }).eq('user_id', userId);
              }

              const shortErr = err.message ? err.message.substring(0, 40) : "Unknown error";
              await editAdminMessage(messageId, "⚠️ *Blockchain Failed & Auto-Refunded*\nError: " + shortErr + "\n\nFunds have been returned to user.");
              await notifyUserRaw(userId, "⚠️ Your withdrawal encountered a blockchain network error. Your $" + usdtDeducted.toFixed(4) + " balance has been automatically refunded.");
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
