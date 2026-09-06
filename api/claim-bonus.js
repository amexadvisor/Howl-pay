import crypto from 'crypto';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Telegram-Init-Data');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const BOT_TOKEN = process.env.BOT_TOKEN;
  const targetWebhook = process.env.ADS_WEBHOOK_URL;

  if (!BOT_TOKEN || !targetWebhook) {
    return res.status(500).json({ error: "Server configuration error: missing environment variables" });
  }

  // Extract initData from body or headers
  const initData = req.body?.initData || req.headers['x-telegram-init-data'];

  if (!initData || typeof initData !== 'string') {
    return res.status(401).json({ error: "Unauthorized: Missing Telegram WebApp security context" });
  }

  let targetUserId = null;

  try {
    const pairs = initData.split('&');
    const hashIndex = pairs.findIndex(str => str.startsWith('hash='));

    if (hashIndex === -1) {
      return res.status(401).json({ error: "Unauthorized: Missing signature hash" });
    }

    const receivedHash = pairs.splice(hashIndex)[0].split('=')[1];

    pairs.sort((a, b) => a.localeCompare(b));
    const dataCheckString = pairs.join('\n');

    // Generate secret key using HMAC-SHA-256 with "WebAppData" as key and BOT_TOKEN as message
    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
    const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

    if (calculatedHash !== receivedHash) {
      return res.status(403).json({ error: "Forbidden: Invalid Telegram signature" });
    }

    const urlParams = new URLSearchParams(initData);
    const userStr = urlParams.get('user');
    if (userStr) {
      const parsed = JSON.parse(userStr);
      if (parsed && parsed.id) {
        targetUserId = parsed.id;
      }
    }
  } catch (e) {
    return res.status(400).json({ error: "Bad Request: " + e.message });
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
