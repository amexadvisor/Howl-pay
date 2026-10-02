import { createClient } from '@supabase/supabase-js';
import { ethers } from 'ethers';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
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

      // SECURITY: Only  process your specific button clicks
      if (clickerId !== '8026237972' || (!data.startsWith('A_') && !data.startsWith('R_'))) {
        return res.status(200).json({ success: true }); 
      }

      const action = data.split('_')[0]; 
      const timestampId = data.split('_')[1];

      // Retrieve transaction data natively from existing tables
      const { data: txRow } = await supabase.from('transactions')
          .select('*').like('transaction_id', `W_${timestampId}_%`).single();

      if (!txRow || txRow.status !== 'pending') {
          await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ callback_query_id: callbackId, text: "Already processed or invalid." })
          });
          return res.status(200).json({ success: true });
      }

      const userId = txRow.user_id;
      const address = txRow.task_type.replace('BEP20: ', '').trim();
      const usdtDeducted = Math.abs(parseFloat(txRow.reward_amount));
      const payoutUsdt = usdtDeducted - 0.01;
      const howlAmount = usdtDeducted / 0.00002;

      if (action === 'R') {
          // Process Refund
          const { data: user } = await supabase.from('users').select('balance, coins').eq('user_id', userId).single();
          await supabase.from('users').update({
              coins: parseFloat(user.coins) + howlAmount,
              balance: parseFloat(user.balance) + usdtDeducted
          }).eq('user_id', userId);
          
          await supabase.from('transactions').update({ status: 'rejected' }).eq('transaction_id', txRow.transaction_id);
          
          // Notify
          await editAdminMessage(messageId, `❌ *Rejected*\nUser refunded $${usdtDeducted.toFixed(4)}.`);
          await notifyUser(userId, `❌ Your withdrawal request was rejected and $${usdtDeducted.toFixed(4)} was refunded.`);

      } else if (action === 'A') {
          await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ callback_query_id: callbackId, text: "Processing Blockchain Payout..." })
          });

          try {
              // Connect and Execute Auto Web3 Payment
              const provider = new ethers.JsonRpcProvider("https://bsc-dataseed.binance.org/");
              const wallet = new ethers.Wallet(process.env.HOT_WALLET_PRIVATE_KEY, provider);
              const contract = new ethers.Contract("0x55d398326f99059fF775485246999027B3197955", ["function transfer(address to, uint256 amount) returns (bool)"], wallet);
              
              const amountInWei = ethers.parseUnits(payoutUsdt.toFixed(4), 18);
              const tx = await contract.transfer(address, amountInWei);
              
              await supabase.from('transactions').update({ status: 'approved', transaction_id: tx.hash }).eq('transaction_id', txRow.transaction_id);
              
              // Notify
              await editAdminMessage(messageId, `✅ *Paid Successfully*\nAmount: $${payoutUsdt.toFixed(4)}\nTxHash: [${tx.hash}](https://bscscan.com/tx/${tx.hash})`);
              await notifyUser(userId, `🎉 *Withdrawal Approved!*\n$${payoutUsdt.toFixed(4)} USDT (BEP-20) has been sent to your wallet.\n\nTxHash: [${tx.hash}](https://bscscan.com/tx/${tx.hash})`);
          } catch (err) {
              await editAdminMessage(messageId, `⚠️ *Blockchain Failed*\nError: ${err.message.substring(0, 50)}\n\nTransaction remains pending.`);
          }
      }
    }
    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(200).end();
  }
}

async function editAdminMessage(messageId, newText) {
    await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/editMessageText`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: '8026237972', message_id: messageId, text: newText, parse_mode: 'Markdown', disable_web_page_preview: true })
    });
}

async function notifyUser(userId, text) {
    await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: userId, text: text, parse_mode: 'Markdown', disable_web_page_preview: true })
    });
}
