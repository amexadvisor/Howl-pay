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

  if (!initData || typeof initData !== 'string') {
    return res.status(401).json({ error: "Unauthorized: Missing or invalid Telegram WebApp security context" });
  }

  let targetUserId = null;

  try {
    // 1. Parse raw initData segments
    const pairs = initData.split('&');
    const hashIndex = pairs.findIndex(str => str.startsWith('hash='));

    if (hashIndex === -1) {
      return res.status(401).json({ error: "Unauthorized: Missing signature hash" });
    }

    // Extract the client hash and remove it from the array for validation
    const receivedHash = pairs.splice(hashIndex)[0].split('=')[1];

    // 2. Sort remaining key-value pairs alphabetically
    pairs.sort((a, b) => a.localeCompare(b));
    const dataCheckString = pairs.join('\n');

    // 3. Compute secret key: HMAC-SHA-256 of "WebAppData" using BOT_TOKEN
    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
    
    // 4. Compute signature: HMAC-SHA-256 of dataCheckString using secretKey
    const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

    if (calculatedHash !== receivedHash) {
      return res.status(403).json({ error: "Forbidden: Invalid Telegram signature" });
    }

    // 5. Extract user ID safely from the validated payload parameters
    const urlParams = new URLSearchParams(initData);
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
