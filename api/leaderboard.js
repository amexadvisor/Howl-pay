export default async function handler(req, res) {
  try {
    const upstreamRes = await fetch('https://howlearn.duckdns.org/api/leaderboard', {
      method: req.method,
      headers: {
        'Content-Type': 'application/json'
      }
    });
    const data = await upstreamRes.json().catch(() => ([]));
    res.setHeader('Cache-Control', 'public, max-age=15, s-maxage=30');
    return res.status(upstreamRes.status).json(data);
  } catch (err) {
    console.error('[leaderboard forward error]', err.message);
    return res.status(500).json({ error: 'Leaderboard forward error' });
  }
}
