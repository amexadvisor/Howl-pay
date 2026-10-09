import { createClient } from '@supabase/supabase-js';
import { verifyInitData, creditHowl } from '../lib/balance.js';
import {
  FEATURED_TASK_TYPE,
  getFeaturedTasks,
  verifyUserInChat,
  linkHash
} from '../lib/featured-tasks.js';

const SUPABASE_URL = (process.env.SUPABASE_URL || '').trim();
const SUPABASE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || '').trim();
const supabase = (SUPABASE_URL && SUPABASE_KEY) ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;

const BOT_TOKEN = (process.env.BOT_TOKEN || '').trim();
const ADMIN_IDS = ['8026237972', '1928631932'];

async function accountBlocked(uid) {
  if (ADMIN_IDS.includes(uid)) return false;

  const { data: banRows } = await supabase.from('transactions').select('status')
    .eq('user_id', uid).eq('task_type', 'ADMIN_BAN')
    .order('created_at', { ascending: false }).limit(1);
  const last = banRows && banRows[0] && banRows[0].status;
  if (last === 'BANNED') return true;
  if (last === 'UNBANNED') return false;

  const { data: me } = await supabase.from('users').select('fingerprint, created_at').eq('user_id', uid).maybeSingle();
  if (!me || !me.fingerprint) return false;

  const { data: other } = await supabase.from('users').select('user_id, created_at')
    .eq('fingerprint', me.fingerprint).neq('user_id', uid)
    .order('created_at', { ascending: true }).limit(1).maybeSingle();

  return !!(other && (ADMIN_IDS.includes(String(other.user_id)) || new Date(me.created_at) >= new Date(other.created_at)));
}

