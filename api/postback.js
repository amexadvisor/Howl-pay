const crypto = require('crypto');

const OFFERWALL_SECRET_KEY = "oLU53dfdzFpqUbgalyoEsWoRAjHGEU5j";
const BOT_TOKEN = "8880792386:AAETJqQCC-E3ZJGGny98RuE8bIHLonR-SPU";
const TELEBOT_API_KEY = "TgBcVcWghYwyk7QezwI3TJ0dYPqjY0rUJmLR64I3R24";
const HOLD_SECONDS = 7 * 24 * 60 * 60; // 7 days in seconds

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method === 'GET' && !req.query.subId) {
    return res.status(200).json({ status: "Postback gateway active and healthy" });
  }

  const data = req.method === 'POST' ? (req.body || {}) : req.query;

  const userId = data.subId;
  const transactionId = data.transId;
  const reward = parseFloat(data.reward || 0);
  const status = data.status;
  const country = data.country || "GLOBAL";
  const signature = data.signature;

  // Error Check 1: Missing Required Parameters
  if (!userId || !transactionId || isNaN(reward) || !signature) {
    console.error("Validation Error: Missing parameters received ->", { userId, transactionId, reward, status });
    return res.status(400).send("ERROR: Missing required postback parameters");
  }

  // Error Check 2: Signature Verification
  const stringToHash = `${userId}${transactionId}${reward}${OFFERWALL_SECRET_KEY}`;
  const calculatedSignature = crypto.createHash('md5').update(stringToHash).digest('hex');

  if (calculatedSignature !== signature) {
    console.warn(`[SECURITY WARNING] Signature mismatch for user ${userId}, TxID: ${transactionId}. Received: ${signature}, Calculated: ${calculatedSignature}`);
    return res.status(400).send("ERROR: Signature doesn't match");
  }

  // Handle Reversal / Chargeback (Status 2)
  if (status == "2") {
    console.log(`[REVERSAL PROCESSING] TxID: ${transactionId} reversed for user ${userId}. Amount: ${reward}`);
    
    try {
      const tbRes = await fetch("https://api.telebotcreator.com/api/v1/runCommand", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: TELEBOT_API_KEY,
          bot_token: BOT_TOKEN,
          command: "/surveyreversed",
          user_id: String(userId),
          params: `${reward}|${transactionId}`
        })
      });

      const tbText = await tbRes.text();
      if (!tbRes.ok) {
        console.error("TelebotCreator Reversal API Error Response:", tbText);
      }
    } catch (err) {
      console.error("Network/Fetch Exception during Telebot Reversal Trigger:", err.message);
    }

    return res.status(200).send("ok");
  }

  // Handle Valid Completion -> Add to Hold & Schedule Auto-Release
  console.log(`[HOLD PROCESSING] TxID: ${transactionId} targeting user ${userId}. Reward: ${reward}`);

  try {
    // 1. Trigger /surveyreward command
    const rewardRes = await fetch("https://api.telebotcreator.com/api/v1/runCommand", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: TELEBOT_API_KEY,
        bot_token: BOT_TOKEN,
        command: "/surveyreward",
        user_id: String(userId),
        params: `${reward}|${transactionId}|${country}`
      })
    });

    const rewardText = await rewardRes.text();
    if (!rewardRes.ok) {
      console.error("TelebotCreator Reward API Error Response:", rewardText);
      return res.status(500).send("ERROR: Failed to trigger bot reward command");
    }

    // 2. Schedule /releasereward command after 7 days
    const scheduleRes = await fetch("https://api.telebotcreator.com/api/v1/runCommandAfter", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: TELEBOT_API_KEY,
        bot_token: BOT_TOKEN,
        timeout: HOLD_SECONDS,
        command: "/releasereward",
        user_id: String(userId),
        params: `${reward}|${transactionId}`
      })
    });

    const scheduleText = await scheduleRes.text();
    if (!scheduleRes.ok) {
      console.error("TelebotCreator Schedule API Error Response:", scheduleText);
    }

  } catch (err) {
    console.error("Network/Fetch Exception during Telebot Dispatch:", err.message);
    return res.status(500).send("ERROR: Internal server communication failure");
  }

  return res.status(200).send("ok");
};
