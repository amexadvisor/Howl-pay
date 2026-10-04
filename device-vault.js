/* HOWL Device Vault
 * Saves the device identity in EVERY place that can survive an IP change:
 *   Telegram SecureStorage, Telegram DeviceStorage, localStorage, IndexedDB, cookie
 * Reads them all on each launch and heals any that were cleared (so clearing
 * one store, or switching Telegram accounts, does not produce a "new" device).
 * Also keeps a hardware fingerprint (FingerprintJS) and a persistent ban flag.
 *
 * Note: Telegram CloudStorage is per-ACCOUNT, so it is intentionally NOT used.
 */
(function () {
  const K = { did: 'howl_did', owner: 'howl_owner', ban: 'howl_ban', hw: 'howl_hw' };
  const LEGACY = { did: 'howl_device_uuid', owner: 'howl_verified_user' };
  const PRIORITY = ['secure', 'device', 'local', 'idb', 'cookie'];

  const wa = () => (window.Telegram && Telegram.WebApp) || null;
  const supports = (obj) => { try { const w = wa(); return !!(w && w[obj] && w.isVersionAtLeast && w.isVersionAtLeast('9.0')); } catch (e) { return false; } };
  const timeout = (p, ms) => Promise.race([p, new Promise((r) => setTimeout(() => r(null), ms || 2500))]);

  /* ---------------- stores ---------------- */
  const stores = {
    local: {
      get: async (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } },
      set: async (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} },
      remove: async (k) => { try { localStorage.removeItem(k); } catch (e) {} }
    },
    cookie: {
      get: async (k) => {
        try { const m = document.cookie.match(new RegExp('(?:^|; )' + k + '=([^;]*)')); return m ? decodeURIComponent(m[1]) : null; } catch (e) { return null; }
      },
      set: async (k, v) => { try { document.cookie = k + '=' + encodeURIComponent(v) + '; max-age=315360000; path=/; SameSite=Lax; Secure'; } catch (e) {} },
      remove: async (k) => { try { document.cookie = k + '=; max-age=0; path=/'; } catch (e) {} }
    },
    idb: (function () {
      const open = () => new Promise((res, rej) => {
        try {
          const r = indexedDB.open('howl_vault', 1);
          r.onupgradeneeded = () => r.result.createObjectStore('kv');
          r.onsuccess = () => res(r.result);
          r.onerror = () => rej(r.error);
        } catch (e) { rej(e); }
      });
      const run = (mode, fn) => open().then((db) => new Promise((res) => {
        try {
          const tx = db.transaction('kv', mode); const out = fn(tx.objectStore('kv'));
          tx.oncomplete = () => res(out && out.result !== undefined ? out.result : null);
          tx.onerror = () => res(null);
        } catch (e) { res(null); }
      })).catch(() => null);
      return {
        get: (k) => run('readonly', (s) => s.get(k)),
        set: (k, v) => run('readwrite', (s) => s.put(v, k)),
        remove: (k) => run('readwrite', (s) => s.delete(k))
      };
    })(),
    device: {
      get: (k) => new Promise((res) => {
        if (!supports('DeviceStorage')) return res(null);
        try { wa().DeviceStorage.getItem(k, (err, v) => res(err ? null : (v || null))); } catch (e) { res(null); }
      }),
      set: (k, v) => new Promise((res) => {
        if (!supports('DeviceStorage')) return res();
        try { wa().DeviceStorage.setItem(k, v, () => res()); } catch (e) { res(); }
      }),
      remove: (k) => new Promise((res) => {
        if (!supports('DeviceStorage')) return res();
        try { wa().DeviceStorage.removeItem(k, () => res()); } catch (e) { res(); }
      })
    },
    secure: {
      get: (k) => new Promise((res) => {
        if (!supports('SecureStorage')) return res(null);
        try {
          wa().SecureStorage.getItem(k, (err, v, canRestore) => {
            if (!err && v) return res(v);
            if (canRestore) { try { wa().SecureStorage.restoreItem(k, (e2, rv) => res(!e2 && rv ? rv : null)); } catch (e) { res(null); } }
            else res(null);
          });
        } catch (e) { res(null); }
      }),
      set: (k, v) => new Promise((res) => {
        if (!supports('SecureStorage')) return res();
        try { wa().SecureStorage.setItem(k, v, () => res()); } catch (e) { res(); }
      }),
      remove: (k) => new Promise((res) => {
        if (!supports('SecureStorage')) return res();
        try { wa().SecureStorage.removeItem(k, () => res()); } catch (e) { res(); }
      })
    }
  };

  /* ---------------- helpers ---------------- */
  async function readAll(key) {
    const out = {};
    await Promise.all(PRIORITY.map(async (n) => { out[n] = await timeout(stores[n].get(key)); }));
    return out;
  }
  function pick(found, validate) {
    for (const n of PRIORITY) { const v = found[n]; if (v && (!validate || validate(v))) return v; }
    return null;
  }
  async function writeAll(key, value, found) {
    await Promise.all(PRIORITY.map((n) => (found && found[n] === value) ? null : timeout(stores[n].set(key, value))));
  }
  async function removeAll(key) { await Promise.all(PRIORITY.map((n) => timeout(stores[n].remove(key)))); }

  function newId() {
    const rnd = (window.crypto && crypto.randomUUID) ? crypto.randomUUID().replace(/-/g, '').slice(0, 20) : Math.random().toString(36).slice(2, 12) + Math.random().toString(36).slice(2, 12);
    return 'dev_' + rnd + Date.now().toString(36);
  }

  async function hardwareId(found) {
    let hw = null;
    try {
      const t0 = Date.now();
      while (!window.FingerprintJS && Date.now() - t0 < 4000) await new Promise((r) => setTimeout(r, 150));
      if (window.FingerprintJS) {
        const fp = await timeout(window.FingerprintJS.load(), 4000);
        const result = fp ? await timeout(fp.get(), 4000) : null;
        if (result && result.visitorId) hw = result.visitorId;
      }
    } catch (e) {}
    if (hw) { await writeAll(K.hw, hw, found); return hw; }
    return pick(found || {}) || null;   // fall back to the saved one
  }

  /* ---------------- public API ---------------- */
  let memo = null;

  async function collect(tgId) {
    if (memo && memo.tgId === tgId) return memo.data;
    tgId = String(tgId);

    const [didFound, ownerFound, hwFound] = await Promise.all([readAll(K.did), readAll(K.owner), readAll(K.hw)]);

    // ---- device id: vault first, then the legacy keys from the old version ----
    let deviceId = pick(didFound, (v) => /^dev_[A-Za-z0-9]+$/.test(v));
    if (!deviceId) {
      const legacyLS = await stores.local.get(LEGACY.did);
      const legacyCookie = await stores.cookie.get(LEGACY.did);
      deviceId = [legacyLS, legacyCookie].find((v) => v && /^dev_[A-Za-z0-9]+$/.test(v)) || newId();
    }
    // ---- owner = first Telegram account ever seen on this device ----
    let ownerId = pick(ownerFound, (v) => /^\d+$/.test(v));
    if (!ownerId) {
      const legacyOwner = await stores.local.get(LEGACY.owner);
      ownerId = (legacyOwner && /^\d+$/.test(legacyOwner)) ? legacyOwner : tgId;
    }
    const isLocalMulti = ownerId !== tgId;

    // ---- heal every store (write the winner everywhere) + hardware fingerprint ----
    const [, , hw] = await Promise.all([
      writeAll(K.did, deviceId, didFound),
      writeAll(K.owner, ownerId, ownerFound),
      hardwareId(hwFound)
    ]);

    const data = { deviceId, fingerprint: 'hw_' + deviceId, hw: hw || null, ownerId, isLocalMulti };
    memo = { tgId, data };
    return data;
  }

  async function setBan(tgId, reason) {
    try {
      const value = JSON.stringify({ u: String(tgId), r: String(reason || '').slice(0, 300), t: Date.now() });
      await writeAll(K.ban, value, null);
    } catch (e) {}
  }
  async function getBan(tgId) {
    try {
      const found = await readAll(K.ban);
      const raw = pick(found);
      if (!raw) return null;
      const b = JSON.parse(raw);
      return b && String(b.u) === String(tgId) ? b : null;   // only ever applies to the banned account itself
    } catch (e) { return null; }
  }
  // Only removes the flag if it belongs to this account (a clean account must not wipe another account's flag)
  async function clearBan(tgId) {
    try {
      if (tgId !== undefined && tgId !== null) {
        const b = await getBan(tgId);
        if (!b) return;
      }
      await removeAll(K.ban);
    } catch (e) {}
  }

  window.HowlDevice = { collect, setBan, getBan, clearBan };
})();
