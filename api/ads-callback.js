import crypto from 'crypto';

function verifyTelegramWebAppData(telegramInitData, botToken) {
  if (!telegramInitData) return null;

  const initData = new URLSearchParams(telegramInitData);
  const hash = initData.get('hash');
  if (!hash) return null;

  initData.delete('hash');

  const dataCheckArr = [];
  for (const [key, value] of initData.entries()) {
    dataCheckArr.push(`${key}=${value}`);
  }
  dataCheckArr.sort();

  const dataCheckString = dataCheckArr.join('\n');
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  if (calculatedHash === hash) {
    const userJson = initData.get('user');
    return userJson ? JSON.parse(userJson) : null;
  }
  return null;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { initData } = req.body;
  const BOT_TOKEN = "8863906305:AAFduwJfiOkXr2RUAdivUkIGblLKeVI-i1U";
  const TELEBOT_API_KEY = "TgBcVcWghYwyk7QezwI3TJ0dYPqjY0rUJmLR64I3R24";

  // Validate genuine Telegram user
  const verifiedUser = verifyTelegramWebAppData(initData, BOT_TOKEN);
  if (!verifiedUser || !verifiedUser.id) {
    return res.status(401).json({ error: 'Unauthorized request.' });
  }

  const userId = verifiedUser.id;

  try {
    // 1. Increment balance in TelebotCreator
    await fetch("https://api.telebotcreator.com/api/v1/runCommand", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: TELEBOT_API_KEY,
        bot_token: BOT_TOKEN,
        command: "/onbonuscomplete",
        user_id: userId,
        json: {
          action: "CLAIM_BONUS_ADS",
          amount: 0.002
        }
      })
    });

    // 2. Send instant bot notification
    const messageText = encodeURIComponent(
      "🎉 <b>Bonus Verified & Credited!</b>\n\n" +
      "➕ Added: <b>$0.002</b>\n" +
      "<i>Check your balance in the main menu!</i>"
    );

    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage?chat_id=${userId}&text=${messageText}&parse_mode=html`);

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("Reward error:", error);
    return res.status(500).json({ error: "Failed to process reward." });
  }
}
