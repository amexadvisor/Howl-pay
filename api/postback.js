const crypto = require('crypto');

const OFFERWALL_SECRET_KEY = "oLU53dfdzFpqUbgalyoEsWoRAjHGEU5j");
const HOLD_SECONDS = 7 * 24 * 60 * 60; // 7 days hold window

// Temporary in-memory store mapping user_id -> TelebotCreator webhook URL
// (For production scale across serverless cold starts, map this to Vercel KV / Upstash Redis)
global.userWebhooks = global.userWebhooks || {};

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // Endpoint to register the user's native webhook URL when they open the Mini App
  if (req.method === 'POST' && req.body && req.body.webhook && req.body.user_id) {
    global.userWebhooks[req.body.user_id] = req.body.webhook;
    return res.status(200).json({ success: true });
  }

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

  const targetWebhook = global.userWebhooks[userId];
  if (!targetWebhook) {
    console.warn(`No registered webhook found for user ${userId}. User needs to reopen the Mini App.`);
    return res.status(200).send("ok"); // Return ok so offerwall doesn't flag failure, but log warning
  }

  // Handle Reversal / Chargeback (Status 2)
  if (status == "2") {
    try {
      await fetch(targetWebhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed: false, reversed: true, reward, transactionId })
      });
    } catch (e) {
      console.error("Failed to trigger reversal webhook:", e);
    }
    return res.status(200).send("ok");
  }

  // Handle Valid Credit via Native Webhook Trigger
  try {
    await fetch(targetWebhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed: true, reward, transactionId })
    });
  } catch (err) {
    console.error("Failed to trigger reward webhook:", err.message);
  }

  return res.status(200).send("ok");
};
