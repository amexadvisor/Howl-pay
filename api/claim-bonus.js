import crypto from 'crypto';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { initData } = req.body || {};
  const BOT_TOKEN = process.env.BOT_TOKEN;
  const targetWebhook = process.env.ADS_WEBHOOK_URL;

  if (!BOT_TOKEN || !targetWebhook) {
    return res.status(500).json({ error: "Server configuration error: missing environment variables" });
  }

  if (!initData) {
    return res.status(401).json({ error: "Unauthorized: Missing Telegram WebApp security context" });
  }

  let targetUserId = null;

  try {
    const urlParams = new URLSearchParams(initData);
    const hash = urlParams.get('hash');
    
    if (!hash) {
      return res.status(401).json({ error: "Unauthorized: Missing signature hash" });
    }

    // Split raw initData by '&', remove the hash parameter, sort alphabetically, and join with '\n'
    const pairs = initData.split('&');
    const filteredPairs = pairs.filter(pair => !pair.startsWith('hash='));
    filteredPairs.sort();
    const dataCheckString = filteredPairs.join('\n');

    // Compute secret key: HMAC-SHA-256 of "WebAppData" using BOT_TOKEN
    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
    
    // Compute signature: HMAC-SHA-256 of dataCheckString using secretKey
    const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

    if (calculatedHash !== hash) {
      return res.status(403).json({ error: "Forbidden: Invalid Telegram signature (unauthorized bot context)" });
    }

    // Extract user id safely from the parsed parameters
    const userStr = urlParams.get('user');
    if (userStr) {
      const parsed = JSON.parse(userStr);
      if (parsed && parsed.id) {
        targetUserId = parsed.id;
      }
    }
  } catch (e) {
    return res.status(400).json({ error: "Bad Request: Failed to process validation parameters: " + e.message });
  }

  if (!targetUserId) {
    return res.status(400).json({ error: "Missing user identification within validated context" });
  }

  try {
    const forwardRes = await fetch(targetWebhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        user_id: String(targetUserId),
        completed: true, 
        timestamp: Date.now() 
      })
    });

    const responseText = await forwardRes.text();

    return res.status(200).json({
      success: forwardRes.ok,
      telebot_response: responseText
    });
  } catch (err) {
    return res.status(500).json({ error: "Webhook forwarding failed: " + err.message });
  }
}
