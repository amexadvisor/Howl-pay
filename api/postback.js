const crypto = require('crypto');

const OFFERWALL_SECRET_KEY = process.env.OFFERWALL_SECRET_KEY;
const SURVEY_WEBHOOK_URL = process.env.SURVEY_WEBHOOK_URL;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

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

  let supabaseErrorDetails = null;

  // STRICTLY AWAIT DATABASE WRITE BEFORE PROCEEDING
  if (SUPABASE_URL && SUPABASE_KEY && (txStatus === "1" || txStatus === "2")) {
    try {
      const dbResponse = await fetch(`${SUPABASE_URL}/rest/v1/transactions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": SUPABASE_KEY,
          "Authorization": `Bearer ${SUPABASE_KEY}`,
          "Prefer": "return=minimal"
        },
        body: JSON.stringify({
          user_id: String(userId),
          reward_amount: rewardAmount,
          transaction_id: String(transactionId),
          task_type: 'Offerwall Partner',
          status: txStatus,
          created_at: new Date().toISOString()
        })
      });

      if (!dbResponse.ok) {
        supabaseErrorDetails = await dbResponse.text();
        console.error("SUPABASE WRITE FAILED:", supabaseErrorDetails);
      }
    } catch (dbErr) {
      supabaseErrorDetails = dbErr.message;
      console.error("SUPABASE NETWORK ERROR:", dbErr.message);
    }
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
      supabase_error: supabaseErrorDetails
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message, supabase_error: supabaseErrorDetails });
  }
};
