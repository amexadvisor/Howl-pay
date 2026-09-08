const { createClient } = require('@supabase/supabase-js');

const SURVEY_WEBHOOK_URL = process.env.SURVEY_WEBHOOK_URL;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

const supabase = (SUPABASE_URL && SUPABASE_KEY) ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS, GET');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const data = req.method === 'POST' ? (req.body || {}) : req.query;

  if (req.method === 'GET' && !data.uid && !data.user_id) {
    return res.status(200).json({ status: "TimeWall Gateway is online" });
  }

  // TimeWall parameters (uid for user, reward/amount for payout, oid/txid for transaction)
  const userId = data.uid || data.user_id || data.subId;
  const rawRewardStr = data.reward || data.amount || data.payout || "0";
  const rewardAmount = parseFloat(rawRewardStr) || 0;
  const transactionId = data.oid || data.transId || data.transaction_id || `tw_${Date.now()}`;
  const txStatus = String(data.status || "1");

  if (!userId || isNaN(rewardAmount)) {
    return res.status(400).json({ success: false, error: "Missing required TimeWall postback parameters" });
  }

  let supabaseDebugInfo = {
    url_exists: !!SUPABASE_URL,
    key_exists: !!SUPABASE_KEY,
    payload_attempted: null,
    insert_response_status: null,
    insert_data: null,
    insert_error: null,
    catch_exception: null
  };

  if (supabase && (txStatus === "1" || txStatus === "2" || txStatus === "completed")) {
    const payload = {
      user_id: String(userId),
      reward_amount: rewardAmount,
      transaction_id: String(transactionId),
      task_type: 'TimeWall Survey',
      status: '1',
      created_at: new Date().toISOString()
    };
    supabaseDebugInfo.payload_attempted = payload;

    try {
      const response = await supabase.from('transactions').insert([payload]).select();
      
      supabaseDebugInfo.insert_response_status = response.status;
      supabaseDebugInfo.insert_data = response.data;
      
      if (response.error) {
        supabaseDebugInfo.insert_error = response.error;
      }
    } catch (dbErr) {
      supabaseDebugInfo.catch_exception = { message: dbErr.message, stack: dbErr.stack };
    }
  } else if (!supabase) {
    supabaseDebugInfo.insert_error = "Supabase client not initialized";
  }

  try {
    let webhookResOk = true;
    let responseText = "No webhook configured";

    if (SURVEY_WEBHOOK_URL) {
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

      webhookResOk = webhookRes.ok;
      responseText = await webhookRes.text();
    }

    // TimeWall expects a simple text response like "OK" to confirm receipt
    return res.status(200).send("OK");
  } catch (error) {
    return res.status(500).json({ 
      success: false, 
      error: error.message, 
      supabase_debug: supabaseDebugInfo 
    });
  }
}
