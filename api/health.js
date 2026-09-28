import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = (process.env.SUPABASE_URL || 'https://knrgbyezxjunjysaaukx.supabase.co').trim();
const SUPABASE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || '').trim();
const BOT_TOKEN = (process.env.BOT_TOKEN || '').trim();
const supabase = (SUPABASE_URL && SUPABASE_KEY) ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const diagnostics = {
    status: 'online',
    timestamp: new Date().toISOString(),
    env: {
      has_BOT_TOKEN: Boolean(BOT_TOKEN),
      has_SUPABASE_URL: Boolean(SUPABASE_URL),
      has_SUPABASE_KEY: Boolean(SUPABASE_KEY),
      has_ADS_WEBHOOK_URL: Boolean(process.env.ADS_WEBHOOK_URL)
    },
    supabase_connection: false,
    users_table_accessible: false,
    transactions_table_accessible: false,
    error: null
  };

  if (!supabase) {
    diagnostics.error = 'Supabase client failed to initialize: Check SUPABASE_URL and SUPABASE_KEY in Vercel environment variables.';
    return res.status(200).json(diagnostics);
  }

  try {
    const { data: users, error: usersErr } = await supabase.from('users').select('user_id').limit(1);
    if (usersErr) {
      diagnostics.users_error = usersErr.message;
    } else {
      diagnostics.supabase_connection = true;
      diagnostics.users_table_accessible = true;
    }

    const { error: txErr } = await supabase.from('transactions').select('user_id').limit(1);
    if (txErr) {
      diagnostics.transactions_error = txErr.message;
    } else {
      diagnostics.transactions_table_accessible = true;
    }

    return res.status(200).json(diagnostics);
  } catch (err) {
    diagnostics.error = err.message;
    return res.status(200).json(diagnostics);
  }
}
