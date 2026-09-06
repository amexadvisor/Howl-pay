const crypto = require('crypto');

const OFFERWALL_SECRET_KEY = "oLU53dfdzFpqUbgalyoEsWoRAjHGEU5j";
const SURVEY_WEBHOOK_URL = "https://api.telebotcreator.com/new-webhook?data=gAAAAABqnRexbFUmGL0_PHDFtmSfcMI1tlkWBTHN4bZ01OI4_zQ4ZtPO2QF7OK0wR6ca9TWW7fcf--WvTFy5vbqlGUkdr3t56T2iO0tOnWMQBZ7L8JttzlCDs4gQvAMEguZmDN0THDZeENQ76eq16zCK4prv5nPwK_KJbD_fuiDAKobkEH4_x6GFW4VK5VHNSotQpFMEzOx3";
const RELEASE_WEBHOOK_URL = "https://api.telebotcreator.com/new-webhook?data=gAAAAABqnTT5Mznt84S1YVGZUBHdDvUWFRkVExNe1KYo6YojNVG1DCtqAReQ9JvF7H2S_QZqBKSoPSuugN_4mytA989VRz34zd1NYnI0lm8m442J4GuzodYVQFFsTWcp-0USboXYHGDxo5-1BTP2vg68mo2NUCI1IczMOHAJ1KFb45qGDEAWm_kqfgKkwbbobuGo9HrYOCm1";

const HOLD_SECONDS = 15; // 7 days in seconds

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

  try {
    // 1. Trigger the immediate /surveyreward webhook
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

    // 2. Schedule the 7-day release using Vercel background delay instead of TelebotCreator
    if (txStatus === "1" && rewardAmount > 0) {
      setTimeout(async () => {
        try {
          await fetch(RELEASE_WEBHOOK_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              user_id: String(userId),
              reward: rewardAmount,
              transactionId: String(transactionId)
            })
          });
        } catch (err) {
          console.error("Delayed release trigger failed:", err.message);
        }
      }, HOLD_SECONDS * 1000); // 7 days in milliseconds
    }

    return res.status(200).json({
      success: webhookRes.ok,
      telebot_response: responseText
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};
