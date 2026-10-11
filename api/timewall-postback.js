export default async function handler(req, res) {
  try {
    const upstreamRes = await fetch('https://howlearn.duckdns.org/api/timewall-postback', {
      method: req.method,
      headers: {
        'Content-Type': req.headers['content-type'] || 'application/json'
      },
      body: req.method !== 'GET' && req.method !== 'HEAD' ? JSON.stringify(req.body) : undefined
    });
    const data = await upstreamRes.json().catch(() => ({}));
    return res.status(upstreamRes.status).json(data);
  } catch (err) {
    console.error('[timewall forward error]', err.message);
    return res.status(200).json({ success: true });
  }
}
