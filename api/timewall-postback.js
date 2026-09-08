import { createClient } from '@supabase/supabase-js';

const SURVEY_WEBHOOK_URL = process.env.SURVEY_WEBHOOK_URL;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const TIMEWALL_POSTBACK_SECRET = process.env.TIMEWALL_POSTBACK_SECRET;

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

  if (TIMEWALL_POSTBACK_SECRET && data.secret !== TIMEWALL_POSTBACK_SECRET) {
    return res.status(403).json({ success: false, error: "Unauthorized: Invalid postback secret token" });
  }

  const userId = data.uid || data.user_id || data.subId;
  const rawRewardStr = data.reward || data.amount || data.payout || "0";
  let rewardAmount = parseFloat(rawRewardStr) || 0;
  const transactionId = data.oid || data.transId || data.transaction_id || `tw_${Date.now()}`;
  const txStatus = String(data.status || "1");

  const isReversal = txStatus === '-1' || txStatus === 'chargeback' || txStatus === 'reversal' || rewardAmount < 0;
  if (isReversal && rewardAmount > 0) {
    rewardAmount = -Math.abs(rewardAmount);
  }

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

  if (supabase) {
    const payload = {
      user_id: String(userId),
      reward_amount: rewardAmount,
      transaction_id: String(transactionId),
      task_type: isReversal ? 'TimeWall Reversal' : 'TimeWall Survey',
      status: isReversal ? '-1' : txStatus,
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
  } else {
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
          status: isReversal ? '-1' : txStatus
        })
      });

      webhookResOk = webhookRes.ok;
      responseText = await webhookRes.text();
    }

    return res.status(200).send("OK");
  } catch (error) {
    return res.status(500).json({ 
      success: false, 
      error: error.message, 
      supabase_debug: supabaseDebugInfo 
    });
  }
}
