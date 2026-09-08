const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // 1. Calculate totals from transactions
    const { data: txData, error: txError } = await supabase.from('transactions').select('user_id, reward_amount');
    if (txError) throw txError;

    let userTotals = {};
    txData.forEach(tx => {
        let uid = String(tx.user_id);
        userTotals[uid] = (userTotals[uid] || 0) + (parseFloat(tx.reward_amount) || 0);
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
            total: earner.total
        };
    });

    return res.status(200).json(enrichedLeaderboard);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
