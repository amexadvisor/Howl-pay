const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const OFFERWALL_SECRET_KEY = process.env.OFFERWALL_SECRET_KEY;
const SURVEY_WEBHOOK_URL = process.env.SURVEY_WEBHOOK_URL;

// Initialize Supabase Client for Ledger & Leaderboard
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = (supabaseUrl && supabaseKey) ? createClient(supabaseUrl, supabaseKey) : null;

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS, GET');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const data = req.method === 'POST' ? (req.body || {}) : req.query;

  if (req.method === 'GET' && !data.subId && !data.webhook) {
    return res.status(200).json({ status: "Gateway is online" });
  }

  const { webhook, subId, transId, reward, status, signature } = data;

  if (webhook) {
    try {
      const forwardRes = await fetch(webhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed: true, timestamp: Date.now() })
      });
      return res.status(200).json({ success: true, forwarded: forwardRes.ok });
    } catch (err) {
      return res.status(500).json({ error: "Webhook forwarding failed: " + err.message });
    }
  }

  const userId = subId;
  const transactionId = transId;
  const rawRewardStr = reward ? String(reward) : "0";
  const rewardAmount = parseFloat(rawRewardStr) || 0;
  const txStatus = String(status || "1");

  if (!userId || !transactionId || isNaN(rewardAmount) || !signature) {
    return res.status(400).json({ success: false, error: "Missing required postback parameters" });
  }

  // MD5 Security Verification
  const stringToHash = `${userId}${transactionId}${rawRewardStr}${OFFERWALL_SECRET_KEY}`;
  const calculatedSignature = crypto.createHash('md5').update(stringToHash).digest('hex');

  if (calculatedSignature !== signature) {
    return res.status(400).json({ success: false, error: "Signature doesn't match" });
  }

  // ---> NEW: Log to Database for Transaction Ledger & Leaderboard
  // Only log if the transaction status is successful (e.g., "1" or "2")
  if (supabase && (txStatus === "1" || txStatus === "2")) {
    try {
      await supabase.from('transactions').insert([{
        user_id: String(userId),
        reward_amount: rewardAmount,
        transaction_id: String(transactionId),
        task_type: 'Offerwall Partner',
        status: txStatus,
        created_at: new Date().toISOString()
      }]);
    } catch (dbErr) {
      console.error("Database logging failed:", dbErr.message);
      // Failsafe: Do not block the Telebot webhook if the DB log fails
    }
  }
  // <--- END NEW

  try {
    const webhookRes = await fetch(SURVEY_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: String(userId),
        reward: rewardAmount,
        transactionId: String(transactionId),
        status: txStatus
      })
    });

    const responseText = await webhookRes.text();

    return res.status(200).json({
      success: webhookRes.ok,
      telebot_response: responseText
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};
