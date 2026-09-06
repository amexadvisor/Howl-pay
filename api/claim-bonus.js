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

    urlParams.delete('hash');

    // 1. Sort keys alphabetically as mandated by Telegram WebApp authentication specifications
    const paramsList = [];
    urlParams.sort();
    for (const [key, value] of urlParams.entries()) {
      paramsList.push(`${key}=${value}`);
    }
    const dataCheckString = paramsList.join('\n');

    // 2. Compute HMAC-SHA-256 signature using "WebAppData" as key and BOT_TOKEN as message
    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
    const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

    // 3. Cryptographically verify the signature
    if (calculatedHash !== hash) {
      return res.status(403).json({ error: "Forbidden: Invalid Telegram signature (unauthorized bot context)" });
    }

    // 4. Safely extract verified user ID directly from the validated payload
    const userStr = urlParams.get('user');
    if (userStr) {
      const parsed = JSON.parse(userStr);
      if (parsed && parsed.id) {
        targetUserId = parsed.id;
      }
    }
  } catch (e) {
    return res.status(400).json({ error: "Bad Request: Failed to process validation parameters" });
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
