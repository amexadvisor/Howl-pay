// Quick Tasks & Featured Tasks API for the Mini App.
//   GET  ?action=featured_avatar&file_id=...   -> streams Telegram chat avatar safely
//   POST { initData, action: 'status' }         -> what the Quick Tasks screen shows (read-only)
//   POST { initData, action: 'claim_bio' }      -> one-time bio task, verified server-side with Telegram getChat
//   POST { initData, action: 'featured_list' }  -> user-facing featured tasks list
//   POST { initData, action: 'featured_claim', taskId } -> claim channel or mini app task
//
// Comment-task rewards are NOT claimed here: they are paid by api/community-webhook.js when the bot sees the post.
import { createClient } from '@supabase/supabase-js';
import { verifyInitData, creditHowl } from '../lib/balance.js';
import { getQuickTasks, accountBlocked, COMMENT_TASK_TYPE, BIO_TASK_TYPE } from '../lib/quicktasks.js';
import {
  FEATURED_TASK_TYPE,
  getFeaturedTasks,
  verifyUserInChat,
  linkHash
} from '../lib/featured-tasks.js';

const SUPABASE_URL = (process.env.SUPABASE_URL || '').trim();
const SUPABASE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || '').trim();
const supabase = (SUPABASE_URL && SUPABASE_KEY) ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;

const BOT_USERNAME = (process.env.BOT_USERNAME || 'howl_paybot').trim();
const BOT_TOKEN = (process.env.BOT_TOKEN || '').trim();

// What the user puts in their bio. Telegram bios are limited to 70 characters, so the "https://" is left out.
const refLinkShort = (uid) => `t.me/${BOT_USERNAME}/app?startapp=ref_${uid}`;
const bioText = (uid) => `\u{1F43A} High Earning bot: ${refLinkShort(uid)}`;
const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function getChatBio(uid) {
  const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getChat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: Number(uid) })
  });
  const j = await r.json();
  if (!j.ok) return { ok: false };
  return { ok: true, bio: String((j.result && j.result.bio) || '') };
}

async function status(uid) {
  const cfg = await getQuickTasks(supabase);
  const now = Date.now();

  const { data: lastRows } = await supabase.from('transactions').select('created_at')
    .eq('user_id', uid).eq('task_type', COMMENT_TASK_TYPE).eq('status', '1')
    .order('created_at', { ascending: false }).limit(1);
  const lastAt = lastRows && lastRows[0] ? new Date(lastRows[0].created_at).getTime() : 0;
  const cooldownMs = cfg.comment.cooldown_min * 60000;
  const secondsLeft = lastAt ? Math.max(0, Math.ceil((lastAt + cooldownMs - now) / 1000)) : 0;

  const { data: bioRow } = await supabase.from('transactions').select('transaction_id')
    .eq('user_id', uid).eq('transaction_id', `bio_task_${uid}`).maybeSingle();

  return {
    comment: {
      enabled: !!(cfg.comment.enabled && cfg.comment.chat_id && cfg.comment.texts.length),
      reward: cfg.comment.reward,
      cooldown_hours: cfg.comment.cooldown_min / 60,
      texts: cfg.comment.texts,
      group_link: cfg.comment.group_link,
      seconds_left: secondsLeft,
      last_at: lastAt
    },
    bio: {
      enabled: !!cfg.bio.enabled,
      reward: cfg.bio.reward,
      done: !!bioRow,
      text: bioText(uid),
      bot_link: `https://t.me/${BOT_USERNAME}`
    }
  };
}

