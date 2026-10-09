import crypto from 'crypto';

export const FEATURED_TASKS_KEY = 'featured_tasks';
export const FEATURED_TASK_TYPE = 'Featured Task (HOWL)';

const CACHE_MS = 10000;
let cache = { at: 0, tasks: null };

export const normalizeLink = (url) => {
  return String(url || '').trim().toLowerCase().replace(/\/+$/, '');
};

export const linkHash = (url) => {
  const norm = normalizeLink(url);
  return crypto.createHash('md5').update(norm).digest('hex').substring(0, 16);
};

export async function getFeaturedTasks(supabase, { fresh = false } = {}) {
  if (!fresh && cache.tasks && Date.now() - cache.at < CACHE_MS) return cache.tasks;
  let tasks = [];
  try {
    const { data } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', FEATURED_TASKS_KEY)
      .maybeSingle();
    if (data && Array.isArray(data.value)) {
      tasks = data.value;
    }
  } catch (e) {
    console.error('[featured-tasks] read failed:', e.message);
  }
  cache = { at: Date.now(), tasks };
  return tasks;
}

export async function saveFeaturedTasks(supabase, tasks) {
  const cleanList = Array.isArray(tasks) ? tasks : [];
  const { error } = await supabase.from('app_settings')
    .upsert(
      { key: FEATURED_TASKS_KEY, value: cleanList, updated_at: new Date().toISOString() },
      { onConflict: 'key' }
    );
  if (error) throw new Error(error.message);
  cache = { at: Date.now(), tasks: cleanList };
  return cleanList;
}

/** Check if bot is in chat, verify bot is admin, get title, photo, and permanent invite link */
export async function checkTelegramChat(chatIdentifier, botToken) {
  if (!botToken) return { ok: false, error: 'Server bot token is missing.' };
  const raw = String(chatIdentifier || '').trim();
  if (!raw) return { ok: false, error: 'Please enter a channel username (@channel) or Chat ID (-100...).' };

  let target = raw;
  if (target.startsWith('https://t.me/')) {
    const part = target.replace('https://t.me/', '').split('/')[0].split('?')[0];
    if (part && !part.startsWith('+') && !part.startsWith('joinchat')) {
      target = '@' + part;
    }
  }

  // 1. Fetch Chat Info
  let chatData;
  try {
    const r = await fetch(`https://api.telegram.org/bot${botToken}/getChat?chat_id=${encodeURIComponent(target)}`);
    chatData = await r.json();
  } catch (e) {
    return { ok: false, error: 'Network error connecting to Telegram Bot API.' };
  }

  if (!chatData || !chatData.ok || !chatData.result) {
    return {
      ok: false,
      error: chatData?.description || 'Could not find this channel or group. Make sure the ID or @username is correct and the bot has been added.'
    };
  }

  const chat = chatData.result;
  const chatId = chat.id;

  // 2. Fetch Bot's own identity to check its admin status
  let botId;
  try {
    const meRes = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
    const meData = await meRes.json();
    if (meData.ok && meData.result) botId = meData.result.id;
  } catch (e) {}

  if (!botId) return { ok: false, error: 'Could not verify bot identity.' };

  // 3. Verify bot is Administrator or Creator in the chat
  let memberData;
  try {
    const mRes = await fetch(`https://api.telegram.org/bot${botToken}/getChatMember?chat_id=${chatId}&user_id=${botId}`);
    memberData = await mRes.json();
  } catch (e) {
    return { ok: false, error: 'Failed checking bot admin rights in the chat.' };
  }

  if (!memberData || !memberData.ok || !memberData.result) {
    return { ok: false, error: 'Bot is not a member of this chat. Please add the bot as an Administrator first!' };
  }

  const status = memberData.result.status;
  if (!['administrator', 'creator'].includes(status)) {
    return { ok: false, error: 'The bot is in the chat, but is NOT an Administrator. Please promote the bot to Admin!' };
  }

  // 4. Resolve permanent link
  let inviteLink = '';
  if (chat.username) {
    inviteLink = `https://t.me/${chat.username}`;
  } else {
    // Private chat: export or create permanent invite link
    try {
      const expRes = await fetch(`https://api.telegram.org/bot${botToken}/exportChatInviteLink?chat_id=${chatId}`);
      const expData = await expRes.json();
      if (expData.ok && expData.result) {
        inviteLink = expData.result;
      } else {
        const createRes = await fetch(`https://api.telegram.org/bot${botToken}/createChatInviteLink?chat_id=${chatId}&name=HOWL+Featured+Task`);
        const createData = await createRes.json();
        if (createData.ok && createData.result?.invite_link) {
          inviteLink = createData.result.invite_link;
        }
      }
    } catch (e) {}
  }

  if (!inviteLink && chat.invite_link) {
    inviteLink = chat.invite_link;
  }

  if (!inviteLink) {
    return {
      ok: false,
      error: 'Could not generate a permanent invite link for this chat. Ensure the bot has "Invite Users via Link" permission in the chat.'
    };
  }

  // 5. Check Chat Avatar photo
  let photoFileId = null;
  if (chat.photo && (chat.photo.small_file_id || chat.photo.big_file_id)) {
    photoFileId = chat.photo.small_file_id || chat.photo.big_file_id;
  }

  return {
    ok: true,
    chat: {
      id: String(chatId),
      title: chat.title || chat.username || 'Telegram Channel',
      type: chat.type || 'channel',
      username: chat.username || null,
      invite_link: inviteLink,
      photo_file_id: photoFileId,
      has_photo: !!photoFileId
    }
  };
}

/** Check if user is member/admin/creator of chat */
export async function verifyUserInChat(chatId, userId, botToken) {
  if (!botToken || !chatId || !userId) return false;
  try {
    const url = `https://api.telegram.org/bot${botToken}/getChatMember?chat_id=${encodeURIComponent(chatId)}&user_id=${encodeURIComponent(userId)}`;
    const r = await fetch(url);
    const data = await r.json();
    return !!(data && data.ok && data.result && ['member', 'administrator', 'creator'].includes(data.result.status));
  } catch (e) {
    return false;
  }
}
