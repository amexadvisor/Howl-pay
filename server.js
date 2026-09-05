const express = require('express');
const crypto = require('crypto');
const fetch = require('node-fetch');
const app = express();

app.use(express.json());

// Configuration Keys
const TELEGRAM_BOT_TOKEN = "YOUR_TELEGRAM_BOT_TOKEN"; // Required to verify initData
const POLLMATIC_API_KEY = "6cosfuqw2wk6m7d8zoqmow2tuampqt";

// Helper function to validate Telegram WebApp initData securely
function validateTelegramInitData(initDataString) {
  if (!initDataString) return null;

  try {
    const urlParams = new URLSearchParams(initDataString);
    const hash = urlParams.get('hash');
    urlParams.delete('hash');

    // Sort parameters alphabetically
    const paramsList = Array.from(urlParams.entries()).sort(([a], [b]) => a.localeCompare(b));
    const dataCheckString = paramsList.map(([key, value]) => `${key}=${value}`).join('\n');

    // Create secret key from bot token
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

// Secure Proxy Endpoint for Surveys
app.get('/api/surveys', async (req, res) => {
  const initData = req.headers['x-telegram-init-data'];
  
  // Verify user signature
  const user = validateTelegramInitData(initData);
  if (!user || !user.id) {
    return res.status(401).json({ error: "Unauthorized: Invalid or missing Telegram signature" });
  }

  const userId = user.id; // Trusted user ID from Telegram, cannot be faked

  try {
    const pollmaticUrl = `https://pollmatic.io/api/surveys.php?key=${POLLMATIC_API_KEY}&sub_id=${userId}`;
    const response = await fetch(pollmaticUrl);
    const data = await response.json();
    
    res.json(data);
  } catch (err) {
    console.error("Survey fetch error:", err);
    res.status(500).json({ error: "Failed to fetch surveys" });
  }
});

app.listen(3000, () => {
  console.log("Secure backend running on port 3000");
});
