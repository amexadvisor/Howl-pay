export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).end();

  try {
    const upstreamRes = await fetch('https://howlearn.duckdns.org/api/community-webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(req.headers['x-telegram-bot-api-secret-token'] ? { 'x-telegram-bot-api-secret-token': req.headers['x-telegram-bot-api-secret-token'] } : {})
      },
      body: JSON.stringify(req.body)
    });
    const data = await upstreamRes.json().catch(() => ({}));
    return res.status(upstreamRes.status).json(data);
  } catch (err) {
    console.error('[community-webhook forward error]', err.message);
    return res.status(200).json({ ok: true });
  }
}
