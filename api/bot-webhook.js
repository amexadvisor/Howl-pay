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

      // Retrieve transaction data natively from existing tables
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

      if (action === 'R') {
          // Reject WITH Refund
          await supabase.from('transactions').insert([{
              user_id: userId,
              reward_amount: usdtDeducted,
              transaction_id: 'REF_' + Date.now() + '_' + userId,
              task_type: 'Withdrawal Refund (Admin Rejected)',
              status: '1',
              created_at: new Date().toISOString()
          }]);
          
          await supabase.from('transactions').update({ status: 'rejected_refunded' }).eq('transaction_id', txRow.transaction_id);
          
          await editAdminMessage(messageId, "❌ *Rejected & Refunded*\nUser was refunded $" + usdtDeducted.toFixed(4) + ".");
          await notifyUser(userId, "❌ Your withdrawal request was rejected. $" + usdtDeducted.toFixed(4) + " has been refunded to your balance.");

      } else if (action === 'NR') {
          // Reject WITHOUT Refund
          await supabase.from('transactions').update({ status: 'rejected_norefund' }).eq('transaction_id', txRow.transaction_id);
          
          await editAdminMessage(messageId, "❌ *Rejected (No Refund)*\nRequest closed without balance restoration.");
          await notifyUser(userId, "❌ Your withdrawal request was rejected by administration.");

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
              
              // Mark transaction approved and save tx hash in history
              await supabase.from('transactions').update({ status: 'approved', transaction_id: tx.hash }).eq('transaction_id', txRow.transaction_id);
              
              await editAdminMessage(messageId, "✅ *Paid Successfully*\nAmount: $" + payoutUsdt.toFixed(4) + "\nTxHash: [" + tx.hash + "](https://bscscan.com/tx/" + tx.hash + ")");
              await notifyUser(userId, "🎉 *Withdrawal Approved!*\n$" + payoutUsdt.toFixed(4) + " USDT (BEP-20) has been sent to your wallet.\n\nTxHash: [" + tx.hash + "](https://bscscan.com/tx/" + tx.hash + ")");
          
          } catch (err) {
              // BLOCKCHAIN ERROR AUTOMATIC REFUND LOGIC
              await supabase.from('transactions').insert([{
                  user_id: userId,
                  reward_amount: usdtDeducted,
                  transaction_id: 'REF_ERR_' + Date.now() + '_' + userId,
                  task_type: 'Withdrawal Auto-Refund (Blockchain Error)',
                  status: '1',
                  created_at: new Date().toISOString()
              }]);

              await supabase.from('transactions').update({ status: 'blockchain_failed_refunded' }).eq('transaction_id', txRow.transaction_id);

              const shortErr = err.message ? err.message.substring(0, 40) : "Unknown error";
              await editAdminMessage(messageId, "⚠️ *Blockchain Failed & Auto-Refunded*\nError: " + shortErr + "\n\nFunds have been returned to user.");
              await notifyUser(userId, "⚠️ Your withdrawal encountered a blockchain network error. Your $" + usdtDeducted.toFixed(4) + " balance has been automatically refunded.");
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

async function notifyUser(userId, text) {
    await fetch('https://api.telegram.org/bot' + BOT_TOKEN + '/sendMessage', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: userId, text: text, parse_mode: 'Markdown', disable_web_page_preview: true })
    });
}
