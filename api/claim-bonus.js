import crypto from 'crypto';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS, GET');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'GET') {
    return res.status(200).json({ status: "API is online" });
  }

  const { userId, completed, initData, testMode } = req.body || {};
  const BOT_TOKEN = process.env.BOT_TOKEN;
  const targetWebhook = process.env.ADS_WEBHOOK_URL;

  if (!targetWebhook) {
    return res.status(500).json({ error: "Missing ADS_WEBHOOK_URL environment variable configuration" });
  }

  let targetUserId = userId;

  // 1. Cryptographic Telegram InitData Verification
  if (initData && BOT_TOKEN) {
    try {
      const urlParams = new URLSearchParams(initData);
      const hash = urlParams.get('hash');
      urlParams.delete('hash');

      // Sort parameters alphabetically as required by Telegram WebApp auth spec
      const paramsList = [];
      urlParams.sort();
      for (const [key, value] of urlParams.entries()) {
        paramsList.push(`${key}=${value}`);
      }
      const dataCheckString = paramsList.join('\n');

      // Compute secret key: HMAC-SHA-256 of "WebAppData" using BOT_TOKEN
      const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
      
      // Compute signature
      const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

      if (calculatedHash !== hash && !testMode) {
        return res.status(403).json({ error: "Unauthorized: Invalid Telegram Mini App signature" });
      }

      // Extract verified user id from initData
      const userStr = urlParams.get('user');
      if (userStr) {
        const parsed = JSON.parse(userStr);
        if (parsed && parsed.id) {
          targetUserId = parsed.id;
        }
      }
    } catch (e) {
      if (!testMode) {
        return res.status(403).json({ error: "Unauthorized: Failed to parse or verify initData" });
      }
    }
  } else if (!testMode) {
    return res.status(403).json({ error: "Unauthorized: Missing Telegram WebApp security context" });
  }

  if (!targetUserId) {
    return res.status(400).json({ error: "Missing user identification" });
  }

  try {
    const forwardRes = await fetch(targetWebhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        user_id: String(targetUserId),
        completed: completed !== undefined ? completed : true, 
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
