// /api/postback.js (Vercel Serverless Function)

const crypto = require('crypto');

const OFFERWALL_SECRET_KEY = "oLU53dfdzFpqUbgalyoEsWoRAjHGEU5j";
const HOLD_SECONDS = 7 * 24 * 60 * 60; // 7 days in seconds

// Your verified native TelebotCreator command webhook URL
const TELEBOT_WEBHOOK_URL = "https://api.telebotcreator.com/new-webhook?data=gAAAAABqnQ8sA4zkpAID7j2S2EEbg4dNnmpSu64zpJHhcmjDmktcWzLjYXSNbQscLaGVyo-wzzNXA4tusn0HupSomAyJ0OO05USEJGwbcAEUB63XOmVp-mubhF5fHvq8uX2jC2N-oHWziNI3dUeEnlJsLNi1MVH_6ddb75W_WLtA3SRkKIM_s6QSSt_JxoGKyo4cV5dMhTEu";

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method === 'GET' && !req.query.subId) {
    return res.status(200).json({ status: "Postback gateway active" });
  }

  const data = req.method === 'POST' ? (req.body || {}) : req.query;

  const userId = data.subId;
  const transactionId = data.transId;
  const reward = parseFloat(data.reward || 0);
  const status = data.status;
  const signature = data.signature;

  if (!userId || !transactionId || isNaN(reward) || !signature) {
    return res.status(400).send("ERROR: Missing parameters");
  }

  // Verify Offerwall.me MD5 signature: md5(subId + transId + reward + secretKey)
  const stringToHash = `${userId}${transactionId}${reward}${OFFERWALL_SECRET_KEY}`;
  const calculatedSignature = crypto.createHash('md5').update(stringToHash).digest('hex');

  if (calculatedSignature !== signature) {
    console.warn(`Signature mismatch for user ${userId}`);
    return res.status(400).send("ERROR: Signature doesn't match");
  }

  // Push payload directly through TelebotCreator's native command bridge
  try {
    await fetch(TELEBOT_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: String(userId),
        status: status || "1",
        reward: reward,
        transactionId: transactionId,
        release_delay: status == "2" ? 0 : HOLD_SECONDS
      })
    });
  } catch (err) {
    console.error("Failed to push postback to Telebot webhook:", err.message);
  }

  return res.status(200).send("ok");
};
