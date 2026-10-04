import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import {
  HOLD_DAYS,
  HOWL_USD_RATE,
  creditHold,
  reduceHold,
  debitHowlUpTo,
  releaseDueHolds
} from '../lib/balance.js';

const SUPABASE_URL = (process.env.SUPABASE_URL || 'https://knrgbyezxjunjysaaukx.supabase.co').trim();
const SUPABASE_SERVICE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || '').trim();
const TIMEWALL_SECRET_KEY = process.env.TIMEWALL_SECRET_KEY;
const BOT_TOKEN = (process.env.BOT_TOKEN || '').trim();

const supabase = (SUPABASE_URL && SUPABASE_SERVICE_KEY) ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY) : null;

const HOLD_TYPE = 'TimeWall Survey (On Hold)';
const REVERSED_TYPE = 'TimeWall Survey (Reversed)';

const fmtHowl = (usd) => Math.round(usd / HOWL_USD_RATE).toLocaleString('en-US');
const fmtUsd = (usd) => '$' + (+usd).toFixed(4);

// Telegram message to the user (never lets a failure break the postback)
async function notifyUser(userId, text) {
  if (!BOT_TOKEN) return;
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: userId, text, disable_web_page_preview: true })
    });
  } catch (e) {
    console.error('[timewall notify]', e.message);
  }
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS, GET');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const data = req.method === 'POST' ? (req.body || {}) : req.query;

  if (req.method === 'GET' && !data.userid && !data.uid) {
    return res.status(200).json({ status: 'TimeWall Gateway is online' });
  }

  const userId = data.userid || data.uid;
  const rawRevenue = data.revenue || data.reward || data.amount || '0';
  const rawCurrencyAmount = data.currencyAmount || data.currency || rawRevenue;
  let rewardAmount = parseFloat(rawCurrencyAmount) || 0;
  const transactionId = data.txid || data.oid || data.transId;
  const txStatus = String(data.type || data.status || '1');
  const receivedHash = data.hash;

  // STRICT SECURITY: reject any call without a valid TimeWall signature
  if (!TIMEWALL_SECRET_KEY || !receivedHash) {
    return res.status(403).json({ success: false, error: 'Forbidden: Missing signature security parameters' });
  }

  // TimeWall hash formula: sha256(userID + revenue + SecretKey)
  const calculatedHash = crypto.createHash('sha256').update(`${userId}${rawRevenue}${TIMEWALL_SECRET_KEY}`).digest('hex');
  if (!safeEqual(calculatedHash, receivedHash)) {
    return res.status(403).json({ success: false, error: 'Unauthorized: Invalid cryptographic signature hash' });
  }

  const isReversal = txStatus === '-1' || txStatus === 'chargeback' || txStatus === 'reversal' || rewardAmount < 0;

  if (!userId || !transactionId || isNaN(rewardAmount)) {
    return res.status(400).json({ success: false, error: 'Missing required postback fields' });
  }

  const uid = String(userId);
  const txid = String(transactionId);
  const usd = Math.abs(rewardAmount);

  if (usd === 0) return res.status(200).send('OK');
  if (!supabase) return res.status(500).send('RETRY');   // TimeWall retries non-200 responses

  try {
    const getRow = async () => {
      const { data: row } = await supabase.from('transactions')
        .select('transaction_id, reward_amount, status, task_type')
        .eq('user_id', uid).eq('transaction_id', txid).maybeSingle();
      return row;
    };

    /* ============================ COMPLETION ============================ */
    if (!isReversal) {
      if (await getRow()) return res.status(200).send('OK');             // duplicate postback, already handled

      // make sure the user row exists so the hold can be stored
      const { data: userRow } = await supabase.from('users').select('user_id').eq('user_id', uid).maybeSingle();
      if (!userRow) {
        await supabase.from('users').insert([{
          user_id: uid, coins: 0, balance: 0, hold_balance: 0, total_earned: 0, created_at: new Date().toISOString()
        }]);
      }

      // 1) ledger row first (this is what marks the task as handled)
      const { error: insErr } = await supabase.from('transactions').insert([{
        user_id: uid,
        reward_amount: usd,
        transaction_id: txid,
        task_type: HOLD_TYPE,
        status: 'hold',
        created_at: new Date().toISOString()
      }]);
      if (insErr) {
        if (await getRow()) return res.status(200).send('OK');           // parallel retry beat us
        console.error('[timewall] ledger insert failed:', insErr.message);
        return res.status(500).send('RETRY');
      }

      // 2) put the money on hold
      let ok = false;
      try { ok = (await creditHold(supabase, uid, usd)).ok; } catch (e) { console.error('[timewall] hold failed:', e.message); }
      if (!ok) {
        await supabase.from('transactions').delete().eq('user_id', uid).eq('transaction_id', txid).eq('status', 'hold');
        return res.status(500).send('RETRY');
      }

    /* ============================== REVERSAL ============================ */
    } else {
      const revTxId = `rev_${txid}`;
      const { data: revDup } = await supabase.from('transactions').select('transaction_id')
        .eq('user_id', uid).eq('transaction_id', revTxId).maybeSingle();
      if (revDup) return res.status(200).send('OK');                     // reversal already processed

      let row = await getRow();
      if (row && row.status === 'reversed') return res.status(200).send('OK');

      // Still being released/reversed by another request: ask TimeWall to try again shortly
      if (row && (row.status === 'releasing' || row.status === 'reversing')) {
        return res.status(500).send('RETRY');
      }

      // ---- A) task is still on hold -> reduce the HOLD balance ----
      if (row && row.status === 'hold') {
        const { data: claimed } = await supabase.from('transactions')
          .update({ status: 'reversing' })
          .eq('user_id', uid).eq('transaction_id', txid).eq('status', 'hold')
          .select('reward_amount');

        if (claimed && claimed.length > 0) {
          const amt = Math.abs(parseFloat(claimed[0].reward_amount)) || usd;

          let ok = false;
          try { ok = (await reduceHold(supabase, uid, amt)).ok; } catch (e) { console.error('[timewall] reduce hold failed:', e.message); }
          if (!ok) {
            await supabase.from('transactions').update({ status: 'hold' })
              .eq('user_id', uid).eq('transaction_id', txid).eq('status', 'reversing');
            return res.status(500).send('RETRY');
          }

          await supabase.from('transactions')
            .update({ status: 'reversed', task_type: REVERSED_TYPE })
            .eq('user_id', uid).eq('transaction_id', txid);

          await supabase.from('transactions').insert([{
            user_id: uid,
            reward_amount: -amt,
            transaction_id: revTxId,
            task_type: 'TimeWall Reversal',
            status: '-1',
            created_at: new Date().toISOString()
          }]);

          await notifyUser(uid,
            `⚠️ TimeWall reversed one of your completed tasks.\n\n` +
            `${fmtHowl(amt)} HOWL (${fmtUsd(amt)}) was removed from your pending balance.\n` +
            `Pending rewards are held for ${HOLD_DAYS} days to allow for this.`);

          return res.status(200).send('OK');
        }
        row = await getRow();   // lost a race: re-read and fall through
        if (row && row.status === 'reversed') return res.status(200).send('OK');
      }

      // ---- B) already released (or an older credit we never held) -> take back from the main balance ----
      const amt = row ? (Math.abs(parseFloat(row.reward_amount)) || usd) : usd;
      let taken = 0;
      try {
        const r = await debitHowlUpTo(supabase, uid, amt / HOWL_USD_RATE);
        taken = (r.meta && r.meta.taken) || 0;
      } catch (e) {
        console.error('[timewall] clawback failed:', e.message);
        return res.status(500).send('RETRY');
      }
      const takenUsd = taken * HOWL_USD_RATE;

      if (row) {
        await supabase.from('transactions')
          .update({ status: 'reversed', task_type: REVERSED_TYPE })
          .eq('user_id', uid).eq('transaction_id', txid);
      }
      await supabase.from('transactions').insert([{
        user_id: uid,
        reward_amount: -amt,
        transaction_id: revTxId,
        task_type: 'TimeWall Reversal',
        status: '-1',
        created_at: new Date().toISOString()
      }]);

      await notifyUser(uid,
        `⚠️ TimeWall reversed a task whose reward had already been released.\n\n` +
        `${fmtHowl(takenUsd)} HOWL (${fmtUsd(takenUsd)}) was deducted from your balance.`);
    }

    // Opportunistic: pay out any of this user's holds that are now older than HOLD_DAYS
    try { await releaseDueHolds(supabase, uid); } catch (e) { console.error('[timewall] release error:', e.message); }

    return res.status(200).send('OK');
  } catch (err) {
    console.error('[timewall] error:', err.message);
    return res.status(500).send('RETRY');
  }
      }
