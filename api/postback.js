// /api/postback.js (Vercel Serverless Function)

const crypto = require('crypto');

const OFFERWALL_SECRET_KEY = "oLU53dfdzFpqUbgalyoEsWoRAjHGEU5j";
const BOT_TOKEN = "8880792386:AAETJqQCC-E3ZJGGny98RuE8bIHLonR-SPU";
const TELEBOT_API_KEY = "TgBcVcWghYwyk7QezwI3TJ0dYPqjY0rUJmLR64I3R24";
const HOLD_DAYS = 7; // 7-day hold period before auto-release

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'GET') {
    return res.status(200).json({ status: "Offerwall postback endpoint is online" });
  }

  const data = req.method === 'POST' ? (req.body || {}) : req.query;

  const userId = data.subId || data.user_id || data.uid;
  const transactionId = data.transId || data.transaction_id || data.tid;
  const reward = parseFloat(data.reward || data.payout || data.amount || 0);
  const action = data.status || data.action || data.type;
  const signature = data.signature || data.sig;

  if (!userId || !transactionId || !signature) {
    return res.status(400).send("ERROR: Missing required postback fields");
  }

  // 1. Verify Offerwall.me signature: md5(userId + transactionId + reward + secret)
  const stringToHash = `${userId}${transactionId}${reward}${OFFERWALL_SECRET_KEY}`;
  const calculatedSignature = crypto.createHash('md5').update(stringToHash).digest('hex');

  if (calculatedSignature !== signature) {
    console.warn(`[SECURITY] Invalid signature for user ${userId}, TxID: ${transactionId}`);
    return res.status(400).send("ERROR: Signature doesn't match");
  }

  // 2. Handle Reversal / Chargeback (Action 2 from Offerwall.me)
  if (action == 2 || action === 'reversed' || action === 'chargeback' || action === 'rejected') {
    console.log(`[REVERSAL] Offer ${transactionId} reversed for user ${userId}. Amount: ${reward}`);
    
    try {
      await fetch("https://api.telebotcreator.com/api/v1/runCommand", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: TELEBOT_API_KEY,
          bot_token: BOT_TOKEN,
          command: "/surveyreversed",
          user_id: userId,
          params: String(reward)
        })
      });
    } catch (e) {
      console.error("Telebot reversal command failed:", e);
    }

    return res.status(200).send("ok");
  }

  // 3. Handle Approved Completion -> Send to Hold Balance with 7-Day Auto-Release Payload
  console.log(`[HOLD] Offer ${transactionId} added to hold for user ${userId}. Reward: ${reward}`);

  try {
    const releaseTimestamp = Date.now() + (HOLD_DAYS * 24 * 60 * 60 * 1000);
    const telebotRes = await fetch("https://api.telebotcreator.com/api/v1/runCommand", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: TELEBOT_API_KEY,
        bot_token: BOT_TOKEN,
        command: "/surveyreward", 
        user_id: userId,
        params: `${reward}|${releaseTimestamp}` // Passes amount and release timestamp
      })
    });

    const telebotData = await telebotRes.json().catch(() => ({}));
    console.log("Telebot hold response:", telebotData);
  } catch (error) {
    console.error("Telebot hold trigger failed:", error.message);
  }

  return res.status(200).send("ok");
}
