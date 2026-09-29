import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = (process.env.SUPABASE_URL || 'https://knrgbyezxjunjysaaukx.supabase.co').trim();
const SUPABASE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || '').trim();
const supabase = (SUPABASE_URL && SUPABASE_KEY) ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!supabase) return res.status(500).json({ error: 'Database connection missing or misconfigured.' });

  try {
    const HOWL_USD_RATE = 0.00002;

    // 1. Calculate totals from transactions
    const { data: txData, error: txError } = await supabase
      .from('transactions')
      .select('user_id, reward_amount, task_type')
      .not('task_type', 'eq', 'ADMIN_BAN');
    if (txError) throw txError;

    let userTotals = {};
    txData.forEach(tx => {
        let uid = String(tx.user_id);
        let amt = parseFloat(tx.reward_amount) || 0;
        let usdAmt = (tx.task_type && tx.task_type.includes('HOWL')) ? (amt * HOWL_USD_RATE) : amt;
        userTotals[uid] = (userTotals[uid] || 0) + usdAmt;
    });

    let topEarners = Object.keys(userTotals).map(uid => ({ userId: uid, total: userTotals[uid] }))
        .sort((a, b) => b.total - a.total).slice(0, 10);

    if (topEarners.length === 0) return res.status(200).json([]);

    // 2. Fetch profiles for the top earners
    const topUserIds = topEarners.map(e => e.userId);
    const { data: userData } = await supabase.from('users').select('user_id, name, photo_url').in('user_id', topUserIds);

    const userMap = {};
    if (userData) userData.forEach(u => { userMap[u.user_id] = u; });

    // 3. Merge data
    const enrichedLeaderboard = topEarners.map(earner => {
        const profile = userMap[earner.userId] || {};
        return {
            userId: earner.userId,
            name: profile.name || `User ${earner.userId.substring(0,4)}***`,
            photo_url: profile.photo_url || null,
            total: +(earner.total.toFixed(4)),
            total_howl: Math.round(earner.total / HOWL_USD_RATE)
        };
    });

    return res.status(200).json(enrichedLeaderboard);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
