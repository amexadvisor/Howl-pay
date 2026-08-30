export default async function handler(req, res) {
  // Handle both GET (query parameters) and POST (JSON body) from AdsGalaxy
  const params = req.method === 'POST' ? req.body : req.query;
  const { user_id, reward_id, secret } = params;

  // Choose a private secret phrase to match in your AdsGalaxy dashboard
  const EXPECTED_SECRET = "SecureAdSecret_2026_x89";
  const BOT_TOKEN = "8863906305:AAFduwJfiOkXr2RUAdivUkIGblLKeVI-i1U";
  const TELEBOT_API_KEY = "TgBcVcWghYwyk7QezwI3TJ0dYPqjY0rUJmLR64I3R24";

  // 1. Verify signature authenticity
  if (!secret || secret !== EXPECTED_SECRET) {
    return res.status(403).json({ error: "Forbidden: Invalid secret key" });
  }

  if (!user_id || !reward_id) {
    return res.status(400).json({ error: "Missing required parameters" });
  }

  try {
    // 2. Trigger TelebotCreator database update
    await fetch("https://api.telebotcreator.com/api/v1/runCommand", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: TELEBOT_API_KEY,
        bot_token: BOT_TOKEN,
        command: "/onbonuscomplete",
        user_id: user_id,
        json: {
          action: "CLAIM_BONUS_ADS",
          reward_id: reward_id,
          amount: 0.002
        }
      })
    });

    // 3. Send Telegram confirmation message
    const messageText = encodeURIComponent(
      "🎉 <b>Ad Verified & Balance Credited!</b>\n\n" +
      "➕ Added: <b>$0.005</b>\n" +
      "<i>Check your updated balance in the main menu.</i>"
    );

    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage?chat_id=${user_id}&text=${messageText}&parse_mode=html`);

    return res.status(200).send("OK");
  } catch (error) {
    console.error("Callback processing error:", error);
    return res.status(500).send("Internal Server Error");
  }
}
