const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { data, error } = await supabase
      .from('transactions')
      .select('user_id, reward_amount');

    if (error) throw error;

    let userTotals = {};
    data.forEach(tx => {
        let uid = tx.user_id;
        let amt = parseFloat(tx.reward_amount) || 0;
        userTotals[uid] = (userTotals[uid] || 0) + amt;
    });

    let sortedEarners = Object.keys(userTotals).map(uid => ({
        userId: uid.substring(0, 4) + '***' + uid.slice(-2),
        total: userTotals[uid]
    })).sort((a, b) => b.total - a.total).slice(0, 10);

    return res.status(200).json(sortedEarners);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
