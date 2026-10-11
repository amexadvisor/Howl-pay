export default async function handler(req, res) {
  try {
    const url = new URL(req.url, 'https://howlearn.duckdns.org');
    const targetUrl = `https://howlearn.duckdns.org${url.pathname}${url.search}`;

    const headers = {};
    if (req.headers['content-type']) headers['content-type'] = req.headers['content-type'];
    if (req.headers['x-telegram-init-data']) headers['x-telegram-init-data'] = req.headers['x-telegram-init-data'];

    const options = {
      method: req.method,
      headers
    };

    if (req.method !== 'GET' && req.method !== 'HEAD' && req.body) {
      options.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
      if (!headers['content-type']) headers['content-type'] = 'application/json';
    }

    const upstreamRes = await fetch(targetUrl, options);
    const data = await upstreamRes.json().catch(() => ({}));
    return res.status(upstreamRes.status).json(data);
  } catch (err) {
    console.error('[adsgram-reward forward error]', err.message);
    return res.status(500).json({ success: false, error: 'Forward error' });
  }
}
