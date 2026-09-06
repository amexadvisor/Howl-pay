const crypto = require('crypto');

const OFFERWALL_SECRET_KEY = "oLU53dfdzFpqUbgalyoEsWoRAjHGEU5j";
const BOT_TOKEN = "8880792386:AAETJqQCC-E3ZJGGny98RuE8bIHLonR-SPU";
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
  const status = data.status;
  const signature = data.signature;

  if (!userId || !transactionId || isNaN(reward) || !signature) {
    return res.status(400).send("ERROR: Missing parameters");
  }

  // 1. Verify Offerwall.me MD5 signature: md5(subId + transId + reward + secretKey)
  const stringToHash = `${userId}${transactionId}${reward}${OFFERWALL_SECRET_KEY}`;
  const calculatedSignature = crypto.createHash('md5').update(stringToHash).digest('hex');

  if (calculatedSignature !== signature) {
    console.warn(`Signature mismatch for user ${userId}`);
    return res.status(400).send("ERROR: Signature doesn't match");
  }

  // 2. Send Telegram Message directly via Bot API
  let messageText = "";
  if (status == "2") {
    messageText = `⚠️ <b>Notice:</b> Offer completion TxID <code>${transactionId}</code> worth ${reward} points was reversed by the provider.`;
  } else {
    messageText = `⏳ <b>+${reward} points</b> added to your <b>Hold Balance</b> (TxID: <code>${transactionId}</code>).\n\nIt will automatically unlock and move to your main balance after 7 days!`;
  }

  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: userId,
        text: messageText,
        parse_mode: "HTML"
      })
    });
  } catch (err) {
    console.error("Failed to send Telegram notification:", err.message);
  }

  return res.status(200).send("ok");
};
