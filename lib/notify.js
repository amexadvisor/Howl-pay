// Telegram notifications for TimeWall rewards (hold / approved / reversed).
// Sends to the user AND to the public notification channel. Never throws.

const CHANNEL_CHAT = '@howlnotification';          // the bot must be an admin of this channel
const APP_URL_USER = 'https://t.me/howl_paybot/app';
const APP_URL_CHANNEL = 'https://t.me/howl_paybot/app?startapp=ref_8026237972';

// Premium (custom) emoji ids
const E = {
  target: '5350460637182993292',   // 🎯
  wolf:   '5276289730256842699',   // 🐺
  user:   '5976524022622460378',   // user id
  amount: '5409048419211682843',   // amount
  tx:     '5210956306952758910',   // txid
  status: '5454415424319931791'    // status
};

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const em = (id, fallback) => `<tg-emoji emoji-id="${id}">${fallback}</tg-emoji>`;
const fmtHowl = (n) => Math.round(Number(n) || 0).toLocaleString('en-US');
// The channel is public, so the user id is partly hidden there
const maskId = (id) => { id = String(id); return id.length > 6 ? id.slice(0, 4) + '***' + id.slice(-2) : id; };

function kindInfo(kind, holdDays) {
  switch (kind) {
    case 'hold':
      return { title: 'TimeWall Reward On Hold', status: `On Hold • released in ${holdDays} days`, sign: '+' };
    case 'approved':
      return { title: 'TimeWall Reward Approved', status: 'Approved • added to your balance', sign: '+' };
    case 'reversed_hold':
      return { title: 'TimeWall Reward Reversed', status: 'Reversed • removed from pending balance', sign: '-' };
    case 'reversed_balance':
      return { title: 'TimeWall Reward Reversed', status: 'Reversed • deducted from your balance', sign: '-' };
    default:
      return { title: 'TimeWall Update', status: String(kind), sign: '' };
  }
}

function buildText({ kind, howl, txid, userId, holdDays, forChannel }) {
  const k = kindInfo(kind, holdDays);
  const lines = [`${em(E.target, '🎯')} <b>${k.title}</b>`, ''];
  if (forChannel) lines.push(`${em(E.user, '👤')} User ID: <code>${esc(maskId(userId))}</code>`);
  lines.push(`${em(E.amount, '💵')} Amount: <b>${k.sign}${fmtHowl(howl)} HOWL</b>`);
  lines.push(`${em(E.tx, '🧾')} TxID: <code>${esc(txid)}</code>`);
  lines.push(`${em(E.status, '📌')} Status: <b>${k.status}</b>`);
  return lines.join('\n');
}

// Green "App" button with the 🐺 premium emoji
function appButton(url) {
  return { inline_keyboard: [[{ text: 'App', url, style: 'success', icon_custom_emoji_id: E.wolf }]] };
}
const plainButton = (url) => ({ inline_keyboard: [[{ text: 'App', url }]] });

async function tgSend(chatId, text, url) {
  const token = (process.env.BOT_TOKEN || '').trim();
  if (!token) return false;

  const send = async (markup) => {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        reply_markup: markup
      })
    });
    if (!r.ok) {
      const body = await r.text().catch(() => '');
      return { ok: false, body };
    }
    return { ok: true };
  };

  try {
    let res = await send(appButton(url));
    // If Telegram rejects the styled button, still deliver the message with a plain button
    if (!res.ok && /button|style|icon|emoji/i.test(res.body || '')) res = await send(plainButton(url));
    if (!res.ok) console.error('[notify] Telegram rejected message for', chatId, (res.body || '').slice(0, 200));
    return res.ok;
  } catch (e) {
    console.error('[notify] send failed for', chatId, e.message);
    return false;
  }
}

/**
 * kind: 'hold' | 'approved' | 'reversed_hold' | 'reversed_balance'
 * howl: amount in HOWL
 */
export async function notifyTimewall({ userId, kind, howl, txid, holdDays = 7 }) {
  try {
    const base = { kind, howl, txid, userId: String(userId), holdDays };
    await Promise.allSettled([
      tgSend(String(userId), buildText({ ...base, forChannel: false }), APP_URL_USER),
      tgSend(CHANNEL_CHAT, buildText({ ...base, forChannel: true }), APP_URL_CHANNEL)
    ]);
  } catch (e) {
    console.error('[notify] error:', e.message);
  }
  }
