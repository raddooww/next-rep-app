// companion.js — the Rosebud-style AI Companion tab (D40)
// Works TODAY without a key: assembles the full prompt (persona + your app context + thread)
// and copies it for pasting into Claude/ChatGPT on a clean device; paste the reply back to keep the thread.
// Works TOMORROW with the key: same button becomes a live chat. Zero code changes needed.

(function () {
  "use strict";
  const $ = id => document.getElementById(id);
  const AI = window.NR_AI;

  const store = {
    get(key, fallback) {
      try { const v = JSON.parse(localStorage.getItem("nr-final-" + key)); return v === null || v === undefined ? fallback : v; }
      catch { return fallback; }
    },
    set(key, value) { localStorage.setItem("nr-final-" + key, JSON.stringify(value)); window.dispatchEvent(new CustomEvent("nr:saved")); }
  };

  // ---------- personas (from the approved Prompt Desk mode list, D31) ----------
  const PERSONAS = [
    { id: "companion", label: "COMPANION", sys: "Role: daily companion (Rosebud-style). Listen, reflect back briefly, ask ONE good question at a time. Never lecture. Max 120 words per reply." },
    { id: "coach", label: "COACH", sys: "Role: performance coach. Concrete, numbers-first, next-action-first. End every reply with exactly one small next action. Max 100 words." },
    { id: "therapy-prep", label: "THERAPY PREP", sys: "Role: therapy preparation partner. Help organize what to bring to the session: themes, incidents, questions. Never do therapy yourself; you prepare FOR it. Structure over comfort." },
    { id: "reality-check", label: "REALITY CHECK", sys: "Role: reality check. The user tends toward catastrophic or suspicious interpretations under stress. Separate observable facts from interpretations, list both columns, then give the most boring plausible explanation. Never dismiss feelings; dismantle stories." },
    { id: "career", label: "CAREER", sys: "Role: career helper. CV wording, interview prep, workplace situations. Specific, evidence-based, no generic filler. Time-box: push to ship at defensible, not perfect." },
    { id: "artist", label: "ARTIST", sys: "Role: creative playmate. Brainstorm, riff, make weird things. This is the fun persona — levity allowed, no productivity talk unless asked." }
  ];

  // ---------- context assembly: this is what makes it YOUR Rosebud ----------
  function appContext() {
    const bits = [];
    try {
      const ec = JSON.parse(localStorage.getItem("next-rep-v03")) || {};
      const today = new Date().toISOString().slice(0, 10);
      const day = (ec.days || {})[today];
      const done = day ? Object.keys(day.completions || {}).length : 0;
      const anchors = (ec.anchors || []).length;
      bits.push("Today's anchors completed: " + done + "/" + anchors + ".");
      // P2.3: weekly evidence — N/7 per anchor + restarts (last 7 days incl. today)
      const week = [];
      for (let i = 6; i >= 0; i--) week.push(new Date(Date.now() - i * 864e5).toISOString().slice(0, 10));
      const perAnchor = (ec.anchors || []).map(a =>
        a.label + " " + week.filter(d => (ec.days || {})[d] && ec.days[d].completions && ec.days[d].completions[a.id]).length + "/7");
      if (perAnchor.length) bits.push("This week (≥5/7 = strong): " + perAnchor.join(", ") + ".");
      const restarts = week.reduce((s, d) => s + Number(((ec.days || {})[d] || {}).restarts || 0), 0);
      if (restarts) bits.push("Safe restarts this week: " + restarts + " (restarts are a feature, not a failure).");
      if (ec.checkpoint && ec.checkpoint.next) bits.push("Current NOW/next action: \"" + ec.checkpoint.next + "\".");
      if (Array.isArray(ec.openLoops) && ec.openLoops.length) bits.push("Open loops: " + ec.openLoops.slice(0, 5).map(l => l.text || l).join("; ") + ".");
    } catch (e) { /* EC state unavailable — fine */ }
    const g = store.get("gamify", null);
    if (g) bits.push("Level " + (Math.floor(g.xp / 100) + 1) + ", " + g.repCount + " reps logged, achievements: " + (g.achievements || []).join(", ") + ".");
    const diary = store.get("diary", []).slice(0, 3);
    if (diary.length) {
      bits.push("Last diary entries (newest first):\n" + diary.map(e =>
        "- " + e.date + " (" + e.mode + "): " + e.qa.map(x => x.q + " → " + x.a).join(" | ")).join("\n"));
    }
    return bits.join("\n");
  }

  function systemFor(personaId) {
    const p = PERSONAS.find(x => x.id === personaId) || PERSONAS[0];
    return AI.SYSTEM + "\n\n" + p.sys + "\n\nLive context from the user's Next Rep app (real data, cite it when relevant):\n" + appContext();
  }

  // ---------- thread state ----------
  function threads() { return store.get("companion-threads", {}); }
  function saveThread(personaId, msgs) { const t = threads(); t[personaId] = msgs.slice(-40); store.set("companion-threads", t); }
  function thread(personaId) { return threads()[personaId] || []; }

  let persona = store.get("companion-persona", "companion");

  // ---------- UI ----------
  function render() {
    const box = $("nrCompanion");
    if (!box) return;
    box.querySelector(".nrc-personas").innerHTML = PERSONAS.map(p =>
      '<button class="nrc-persona' + (p.id === persona ? " active" : "") + '" data-p="' + p.id + '" type="button">' + p.label + "</button>").join("");
    box.querySelectorAll(".nrc-persona").forEach(b => b.onclick = () => { persona = b.dataset.p; store.set("companion-persona", persona); render(); });
    const th = $("nrcThread");
    const msgs = thread(persona);
    th.innerHTML = msgs.length ? "" : '<p class="settings-note nrc-empty">' +
      (AI.ready()
        ? "Live chat. It knows your reps, diary, and level — ask it anything."
        : "No key yet — SEND copies the full prompt (persona + your app context + thread) to paste into Claude on a clean device. Paste the reply back with ↩ to keep the thread. Goes fully live tomorrow.") + "</p>";
    msgs.forEach(m => {
      const d = document.createElement("div");
      d.className = "nrc-msg " + (m.role === "user" ? "me" : "ai");
      d.textContent = m.content;
      th.appendChild(d);
    });
    th.scrollTop = th.scrollHeight;
    $("nrcPasteReply").style.display = AI.ready() ? "none" : "";
  }

  async function sendMsg() {
    const input = $("nrcInput");
    const text = input.value.trim();
    if (!text) return;
    const msgs = thread(persona);
    const res = await AI.send(text, { system: systemFor(persona), history: msgs, maxTokens: 500 });
    if (res.mode === "copy") {
      msgs.push({ role: "user", content: text });
      saveThread(persona, msgs);
      navigator.clipboard.writeText(res.prompt + "\n\nME: " + text);
      input.value = "";
      render();
      if (window.toast) toast(res.reason ? res.reason + " Paste the reply back with ↩" : "Prompt copied — paste into Claude, then paste the reply back with ↩");
    } else if (res.mode === "live") {
      msgs.push({ role: "user", content: text }, { role: "assistant", content: res.text });
      saveThread(persona, msgs);
      input.value = "";
      render();
    } else {
      if (window.toast) toast(res.error || "AI error");
    }
  }

  function pasteReply() {
    const reply = prompt("Paste the AI's reply here to add it to the thread:");
    if (!reply || !reply.trim()) return;
    const msgs = thread(persona);
    msgs.push({ role: "assistant", content: reply.trim() });
    saveThread(persona, msgs);
    render();
  }

  function boot() {
    const send = $("nrcSend");
    if (!send) return;
    send.addEventListener("click", sendMsg);
    $("nrcInput").addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMsg(); } });
    $("nrcPasteReply").addEventListener("click", pasteReply);
    const clear = $("nrcClear");
    if (clear) clear.addEventListener("click", () => { if (confirm("Clear this persona's thread?")) { saveThread(persona, []); render(); } });
    const nav = document.querySelector('[data-nav="chat"]');
    if (nav) nav.addEventListener("click", render);
    render();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