async function claimBio(uid, res) {
  const cfg = await getQuickTasks(supabase, { fresh: true });
  if (!cfg.bio.enabled) return res.status(200).json({ success: false, error: 'This task is not available right now.' });
  if (await accountBlocked(supabase, uid)) return res.status(403).json({ success: false, error: 'Account suspended.' });

  const txId = `bio_task_${uid}`;
  const { data: done } = await supabase.from('transactions').select('transaction_id').eq('transaction_id', txId).maybeSingle();
  if (done) return res.status(200).json({ success: false, error: 'You already completed this task.' });

  // Verify with Telegram itself: the link in the bio must be THIS user's own referral link
  const chat = await getChatBio(uid);
  if (!chat.ok) {
    return res.status(200).json({ success: false, need_start: true, bot_link: `https://t.me/${BOT_USERNAME}`,
      error: 'Open the bot and press Start first, then try again.' });
  }
  const re = new RegExp(escapeRegExp(refLinkShort(uid)) + '(?!\\d)', 'i');   // (?!\d): ref_123 must not match ref_1234
  if (!re.test(chat.bio)) {
    return res.status(200).json({ success: false,
      error: 'We could not find your link in your bio. Save it, make sure your bio is visible (Settings > Privacy > Bio > Everybody), then try again.' });
  }

  // Reserve first (unique id = one payment per user), then credit
  const reward = cfg.bio.reward;
  const { error: txErr } = await supabase.from('transactions').insert([{
    user_id: uid, reward_amount: reward, transaction_id: txId,
    task_type: BIO_TASK_TYPE, status: '1', created_at: new Date().toISOString()
  }]);
  if (txErr) {
    if (txErr.code === '23505') return res.status(200).json({ success: false, error: 'You already completed this task.' });
    return res.status(500).json({ success: false, error: 'Could not record the reward. Try again.' });
  }

  let credit;
  try { credit = await creditHowl(supabase, uid, reward); } catch (e) { credit = { ok: false }; }
  if (!credit.ok) {
    await supabase.from('transactions').delete().eq('transaction_id', txId);
    return res.status(500).json({ success: false, error: 'Could not credit the reward. Open the app once and try again.' });
  }
  return res.status(200).json({ success: true, reward, user_balance: credit.balance });
}

// Telegram chat avatar proxy (streamed securely without leaking BOT_TOKEN)
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

// Featured tasks: List for users
async function handleFeaturedList(req, res, uid) {
  const allTasks = await getFeaturedTasks(supabase);
  const activeTasks = allTasks.filter(t => t.enabled !== false);

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
        avatar_url: t.photo_file_id ? `/api/quick-tasks?action=featured_avatar&file_id=${encodeURIComponent(t.photo_file_id)}` : '',
        reward: Number(t.reward) || 0,
        done: isDone
      });
    }
  }

  return res.status(200).json({ success: true, tasks: visibleTasks });
}

// Featured tasks: Claim reward
async function handleFeaturedClaim(req, res, uid) {
  const { taskId } = req.body || {};
  if (!taskId) return res.status(400).json({ success: false, error: 'Task ID is required.' });

  if (await accountBlocked(supabase, uid)) {
    return res.status(403).json({ success: false, error: 'Account suspended.' });
  }

  const allTasks = await getFeaturedTasks(supabase, { fresh: true });
  const task = allTasks.find(t => t.id === taskId);
  if (!task || task.enabled === false) {
    return res.status(404).json({ success: false, error: 'Task not found or is no longer available.' });
  }

  let txId = '';
  if (task.type === 'channel') {
    const isMember = await verifyUserInChat(task.chat_id, uid, BOT_TOKEN, task.chat_username);
    if (!isMember) {
      return res.status(200).json({
        success: false,
        error: 'Please join the channel or group before claiming!'
      });
    }

    const cId = Math.abs(Number(task.chat_id) || 0);
    txId = `ft_chat_${cId}_${uid}`;
  } else {
    const lHash = linkHash(task.link);
    txId = `ft_link_${lHash}_${uid}`;
  }

  const { data: existing } = await supabase
    .from('transactions')
    .select('id')
    .eq('transaction_id', txId)
    .maybeSingle();

  if (existing) {
    return res.status(200).json({ success: false, error: 'You have already claimed this task!' });
  }

  const rewardHowl = Math.max(1, Math.round(Number(task.reward) || 0));

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

  // Handle Telegram chat avatar streaming (GET)
  if (req.method === 'GET' && (req.query.action === 'featured_avatar' || req.query.action === 'avatar')) {
    return handleAvatar(req, res);
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!supabase || !BOT_TOKEN) return res.status(500).json({ success: false, error: 'Server configuration error.' });

  try {
    const { initData, action } = req.body || {};
    const verified = verifyInitData(initData || req.headers['x-telegram-init-data'], BOT_TOKEN, 86400);
    if (!verified) return res.status(403).json({ success: false, error: 'Invalid signature' });
    const uid = String(verified.user.id);

    // Quick tasks actions
    if (action === 'status') return res.status(200).json({ success: true, ...(await status(uid)) });
    if (action === 'claim_bio') return await claimBio(uid, res);

    // Featured tasks actions
    if (action === 'featured_list' || action === 'list') return await handleFeaturedList(req, res, uid);
    if (action === 'featured_claim' || action === 'claim') return await handleFeaturedClaim(req, res, uid);

    return res.status(400).json({ success: false, error: 'Unknown action' });
  } catch (e) {
    console.error('[quick-tasks]', e && e.message);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
}
