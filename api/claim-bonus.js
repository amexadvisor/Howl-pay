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
    // 1. Run TelebotCreator command (which verifies 30-min cooldown and credits $0.002)
    const telebotRes = await fetch("https://api.telebotcreator.com/api/v1/runCommand", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: TELEBOT_API_KEY,
        bot_token: BOT_TOKEN,
        command: "/onbonuscomplete",
        user_id: targetUserId,
        json: {
          action: "CLAIM_BONUS_ADS",
          amount: 0.002
        }
      })
    });

    const telebotData = await telebotRes.json();

    // Check if TelebotCreator rejected due to active cooldown
    if (telebotData && telebotData.cooldown) {
      return res.status(200).json({ cooldown: true, minutes_left: telebotData.minutes_left });
    }

    // 2. Send Telegram confirmation notification
    const messageText = encodeURIComponent(
      "🎉 <b>3 Ads Verified & Bonus Credited!</b>\n\n" +
      "➕ Added: <b>$0.002</b>\n" +
      "⏳ <i>Next bonus available in 30 minutes!</i>"
    );

    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage?chat_id=${targetUserId}&text=${messageText}&parse_mode=html`);

    return res.status(200).json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
