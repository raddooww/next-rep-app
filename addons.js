// addons.js — Next Rep final-version add-on layer (2026-07-12)
// Adds on top of Electric Calm V6 WITHOUT touching app.js internals:
//   KNOWLEDGE library (Support) · DIARY view · EMERGENCY chain (Today) ·
//   XP/levels/abilities/achievements (Progress + pinned bar) · AI settings UI.
// Hooks: parallel event listeners + state diffing. EC core stays intact.

(function () {
  "use strict";
  const $ = id => document.getElementById(id);
  const KB = window.NR_KB;
  const AI = window.NR_AI;

  // ---------- namespaced storage (P0.4: swap this backend for cloud later) ----------
  const store = {
    get(key, fallback) {
      try { const v = JSON.parse(localStorage.getItem("nr-final-" + key)); return v === null || v === undefined ? fallback : v; }
      catch { return fallback; }
    },
    set(key, value) { localStorage.setItem("nr-final-" + key, JSON.stringify(value)); window.dispatchEvent(new CustomEvent("nr:saved")); }
  };

  let lang = store.get("lang", "en");
  const TXT = (obj, key) => obj[key + "_" + lang] || obj[key + "_en"] || "";
  const fold = s => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
  const todayKey = () => new Date().toISOString().slice(0, 10);
  const hhmm = () => new Date().toTimeString().slice(0, 5);

  // ================= KNOWLEDGE (rendered into Support view) =================
  let kCat = "all", kQuery = "";

  function kCardText(c) {
    const bits = [c.title_en, c.title_sk, c.tagline_en, c.tagline_sk, c.body_en, c.body_sk, c.note_en, c.note_sk, c.source];
    (c.steps || []).forEach(s => bits.push(s.en, s.sk));
    return bits.filter(Boolean).join(" ").toLowerCase();
  }
  function kBodyHtml(card) {
    let h = "";
    if (card.body_en) h += '<div class="nrk-letter">' + TXT(card, "body") + "</div>";
    if (card.steps) h += "<ol>" + card.steps.map(s => "<li>" + (s[lang] || s.en) + "</li>").join("") + "</ol>";
    if (card.note_en) h += '<div class="nrk-note">' + TXT(card, "note") + "</div>";
    h += '<div class="nrk-src">source: ' + card.source + "</div>";
    return h;
  }
  function renderKnowledge() {
    const wrap = $("nrKnowledge");
    if (!wrap) return;
    const cats = [{ id: "all", label_en: "ALL", label_sk: "VŠETKO", color: "lime" }].concat(KB.categories);
    wrap.querySelector(".nrk-chips").innerHTML = cats.map(c =>
      '<button class="nrk-chip' + (kCat === c.id ? " active" : "") + '" data-cat="' + c.id + '">' + TXT(c, "label") + "</button>").join("");
    wrap.querySelectorAll(".nrk-chip").forEach(b => b.onclick = () => { kCat = b.dataset.cat; renderKnowledge(); });
    const list = wrap.querySelector(".nrk-list");
    const shown = KB.cards
      .filter(c => (kCat === "all" || c.category === kCat) && (!kQuery || fold(kCardText(c)).includes(fold(kQuery))))
      .sort((a, b) => (a.category === "emergency" ? -1 : 0) - (b.category === "emergency" ? -1 : 0) || a.priority - b.priority);
    list.innerHTML = shown.length ? "" : '<p class="settings-note">' + (lang === "sk" ? "Nič sa nenašlo." : "No matches.") + "</p>";
    shown.forEach(card => {
      const div = document.createElement("div");
      div.className = "nrk-card nrk-" + card.category;
      div.innerHTML = '<div class="nrk-head"><strong>' + TXT(card, "title") + '</strong><span>' + card.category.toUpperCase() + "</span></div>" +
        '<p class="nrk-tag">' + TXT(card, "tagline") + '</p><div class="nrk-body">' + kBodyHtml(card) + "</div>";
      div.querySelector(".nrk-head").onclick = () => div.classList.toggle("open");
      list.appendChild(div);
    });
    const lt = wrap.querySelector(".nrk-lang");
    if (lt) lt.textContent = lang === "en" ? "EN → SK" : "SK → EN";
  }

  // ================= EMERGENCY CHAIN (Today button + overlay) =================
  const CHAIN = ["dont-use-letter", "emergency-reset", "shutdown-button", "wrong-people", "urge-to-lash-out"];
  function openEmergency() {
    const ov = $("nrEmergencyOverlay");
    awardAchievement("clutch");
    function show(i) {
      const card = KB.cards.find(c => c.id === CHAIN[i]);
      if (!card) return;
      $("nrEmergencyContent").innerHTML = "<h2>" + TXT(card, "title") + "</h2>" + kBodyHtml(card) +
        (i < CHAIN.length - 1
          ? '<button class="nre-next" type="button">' + (lang === "sk" ? "STÁLE ZLE? ĎALŠIA KARTA →" : "STILL BAD? NEXT CARD →") + "</button>"
          : "");
      const n = $("nrEmergencyContent").querySelector(".nre-next");
      if (n) n.onclick = () => show(i + 1);
      ov.scrollTop = 0;
    }
    show(0);
    ov.classList.add("open");
  }

  // ================= DIARY =================
  let diaryMode = new Date().getHours() < 14 ? "morning" : "evening";
  const MORNING_Q = [
    { en: "What matters today? One thing.", sk: "Na čom dnes záleží? Jedna vec." },
    { en: "What will try to pull you off it — and what's your counter-move?", sk: "Čo ťa od toho bude odťahovať — a aký je tvoj protiťah?" }
  ];
  const EVENING_Q = [ // Rosebud classic — D41
    { en: "How was the day?", sk: "Aký bol deň?" },
    { en: "What's on your mind?", sk: "Čo ti behá hlavou?" },
    { en: "What are you grateful for?", sk: "Za čo si vďačný?" }
  ];
  const ROTATING = (KB.cards.find(c => c.id === "reflection-prompts") || { steps: [] }).steps;

  function diaryEntries() { return store.get("diary", []); }

  function renderDiary() {
    const flow = $("nrDiaryFlow");
    if (!flow) return;
    document.querySelectorAll(".nrd-mode").forEach(b => b.classList.toggle("active", b.dataset.mode === diaryMode));
    flow.innerHTML = "";
    if (diaryMode === "history") return renderDiaryHistory(flow);
    let qs = diaryMode === "morning" ? MORNING_Q.slice() : EVENING_Q.slice();
    if (diaryMode === "evening" && ROTATING.length) qs.push(ROTATING[Math.floor(Date.now() / 86400000) % ROTATING.length]);
    qs.forEach((q, i) => {
      const card = document.createElement("div");
      card.className = "nrd-q";
      card.innerHTML = '<p class="eyebrow">Q' + (i + 1) + " / " + qs.length + "</p><h3>" + (q[lang] || q.en) + "</h3><textarea rows=\"3\"></textarea>";
      card.querySelector("textarea").addEventListener("blur", e => maybeFollowup(card, q, e.target.value));
      flow.appendChild(card);
    });
    const save = document.createElement("button");
    save.className = "primary-button full";
    save.type = "button";
    save.textContent = lang === "sk" ? "ZAPÍSAŤ ✓" : "LOG IT ✓";
    save.onclick = saveDiaryEntry;
    flow.appendChild(save);
    const reflect = document.createElement("button");
    reflect.className = "secondary-button full";
    reflect.type = "button";
    reflect.textContent = AI.ready()
      ? (lang === "sk" ? "REFLEXIA S AI" : "REFLECT WITH AI")
      : (lang === "sk" ? "REFLEXIA S AI → SKOPÍROVAŤ PROMPT (bez kľúča)" : "REFLECT WITH AI → COPY PROMPT (no key yet)");
    reflect.onclick = () => runReflect(reflect);
    flow.appendChild(reflect);
    const out = document.createElement("div");
    out.id = "nrReflectOut";
    flow.appendChild(out);
  }

  function maybeFollowup(card, q, answer) {
    if (!answer.trim() || card.dataset.fu) return;
    card.dataset.fu = "1";
    // Scripted rules today; when AI is ready this becomes a live single follow-up (spec Phase 1).
    const RULES = [
      { t: a => a.trim().length < 18, en: "One more sentence — what's underneath that?", sk: "Ešte jednu vetu — čo je pod tým?" },
      { t: a => /avoid|vyh[ýy]b|odklad|postpon|procrast/i.test(a), en: "What's the 10-minute version you could do tomorrow?", sk: "Aká je 10-minútová verzia na zajtra?" },
      { t: a => /angr|hnev|nasran|pissed|rage/i.test(a), en: "Factually — what was the trigger?", sk: "Fakticky — čo bol spúšťač?" },
      { t: a => /tired|unaven|exhaust|vy[čc]erpan/i.test(a), en: "Body-tired or mind-tired?", sk: "Unavené telo, alebo hlava?" },
      { t: a => /nothing|ni[čc]|numb|otupen|bored/i.test(a), en: "Name the smallest real thing that happened.", sk: "Pomenuj najmenšiu skutočnú vec, ktorá sa stala." }
    ];
    const rule = RULES.find(r => r.t(answer));
    if (!rule) return;
    const fu = document.createElement("div");
    fu.className = "nrd-q nrd-fu";
    fu.innerHTML = '<p class="eyebrow">' + (lang === "sk" ? "DOPLŇUJÚCA (SKRIPT, NIE AI)" : "FOLLOW-UP (SCRIPTED, NOT AI)") + "</p><h3>" + (rule[lang] || rule.en) + '</h3><textarea rows="2"></textarea>';
    card.after(fu);
  }

  function saveDiaryEntry() {
    const qa = [];
    document.querySelectorAll("#nrDiaryFlow .nrd-q").forEach(c => {
      const a = c.querySelector("textarea").value.trim();
      if (a) qa.push({ q: c.querySelector("h3").textContent, a });
    });
    if (!qa.length) return;
    const entries = diaryEntries();
    entries.unshift({ date: todayKey(), time: hhmm(), mode: diaryMode, qa });
    store.set("diary", entries);
    gainXp(15, "diary");
    diaryMode = "history";
    renderDiary();
    if (window.toast) toast("Diary entry logged.");
  }

  function renderDiaryHistory(flow) {
    const entries = diaryEntries();
    if (!entries.length) { flow.innerHTML = '<p class="settings-note">' + (lang === "sk" ? "Zatiaľ žiadne zápisy. Prvý zaberie 2 minúty." : "No entries yet. The first one takes 2 minutes.") + "</p>"; return; }
    entries.forEach(e => {
      const item = document.createElement("div");
      item.className = "nrd-hist";
      item.innerHTML = '<p class="eyebrow">' + e.date + " · " + e.time + " · " + e.mode.toUpperCase() + "</p>" +
        '<p class="nrd-preview">' + (e.qa[0] ? e.qa[0].a : "") + "</p>" +
        '<div class="nrd-full">' + e.qa.map(x => "<p class=\"nrd-fq\">" + x.q + "</p><p class=\"nrd-fa\">" + x.a + "</p>").join("") + "</div>";
      item.onclick = () => item.classList.toggle("open");
      flow.appendChild(item);
    });
  }

  async function runReflect(btn) {
    const entries = diaryEntries().slice(0, 7);
    if (!entries.length) return;
    const prompt = AI.reflectPrompt(entries);
    const res = await AI.send(prompt);
    const out = $("nrReflectOut");
    if (res.mode === "copy") {
      navigator.clipboard.writeText(res.prompt);
      btn.textContent = lang === "sk" ? "SKOPÍROVANÉ ✓ — vlož do Claude" : "COPIED ✓ — paste into Claude";
      if (res.reason) out.innerHTML = '<p class="settings-note">' + res.reason + "</p>";
    } else if (res.mode === "live") {
      out.innerHTML = '<div class="nrd-ai"><p class="eyebrow">AI REFLECTION</p>' + res.text.replace(/\n/g, "<br>") + "</div>";
    } else {
      out.innerHTML = '<p class="settings-note">' + res.error + "</p>";
    }
  }

  // ================= WEEKLY DIGEST (D41 / P2.3) =================
  function weekEvidence() {
    const days = [];
    for (let i = 6; i >= 0; i--) days.push(new Date(Date.now() - i * 864e5).toISOString().slice(0, 10));
    let ec = {};
    try { ec = JSON.parse(localStorage.getItem("next-rep-v03")) || {}; } catch { /* ignore */ }
    const anchors = ec.anchors || [];
    const perAnchor = anchors.map(a => ({
      label: a.label,
      n: days.filter(d => (ec.days || {})[d] && ec.days[d].completions && ec.days[d].completions[a.id]).length
    }));
    const restarts = days.reduce((s, d) => s + Number(((ec.days || {})[d] || {}).restarts || 0), 0);
    const g = store.get("gamify", { xp: 0, repCount: 0, achievements: [] });
    const diary = diaryEntries().filter(e => days.includes(e.date));
    const loops = Array.isArray(ec.openLoops) ? ec.openLoops.slice(0, 5).map(l => l.text || l) : [];
    return { days, perAnchor, restarts, g, diary, loops, checkpoint: (ec.checkpoint && ec.checkpoint.next) || "" };
  }

  function digestPrompt() {
    const w = weekEvidence();
    return "Weekly digest request for my Next Rep week " + w.days[0] + " → " + w.days[6] + ". THE EVIDENCE:\n" +
      "- Anchors (N/7): " + (w.perAnchor.map(a => a.label + " " + a.n + "/7").join(", ") || "none tracked") + "\n" +
      "- Safe restarts used: " + w.restarts + " (restarts are a feature, not a failure)\n" +
      "- Level " + (Math.floor(w.g.xp / 100) + 1) + ", " + w.g.xp + " XP, " + w.g.repCount + " reps total\n" +
      (w.checkpoint ? "- Current NOW/next action: \"" + w.checkpoint + "\"\n" : "") +
      (w.loops.length ? "- Open loops: " + w.loops.join("; ") + "\n" : "") +
      (w.diary.length ? "- Diary this week:\n" + w.diary.map(e => "  · " + e.date + " (" + e.mode + "): " +
        e.qa.map(x => x.q + " → " + x.a).join(" | ")).join("\n") + "\n" : "- No diary entries this week.\n") +
      "\nWrite the digest, max 200 words: 1) three receipts — what the evidence proves I did, cite dates; " +
      "2) one pattern worth noticing; 3) one risk for next week; 4) ONE small adjustment (10-minute version). " +
      "A ≥5/7 anchor week is strong — never demand 7/7. No cheerleading.";
  }

  function digests() { return store.get("digests", []); }
  function renderDigestOut(html) { const out = $("nrDigestOut"); if (out) out.innerHTML = html; }
  function renderLatestDigest() {
    const d = digests()[0];
    if (d) renderDigestOut('<div class="nrd-ai"><p class="eyebrow">DIGEST · ' + d.date + "</p>" + d.text.replace(/\n/g, "<br>") + "</div>");
  }

  async function runDigest(btn) {
    const res = await AI.send(digestPrompt(), { maxTokens: 500 });
    if (res.mode === "copy") {
      navigator.clipboard.writeText(res.prompt);
      btn.textContent = lang === "sk" ? "SKOPÍROVANÉ ✓ — vlož do Claude, odpoveď vlož cez 'Paste digest reply'" : "COPIED ✓ — paste into Claude, bring the reply back via 'Paste digest reply'";
      if (res.reason) renderDigestOut('<p class="settings-note">' + res.reason + "</p>");
    } else if (res.mode === "live") {
      saveDigest(res.text);
    } else {
      renderDigestOut('<p class="settings-note">' + res.error + "</p>");
    }
  }
  function saveDigest(text) {
    const list = digests();
    list.unshift({ date: todayKey(), text: text.trim() });
    store.set("digests", list.slice(0, 52)); // a year of weeks
    renderLatestDigest();
  }
  function downloadDigest() {
    const d = digests()[0];
    if (!d) { if (window.toast) toast("No digest yet — generate one first."); return; }
    const blob = new Blob(["# Next Rep weekly digest — " + d.date + "\n\n" + d.text + "\n"], { type: "text/markdown" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "next-rep-digest-" + d.date + ".md";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // ================= GAMIFY (D42): XP · levels · abilities · achievements =================
  const ABILITIES = [
    { ico: "🧪", nm: "NEW PROMPT: ARTIST", lvl: 1 },
    { ico: "🗺", nm: "NEW ROUTE", lvl: 2 },
    { ico: "🎨", nm: "THEME UNLOCK", lvl: 3 },
    { ico: "🎵", nm: "ALBUM NIGHT", lvl: 4 },
    { ico: "🧰", nm: "NEW TOOL HOUR", lvl: 5 },
    { ico: "⚔️", nm: "BOSS KEY", lvl: 6 },
    { ico: "🍳", nm: "NEW RECIPE", lvl: 7 },
    { ico: "🎟", nm: "FREE EVENING", lvl: 8 },
    { ico: "🚀", nm: "PROJECT SLOT", lvl: 10 },
    { ico: "👑", nm: "CUSTOM ABILITY", lvl: 12 }
  ];
  const ACH_DEFS = [
    { id: "first-rep", ico: "🎯", nm: "FIRST REP" },
    { id: "first-diary", ico: "📓", nm: "FIRST DIARY ENTRY" },
    { id: "five-week", ico: "📆", nm: "5-DAY WEEK" },
    { id: "clutch", ico: "🧯", nm: "CLUTCH (emergency card in the moment)" },
    { id: "iron-return", ico: "🛡", nm: "IRON RETURN (came back after 7+ days)" },
    { id: "hundred", ico: "💯", nm: "100 LIFETIME REPS" }
  ];

  function gam() { return store.get("gamify", { xp: 0, lastRepAt: 0, repCount: 0, achievements: [], lastDing: 0 }); }
  function setGam(g) { store.set("gamify", g); }
  const levelOf = xp => Math.floor(xp / 100) + 1;  // flat 100/level — the next level never gets farther away (D42)
  const isRested = g => !g.lastRepAt || Date.now() - g.lastRepAt > 36 * 3600 * 1000;

  function gainXp(amount, why) {
    const g = gam();
    const rested = why === "rep" && isRested(g);
    if (rested && g.lastRepAt && Date.now() - g.lastRepAt > 7 * 86400000) awardAchievement("iron-return");
    const before = levelOf(g.xp);
    g.xp += rested ? amount * 2 : amount;
    if (why === "rep") { g.repCount += 1; g.lastRepAt = Date.now(); }
    setGam(g);
    if (why === "rep" && g.repCount === 1) awardAchievement("first-rep");
    if (why === "rep" && g.repCount >= 100) awardAchievement("hundred");
    if (why === "diary") awardAchievement("first-diary");
    const after = levelOf(g.xp);
    renderXpBar(); renderGamify();
    if (after > before) ding(after);
  }

  function awardAchievement(id) {
    const g = gam();
    if (g.achievements.includes(id)) return;
    g.achievements.push(id);
    setGam(g);
    if (window.toast) toast("Achievement unlocked: " + (ACH_DEFS.find(a => a.id === id) || { nm: id }).nm);
  }

  function ding(lv) {
    $("nrDingLevel").textContent = "LEVEL " + lv;
    const unlock = ABILITIES.find(a => a.lvl === lv);
    $("nrDingUnlock").textContent = unlock ? "ABILITY UNLOCKED: " + unlock.ico + " " + unlock.nm : "";
    const el2 = $("nrDing");
    el2.classList.remove("show"); void el2.offsetWidth; el2.classList.add("show");
  }

  function renderXpBar() {
    const g = gam();
    const cur = g.xp % 100;
    if (!$("nrXpFill")) return;
    $("nrXpFill").style.width = cur + "%";
    $("nrXpFill").classList.toggle("rested", isRested(g));
    $("nrXpLabel").textContent = "LV " + levelOf(g.xp) + " · " + cur + "/100" + (isRested(g) ? " · ✦ RESTED 2×" : "");
  }

  function renderGamify() {
    const wrap = $("nrGamify");
    if (!wrap) return;
    const g = gam();
    wrap.querySelector(".nrg-stats").innerHTML =
      "<strong>LEVEL " + levelOf(g.xp) + "</strong> · " + g.xp + " XP · " + g.repCount + " gamified reps · " + diaryEntries().length + " diary entries";
    wrap.querySelector(".nrg-achs").innerHTML = ACH_DEFS.map(a =>
      '<div class="nrg-ach' + (g.achievements.includes(a.id) ? " got" : "") + '">' + a.ico + " <small>" + a.nm + "</small></div>").join("");
    wrap.querySelector(".nrg-abilities").innerHTML = ABILITIES.map(a => {
      const un = levelOf(g.xp) >= a.lvl;
      return '<div class="nrg-slot' + (un ? " un" : "") + '">' + a.ico + "<small>" + a.nm + (un ? "" : " · LV " + a.lvl) + "</small></div>";
    }).join("");
  }

  // Hook: EC's completeRepButton → award XP by diffing total completions (runs after core handler).
  let lastCompletionCount = null;
  function totalCompletions() {
    try {
      const s = JSON.parse(localStorage.getItem("next-rep-v03"));
      return Object.values((s && s.days) || {}).reduce((n, d) => n + Object.keys(d.completions || {}).length, 0);
    } catch { return 0; }
  }
  function watchCompletions() {
    const now = totalCompletions();
    if (lastCompletionCount !== null && now > lastCompletionCount) gainXp(25 * (now - lastCompletionCount), "rep");
    lastCompletionCount = now;
  }

  // ================= AI SETTINGS UI =================
  function renderAiSettings() {
    const box = $("nrAiSettings");
    if (!box) return;
    const s = AI.getSettings();
    box.querySelector("#nrAiModel").value = s.model;
    box.querySelector("#nrAiKey").value = s.apiKey;
    box.querySelector("#nrAiCeiling").value = s.monthlyCostCeilingEur;
    box.querySelector("#nrAiStatus").textContent = AI.ready()
      ? "LIVE — key present. Estimated spend this month: " + s.spentEstimateEur.toFixed(2) + "€ / ceiling " + s.monthlyCostCeilingEur + "€."
      : "COPY-PASTE MODE — no key. Add your API key here AFTER the Windows reinstall (2026-07-13). Everything else already works.";
  }
  function bindAiSettings() {
    const box = $("nrAiSettings");
    if (!box) return;
    box.querySelector("#nrAiSave").addEventListener("click", () => {
      AI.saveSettings({
        model: box.querySelector("#nrAiModel").value.trim(),
        apiKey: box.querySelector("#nrAiKey").value.trim(),
        monthlyCostCeilingEur: Number(box.querySelector("#nrAiCeiling").value) || 5
      });
      renderAiSettings();
      if (window.toast) toast(AI.ready() ? "AI is LIVE." : "Saved. Still in copy-paste mode (no key).");
    });
  }

  // ================= BOOT =================
  function boot() {
    // nav title for diary
    const navBtn = document.querySelector('[data-nav="diary"]');
    if (navBtn) navBtn.addEventListener("click", () => renderDiary());
    document.querySelectorAll(".nrd-mode").forEach(b => b.onclick = () => { diaryMode = b.dataset.mode; renderDiary(); });
    const search = $("nrkSearch");
    if (search) search.addEventListener("input", e => { kQuery = e.target.value.trim(); renderKnowledge(); });
    const langBtn = document.querySelector(".nrk-lang");
    if (langBtn) langBtn.addEventListener("click", () => { lang = lang === "en" ? "sk" : "en"; store.set("lang", lang); renderKnowledge(); renderDiary(); });
    const em = $("nrEmergencyBtn");
    if (em) em.addEventListener("click", openEmergency);
    const dg = $("nrDigestRun");
    if (dg) dg.addEventListener("click", () => runDigest(dg));
    const dgp = $("nrDigestPaste");
    if (dgp) dgp.addEventListener("click", () => {
      const reply = prompt("Paste the digest reply from Claude:");
      if (reply && reply.trim()) saveDigest(reply);
    });
    const dgd = $("nrDigestDownload");
    if (dgd) dgd.addEventListener("click", downloadDigest);
    renderLatestDigest();
    const emClose = $("nrEmergencyClose");
    if (emClose) emClose.addEventListener("click", () => $("nrEmergencyOverlay").classList.remove("open"));
    const crb = $("completeRepButton");
    if (crb) crb.addEventListener("click", () => setTimeout(watchCompletions, 80));
    lastCompletionCount = totalCompletions();
    bindAiSettings();
    renderKnowledge(); renderDiary(); renderGamify(); renderXpBar(); renderAiSettings();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
