export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Telegram-Init-Data, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const url = new URL(req.url, 'https://howlearn.duckdns.org');
    const targetUrl = `https://howlearn.duckdns.org${url.pathname}${url.search}`;

    const headers = {};
    for (const [key, val] of Object.entries(req.headers)) {
      if (key.toLowerCase() !== 'host') {
        headers[key] = val;
      }
    }

    const options = {
      method: req.method,
      headers
    };

    if (req.method !== 'GET' && req.method !== 'HEAD' && req.body) {
      options.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
      if (!headers['content-type']) headers['content-type'] = 'application/json';
    }

    const upstreamRes = await fetch(targetUrl, options);
    const contentType = upstreamRes.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      const data = await upstreamRes.json().catch(() => ({}));
      return res.status(upstreamRes.status).json(data);
    } else {
      const text = await upstreamRes.text().catch(() => '');
      if (contentType) res.setHeader('content-type', contentType);
      return res.status(upstreamRes.status).send(text);
    }
  } catch (err) {
    console.error('[claim-bonus forward error]', err.message);
    return res.status(500).json({ success: false, error: 'Server proxy error' });
  }
}
