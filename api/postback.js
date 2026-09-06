const crypto = require('crypto');

const OFFERWALL_SECRET_KEY = "oLU53dfdzFpqUbgalyoEsWoRAjHGEU5j";
const BOT_TOKEN = "8880792386:AAETJqQCC-E3ZJGGny98RuE8bIHLonR-SPU";
const TELEBOT_API_KEY = "TgBcVcWghYwyk7QezwI3TJ0dYPqjY0rUJmLR64I3R24";
const HOLD_SECONDS = 7 * 24 * 60 * 60; // 7 days hold window

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method === 'GET' && !req.query.subId) {
    return res.status(200).json({ status: "Offerwall postback gateway active" });
  }

  // Offerwall.me can send data via GET query parameters or POST body
  const data = req.method === 'POST' ? (req.body || {}) : req.query;

  const userId = data.subId;
  const transactionId = data.transId;
  const reward = parseFloat(data.reward || 0);
  const status = data.status;
  const country = data.country || "GLOBAL";
  const signature = data.signature;

  if (!userId || !transactionId || !reward || !signature) {
    return res.status(400).send("ERROR: Missing parameters");
  }

  // Exact MD5 formula: md5(subId + transId + reward + secretKey)
  const stringToHash = `${userId}${transactionId}${reward}${OFFERWALL_SECRET_KEY}`;
  const calculatedSignature = crypto.createHash('md5').update(stringToHash).digest('hex');

  if (calculatedSignature !== signature) {
    console.warn(`[SECURITY] Signature mismatch for user ${userId}, TxID: ${transactionId}`);
    return res.status(400).send("ERROR: Signature doesn't match");
  }

  // Status 2 is reserved for chargebacks / reversals
  if (status == "2") {
    console.log(`[REVERSAL] TxID: ${transactionId} reversed for user ${userId}. Amount: ${reward}`);
    
    try {
      await fetch("https://api.telebotcreator.com/api/v1/runCommand", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: TELEBOT_API_KEY,
          bot_token: BOT_TOKEN,
          command: "/surveyreversed",
          user_id: userId,
          params: `${reward}|${transactionId}`
        })
      });
    } catch (e) {
      console.error("Telebot reversal notification failed:", e);
    }

    return res.status(200).send("ok");
  }

  // Standard valid credit -> Add to Hold & Schedule Release after 7 Days
  console.log(`[HOLD] TxID: ${transactionId} added to hold for user ${userId}. Reward: ${reward}`);

  try {
    // 1. Credit to user's hold balance immediately
    await fetch("https://api.telebotcreator.com/api/v1/runCommand", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: TELEBOT_API_KEY,
        bot_token: BOT_TOKEN,
        command: "/surveyreward",
        user_id: userId,
        params: `${reward}|${transactionId}|${country}`
      })
    });

    // 2. Schedule automatic release from hold to main balance after 7 days
    await fetch("https://api.telebotcreator.com/api/v1/runCommandAfter", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: TELEBOT_API_KEY,
        bot_token: BOT_TOKEN,
        timeout: HOLD_SECONDS,
        command: "/releasereward",
        user_id: userId,
        params: `${reward}|${transactionId}`
      })
    });
  } catch (err) {
    console.error("Failed to trigger Telebot workflows:", err);
  }

  return res.status(200).send("ok");
};
