const crypto = require('crypto');

const OFFERWALL_SECRET_KEY = "oLU53dfdzFpqUbgalyoEsWoRAjHGEU5j";
const BOT_TOKEN = "8880792386:AAETJqQCC-E3ZJGGny98RuE8bIHLonR-SPU";
const TELEBOT_API_KEY = "Cz_DphAzc0dVIea8NxQpj3VugRg0w8lS0hksiyC4VX0";
const HOLD_SECONDS = 7 * 24 * 60 * 60; // 7 days in seconds

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS, GET');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const data = req.method === 'POST' ? (req.body || {}) : req.query;

  if (req.method === 'GET' && !data.subId && !data.webhook) {
    return res.status(200).json({ status: "Offerwall postback API is online" });
  }

  const { webhook, subId, transId, reward, status, signature } = data;

  // 1. Handle dynamic frontend webhook forwarding (Miniapp logic)
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

  // 2. Handle Offerwall.me S2S Postbacks
  const userId = subId;
  const transactionId = transId;
  const rewardAmount = parseFloat(reward || 0);
  const txStatus = status || "1";

  if (!userId || !transactionId || isNaN(rewardAmount) || !signature) {
    return res.status(400).json({ 
      success: false, 
      error: "Missing required postback parameters (subId, transId, reward, signature)" 
    });
  }

  // MD5 Security Verification
  const stringToHash = `${userId}${transactionId}${rewardAmount}${OFFERWALL_SECRET_KEY}`;
  const calculatedSignature = crypto.createHash('md5').update(stringToHash).digest('hex');

  if (calculatedSignature !== signature) {
    return res.status(400).json({ success: false, error: "Signature doesn't match" });
  }

  const commandName = txStatus == "2" ? "/surveyreversed" : "/surveyreward";

  try {
    const telebotRes = await fetch("https://api.telebotcreator.com/api/v1/runCommand", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: TELEBOT_API_KEY,
        bot_token: BOT_TOKEN,
        command: commandName,
        user_id: String(userId),
        params: `${rewardAmount}|${transactionId}`
      })
    });

    // Read the body exactly once as text, then try parsing it
    const rawText = await telebotRes.text();
    let telebotData = {};
    try {
      telebotData = JSON.parse(rawText);
    } catch (e) {
      telebotData = { raw: rawText };
    }

    // Schedule 7-day hold release if valid credit completion
    if (txStatus != "2") {
      await fetch("https://api.telebotcreator.com/api/v1/runCommandAfter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: TELEBOT_API_KEY,
          bot_token: BOT_TOKEN,
          timeout: HOLD_SECONDS,
          command: "/releasereward",
          user_id: String(userId),
          params: `${rewardAmount}|${transactionId}`
        })
      });
    }

    return res.status(200).json({
      success: telebotRes.ok,
      telebot_response: telebotData
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};
