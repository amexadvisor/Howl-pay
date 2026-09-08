import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  
  const { initData } = req.body || {};
  const BOT_TOKEN = process.env.BOT_TOKEN;

  if (!initData || !BOT_TOKEN) return res.status(400).json({ error: 'Missing data' });

  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    params.delete('hash');
    params.sort();
    
    const dataCheckString = Array.from(params.entries()).map(([k, v]) => `${k}=${v}`).join('\n');
    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
    const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

    if (calculatedHash !== hash) return res.status(403).json({ error: 'Invalid signature' });

    const userObj = JSON.parse(params.get('user'));
    const fullName = (userObj.first_name + ' ' + (userObj.last_name || '')).trim();
    
    await supabase.from('users').upsert({
      user_id: String(userObj.id),
      name: fullName,
      photo_url: userObj.photo_url || null,
      last_seen: new Date().toISOString()
    }, { onConflict: 'user_id' });

    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
