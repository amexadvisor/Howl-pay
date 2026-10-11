export default async function handler(req, res) {
  try {
    const url = new URL(req.url, 'https://howlearn.duckdns.org');
    const targetUrl = `https://howlearn.duckdns.org${url.pathname}${url.search}`;

    const headers = {};
    if (req.headers['content-type']) headers['content-type'] = req.headers['content-type'];
    if (req.headers['user-agent']) headers['user-agent'] = req.headers['user-agent'];
    if (req.headers['x-forwarded-for']) headers['x-forwarded-for'] = req.headers['x-forwarded-for'];

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
    console.error('[timewall forward error]', err.message);
    return res.status(500).send('RETRY');
  }
}
