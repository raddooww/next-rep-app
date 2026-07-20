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
  let mode = store.get("mode", "full"); // D47: "easy" | "full" — nr-final-mode, default full for existing AND fresh installs
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

  // ================= MODE (EASY/FULL, D47) =================
  // EASY is a pure view toggle, never a feature toggle (no dead switches, canon): mechanics
  // keep running underneath (XP, arena, tokens, streaks) — this only decides what's painted.
  function applyMode() {
    document.body.classList.toggle("easy-mode", mode === "easy");
    if (mode === "easy") renderEasyView();
  }
  function setMode(next) {
    mode = next;
    store.set("mode", mode);
    applyMode();
  }
  function renderEasyView() {
    const list = $("easyAnchorList");
    const status = $("easyStatus");
    if (!list || !status) return;
    const data = dayData();
    list.innerHTML = state.anchors.map(anchor => {
      const done = Boolean(data.completions[anchor.id]);
      return '<button class="easy-anchor-btn' + (done ? " done" : "") + '" type="button" data-easy-anchor="' + anchor.id + '">' +
        '<span class="easy-dot" style="background:' + anchor.color + '"></span>' +
        '<span class="easy-anchor-copy"><strong>' + escapeHtml(anchor.label) + '</strong><small>min: ' + anchor.minimum + ' min</small></span>' +
        '<span class="easy-tap">' + (done ? "✓ LOGGED" : "TAP ✓") + '</span></button>';
    }).join("");
    list.querySelectorAll("[data-easy-anchor]").forEach(btn => btn.addEventListener("click", () => easyTapAnchor(btn.dataset.easyAnchor)));
    const completedCount = state.anchors.filter(anchor => data.completions[anchor.id]).length;
    status.textContent = completedCount === state.anchors.length
      ? completedCount + " of " + state.anchors.length + " — day taken ✓"
      : completedCount + " of " + state.anchors.length + " · tap = logged (minimum)";
  }
  // D24 taken literally: one tap = the anchor's minimum logged instantly, via the exact
  // same completion path (app.js: logAnchorCompletion) the FULL timer flow ends in — no
  // parallel bookkeeping. Already-completed anchors are tappable-inert; corrections happen
  // in FULL (no un-log in EASY, D47 §2.3).
  function easyTapAnchor(anchorId) {
    if (dayData().completions[anchorId]) return;
    logAnchorCompletion(anchorId, "minimum");
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

  // Award XP by diffing total completions; called from the nr:repCompleted listener in
  // boot(), which fires identically for the FULL timer flow and EASY's one-tap log (D47).
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

  // ================= ARENA v2 (D46 + D50, ARENA_V2_SPEC) =================
  // Replaces the v1 week-as-match engine that lived in app.js. Doctrine carried over from v1
  // and Recoveries: NOTHING derived is ever stored. Config + append-only logs + resets are the
  // only inputs; ratings, floors, W–L, peaks and streaks are recomputed by deterministic replay
  // on every render. That is what makes ARENA_V2_SPEC §7's promise true — "changing any profile
  // formula later is safe" — and what keeps JSON import/export (D16) and cloud sync (D39) from
  // ever desyncing the ladder. Storage sits in the nr-final namespace, so sync.js snapshots it
  // for free (it sweeps every nr-final-* key).

  const ARENA_TIERS = { min: 8, std: 12, stretch: 20 }; // D46 defaults, fixed at season start
  // planDays uses the project's Monday-first index (0=Mon … 6=Sun), matching weekKey().
  // Block teams ship with an EMPTY plan by Rado's call (2026-07-20): blocks pay rating from
  // day one, but no game — and therefore no −10 — exists until he declares which days count.
  // The alternative (a guessed Mon–Fri) would have manufactured losses against a training
  // schedule nobody chose. DAILY plans every day per D50(3).
  function arenaTeamDefaults() {
    return [
      { id: "exercise", bracket: "2v2", name: "EXERCISE", subtitle: "resistance training + running", color: "#ff7b45", profile: "sublinear", tiers: { ...ARENA_TIERS }, planDays: [] },
      { id: "learning", bracket: "3v3", name: "LEARNING", subtitle: "courses, new skills, memory drills", color: "#b48aff", profile: "linearSoft", tiers: { ...ARENA_TIERS }, planDays: [] },
      { id: "work", bracket: "5v5", name: "WORK/CREATION", subtitle: "the app, part-time job, YouTube, creating", color: "#d8ff52", profile: "linearCap", tiers: { ...ARENA_TIERS }, planDays: [] },
      { id: "daily", bracket: "1v1", name: "DAILY", subtitle: "foundation habits", color: "#85d8ff", profile: "daily", tiers: { ...ARENA_TIERS }, planDays: [0, 1, 2, 3, 4, 5, 6],
        habits: [{ id: "journal", name: "Journaling" }, { id: "meditate", name: "Meditation" }, { id: "stretch", name: "Stretches" }, { id: "read", name: "Reading" }] }
    ];
  }

  // ---------- date + season helpers (all local-date, via app.js's localDateKey) ----------
  const dayKey = (d) => localDateKey(d);
  const parseKey = (k) => new Date(k + "T12:00:00");
  const shiftKey = (k, n) => { const d = parseKey(k); d.setDate(d.getDate() + n); return dayKey(d); };
  const weekdayIndex = (k) => (parseKey(k).getDay() + 6) % 7; // Monday = 0
  const mondayOf = (k) => weekKey(parseKey(k));
  const daysApart = (a, b) => Math.round((parseKey(b) - parseKey(a)) / 86400000);

  function seasonKeyOf(k) {
    const [y, m] = k.split("-").map(Number);
    return y + "-Q" + (Math.floor((m - 1) / 3) + 1);
  }
  function seasonBounds(sk) {
    const [y, q] = sk.split("-Q").map(Number);
    const startMonth = (q - 1) * 3;
    const start = dayKey(new Date(y, startMonth, 1));
    const end = dayKey(new Date(y, startMonth + 3, 0));
    return { start, end };
  }
  function seasonLabel(sk) {
    const [y, q] = sk.split("-Q");
    return "Season " + q + " · " + y;
  }

  // ---------- stored state ----------
  function arenaConfig() {
    const cfg = store.get("arena2-config", null) || { seasons: {} };
    cfg.seasons ||= {};
    const sk = seasonKeyOf(dayKey());
    if (!cfg.seasons[sk]) {
      // startedAt = max(quarter start, first app use) per §3. For a season that opens while
      // the app is already running, "first app use" is today — so a brand-new install can
      // never inherit missed planned days from earlier in the quarter.
      const { start } = seasonBounds(sk);
      const previous = Object.keys(cfg.seasons).sort().at(-1);
      cfg.seasons[sk] = {
        season: sk,
        // A rollover season really did start on day one of the quarter (the app was running).
        // The very first season a device ever sees starts today — never earlier, or the arena
        // would open owing losses for planned days that predate its own existence.
        startedAt: previous ? start : dayKey(),
        // Carry the previous season's team definitions forward — a new quarter resets ratings
        // (§3), not Rado's declared teams. He re-defines them if he wants to.
        teams: previous ? structuredClone(cfg.seasons[previous].teams) : arenaTeamDefaults()
      };
      store.set("arena2-config", cfg);
    }
    return cfg;
  }
  const currentSeasonKey = () => seasonKeyOf(dayKey());
  const seasonConfig = (sk) => arenaConfig().seasons[sk];
  const arenaLogs = () => store.get("arena2-logs", []);
  const arenaResets = () => store.get("arena2-resets", []);

  // ---------- gain profiles (§4) ----------
  // Value of the n-th block of the day, before bracket scaling. `tier` is the team's configured
  // point value for the tapped tier; `daily` ignores tiers entirely (flat +8 per habit credit).
  function profiledGain(profile, tier, n) {
    switch (profile) {
      case "sublinear": return tier * (Math.pow(n, 0.85) - Math.pow(n - 1, 0.85));
      case "linearSoft": return n <= 4 ? tier : tier * 0.7;
      case "linearCap": return n <= 8 ? tier : 0;
      case "daily": return 8;
      default: return tier;
    }
  }
  const roundHalfUp = (x) => Math.floor(x + 0.5);
  // Bracket scaling reads the rating as it stands BEFORE the block — climbing past 1700
  // mid-day slows the rest of that day, not retroactively the blocks already banked.
  function bracketScale(rating) {
    if (rating >= 1800) return 0.5;
    if (rating >= 1700) return 0.75;
    return 1;
  }
  function blockGain(profile, tier, n, rating) {
    const base = profiledGain(profile, tier, n);
    if (base <= 0) return 0; // linearCap block 9+: still a rep in the header, zero rating
    return Math.max(1, roundHalfUp(base * bracketScale(rating))); // floor +1 per §4
  }

  // ---------- replay ----------
  // No retroactive logging beyond yesterday (§4): a log whose loggedAt date is more than one
  // day after the day it claims is ignored outright, so back-dating can't be smuggled in via
  // a hand-edited export.
  function logIsValid(l) {
    const loggedDay = String(l.loggedAt || "").slice(0, 10) || l.forDate;
    return daysApart(l.forDate, loggedDay) <= 1;
  }
  function teamSeasonLogs(all, teamId, sk) {
    const { start, end } = seasonBounds(sk);
    return all
      .filter(l => l.teamId === teamId && l.forDate >= start && l.forDate <= end && logIsValid(l))
      .sort((a, b) => (a.forDate + (a.loggedAt || "")).localeCompare(b.forDate + (b.loggedAt || "")));
  }

  // Credits for a DAILY day: one per habit, first tap wins, extra taps of a done habit are
  // dropped entirely (§4 "five meditations = one credit" — and no extra rep either).
  function dayUnits(team, logsForDay) {
    if (team.profile !== "daily") return logsForDay;
    const seen = new Set();
    return logsForDay.filter(l => (seen.has(l.habitId) ? false : (seen.add(l.habitId), true)));
  }

  function replayTeam(team, sk, allLogs, allResets, todayK) {
    const cfg = seasonConfig(sk);
    const { start, end } = seasonBounds(sk);
    const from = cfg.startedAt > start ? cfg.startedAt : start;
    const to = todayK < end ? todayK : end;
    const logs = teamSeasonLogs(allLogs, team.id, sk);
    const byDay = {};
    logs.forEach(l => { (byDay[l.forDate] ||= []).push(l); });
    // A week with zero logs for this team is sick/travel semantics (§4): no games, no Ls.
    // A week with ANY activity is a real week, so its missed planned days are real misses.
    const activeWeeks = new Set(logs.map(l => mondayOf(l.forDate)));
    const resets = allResets.filter(r => r.season === sk && r.teamId === team.id);

    let rating = 1500, floor = 1500, peak = 1500;
    let wins = 0, losses = 0, reps = 0, resetsUsed = 0;
    const thisMonday = mondayOf(todayK);
    let weekWins = 0, weekLosses = 0, weekGames = 0;
    const todayStat = { w: 0, l: 0 }, yesterdayStat = { w: 0, l: 0 };
    const yesterdayK = shiftKey(todayK, -1);
    let todayReps = 0, yesterdayReps = 0;

    for (let k = from, guard = 0; k <= to && guard < 400; k = shiftKey(k, 1), guard += 1) {
      if (resets.some(r => r.atDate === k)) { rating = 1500; floor = 1500; resetsUsed += 1; }
      const units = dayUnits(team, byDay[k] || []);
      units.forEach((unit, i) => {
        const tierValue = team.profile === "daily" ? 0 : (team.tiers?.[unit.tier] ?? ARENA_TIERS[unit.tier] ?? ARENA_TIERS.std);
        rating += blockGain(team.profile, tierValue, i + 1, rating);
        floor = Math.max(floor, Math.floor(rating / 100) * 100); // permanent, every 100 (§4)
        peak = Math.max(peak, rating);
      });
      reps += units.length;
      if (k === todayK) todayReps = units.length;
      if (k === yesterdayK) yesterdayReps = units.length;

      const planned = (team.planDays || []).includes(weekdayIndex(k));
      if (planned) {
        const isThisWeek = mondayOf(k) === thisMonday;
        if (units.length > 0) {
          wins += 1; weekGames += isThisWeek ? 1 : 0; weekWins += isThisWeek ? 1 : 0;
          if (k === todayK) todayStat.w += 1;
          if (k === yesterdayK) yesterdayStat.w += 1;
        } else if (k < todayK && activeWeeks.has(mondayOf(k))) {
          // Loss resolves only once the day is over, and only in a week that saw activity.
          rating = Math.max(rating - 10, floor, 1500);
          losses += 1; weekGames += isThisWeek ? 1 : 0; weekLosses += isThisWeek ? 1 : 0;
          if (k === yesterdayK) yesterdayStat.l += 1;
        }
      }
    }

    // DAILY streak: consecutive days with >=1 credit, ending today — or yesterday, so the
    // number doesn't read 0 all morning before the first tap. A broken streak just restarts;
    // no red, no failure language (§4, §8).
    let streak = 0;
    if (team.profile === "daily") {
      let cursor = (byDay[todayK] || []).length ? todayK : shiftKey(todayK, -1);
      for (let guard = 0; guard < 400 && (byDay[cursor] || []).length; guard += 1) {
        streak += 1;
        cursor = shiftKey(cursor, -1);
      }
    }
    return {
      team, rating, floor, peak, wins, losses, reps, resetsUsed, streak,
      weekGames, weekWins, weekLosses, todayStat, yesterdayStat, todayReps, yesterdayReps,
      bracket: arenaBracketName(rating), peakBracket: arenaBracketName(peak)
    };
  }

  function replaySeason(sk, todayK) {
    const cfg = seasonConfig(sk);
    if (!cfg) return null;
    const logs = arenaLogs(), resets = arenaResets();
    return { season: sk, teams: cfg.teams.map(t => replayTeam(t, sk, logs, resets, todayK || dayKey())) };
  }

  // Lifetime numbers span every season on record (D46 §6 / Q8.1: the header W–L persists
  // across season resets — the seasonal rating is what resets, not the record of games played).
  function arenaSummary(todayK) {
    const today = todayK || dayKey();
    const cfg = arenaConfig();
    const seasons = Object.keys(cfg.seasons).sort();
    const perSeason = seasons.map(sk => replaySeason(sk, today)).filter(Boolean);
    const lifetime = { wins: 0, losses: 0, reps: 0, todayReps: 0, yesterdayReps: 0, today: { w: 0, l: 0 }, yesterday: { w: 0, l: 0 } };
    const peaks = {};
    perSeason.forEach(season => season.teams.forEach(r => {
      lifetime.wins += r.wins; lifetime.losses += r.losses; lifetime.reps += r.reps;
      lifetime.todayReps += r.todayReps; lifetime.yesterdayReps += r.yesterdayReps;
      lifetime.today.w += r.todayStat.w; lifetime.today.l += r.todayStat.l;
      lifetime.yesterday.w += r.yesterdayStat.w; lifetime.yesterday.l += r.yesterdayStat.l;
      // Permanent peak badge (§3): highest rating ever reached per team, across all seasons
      // and immune to voluntary resets, because it is derived from the full replay.
      if (!peaks[r.team.id] || r.peak > peaks[r.team.id].peak) peaks[r.team.id] = { peak: r.peak, bracket: r.peakBracket, season: season.season, name: r.team.name };
    }));
    const current = perSeason.find(s => s.season === seasonKeyOf(today)) || null;
    return { current, perSeason, lifetime, peaks };
  }

  // ---------- logging ----------
  function appendLog(entry) {
    const logs = arenaLogs();
    logs.push(entry);
    store.set("arena2-logs", logs);
  }
  function ratingOf(teamId, todayK) {
    const season = replaySeason(currentSeasonKey(), todayK);
    return season?.teams.find(r => r.team.id === teamId)?.rating ?? 1500;
  }
  function logBlock(teamId, tier) {
    const today = dayKey();
    const team = seasonConfig(currentSeasonKey()).teams.find(t => t.id === teamId);
    if (!team) return;
    const before = ratingOf(teamId, today);
    appendLog({ forDate: today, teamId, tier, loggedAt: new Date().toISOString() });
    const after = ratingOf(teamId, today);
    renderArena();
    if (window.toast) toast("+" + (after - before) + " " + team.name + " · " + after);
  }
  function logCredit(teamId, habitId) {
    const today = dayKey();
    const team = seasonConfig(currentSeasonKey()).teams.find(t => t.id === teamId);
    if (!team) return;
    // Hard daily cap (§4): a habit already credited today is inert, and nothing is appended —
    // so it can't inflate the rep count either.
    const already = arenaLogs().some(l => l.teamId === teamId && l.forDate === today && l.habitId === habitId);
    if (already) return;
    const before = ratingOf(teamId, today);
    appendLog({ forDate: today, teamId, habitId, loggedAt: new Date().toISOString() });
    const after = ratingOf(teamId, today);
    renderArena();
    if (window.toast) toast("+" + (after - before) + " " + team.name + " · " + after);
  }
  function voluntaryReset(teamId) {
    const sk = currentSeasonKey();
    const resets = arenaResets();
    if (resets.some(r => r.season === sk && r.teamId === teamId)) return; // once per season (§4)
    resets.push({ season: sk, teamId, atDate: dayKey() });
    store.set("arena2-resets", resets);
    renderArena();
  }

  // ---------- season rollover ceremony (§3) ----------
  function maybeFireSeasonToast() {
    const sk = currentSeasonKey();
    const meta = store.get("arena2-meta", {});
    if (meta.lastSeasonSeen === sk) return;
    const isBootstrap = !meta.lastSeasonSeen;
    store.set("arena2-meta", { ...meta, lastSeasonSeen: sk });
    if (isBootstrap) return; // first ever render is software catching up, not a new season
    if (window.toast) toast(seasonLabel(sk) + " — teams reset to 1500");
  }

  // ---------- render (§6: WoW PvP pane) ----------
  let arenaSheet = null; // null | "stats" | "plan"

  function statCell(value) { return '<td>' + value + "</td>"; }
  function recordText(rec) { return rec.w + rec.l === 0 ? "—" : rec.w + "–" + rec.l; }

  function teamCardHtml(r) {
    const t = r.team;
    const line2 = t.profile === "daily"
      ? "Streak: " + r.streak + " day" + (r.streak === 1 ? "" : "s") + " · W–L " + r.weekWins + "–" + r.weekLosses
      : "This week: " + r.weekGames + " game" + (r.weekGames === 1 ? "" : "s") + " · W–L " + r.weekWins + "–" + r.weekLosses;
    const controls = t.profile === "daily"
      ? '<div class="arena-log-row">' + (t.habits || []).map(h => {
          const done = arenaLogs().some(l => l.teamId === t.id && l.forDate === dayKey() && l.habitId === h.id);
          return '<button class="arena-habit' + (done ? " done" : "") + '" type="button" data-arena-habit="' + t.id + "|" + h.id + '">' + (done ? "✓ " : "+ ") + escapeHtml(h.name) + "</button>";
        }).join("") + "</div>"
      : '<div class="arena-log-row">' + ["min", "std", "stretch"].map(tier =>
          '<button class="arena-tier" type="button" data-arena-block="' + t.id + "|" + tier + '">' + tier.toUpperCase() + " +" + (t.tiers?.[tier] ?? ARENA_TIERS[tier]) + "</button>").join("") + "</div>";
    return '<article class="arena-team" style="--team:' + t.color + '">' +
      '<div class="arena-team-main">' +
        '<div class="arena-team-copy">' +
          '<strong class="arena-team-name">' + t.bracket + " " + escapeHtml(t.name) + ' <span>· ' + escapeHtml(t.subtitle) + "</span></strong>" +
          '<small class="arena-team-line">' + line2 + "</small>" +
        "</div>" +
        '<div class="arena-team-rating"><strong>' + r.rating + "</strong><small>" + r.bracket + "</small></div>" +
      "</div>" + controls + "</article>";
  }

  function planEditorHtml(cfg) {
    const names = ["M", "T", "W", "T", "F", "S", "S"];
    return '<div class="arena-sheet"><p class="eyebrow">Weekly plan — which days count as games</p>' +
      cfg.teams.map(t =>
        '<div class="arena-plan-row"><span style="color:' + t.color + '">' + escapeHtml(t.name) + "</span>" +
        '<div class="arena-plan-days">' + names.map((n, i) =>
          '<button class="arena-day' + ((t.planDays || []).includes(i) ? " on" : "") + '" type="button" data-arena-day="' + t.id + "|" + i + '">' + n + "</button>").join("") +
        "</div></div>" +
        (t.profile === "daily"
          ? '<div class="arena-habit-edit">' + (t.habits || []).map(h =>
              '<span class="arena-habit-tag">' + escapeHtml(h.name) + '<button type="button" data-arena-habit-del="' + h.id + '" aria-label="Remove ' + escapeHtml(h.name) + '">×</button></span>').join("") +
            '<button class="arena-habit-add" type="button" data-arena-habit-add="1">+ habit</button></div>'
          : "")
      ).join("") +
      '<p class="settings-note">Changes apply from tomorrow. An empty plan means no games and no losses — blocks still pay rating.</p></div>';
  }

  function statsSheetHtml(summary) {
    const rows = summary.perSeason.slice().reverse().map(season =>
      '<div class="arena-season-block"><p class="eyebrow">' + seasonLabel(season.season) + "</p>" +
      season.teams.map(r =>
        '<div class="arena-season-row"><span style="color:' + r.team.color + '">' + escapeHtml(r.team.name) + (r.resetsUsed ? ' <b class="arena-r" title="Voluntary reset used this season">R</b>' : "") + "</span>" +
        "<span>" + r.rating + " · " + r.bracket + "</span><span>peak " + r.peakBracket + "</span><span>" + r.wins + "–" + r.losses + "</span>" +
        (r.resetsUsed ? "" : '<button class="arena-reset-btn" type="button" data-arena-reset="' + r.team.id + '">reset →1500</button>') +
        "</div>").join("") + "</div>").join("");
    const badges = Object.values(summary.peaks).map(p =>
      '<div class="arena-badge">' + p.bracket + ' <small>peak bracket (' + escapeHtml(p.name) + ", " + seasonLabel(p.season).replace("Season ", "S") + ")</small></div>").join("");
    return '<div class="arena-sheet"><p class="eyebrow">Permanent peak badges</p><div class="arena-badges">' + (badges || '<small class="settings-note">No games played yet.</small>') + "</div>" + rows + "</div>";
  }

  function renderArena() {
    const card = $("arenaCard");
    if (!card) return;
    const today = dayKey();
    const summary = arenaSummary(today);
    const cfg = seasonConfig(currentSeasonKey());
    const current = summary.current;
    if (!current) { card.innerHTML = ""; return; }
    const lt = summary.lifetime;
    const header =
      '<table class="arena-header"><thead><tr><th></th><th>Today</th><th>Yesterday</th><th>Lifetime</th></tr></thead><tbody>' +
      "<tr><td>Reps</td>" + statCell(lt.todayReps) + statCell(lt.yesterdayReps) + '<td class="arena-lifetime">' + lt.reps + "</td></tr>" +
      "<tr><td>Record</td>" + statCell(recordText(lt.today)) + statCell(recordText(lt.yesterday)) +
        '<td class="arena-lifetime">' + (lt.wins + lt.losses === 0 ? "—" : lt.wins + "–" + lt.losses) + "</td></tr>" +
      "</tbody></table>";
    card.innerHTML =
      '<div class="arena-title-row"><p class="eyebrow">Arena — ' + seasonLabel(current.season) + "</p>" +
        '<button class="arena-link" type="button" data-arena-sheet="plan">⚙ Plan</button></div>' +
      header +
      '<div class="arena-teams">' + current.teams.map(teamCardHtml).join("") + "</div>" +
      '<button class="arena-link arena-foot" type="button" data-arena-sheet="stats">View this season\'s stats →</button>' +
      (arenaSheet === "stats" ? statsSheetHtml(summary) : arenaSheet === "plan" ? planEditorHtml(cfg) : "");

    card.querySelectorAll("[data-arena-block]").forEach(b => b.onclick = () => {
      const [teamId, tier] = b.dataset.arenaBlock.split("|");
      logBlock(teamId, tier);
    });
    card.querySelectorAll("[data-arena-habit]").forEach(b => b.onclick = () => {
      const [teamId, habitId] = b.dataset.arenaHabit.split("|");
      logCredit(teamId, habitId);
    });
    card.querySelectorAll("[data-arena-sheet]").forEach(b => b.onclick = () => {
      arenaSheet = arenaSheet === b.dataset.arenaSheet ? null : b.dataset.arenaSheet;
      renderArena();
    });
    card.querySelectorAll("[data-arena-day]").forEach(b => b.onclick = () => {
      const [teamId, index] = b.dataset.arenaDay.split("|");
      const full = arenaConfig();
      const team = full.seasons[currentSeasonKey()].teams.find(t => t.id === teamId);
      const i = Number(index);
      team.planDays = (team.planDays || []).includes(i) ? team.planDays.filter(d => d !== i) : [...(team.planDays || []), i].sort((a, b) => a - b);
      store.set("arena2-config", full);
      renderArena();
    });
    card.querySelectorAll("[data-arena-habit-del]").forEach(b => b.onclick = () => {
      const full = arenaConfig();
      const team = full.seasons[currentSeasonKey()].teams.find(t => t.profile === "daily");
      team.habits = (team.habits || []).filter(h => h.id !== b.dataset.arenaHabitDel);
      store.set("arena2-config", full);
      renderArena();
    });
    card.querySelectorAll("[data-arena-habit-add]").forEach(b => b.onclick = () => {
      const name = prompt("Habit name:");
      if (!name || !name.trim()) return;
      const full = arenaConfig();
      const team = full.seasons[currentSeasonKey()].teams.find(t => t.profile === "daily");
      team.habits = [...(team.habits || []), { id: "h" + Date.now().toString(36), name: name.trim() }];
      store.set("arena2-config", full);
      renderArena();
    });
    card.querySelectorAll("[data-arena-reset]").forEach(b => b.onclick = () => {
      if (!confirm("Reset this team to 1500 for the rest of the season? Your peak badge and W–L record are not affected. Once per season.")) return;
      voluntaryReset(b.dataset.arenaReset);
    });
    maybeFireSeasonToast();
  }

  // EC core calls this from renderProgress(); the test harness and future auto-mapping work
  // use the rest. Nothing here is stored, so exposing the replay is read-only by construction.
  window.NR_ARENA = {
    render: renderArena, summary: arenaSummary, replaySeason, logBlock, logCredit, voluntaryReset,
    profiledGain, blockGain, config: arenaConfig, seasonKeyOf, currentSeasonKey
  };

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
    // XP hook: one shared event from app.js's completion path (logAnchorCompletion) fires
    // for BOTH the FULL timer flow and EASY's one-tap log — same handler, same math, no
    // mode-specific branch. Replaces the old completeRepButton-click binding (D47).
    document.addEventListener("nr:repCompleted", () => { watchCompletions(); renderEasyView(); });
    lastCompletionCount = totalCompletions();
    bindAiSettings();
    const toEasy = $("modeToEasyBtn");
    if (toEasy) toEasy.addEventListener("click", () => setMode("easy"));
    const toFull = $("modeToFullBtn");
    if (toFull) toFull.addEventListener("click", () => setMode("full"));
    const emEasy = $("nrEmergencyBtnEasy");
    if (emEasy) emEasy.addEventListener("click", openEmergency);
    applyMode();
    // app.js runs render() at parse time, before this file exists — so the arena's first
    // paint has to happen here. Every later paint rides renderProgress()'s NR_ARENA.render().
    renderKnowledge(); renderDiary(); renderGamify(); renderXpBar(); renderAiSettings(); renderArena();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
