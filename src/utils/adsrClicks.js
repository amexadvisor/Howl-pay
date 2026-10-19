// Detects "the user clicked CTA button(s) inside the ad".
// Signals: the ad calls window.open / Telegram openLink / openTelegramLink / TelegramWebviewProxy / parent.postMessage / webkit notification.
export function adsrWatchClicks(onFirstClick) {
  const w = { clicks: 0, clicked: false, reasons: [], stop: function () {} };
  const undo = [];
  const seenUrls = new Set();
  const tg = window.Telegram && window.Telegram.WebApp;
  let lastClickTime = 0;

  const mark = (why, url) => {
    const now = Date.now();
    if (now - lastClickTime < 1000) return; // debounce fast double-taps
    if (url) {
      const norm = String(url).trim().toLowerCase().split('?')[0];
      if (norm && seenUrls.has(norm)) return; // already counted this specific ad destination
      if (norm) seenUrls.add(norm);
    }
    lastClickTime = now;
    w.clicks++;
    if (w.reasons.indexOf(why) < 0) w.reasons.push(why);
    if (!w.clicked) {
      w.clicked = true;
      try {
        if (onFirstClick) onFirstClick();
      } catch (e) {}
    }
  };

  const wrap = (obj, name, why) => {
    try {
      if (!obj || typeof obj[name] !== 'function') return;
      const orig = obj[name];
      obj[name] = function () {
        const url = arguments && arguments[0];
        mark(why, typeof url === 'string' ? url : '');
        return orig.apply(this, arguments);
      };
      undo.push(() => {
        try {
          obj[name] = orig;
        } catch (e) {}
      });
    } catch (e) {}
  };

  wrap(window, 'open', 'window.open');
  if (tg) {
    wrap(tg, 'openLink', 'openLink');
    wrap(tg, 'openTelegramLink', 'openTelegramLink');
  }

  // Android Telegram Native Bridge
  if (window.TelegramWebviewProxy && typeof window.TelegramWebviewProxy.postEvent === 'function') {
    try {
      const origPost = window.TelegramWebviewProxy.postEvent;
      window.TelegramWebviewProxy.postEvent = function (eventType, eventData) {
        if (eventType === 'web_app_open_link' || eventType === 'web_app_open_tg_link') {
          let u = '';
          try {
            const d = typeof eventData === 'string' ? JSON.parse(eventData) : eventData;
            u = d && (d.url || d.path_full);
          } catch (e) {}
          mark(eventType, u);
        }
        return origPost.apply(this, arguments);
      };
      undo.push(() => {
        try {
          window.TelegramWebviewProxy.postEvent = origPost;
        } catch (e) {}
      });
    } catch (e) {}
  }

  // Telegram Web / Desktop (iframe postMessage to parent)
  if (window.parent && window.parent !== window && typeof window.parent.postMessage === 'function') {
    try {
      const origParentPost = window.parent.postMessage;
      window.parent.postMessage = function (msg, targetOrigin, transfer) {
        try {
          let parsed = msg;
          if (typeof msg === 'string') {
            try {
              parsed = JSON.parse(msg);
            } catch (e) {}
          }
          if (parsed && (parsed.eventType === 'web_app_open_link' || parsed.eventType === 'web_app_open_tg_link')) {
            const u = parsed.eventData && (parsed.eventData.url || parsed.eventData.path_full);
            mark('parent_postMessage', u);
          }
        } catch (e) {}
        return origParentPost.apply(this, arguments);
      };
      undo.push(() => {
        try {
          window.parent.postMessage = origParentPost;
        } catch (e) {}
      });
    } catch (e) {}
  }

  // iOS Telegram Native Bridge
  if (
    window.webkit &&
    window.webkit.messageHandlers &&
    window.webkit.messageHandlers.notification &&
    typeof window.webkit.messageHandlers.notification.postMessage === 'function'
  ) {
    try {
      const origIosPost = window.webkit.messageHandlers.notification.postMessage;
      window.webkit.messageHandlers.notification.postMessage = function (data) {
        try {
          const parsed = typeof data === 'string' ? JSON.parse(data) : data;
          if (parsed && (parsed.event_name === 'web_app_open_link' || parsed.event_name === 'web_app_open_tg_link')) {
            const u = parsed.data && (parsed.data.url || parsed.data.path_full);
            mark('ios_' + parsed.event_name, u);
          }
        } catch (e) {}
        return origIosPost.apply(this, arguments);
      };
      undo.push(() => {
        try {
          window.webkit.messageHandlers.notification.postMessage = origIosPost;
        } catch (e) {}
      });
    } catch (e) {}
  }

  // In-page link clicks
  const onLinkClick = (e) => {
    try {
      const a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
      if (a && a.href) {
        const h = a.href;
        if ((h.startsWith('http://') || h.startsWith('https://') || h.startsWith('tg://')) && !h.includes(window.location.host)) {
          mark('a_tag_click', h);
        }
      }
    } catch (err) {}
  };
  document.addEventListener('click', onLinkClick, true);
  undo.push(() => document.removeEventListener('click', onLinkClick, true));

  w.stop = () => {
    undo.splice(0).forEach((fn) => fn());
  };
  return w;
}
