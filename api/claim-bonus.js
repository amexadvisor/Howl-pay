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

  const { user_id, initData } = req.body || {};
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
    return res.status(400).json({ error: "Missing user ID" });
  }

  const BOT_TOKEN = "8863906305:AAFduwJfiOkXr2RUAdivUkIGblLKeVI-i1U";
  const TELEBOT_API_KEY = "TgBcVcWghYwyk7QezwI3TJ0dYPqjY0rUJmLR64I3R24";

  try {
    // 1. Run TelebotCreator command
    const telebotRes = await fetch("https://api.telebotcreator.com/api/v1/runCommand", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: TELEBOT_API_KEY,
        bot_token: BOT_TOKEN,
        command: "/onbonuscomplete",
        user_id: targetUserId,
        params: String(targetUserId),
        json: {
          action: "CLAIM_BONUS_ADS",
          user_id: targetUserId,
          amount: 0.002
        }
      })
    });

    return res.status(200).json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
