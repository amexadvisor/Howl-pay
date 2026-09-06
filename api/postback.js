const crypto = require('crypto');

const OFFERWALL_SECRET_KEY = "oLU53dfdzFpqUbgalyoEsWoRAjHGEU5j";
const SURVEY_WEBHOOK_URL = "https://api.telebotcreator.com/new-webhook?data=gAAAAABqnRexbFUmGL0_PHDFtmSfcMI1tlkWBTHN4bZ01OI4_zQ4ZtPO2QF7OK0wR6ca9TWW7fcf--WvTFy5vbqlGUkdr3t56T2iO0tOnWMQBZ7L8JttzlCDs4gQvAMEguZmDN0THDZeENQ76eq16zCK4prv5nPwK_KJbD_fuiDAKobkEH4_x6GFW4VK5VHNSotQpFMEzOx3";

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

  // Verify Offerwall.me MD5 signature: md5(subId + transId + reward + secretKey)
  const stringToHash = `${userId}${transactionId}${reward}${OFFERWALL_SECRET_KEY}`;
  const calculatedSignature = crypto.createHash('md5').update(stringToHash).digest('hex');

  if (calculatedSignature !== signature) {
    console.warn(`Signature mismatch for user ${userId}`);
    return res.status(400).send("ERROR: Signature doesn't match");
  }

  // Forward payload to TelebotCreator webhook using 'options' wrapper
  try {
    await fetch(SURVEY_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: String(userId),
        options: {
          status: status,
          reward: reward,
          transactionId: transactionId
        }
      })
    });
  } catch (err) {
    console.error("Failed to forward postback to Telebot webhook:", err.message);
  }

  return res.status(200).send("ok");
};
