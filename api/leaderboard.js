const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = (supabaseUrl && supabaseKey) ? createClient(supabaseUrl, supabaseKey) : null;

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { userId } = req.query;

  if (!supabase) {
    return res.status(500).json({ error: "Supabase not configured" });
  }

  try {
    // 1. Fetch Top 10 Leaderboard (Summing rewards grouped by user_id)
    // Note: Supabase/Postgres RPC or standard data mapping can be used. We'll pull recent transactions to compile.
    const { data: allTx, error: txError } = await supabase
      .from('transactions')
      .select('user_id, reward_amount, created_at')
      .order('created_at', { ascending: false })
      .limit(100);

    if (txError) throw txError;

    // Aggregate user earnings for leaderboard
    const userTotals = {};
    allTx.forEach(tx => {
      const uid = tx.user_id;
      userTotals[uid] = (userTotals[uid] || 0) + parseFloat(tx.reward_amount || 0);
    });

    const leaderboard = Object.keys(userTotals)
      .map(uid => ({ user_id: uid.slice(0, 4) + '***' + uid.slice(-2), total: userTotals[uid] }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);

    // 2. Fetch User Specific History if userId is provided
    let userHistory = [];
    if (userId) {
      const { data: uTx, error: uError } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', String(userId))
        .order('created_at', { ascending: false })
        .limit(20);

      if (!uError) userHistory = uTx;
    }

    return res.status(200).json({
      success: true,
      leaderboard,
      history: userHistory
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
