// api/postback.js (Vercel Serverless Function for Offerwall.me S2S Postbacks)

const crypto = require('crypto');

const OFFERWALL_SECRET_KEY = "oLU53dfdzFpqUbgalyoEsWoRAjHGEU5j";
const BOT_TOKEN = "8880792386:AAETJqQCC-E3ZJGGny98RuE8bIHLonR-SPU";
const TELEBOT_API_KEY = "TgBcVcWghYwyk7QezwI3TJ0dYPqjY0rUJmLR64I3R24";
const HOLD_SECONDS = 7 * 24 * 60 * 60; // 7 days security hold window

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method === 'GET' && !req.query.subId) {
    return res.status(200).json({ status: "Offerwall postback gateway active" });
  }

  const data = req.method === 'POST' ? (req.body || {}) : req.query;

  const userId = data.subId;
  const transactionId = data.transId;
  const reward = parseFloat(data.reward || 0);
  const status = data.status || "1";
  const signature = data.signature;

  if (!userId || !transactionId || isNaN(reward) || !signature) {
    console.error("Missing parameters in postback request:", data);
    return res.status(400).send("ERROR: Missing parameters");
  }

  // Exact Offerwall.me MD5 signature validation formula: md5(subId + transId + reward + secretKey)
  const stringToHash = `${userId}${transactionId}${reward}${OFFERWALL_SECRET_KEY}`;
  const calculatedSignature = crypto.createHash('md5').update(stringToHash).digest('hex');

  if (calculatedSignature !== signature) {
    console.warn(`[SECURITY] Signature mismatch for user ${userId}, TxID: ${transactionId}`);
    return res.status(400).send("ERROR: Signature doesn't match");
  }

  const commandName = status == "2" ? "/surveyreversed" : "/surveyreward";

  try {
    // Replicate working TelebotCreator API execution pipeline
    const telebotRes = await fetch("https://api.telebotcreator.com/api/v1/runCommand", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: TELEBOT_API_KEY,
        bot_token: BOT_TOKEN,
        command: commandName,
        user_id: String(userId),
        params: `${reward}|${transactionId}`
      })
    });

    if (!telebotRes.ok) {
      console.error("TelebotCreator API rejection response:", await telebotRes.text());
    }

    // Schedule 7-day hold release if it's a valid credit completion
    if (status != "2") {
      await fetch("https://api.telebotcreator.com/api/v1/runCommandAfter", {
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
    }
  } catch (err) {
    console.error("Failed to execute Telebot command trigger:", err.message);
  }

  return res.status(200).send("ok");
};
