const crypto = require('crypto');

const TELEGRAM_BOT_TOKEN = "8880792386:AAETJqQCC-E3ZJGGny98RuE8bIHLonR-SPU";
const POLLMATIC_API_KEY = "6cosfuqw2wk6m7d8zoqmow2tuampqt";

function validateTelegramInitData(initDataString) {
  if (!initDataString) return null;
  try {
    const urlParams = new URLSearchParams(initDataString);
    const hash = urlParams.get('hash');
    urlParams.delete('hash');

    const paramsList = Array.from(urlParams.entries()).sort(([a], [b]) => a.localeCompare(b));
    const dataCheckString = paramsList.map(([key, value]) => `${key}=${value}`).join('\n');

    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(TELEGRAM_BOT_TOKEN).digest();
    const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

    if (calculatedHash === hash) {
      const userParam = urlParams.get('user');
      return userParam ? JSON.parse(userParam) : null;
    }
  } catch (err) {
    console.error("Validation error:", err);
  }
  return null;
}

module.exports = async function handler(req, res) {
  // Handle CORS preflight or non-GET requests if necessary
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-Telegram-Init-Data');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const initData = req.headers['x-telegram-init-data'];
  const user = validateTelegramInitData(initData);
  
  if (!user || !user.id) {
    return res.status(401).json({ error: "Unauthorized: Invalid or missing Telegram signature" });
  }

  try {
    const response = await fetch(`https://pollmatic.io/api/surveys.php?key=${POLLMATIC_API_KEY}&sub_id=${user.id}`);
    const data = await response.json();
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch surveys" });
  }
}
