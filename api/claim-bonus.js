export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS, GET');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'GET') {
    return res.status(200).json({ status: "API is online" });
  }

  const { webhook, user_id, initData } = req.body || {};

  // 1. If a TelebotCreator webhook URL is provided, forward the request directly
  if (webhook) {
    try {
      const forwardRes = await fetch(webhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed: true, timestamp: Date.now() })
      });

      return res.status(200).json({ success: true, forwarded: forwardRes.ok });
    } catch (err) {
      return res.status(500).json({ error: "Webhook forwarding failed: " + err.message });
    }
  }

  // 2. Fallback: Parse user ID if calling TelebotCreator API directly
  let targetUserId = user_id;

  if (initData) {
    try {
      const params = new URLSearchParams(initData);
      const userStr = params.get('user');
      if (userStr) {
        const parsed = JSON.parse(userStr);
        if (parsed && parsed.id) {
          targetUserId = parsed.id;
        }
      }
    } catch (e) {
      console.error("InitData parse error:", e);
    }
  }

  if (!targetUserId) {
    return res.status(400).json({ error: "Missing user identification or webhook URL" });
  }

  const BOT_TOKEN = "8863906305:AAFduwJfiOkXr2RUAdivUkIGblLKeVI-i1U";
  const TELEBOT_API_KEY = "TgBcVcWghYwyk7QezwI3TJ0dYPqjY0rUJmLR64I3R24";

  try {
    const telebotRes = await fetch("https://api.telebotcreator.com/api/v1/runCommand", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: TELEBOT_API_KEY,
        bot_token: BOT_TOKEN,
        command: "/adsreward",
        user_id: targetUserId,
        params: String(targetUserId)
      })
    });

    const telebotData = await telebotRes.json().catch(() => ({}));

    return res.status(200).json({
      success: telebotRes.ok,
      telebot_response: telebotData
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
