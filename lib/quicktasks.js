// Admin-adjustable Quick Tasks (stored as one JSON row in the app_settings table, key 'quick_tasks').
//   comment : users post one of the admin's texts in the community group; a bot watching the group credits them
//   bio     : one-time task, user puts their referral link in their Telegram bio; verified with getChat
// Ledger rows use "(HOWL)" in task_type and store reward_amount in HOWL, same as the referral bonuses.

export const COMMENT_TASK_TYPE = 'Community Comment (HOWL)';
export const BIO_TASK_TYPE = 'Bio Link Task (HOWL)';

export const DEFAULT_QUICK_TASKS = {
  comment: { enabled: false, reward: 300, cooldown_min: 360, chat_id: '', group_link: 'https://t.me/howl_community', texts: [] },
  bio: { enabled: true, reward: 1000 }
};

const KEY = 'quick_tasks';
const CACHE_MS = 10000;
let cache = { at: 0, cfg: null };

export const normalizeText = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();

function withDefaults(v) {
  const x = v && typeof v === 'object' ? v : {};
  return {
    comment: { ...DEFAULT_QUICK_TASKS.comment, ...(x.comment || {}) },
    bio: { ...DEFAULT_QUICK_TASKS.bio, ...(x.bio || {}) }
  };
}

export async function getQuickTasks(supabase, { fresh = false } = {}) {
  if (!fresh && cache.cfg && Date.now() - cache.at < CACHE_MS) return cache.cfg;
  let cfg = withDefaults(null);
  try {
    const { data } = await supabase.from('app_settings').select('value').eq('key', KEY).maybeSingle();
    if (data && data.value) cfg = withDefaults(data.value);
  } catch (e) {
    console.error('[quicktasks] read failed, using defaults:', e.message);
  }
  cache = { at: Date.now(), cfg };
  return cfg;
}

export async function saveQuickTasks(supabase, cfg) {
  const { error } = await supabase.from('app_settings')
    .upsert({ key: KEY, value: cfg, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) throw new Error(error.message);
  cache = { at: Date.now(), cfg };
  return cfg;
}

/** Strict validation for the admin panel. A section that is not sent keeps its current values. */
export function validateQuickTasks(input, current = DEFAULT_QUICK_TASKS) {
  if (!input || typeof input !== 'object') return { ok: false, error: 'Missing settings.' };
  const out = withDefaults(current);
  const num = (v) => (typeof v === 'number' || (typeof v === 'string' && v.trim() !== '')) ? Number(v) : NaN;
  const fail = (error) => ({ ok: false, error });

  if (input.comment) {
    const c = input.comment;
    const reward = num(c.reward);
    if (!Number.isInteger(reward) || reward < 1 || reward > 100000) return fail('Comment task: reward must be a whole number between 1 and 100,000 HOWL.');

    const hours = num(c.cooldown_hours);
    if (!Number.isFinite(hours) || hours < 0.1 || hours > 168) return fail('Comment task: cooldown must be between 0.1 and 168 hours.');

    const chat_id = String(c.chat_id == null ? '' : c.chat_id).trim();
    if (chat_id && !/^-?\d{5,20}$/.test(chat_id)) return fail('Comment task: community chat ID must be a number such as -1001234567890.');

    const group_link = String(c.group_link == null ? '' : c.group_link).trim();
    if (group_link && !/^https:\/\/t\.me\/[A-Za-z0-9_+\/-]{3,64}$/.test(group_link)) return fail('Comment task: group link must look like https://t.me/yourgroup.');

    const texts = [];
    const seen = new Set();
    for (const raw of (Array.isArray(c.texts) ? c.texts : [])) {
      const s = String(raw == null ? '' : raw).trim().replace(/\s+/g, ' ');
      if (!s) continue;
      if (s.length < 3 || s.length > 200) return fail('Comment task: each text must be 3 to 200 characters.');
      const k = normalizeText(s);
      if (seen.has(k)) continue;
      seen.add(k);
      texts.push(s);
    }
    if (texts.length > 20) return fail('Comment task: at most 20 texts.');

    const enabled = !!c.enabled;
    if (enabled && (!chat_id || texts.length === 0)) return fail('Comment task: set the community chat ID and at least one text before turning it on.');

    out.comment = { enabled, reward, cooldown_min: Math.round(hours * 60), chat_id, group_link, texts };
  }

  if (input.bio) {
    const reward = num(input.bio.reward);
    if (!Number.isInteger(reward) || reward < 1 || reward > 100000) return fail('Bio task: reward must be a whole number between 1 and 100,000 HOWL.');
    out.bio = { enabled: !!input.bio.enabled, reward };
  }

  return { ok: true, config: out };
}

// ---- Account guard (same rules as claim-bonus.js): admin ban + multi-account policy ----
const ADMIN_IDS = ['8026237972', '1928631932'];

export async function accountBlocked(supabase, uid) {
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

  return !!(other && (ADMIN_IDS.includes(String(other.user_id)) ||
    new Date(me.created_at) >= new Date(other.created_at)));
            }
