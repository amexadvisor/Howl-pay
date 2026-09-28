import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const SURVEY_WEBHOOK_URL = process.env.SURVEY_WEBHOOK_URL;
const SUPABASE_URL = (process.env.SUPABASE_URL || 'https://knrgbyezxjunjysaaukx.supabase.co').trim();
// Replaced SUPABASE_KEY with SUPABASE_SERVICE_ROLE_KEY to bypass RLS, with fallback
const SUPABASE_SERVICE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || '').trim(); 
const TIMEWALL_SECRET_KEY = process.env.TIMEWALL_SECRET_KEY; 

const supabase = (SUPABASE_URL && SUPABASE_SERVICE_KEY) ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY) : null;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS, GET');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const data = req.method === 'POST' ? (req.body || {}) : req.query;

  if (req.method === 'GET' && !data.userid && !data.uid) {
    return res.status(200).json({ status: "TimeWall Gateway is online" });
  }

  const userId = data.userid || data.uid;
  const rawRevenue = data.revenue || data.reward || data.amount || "0";
  const rawCurrencyAmount = data.currencyAmount || data.currency || rawRevenue;
  let rewardAmount = parseFloat(rawCurrencyAmount) || 0;
  const transactionId = data.txid || data.oid || data.transId;
  const txStatus = String(data.type || data.status || "1");
  const receivedHash = data.hash;

  // STRICT SECURITY: Reject any call that doesn't provide a valid TimeWall hash signature
  if (!TIMEWALL_SECRET_KEY || !receivedHash) {
    return res.status(403).json({ success: false, error: "Forbidden: Missing signature security parameters" });
  }

  // TimeWall hash formula: sha256(userID + revenue + SecretKey)
  const stringToHash = `${userId}${rawRevenue}${TIMEWALL_SECRET_KEY}`;
  const calculatedHash = crypto.createHash('sha256').update(stringToHash).digest('hex');

  if (calculatedHash !== receivedHash) {
    return res.status(403).json({ success: false, error: "Unauthorized: Invalid cryptographic signature hash" });
  }

  const isReversal = txStatus === '-1' || txStatus === 'chargeback' || txStatus === 'reversal' || rewardAmount < 0;
  if (isReversal && rewardAmount > 0) {
    rewardAmount = -Math.abs(rewardAmount);
  }

  if (!userId || !transactionId || isNaN(rewardAmount)) {
    return res.status(400).json({ success: false, error: "Missing required postback fields" });
  }

  if (supabase) {
    const payload = {
      user_id: String(userId),
      reward_amount: rewardAmount,
      transaction_id: String(transactionId),
      task_type: isReversal ? 'TimeWall Reversal' : 'TimeWall Survey',
      status: isReversal ? '-1' : '1',
      created_at: new Date().toISOString()
    };

    try {
      await supabase.from('transactions').insert([payload]);

      if (!isReversal && rewardAmount > 0) {
        try {
          const { data: userRec } = await supabase.from('users').select('referred_by').eq('user_id', String(userId)).maybeSingle();
          if (userRec && userRec.referred_by) {
            const referrerId = String(userRec.referred_by);
            const commission = +(rewardAmount * 0.10).toFixed(6);
            if (commission > 0) {
              const { data: refUser } = await supabase.from('users').select('balance, total_earned').eq('user_id', referrerId).maybeSingle();
              if (refUser) {
                await supabase.from('users').update({
                  balance: (parseFloat(refUser.balance) || 0) + commission,
                  total_earned: (parseFloat(refUser.total_earned) || 0) + commission
                }).eq('user_id', referrerId);

                await supabase.from('transactions').insert([{
                  user_id: referrerId,
                  reward_amount: commission,
                  transaction_id: `ref_timewall_${Date.now()}_${userId}`,
                  task_type: 'Referral Offerwall Commission (10%)',
                  status: '1',
                  created_at: new Date().toISOString()
                }]);
              }
            }
          }
        } catch (refErr) {
          console.error("Referral commission error in timewall:", refErr.message);
        }
      }
    } catch (dbErr) {
      console.error("Database error:", dbErr.message);
    }
  }

  if (SURVEY_WEBHOOK_URL) {
    try {
      await fetch(SURVEY_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: String(userId),
          reward: rewardAmount,
          transactionId: String(transactionId),
          status: isReversal ? '-1' : '1'
        })
      });
    } catch (err) {
      console.error("Webhook forwarding error:", err.message);
    }
  }

  return res.status(200).send("OK");
}
