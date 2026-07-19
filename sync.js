// sync.js — Next Rep cloud sync (P2.1, D39). Local-first: localStorage stays the live store,
// this file pushes/pulls ENCRYPTED whole-state snapshots to Supabase in the background.
// Zero framework, zero CDN: plain fetch against Supabase REST (PostgREST) + GoTrue auth.
// The server NEVER sees plaintext — AES-GCM 256, key derived from your passphrase (PBKDF2 250k).
// Setup steps + SQL: see SUPABASE_SETUP.md in the repo root.

(function () {
  const SKEY = "nr-final-sync-settings"; // device-local: {url, anonKey, email, refreshToken, passphrase, salt, deviceId}
  const META = "nr-final-sync-meta";     // device-local: {lastPushedAt, lastAppliedAt}
  const EXCLUDE = [SKEY, META];          // never leave the device
  const CORE_KEYS = ["next-rep-v03", "next-rep-ai-settings-v01"];

  const cfg = () => { try { return JSON.parse(localStorage.getItem(SKEY)) || {}; } catch { return {}; } };
  const setCfg = (patch) => localStorage.setItem(SKEY, JSON.stringify({ ...cfg(), ...patch }));
  const meta = () => { try { return JSON.parse(localStorage.getItem(META)) || {}; } catch { return {}; } };
  const setMeta = (patch) => localStorage.setItem(META, JSON.stringify({ ...meta(), ...patch }));
  const configured = () => { const s = cfg(); return Boolean(s.url && s.anonKey && s.refreshToken && s.passphrase); };

  let status = configured() ? "idle" : "off";
  let lastError = "";
  function setStatus(st, err) {
    status = st; lastError = err || "";
    const el = document.getElementById("nrSyncStatus");
    if (!el) return;
    const m = meta();
    if (!configured()) { el.textContent = "OFF — fill in the fields below and press Connect. Until then the app is local-only (unchanged)."; return; }
    el.textContent = { idle: "CONNECTED", pushing: "SYNCING…", pulling: "CHECKING CLOUD…", error: "SYNC ERROR (app unaffected): " + lastError }[st]
      + (m.lastPushedAt ? " · last push " + m.lastPushedAt.slice(0, 16).replace("T", " ") : "")
      + (m.lastAppliedAt ? " · last pull " + m.lastAppliedAt.slice(0, 16).replace("T", " ") : "");
  }

  // ---------- crypto ----------
  const bufToB64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
  const b64ToBuf = (b64) => Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  async function deriveKey(passphrase, saltB64) {
    const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(passphrase), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey({ name: "PBKDF2", salt: b64ToBuf(saltB64), iterations: 250000, hash: "SHA-256" },
      base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  }
  async function encryptJson(obj, passphrase, saltB64) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(passphrase, saltB64);
    const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(JSON.stringify(obj)));
    return { payload: bufToB64(ct), iv: bufToB64(iv) };
  }
  async function decryptJson(payloadB64, ivB64, passphrase, saltB64) {
    const key = await deriveKey(passphrase, saltB64);
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64ToBuf(ivB64) }, key, b64ToBuf(payloadB64));
    return JSON.parse(new TextDecoder().decode(pt));
  }

  // ---------- auth (GoTrue) ----------
  let accessToken = "", accessExp = 0;
  async function signIn(email, password) {
    const s = cfg();
    const res = await fetch(s.url + "/auth/v1/token?grant_type=password", {
      method: "POST", headers: { "content-type": "application/json", apikey: s.anonKey },
      body: JSON.stringify({ email, password })
    });
    if (!res.ok) throw new Error("Sign-in failed: " + (await res.text()).slice(0, 120));
    const d = await res.json();
    accessToken = d.access_token; accessExp = Date.now() + (d.expires_in - 60) * 1000;
    setCfg({ email, refreshToken: d.refresh_token });
  }
  async function token() {
    if (accessToken && Date.now() < accessExp) return accessToken;
    const s = cfg();
    const res = await fetch(s.url + "/auth/v1/token?grant_type=refresh_token", {
      method: "POST", headers: { "content-type": "application/json", apikey: s.anonKey },
      body: JSON.stringify({ refresh_token: s.refreshToken })
    });
    if (!res.ok) throw new Error("Session expired — press Connect again with your password.");
    const d = await res.json();
    accessToken = d.access_token; accessExp = Date.now() + (d.expires_in - 60) * 1000;
    setCfg({ refreshToken: d.refresh_token }); // Supabase rotates refresh tokens
    return accessToken;
  }
  async function api(method, path, body) {
    const s = cfg();
    const res = await fetch(s.url + path, {
      method,
      headers: {
        apikey: s.anonKey, authorization: "Bearer " + (await token()),
        "content-type": "application/json", prefer: "return=minimal"
      },
      body: body ? JSON.stringify(body) : undefined
    });
    if (!res.ok) throw new Error(method + " " + path.split("?")[0] + " → " + res.status + " " + (await res.text()).slice(0, 120));
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }

  // ---------- snapshot ----------
  function deviceId() {
    let s = cfg();
    if (!s.deviceId) { setCfg({ deviceId: "dev-" + Math.random().toString(36).slice(2, 10) }); s = cfg(); }
    return s.deviceId;
  }
  function bundle() {
    const snap = {};
    CORE_KEYS.forEach(k => { const v = localStorage.getItem(k); if (v !== null) snap[k] = v; });
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith("nr-final-") && !EXCLUDE.includes(k)) snap[k] = localStorage.getItem(k);
    }
    return snap;
  }
  function applySnapshot(snap) {
    Object.entries(snap).forEach(([k, v]) => { if (!EXCLUDE.includes(k)) localStorage.setItem(k, v); });
  }

  // ---------- push / pull ----------
  let pushTimer = null, busy = false;
  async function push() {
    if (!configured() || busy) return;
    busy = true; setStatus("pushing");
    try {
      const s = cfg();
      const now = new Date().toISOString();
      const enc = await encryptJson(bundle(), s.passphrase, s.salt);
      await api("POST", "/rest/v1/snapshots", { device_id: deviceId(), updated_at: now, payload: enc.payload, iv: enc.iv, salt: s.salt });
      setMeta({ lastPushedAt: now });
      // history retention: drop rows older than 30 days
      const cutoff = new Date(Date.now() - 30 * 864e5).toISOString();
      await api("DELETE", "/rest/v1/snapshots?updated_at=lt." + encodeURIComponent(cutoff));
      setStatus("idle");
    } catch (e) { setStatus("error", String(e.message || e)); }
    busy = false;
  }
  const schedulePush = () => { if (!configured()) return; clearTimeout(pushTimer); pushTimer = setTimeout(push, 2500); };

  async function pull() {
    if (!configured() || busy) return;
    busy = true; setStatus("pulling");
    try {
      const s = cfg(), m = meta();
      const rows = await api("GET", "/rest/v1/snapshots?select=updated_at,payload,iv,salt,device_id&order=updated_at.desc&limit=1");
      const r = rows && rows[0];
      const newest = [m.lastPushedAt || "", m.lastAppliedAt || ""].sort().pop();
      if (r && r.updated_at > newest) {
        const snap = await decryptJson(r.payload, r.iv, s.passphrase, r.salt); // salt travels with the row → cross-device works
        applySnapshot(snap);
        setMeta({ lastAppliedAt: r.updated_at });
        busy = false;
        location.reload(); // re-render everything from the fresh state
        return;
      }
      setStatus("idle");
    } catch (e) { setStatus("error", String(e.message || e)); }
    busy = false;
  }

  // ---------- settings UI ----------
  function renderUi() {
    const box = document.getElementById("nrSyncSettings");
    if (!box) return;
    const s = cfg();
    box.querySelector("#nrSyncUrl").value = s.url || "";
    box.querySelector("#nrSyncAnon").value = s.anonKey || "";
    box.querySelector("#nrSyncEmail").value = s.email || "";
    box.querySelector("#nrSyncPass2").value = s.passphrase || "";
    setStatus(status);
  }
  function bindUi() {
    const box = document.getElementById("nrSyncSettings");
    if (!box) return;
    box.querySelector("#nrSyncConnect").addEventListener("click", async () => {
      try {
        const url = box.querySelector("#nrSyncUrl").value.trim().replace(/\/$/, "");
        const anonKey = box.querySelector("#nrSyncAnon").value.trim();
        const email = box.querySelector("#nrSyncEmail").value.trim();
        const password = box.querySelector("#nrSyncPw").value; // used once, never stored
        const passphrase = box.querySelector("#nrSyncPass2").value;
        if (!url || !anonKey || !email || !password || !passphrase) { if (window.toast) toast("Fill in all five fields."); return; }
        setCfg({ url, anonKey, passphrase });
        if (!cfg().salt) setCfg({ salt: bufToB64(crypto.getRandomValues(new Uint8Array(16))) });
        await signIn(email, password);
        box.querySelector("#nrSyncPw").value = "";
        await pull();   // adopt newer cloud state if any (second device case)
        await push();   // then publish current state
        renderUi();
        if (window.toast) toast(status === "error" ? "Connected, but sync failed: " + lastError : "Cloud sync is LIVE.");
      } catch (e) { setStatus("error", String(e.message || e)); if (window.toast) toast(String(e.message || e)); }
    });
    box.querySelector("#nrSyncNow").addEventListener("click", async () => { await pull(); await push(); });
    box.querySelector("#nrSyncOff").addEventListener("click", () => {
      localStorage.removeItem(SKEY); localStorage.removeItem(META);
      accessToken = ""; renderUi(); setStatus("off");
      if (window.toast) toast("Sync disconnected. Local data untouched. Cloud rows remain (delete in Supabase if wanted).");
    });
  }

  // ---------- boot ----------
  window.addEventListener("nr:saved", schedulePush);
  window.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden" && pushTimer) { clearTimeout(pushTimer); push(); } });
  document.addEventListener("DOMContentLoaded", () => { renderUi(); bindUi(); if (configured()) pull(); });

  window.NR_SYNC = { push, pull, configured };
})();
