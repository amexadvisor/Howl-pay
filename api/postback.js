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

  // Verify Offerwall.me MD5 signature
  const stringToHash = `${userId}${transactionId}${reward}${OFFERWALL_SECRET_KEY}`;
  const calculatedSignature = crypto.createHash('md5').update(stringToHash).digest('hex');

  if (calculatedSignature !== signature) {
    console.warn(`Signature mismatch for user ${userId}`);
    return res.status(400).send("ERROR: Signature doesn't match");
  }

  const commandName = status == "2" ? "/surveyreversed" : "/surveyreward";

  // Trigger TelebotCreator's native command execution endpoint directly
  try {
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

    // If it's a valid credit, also schedule the 7-day release command
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
    console.error("Telebot dispatch error:", err.message);
  }

  return res.status(200).send("ok");
};
