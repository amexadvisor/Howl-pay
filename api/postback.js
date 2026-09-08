const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const OFFERWALL_SECRET_KEY = process.env.OFFERWALL_SECRET_KEY;
const SURVEY_WEBHOOK_URL = process.env.SURVEY_WEBHOOK_URL;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

const supabase = (SUPABASE_URL && SUPABASE_KEY) ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;

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

  const stringToHash = `${userId}${transactionId}${rawRewardStr}${OFFERWALL_SECRET_KEY}`;
  const calculatedSignature = crypto.createHash('md5').update(stringToHash).digest('hex');

  if (calculatedSignature !== signature) {
    return res.status(400).json({ success: false, error: "Signature doesn't match" });
  }

  // --- EXTREME DEBUGGING BLOCK ---
  let supabaseDebugInfo = {
    url_exists: !!SUPABASE_URL,
    key_exists: !!SUPABASE_KEY,
    payload_attempted: null,
    insert_response_status: null,
    insert_response_statustext: null,
    insert_data: null,
    insert_error: null,
    catch_exception: null
  };

  if (supabase && (txStatus === "1" || txStatus === "2")) {
    const payload = {
      user_id: String(userId),
      reward_amount: rewardAmount,
      transaction_id: String(transactionId),
      task_type: 'Offerwall Partner',
      status: txStatus,
      created_at: new Date().toISOString()
    };
    supabaseDebugInfo.payload_attempted = payload;

    try {
      // Adding .select() forces Supabase to return the row. 
      // If RLS or a schema issue prevents the insert, it will throw an error or return an empty array here.
      const response = await supabase.from('transactions').insert([payload]).select();
      
      supabaseDebugInfo.insert_response_status = response.status;
      supabaseDebugInfo.insert_response_statustext = response.statusText;
      supabaseDebugInfo.insert_data = response.data;
      
      if (response.error) {
        supabaseDebugInfo.insert_error = response.error;
      }
    } catch (dbErr) {
      supabaseDebugInfo.catch_exception = { message: dbErr.message, stack: dbErr.stack };
    }
  } else if (!supabase) {
    supabaseDebugInfo.insert_error = "Supabase client not initialized (check environment variables)";
  } else {
    supabaseDebugInfo.insert_error = `Transaction status was ${txStatus}, expected 1 or 2`;
  }

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
      telebot_response: responseText,
      supabase_debug: supabaseDebugInfo
    });
  } catch (error) {
    return res.status(500).json({ 
      success: false, 
      error: error.message, 
      supabase_debug: supabaseDebugInfo 
    });
  }
};
