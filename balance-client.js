/* HOWL live balance client
 * - one place that renders the balance
 * - polls /api/claim-bonus {balance_only:true} (focus, view change, every 5s) so offerwall credits,
 *   referral commissions, admin refunds etc. appear without reopening the app
 * - ignores stale responses (a slow poll can never overwrite a newer claim/withdraw result)
 */
(function () {
  const POLL_MS = 5000;

  let seq = 0;          // id handed to every request / update
  let applied = 0;      // highest id already rendered
  let inflight = false;
  let shownHowl = null; // what is currently on screen
  let rafId = null;

  function initData() {
    return (window.Telegram && Telegram.WebApp && Telegram.WebApp.initData) || '';
  }

  function paint(howl, usd) {
    const h = document.getElementById('user-howl-val');
    const u = document.getElementById('user-usd-val');
    if (h) h.textContent = Math.round(howl).toLocaleString();
    if (u) u.textContent = Number(usd).toFixed(4);
  }

  function animateTo(targetHowl, targetUsd) {
    if (rafId) cancelAnimationFrame(rafId);
    if (shownHowl === null || Math.abs(targetHowl - shownHowl) < 1) {
      shownHowl = targetHowl;
      paint(targetHowl, targetUsd);
      return;
    }
    const from = shownHowl;
    const start = performance.now();
    const dur = 600;
    (function step(now) {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      const cur = from + (targetHowl - from) * eased;
      paint(cur, cur * 0.00002);
      if (t < 1) {
        rafId = requestAnimationFrame(step);
      } else {
        shownHowl = targetHowl;
        paint(targetHowl, targetUsd);
      }
    })(start);
  }

  /** Render a server balance object { total_howl, total_usd }. */
  function applyBalance(b, mySeq) {
    if (!b) return;
    const id = mySeq || ++seq;
    if (id < applied) return;       // stale response, drop it
    applied = id;
    animateTo(Math.round(b.total_howl || 0), parseFloat(b.total_usd || 0));

    // Pending (on-hold) offerwall rewards
    const hp = document.getElementById('hold-pill');
    const hv = document.getElementById('user-hold-val');
    if (hp && hv) {
      hv.textContent = Math.round(b.hold_howl || 0).toLocaleString();
      hp.title = 'HOWL on hold. Offerwall rewards are held for 7 days before they join your balance.';
    }
  }

  async function refreshBalance() {
    const data = initData();
    if (!data || inflight) return;
    inflight = true;
    const mySeq = ++seq;
    try {
      const r = await fetch('/api/claim-bonus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Telegram-Init-Data': data },
        body: JSON.stringify({ balance_only: true, initData: data }),
        cache: 'no-store'
      });
      const j = await r.json();
      if (j && j.success) applyBalance(j.user_balance, mySeq);
    } catch (e) { /* silent, next poll will retry */ }
    inflight = false;
  }

  window.applyBalance = applyBalance;
  window.refreshBalance = refreshBalance;

  document.addEventListener('DOMContentLoaded', function () {
    // Route every existing updateBalanceUI(...) call through the new renderer
    window.updateBalanceUI = applyBalance;

    // Refresh whenever the user navigates to a screen where the balance matters
    const originalShowView = window.showView;
    if (typeof originalShowView === 'function') {
      window.showView = function (id) {
        originalShowView.apply(this, arguments);
        if (['home-view', 'withdraw-view', 'tasks-view', 'team-view'].indexOf(id) !== -1) refreshBalance();
      };
    }

    refreshBalance();
    setInterval(function () { if (!document.hidden) refreshBalance(); }, POLL_MS);

    document.addEventListener('visibilitychange', function () { if (!document.hidden) refreshBalance(); });
    window.addEventListener('focus', refreshBalance);
    try {
      if (window.Telegram && Telegram.WebApp && Telegram.WebApp.onEvent) {
        Telegram.WebApp.onEvent('activated', refreshBalance);
        Telegram.WebApp.onEvent('viewportChanged', function (e) { if (e && e.isStateStable) refreshBalance(); });
      }
    } catch (e) {}
  });
})();
