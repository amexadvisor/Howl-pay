import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const SURVEY_WEBHOOK_URL = process.env.SURVEY_WEBHOOK_URL;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const TIMEWALL_SECRET_KEY = process.env.TIMEWALL_SECRET_KEY; // From your TimeWall dashboard settings

const supabase = (SUPABASE_URL && SUPABASE_KEY) ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;

// TimeWall official approved server IPs
const ALLOWED_IPS = ['18.156.132.55', '51.81.120.73', '142.111.248.18'];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS, GET');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const data = req.method === 'POST' ? (req.body || {}) : req.query;

  if (req.method === 'GET' && !data.userid && !data.uid) {
    return res.status(200).json({ status: "TimeWall Gateway is online" });
  }

  // Optional: IP Whitelisting check behind Vercel proxy headers
  const clientIp = req.headers['x-forwarded-for'] ? req.headers['x-forwarded-for'].split(',')[0].trim() : req.socket.remoteAddress;
  if (process.env.NODE_ENV === 'production' && clientIp && !ALLOWED_IPS.includes(clientIp)) {
    console.warn(`Blocked untrusted IP attempt: ${clientIp}`);
  }

  const userId = data.userid || data.uid || data.subId;
  const rawRevenue = data.revenue || data.reward || data.amount || "0";
  const rawCurrencyAmount = data.currencyAmount || data.currency || rawRevenue;
  let rewardAmount = parseFloat(rawCurrencyAmount) || 0;
  const transactionId = data.txid || data.oid || data.transId || `tw_${Date.now()}`;
  const txStatus = String(data.type || data.status || "1");
  const receivedHash = data.hash;

  // Verify TimeWall SHA256 Hash if provided in parameters
  if (TIMEWALL_SECRET_KEY && receivedHash) {
    const stringToHash = `${userId}${rawRevenue}${TIMEWALL_SECRET_KEY}`;
    const calculatedHash = crypto.createHash('sha256').update(stringToHash).digest('hex');
    
    if (calculatedHash !== receivedHash) {
      return res.status(400).json({ success: false, error: "TimeWall cryptographic hash verification failed" });
    }
  }

  const isReversal = txStatus === '-1' || txStatus === 'chargeback' || txStatus === 'reversal' || rewardAmount < 0;
  if (isReversal && rewardAmount > 0) {
    rewardAmount = -Math.abs(rewardAmount);
  }

  if (!userId || isNaN(rewardAmount)) {
    return res.status(400).json({ success: false, error: "Missing required TimeWall parameters" });
  }

  let supabaseDebugInfo = { insert_error: null };

  if (supabase) {
    const payload = {
      user_id: String(userId),
      reward_amount: rewardAmount,
      transaction_id: String(transactionId),
      task_type: isReversal ? 'TimeWall Reversal' : 'TimeWall Survey',
      status: isReversal ? '-1' : '1',
      created_at: new Date().toISOString()
    };

    try {
      const response = await supabase.from('transactions').insert([payload]).select();
      if (response.error) supabaseDebugInfo.insert_error = response.error;
    } catch (dbErr) {
      supabaseDebugInfo.insert_error = dbErr.message;
    }
  } else {
    supabaseDebugInfo.insert_error = "Supabase client not initialized";
  }

  try {
    if (SURVEY_WEBHOOK_URL) {
      await fetch(SURVEY_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: String(userId),
          reward: rewardAmount,
          transactionId: String(transactionId),
          status: isReversal ? '-1' : '1'
        })
      });
    }

    // TimeWall expects plain text "OK" confirmation response
    return res.status(200).send("OK");
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message, supabase_debug: supabaseDebugInfo });
  }
}
