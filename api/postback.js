// api/postback.js (Vercel Serverless Function with Detailed Error Handling & Webhook Forwarding)

const crypto = require('crypto');

const OFFERWALL_SECRET_KEY = "oLU53dfdzFpqUbgalyoEsWoRAjHGEU5j";
const SURVEY_WEBHOOK_URL = "https://api.telebotcreator.com/new-webhook?data=gAAAAABqnRexbFUmGL0_PHDFtmSfcMI1tlkWBTHN4bZ01OI4_zQ4ZtPO2QF7OK0wR6ca9TWW7fcf--WvTFy5vbqlGUkdr3t56T2iO0tOnWMQBZ7L8JttzlCDs4gQvAMEguZmDN0THDZeENQ76eq16zCK4prv5nPwK_KJbD_fuiDAKobkEH4_x6GFW4VK5VHNSotQpFMEzOx3";

module.exports = async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'GET' && !req.query.subId) {
    return res.status(200).json({ status: "Offerwall postback gateway is active and healthy" });
  }

  // Extract parameters from POST body or GET query string
  const data = req.method === 'POST' ? (req.body || {}) : req.query;

  const userId = data.subId;
  const transactionId = data.transId;
  const reward = parseFloat(data.reward || 0);
  const status = data.status || "1";
  const signature = data.signature;

  // 1. Parameter Validation Error Handling
  if (!userId || !transactionId || isNaN(reward) || !signature) {
    console.error("[ERROR] Missing required postback parameters:", { userId, transactionId, reward, signature });
    return res.status(400).send("ERROR: Missing required parameters (subId, transId, reward, signature)");
  }

  // 2. MD5 Signature Security Verification
  const stringToHash = `${userId}${transactionId}${reward}${OFFERWALL_SECRET_KEY}`;
  const calculatedSignature = crypto.createHash('md5').update(stringToHash).digest('hex');

  if (calculatedSignature !== signature) {
    console.warn(`[SECURITY WARNING] Signature mismatch! Expected: ${calculatedSignature}, Received: ${signature}, User: ${userId}`);
    return res.status(400).send("ERROR: Cryptographic signature verification failed");
  }

  // 3. Forward Payload to TelebotCreator Webhook with Comprehensive Error Catching
  try {
    console.log(`[INFO] Forwarding postback to TelebotCreator for User: ${userId}, TxID: ${transactionId}, Reward: ${reward}`);
    
    const webhookResponse = await fetch(SURVEY_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: String(userId),
        options: {
          status: String(status),
          reward: reward,
          transactionId: String(transactionId)
        }
      })
    });

    const responseText = await webhookResponse.text();

    if (!webhookResponse.ok) {
      console.error(`[ERROR] TelebotCreator webhook rejected request. Status: ${webhookResponse.status}, Response: ${responseText}`);
      return res.status(502).send(`ERROR: TelebotCreator gateway error: ${webhookResponse.status}`);
    }

    console.log(`[SUCCESS] Postback successfully delivered to TelebotCreator. Response: ${responseText}`);
  } catch (netError) {
    console.error("[CRITICAL ERROR] Network or fetch failure while connecting to TelebotCreator webhook:", netError.message);
    return res.status(500).send("ERROR: Internal server error dispatching webhook request");
  }

  // Always return 200 ok to prevent Offerwall.me from endlessly retrying valid postbacks
  return res.status(200).send("ok");
};
