const crypto = require('crypto');

const OFFERWALL_SECRET_KEY = "oLU53dfdzFpqUbgalyoEsWoRAjHGEU5j";
const SURVEY_WEBHOOK_URL = "https://api.telebotcreator.com/new-webhook?data=gAAAAABqnRexbFUmGL0_PHDFtmSfcMI1tlkWBTHN4bZ01OI4_zQ4ZtPO2QF7OK0wR6ca9TWW7fcf--WvTFy5vbqlGUkdr3t56T2iO0tOnWMQBZ7L8JttzlCDs4gQvAMEguZmDN0THDZeENQ76eq16zCK4prv5nPwK_KJbD_fuiDAKobkEH4_x6GFW4VK5VHNSotQpFMEzOx3";

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
  const rawReward = parseFloat(reward || 0);
  const rewardAmount = parseFloat(rawReward.toFixed(2)); // Normalize floats like 1.6 or 2.0
  const txStatus = String(status || "1");

  if (!userId || !transactionId || isNaN(rewardAmount) || !signature) {
    return res.status(400).json({ success: false, error: "Missing required postback parameters" });
  }

  // MD5 Security Verification using normalized reward string
  const stringToHash = `${userId}${transactionId}${rewardAmount}${OFFERWALL_SECRET_KEY}`;
  const calculatedSignature = crypto.createHash('md5').update(stringToHash).digest('hex');

  if (calculatedSignature !== signature) {
    return res.status(400).json({ success: false, error: "Signature doesn't match" });
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
      telebot_response: responseText
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};