// Stream Telegram chat avatar securely without exposing BOT_TOKEN to users
async function handleAvatar(req, res) {
  const fileId = String(req.query.file_id || '').trim();
  if (!fileId || !BOT_TOKEN) return res.status(404).end();

  try {
    const fileRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${encodeURIComponent(fileId)}`);
    const fileData = await fileRes.json();
    if (!fileData || !fileData.ok || !fileData.result?.file_path) {
      return res.status(404).end();
    }

    const downloadUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${fileData.result.file_path}`;
    const imgRes = await fetch(downloadUrl);
    if (!imgRes.ok) return res.status(404).end();

    const buffer = await imgRes.arrayBuffer();
    res.setHeader('Content-Type', imgRes.headers.get('content-type') || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400');
    return res.status(200).send(Buffer.from(buffer));
  } catch (e) {
    return res.status(500).end();
  }
}

// User task list
async function handleList(req, res, verified) {
  const uid = String(verified.user.id);
  const allTasks = await getFeaturedTasks(supabase);
  const activeTasks = allTasks.filter(t => t.enabled !== false);

  // Fetch all user completions for featured tasks
  const { data: userTxs } = await supabase
    .from('transactions')
    .select('transaction_id')
    .eq('user_id', uid)
    .ilike('task_type', `${FEATURED_TASK_TYPE}%`);

  const completedTxIds = new Set((userTxs || []).map(r => r.transaction_id));

  const visibleTasks = [];
  for (const t of activeTasks) {
    if (t.type === 'miniapp') {
      const lHash = linkHash(t.link);
      const isDone = completedTxIds.has(`ft_link_${lHash}_${uid}`) || completedTxIds.has(`ft_task_${t.id}_${uid}`);
      // As requested: if the link was claimed, the mini app task does not appear again for him
      if (!isDone) {
        visibleTasks.push({
          id: t.id,
          type: 'miniapp',
          title: t.title,
          link: t.link,
          icon_url: t.icon_url || '',
          reward: Number(t.reward) || 0,
          done: false
        });
      }
    } else {
      // Channel / Group task
      const cId = Math.abs(Number(t.chat_id) || 0);
      const isDone = completedTxIds.has(`ft_chat_${cId}_${uid}`) || completedTxIds.has(`ft_task_${t.id}_${uid}`);
      visibleTasks.push({
        id: t.id,
        type: 'channel',
        title: t.title,
        chat_id: t.chat_id,
        invite_link: t.invite_link,
        has_photo: !!t.has_photo,
        photo_file_id: t.photo_file_id || '',
        avatar_url: t.photo_file_id ? `/api/featured-tasks?action=avatar&file_id=${encodeURIComponent(t.photo_file_id)}` : '',
        reward: Number(t.reward) || 0,
        done: isDone
      });
    }
  }

  return res.status(200).json({ success: true, tasks: visibleTasks });
}

// Claim reward for a featured task
async function handleClaim(req, res, verified) {
  const uid = String(verified.user.id);
  const { taskId } = req.body || {};
  if (!taskId) return res.status(400).json({ success: false, error: 'Task ID is required.' });

  if (await accountBlocked(uid)) {
    return res.status(403).json({ success: false, error: 'Account suspended.' });
  }

  const allTasks = await getFeaturedTasks(supabase, { fresh: true });
  const task = allTasks.find(t => t.id === taskId);
  if (!task || task.enabled === false) {
    return res.status(404).json({ success: false, error: 'Task not found or is no longer available.' });
  }

  let txId = '';
  if (task.type === 'channel') {
    // 1. Verify user membership in Telegram channel/group
    const isMember = await verifyUserInChat(task.chat_id, uid, BOT_TOKEN);
    if (!isMember) {
      return res.status(200).json({
        success: false,
        error: 'Please join the channel or group before claiming!'
      });
    }

    const cId = Math.abs(Number(task.chat_id) || 0);
    // Keyed by chat_id so if admin deletes & re-adds the same channel, user cannot double-claim
    txId = `ft_chat_${cId}_${uid}`;
  } else {
    // Mini App / Bot task
    const lHash = linkHash(task.link);
    // Keyed by link hash so if admin re-adds the same link, user cannot double-claim
    txId = `ft_link_${lHash}_${uid}`;
  }

  // 2. Double-check idempotency in transactions table
  const { data: existing } = await supabase
    .from('transactions')
    .select('id')
    .eq('transaction_id', txId)
    .maybeSingle();

  if (existing) {
    return res.status(200).json({ success: false, error: 'You have already claimed this task!' });
  }

  const rewardHowl = Math.max(1, Math.round(Number(task.reward) || 0));

  // 3. Record transaction row
  const { error: txErr } = await supabase.from('transactions').insert([{
    user_id: uid,
    reward_amount: rewardHowl,
    transaction_id: txId,
    task_type: `${FEATURED_TASK_TYPE}: ${task.title}`,
    status: '1',
    created_at: new Date().toISOString()
  }]);

  if (txErr) {
    if (txErr.code === '23505') {
      return res.status(200).json({ success: false, error: 'You have already claimed this task!' });
    }
    return res.status(500).json({ success: false, error: 'Failed to record transaction.' });
  }

  // 4. Credit user balance
  let credit;
  try {
    credit = await creditHowl(supabase, uid, rewardHowl);
  } catch (e) {
    credit = { ok: false };
  }

  if (!credit.ok) {
    await supabase.from('transactions').delete().eq('transaction_id', txId);
    return res.status(500).json({ success: false, error: 'Failed to credit HOWL reward.' });
  }

  return res.status(200).json({
    success: true,
    reward: rewardHowl,
    taskId: task.id,
    type: task.type,
    message: `🎉 +${rewardHowl} HOWL successfully added to your balance!`
  });
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'GET' && req.query.action === 'avatar') {
    return handleAvatar(req, res);
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!supabase || !BOT_TOKEN) {
    return res.status(500).json({ success: false, error: 'Server misconfigured.' });
  }

  const { initData, action } = req.body || {};
  const verified = verifyInitData(initData || req.headers['x-telegram-init-data'], BOT_TOKEN);
  if (!verified) return res.status(403).json({ success: false, error: 'Invalid security signature' });

  try {
    if (action === 'list') return await handleList(req, res, verified);
    if (action === 'claim') return await handleClaim(req, res, verified);
    return res.status(400).json({ success: false, error: 'Unknown action' });
  } catch (e) {
    console.error('[featured-tasks]', e?.message);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
}
