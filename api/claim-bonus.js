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

  // Verify Telegram InitData
  const verifiedUser = verifyTelegramWebAppData(initData, BOT_TOKEN);
  if (!verifiedUser || !verifiedUser.id) {
    console.error("Auth Failed. Received initData:", initData);
    return res.status(401).json({ error: 'Unauthorized request. Open in Telegram.' });
  }

  const userId = verifiedUser.id;

  try {
    // Send message using standard JSON POST to Telegram Bot API
    const telegramRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: userId,
        text: "🎉 <b>Bonus Verified & Credited!</b>\n\n➕ Added: <b>$0.005</b>\n<i>Check your balance in the bot!</i>",
        parse_mode: "HTML"
      })
    });

    const telegramData = await telegramRes.json();
    console.log("Telegram API Response:", telegramData);

    if (!telegramData.ok) {
      return res.status(400).json({ error: telegramData.description });
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("Serverless execution error:", error);
    return res.status(500).json({ error: error.message });
  }
}
