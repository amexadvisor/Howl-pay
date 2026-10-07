// Community comment task. Telegram sends every group message of the "watcher" bot (a second bot that sits in
// your community group) to this endpoint; only requests carrying the secret token are accepted.
//
// A reward is paid only when ALL of this holds (nothing here can be triggered from the app):
//   - the request carries the webhook secret token
//   - the message was posted in the configured community chat, is not forwarded, and is fresh
//   - its text contains one of the admin's selected texts
//   - the sender has an account, is not banned, and is outside the cooldown
//   - the message id was never paid before (unique transaction id)
//
// One-time setup: set COMMUNITY_WEBHOOK_SECRET in Vercel, then open once in a browser:
//   https://api.telegram.org/bot<WATCHER_BOT_TOKEN>/setWebhook?url=https://howl-pay.vercel.app/api/community-webhook&secret_token=<COMMUNITY_WEBHOOK_SECRET>&allowed_updates=%5B%22message%22%5D
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { creditHowl } from '../lib/balance.js';
import { getQuickTasks, accountBlocked, normalizeText, COMMENT_TASK_TYPE } from '../lib/quicktasks.js';

const SUPABASE_URL = (process.env.SUPABASE_URL || '').trim();
const SUPABASE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || '').trim();
const supabase = (SUPABASE_URL && SUPABASE_KEY) ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;

const MAX_AGE_SEC = 600;

const safeEqual = (a, b) => {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

async function handleMessage(message) {
  if (!message || !message.chat || !message.from || message.from.is_bot) return 'skip';
  if (typeof message.text !== 'string') return 'not_text';
  if (message.forward_origin || message.forward_date) return 'forwarded';

  const c = (await getQuickTasks(supabase)).comment;
  if (!c.enabled || !c.chat_id || !c.texts.length) return 'disabled';
  if (String(message.chat.id) !== String(c.chat_id)) return 'other_chat';

  const msg = normalizeText(message.text);
  if (!c.texts.some((t) => msg.includes(normalizeText(t)))) return 'no_match';

  const now = Date.now();
  if (message.date && now / 1000 - message.date > MAX_AGE_SEC) return 'stale';

  const uid = String(message.from.id);
  const { data: user } = await supabase.from('users').select('user_id').eq('user_id', uid).maybeSingle();
  if (!user) return 'no_user';
  if (await accountBlocked(supabase, uid)) return 'blocked';

  const since = new Date(now - c.cooldown_min * 60000).toISOString();
  const recent = async () => {
    const { data } = await supabase.from('transactions').select('transaction_id, created_at')
      .eq('user_id', uid).eq('task_type', COMMENT_TASK_TYPE).eq('status', '1').gte('created_at', since)
      .order('created_at', { ascending: true }).order('transaction_id', { ascending: true }).limit(5);
    return data || [];
  };
  if ((await recent()).length > 0) return 'cooldown';

  // Reserve first (unique transaction id = one payment per message)
  const txId = `cmt_${message.chat.id}_${message.message_id}`;
  const { error: txErr } = await supabase.from('transactions').insert([{
    user_id: uid, reward_amount: c.reward, transaction_id: txId,
    task_type: COMMENT_TASK_TYPE, status: '1', created_at: new Date(now).toISOString()
  }]);
  if (txErr) {
    if (txErr.code === '23505') return 'duplicate';
    throw new Error(txErr.message);
  }

  // Two messages at the same moment: only the earliest row inside the cooldown window survives
  const rows = await recent();
  if (rows.length && rows[0].transaction_id !== txId) {
    await supabase.from('transactions').delete().eq('transaction_id', txId);
    return 'cooldown';
  }

  let credit;
  try { credit = await creditHowl(supabase, uid, c.reward); } catch (e) { credit = { ok: false }; }
  if (!credit.ok) {
    await supabase.from('transactions').delete().eq('transaction_id', txId);
    throw new Error('credit_failed');
  }
  return 'credited';
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ ok: false });

  const secret = (process.env.COMMUNITY_WEBHOOK_SECRET || '').trim();
  if (!secret || !safeEqual(req.headers['x-telegram-bot-api-secret-token'], secret)) {
    return res.status(403).json({ ok: false });
  }
  if (!supabase) return res.status(500).json({ ok: false });

  try {
    const result = await handleMessage((req.body || {}).message);
    return res.status(200).json({ ok: true, result });
  } catch (e) {
    console.error('[community-webhook]', e && e.message);
    return res.status(500).json({ ok: false });   // Telegram retries; the unique message id prevents double pay
  }
                               }
