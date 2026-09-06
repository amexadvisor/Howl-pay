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

  const { userId, completed, initData } = req.body || {};

  const targetWebhook = process.env.ADS_WEBHOOK_URL;

  if (!targetWebhook) {
    return res.status(500).json({ error: "Missing ADS_WEBHOOK_URL environment variable configuration" });
  }

  let targetUserId = userId;

  if (!targetUserId && initData) {
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
