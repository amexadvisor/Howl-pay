const crypto = require('crypto');

const OFFERWALL_SECRET_KEY = "oLU53dfdzFpqUbgalyoEsWoRAjHGEU5j";
const BOT_TOKEN = "8880792386:AAETJqQCC-E3ZJGGny98RuE8bIHLonR-SPU";
const TELEBOT_API_KEY = "Cz_DphAzc0dVIea8NxQpj3VugRg0w8lS0hksiyC4VX0";
const HOLD_SECONDS = 7 * 24 * 60 * 60; // 7 days in seconds

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
  const status = data.status || "1";
  const signature = data.signature;

  if (!userId || !transactionId || isNaN(reward) || !signature) {
    return res.status(400).send("ERROR: Missing parameters");
  }

  // 1. Verify Offerwall.me MD5 signature
  const stringToHash = `${userId}${transactionId}${reward}${OFFERWALL_SECRET_KEY}`;
  const calculatedSignature = crypto.createHash('md5').update(stringToHash).digest('hex');

  if (calculatedSignature !== signature) {
    return res.status(400).send("ERROR: Signature doesn't match");
  }

  const commandName = status == "2" ? "/surveyreversed" : "/surveyreward";

  // 2. Format Notification Message
  let messageText = status == "2" 
    ? `⚠️ <b>Notice:</b> Offer completion TxID <code>${transactionId}</code> worth ${reward} points was reversed.`
    : `⏳ <b>+${reward} points</b> added to your <b>Hold Balance</b> (TxID: <code>${transactionId}</code>).\n\nIt unlocks automatically after 7 days!`;

  try {
    // Dispatch direct Telegram message
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: userId, text: messageText, parse_mode: "HTML" })
    });

    // 3. Trigger TelebotCreator resource command using correct matching new API key
    await fetch("https://api.telebotcreator.com/api/v1/runCommand", {
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

    // Schedule 7-day release if valid credit
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
    console.error("Pipeline error:", err.message);
  }

  return res.status(200).send("ok");
};
