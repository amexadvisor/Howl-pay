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

  if (req.method === 'GET') {
    return res.status(200).json({ status: "Offerwall postback API is online" });
  }

  const { webhook, subId, transId, reward, status, signature } = req.method === 'POST' ? (req.body || {}) : req.query;

  // 1. If a dynamic TelebotCreator webhook URL is provided (like your old ads bot logic), forward directly
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

  // 2. Otherwise, process Offerwall.me S2S postback
  const userId = subId;
  const transactionId = transId;
  const rewardAmount = parseFloat(reward || 0);
  const txStatus = status || "1";

  if (!userId || !transactionId || isNaN(rewardAmount) || !signature) {
    return res.status(400).json({ error: "Missing required postback parameters" });
  }

  // MD5 Security Verification
  const stringToHash = `${userId}${transactionId}${rewardAmount}${OFFERWALL_SECRET_KEY}`;
  const calculatedSignature = crypto.createHash('md5').update(stringToHash).digest('hex');

  if (calculatedSignature !== signature) {
    return res.status(400).json({ error: "Signature doesn't match" });
  }

  const commandName = txStatus == "2" ? "/surveyreversed" : "/surveyreward";

  try {
    // Execute command via TelebotCreator API using your new credentials
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

    // Schedule 7-day hold release if valid credit
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

    const telebotData = await telebotRes.json().catch(() => ({}));
    return res.status(200).json({
      success: telebotRes.ok,
      telebot_response: telebotData
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
