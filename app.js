const STORAGE_KEY = "next-rep-v03";
const LEGACY_KEY = "next-rep-v01";

const anchorTemplate = [
  { id: "body", label: "Body", icon: "◒", title: "Posture rep", description: "Do the selected gentle posture or mobility routine.", minimum: 2, standard: 8, color: "#ff9f5a" },
  { id: "brain", label: "Brain / work", icon: "⌬", title: "Recall rep", description: "Learn something useful, close it, then recall three points.", minimum: 5, standard: 15, color: "#50e6ff" },
  { id: "stability", label: "Stability", icon: "◇", title: "Life rep", description: "Create one visible result for work, home, recovery or connection.", minimum: 5, standard: 15, color: "#a78bfa" }
];

const techniques = [
  {
    id: "grounding",
    icon: "◎",
    category: "Grounding",
    title: "5–4–3–2–1",
    purpose: "Reconnect with the present through your senses.",
    minutes: 5,
    steps: ["Name five things you can see.", "Name four things you can physically feel.", "Name three things you can hear.", "Name two things you can smell.", "Name one thing you can taste or appreciate right now."]
  },
  {
    id: "breathing",
    icon: "◌",
    category: "Regulation",
    title: "Paced breathing",
    purpose: "Create a slower rhythm without forcing yourself to feel calm.",
    minutes: 5,
    steps: ["Sit or stand in a stable position.", "Breathe in gently for four counts.", "Breathe out gently for six counts.", "Repeat without taking unusually deep breaths.", "Stop if you become dizzy or uncomfortable."]
  },
  {
    id: "writing",
    icon: "✎",
    category: "Reflection",
    title: "Write the next truth",
    purpose: "Separate facts, interpretations and the next controllable action.",
    minutes: 7,
    steps: ["Write what happened in one factual sentence.", "Write the story your mind added.", "Name the emotion and its intensity.", "Write one alternative interpretation.", "Choose one action that does not require certainty."]
  },
  {
    id: "meditation",
    icon: "◉",
    category: "Attention",
    title: "Five-minute sit",
    purpose: "Practice returning attention rather than achieving a special state.",
    minutes: 5,
    steps: ["Choose one physical anchor such as breath or contact with the chair.", "Notice when attention moves away.", "Label it briefly: thought, sound, sensation or emotion.", "Return to the anchor without scoring the attempt.", "Finish by naming the next action in your day."]
  },
  {
    id: "affective-bridge",
    icon: "⌁",
    category: "Therapy notes required",
    title: "Affective bridge",
    purpose: "This entry must use the exact version taught by your clinician.",
    minutes: 5,
    steps: ["Do not improvise this emotionally activating exercise from an AI summary.", "Import or transcribe the instructions from your therapy notes.", "Use it only under the conditions agreed with your clinician.", "Stop and ground if distress becomes difficult to manage."]
  },
  {
    id: "urge-surf",
    icon: "≈",
    category: "Craving support",
    title: "Observe the urge",
    purpose: "Make space between the urge and an irreversible action.",
    minutes: 5,
    steps: ["Name the urge and rate it from zero to ten.", "Notice where it appears in your body.", "Describe sensations without arguing with them.", "Delay action until the timer ends.", "Re-rate and choose distance, contact or another delay."]
  }
];

function createDefaults() {
  return {
    version: 3,
    minimumMode: false,
    anchorDetails: false,
    accent: "#50e6ff",
    reactionsEnabled: true,
    showPosturePhoto: true,
    privacyEnabled: false,
    pinHash: "",
    currentView: "today",
    checkpoint: { goal: "", next: "", info: "", at: "" },
    openLoops: [],
    anchors: structuredClone(anchorTemplate),
    days: {},
    tasks: [],
    goals: [],
    metrics: [
      { id: "belly", label: "Abdomen", unit: "cm", color: "#ff9f5a", values: [] },
      { id: "weight", label: "Weight", unit: "kg", color: "#a78bfa", values: [] },
      { id: "running", label: "Running", unit: "km", color: "#50e6ff", values: [] },
      { id: "meditation", label: "Meditation", unit: "min", color: "#70f0b0", values: [] }
    ],
    weeklyReviews: {},
    techniqueReviews: [],
    circuitLogs: [],
    supportNotes: [],
    challengeSeedVersion: 1,
    challengeCues: [
      {
        id: "starter-wallow",
        source: "The Philosopher",
        quote: "You wallow in self-pity while life runs through your fingers.",
        actionLine: "No philosophy. Complete one visible action.",
        category: "Life",
        createdAt: "2026-07-03T00:00:00.000Z"
      },
      {
        id: "starter-factory",
        source: "The Factory Comment",
        quote: "They are opening new places at car factory, you know.",
        actionLine: "One professional rep. Keep your options yours.",
        category: "Work",
        createdAt: "2026-07-03T00:00:00.000Z"
      }
    ]
  };
}

const state = loadState();
let currentTaskFilter = "open";
let activeAnchorId = null;
let activeTechniqueId = null;
let proofTaskId = null;
let selectedUrge = "";
let selectedCircuitTool = "Grounding";
let repRemaining = 0;
let techniqueRemaining = 0;
let circuitRemaining = 0;
let repTimerHandle = null;
let techniqueTimerHandle = null;
let circuitTimerHandle = null;
let toastHandle = null;

const el = (id) => document.getElementById(id);

function localDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const value = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function weekKey(date = new Date()) {
  const copy = new Date(date);
  const day = (copy.getDay() + 6) % 7;
  copy.setDate(copy.getDate() - day);
  return localDateKey(copy);
}

function id() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function loadState() {
  const defaults = createDefaults();
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved) {
      const merged = { ...defaults, ...saved };
      if (!Object.prototype.hasOwnProperty.call(saved, "challengeSeedVersion")) {
        const existing = Array.isArray(saved.challengeCues) ? saved.challengeCues : [];
        merged.challengeCues = [...defaults.challengeCues, ...existing.filter(cue => !defaults.challengeCues.some(starter => starter.quote === cue.quote))];
        merged.challengeSeedVersion = 1;
      }
      return normalizeState(merged);
    }
    const legacy = JSON.parse(localStorage.getItem(LEGACY_KEY));
    if (legacy) {
      defaults.minimumMode = Boolean(legacy.minimumMode);
      defaults.checkpoint = legacy.checkpoint || defaults.checkpoint;
      defaults.openLoops = legacy.openLoops || [];
      defaults.days = legacy.days || {};
      if (Array.isArray(legacy.reps)) defaults.anchors = legacy.reps.map((rep, index) => ({ ...anchorTemplate[index], ...rep, icon: anchorTemplate[index]?.icon || "◉" }));
    }
  } catch {
    return defaults;
  }
  return defaults;
}

function normalizeState(value) {
  const defaults = createDefaults();
  value.checkpoint = { ...defaults.checkpoint, ...(value.checkpoint || {}) };
  value.anchors = Array.isArray(value.anchors) && value.anchors.length ? value.anchors : defaults.anchors;
  value.tasks = Array.isArray(value.tasks) ? value.tasks : [];
  value.goals = Array.isArray(value.goals) ? value.goals : [];
  value.metrics = Array.isArray(value.metrics) && value.metrics.length ? value.metrics : defaults.metrics;
  value.openLoops = Array.isArray(value.openLoops) ? value.openLoops : [];
  value.days ||= {};
  value.weeklyReviews ||= {};
  value.techniqueReviews ||= [];
  value.circuitLogs ||= [];
  value.supportNotes ||= [];
  value.challengeCues ||= [];
  return value;
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  // P2.1 cloud sync hook: sync.js listens and pushes an encrypted snapshot (debounced).
  window.dispatchEvent(new CustomEvent("nr:saved"));
}

function dayData(key = localDateKey()) {
  state.days[key] ||= { completions: {}, restarts: 0 };
  state.days[key].completions ||= {};
  return state.days[key];
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
}

function setAccent(hex) {
  const rgb = hex.replace("#", "").match(/.{2}/g).map(part => parseInt(part, 16));
  document.documentElement.style.setProperty("--accent", hex);
  document.documentElement.style.setProperty("--accent-rgb", rgb.join(", "));
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", "#080b12");
}

function render() {
  setAccent(state.accent || "#50e6ff");
  el("todayLabel").textContent = new Date().toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
  renderToday();
  renderProgress();
  renderPlan();
  renderSupport();
  renderSettings();
  renderCheckpoint();
  renderOpenLoops();
  navigate(state.currentView || "today", false);
  saveState();
}

function renderToday() {
  const data = dayData();
  const next = state.anchors.find(anchor => !data.completions[anchor.id]) || state.anchors[0];
  const completed = state.anchors.filter(anchor => data.completions[anchor.id]).length;
  el("nextCard").classList.toggle("posture-photo", Boolean(state.showPosturePhoto && completed < state.anchors.length && next.id === "body"));
  const minutes = state.minimumMode ? next.minimum : next.standard;
  el("nextCategory").textContent = completed === state.anchors.length ? "DAILY SIGNAL COMPLETE" : `NEXT REP · ${next.label.toUpperCase()}`;
  el("nextOverline").textContent = completed === state.anchors.length ? "Let the evidence count" : "Start before the plan feels perfect";
  el("nextTitle").textContent = completed === state.anchors.length ? "Three honest repetitions." : next.title;
  el("nextDescription").textContent = completed === state.anchors.length ? "Anything else today is a bonus, not a new obligation." : next.description;
  el("nextDuration").textContent = completed === state.anchors.length ? "COMPLETE" : `${minutes} MIN`;
  el("todayProgressText").textContent = `${completed} of 3 complete`;
  if (el("tokenPipsRow")) {
    const thisMonday = weekKey();
    const usedThisWeek = state.anchors
      .map(item => ({ anchor: item, week: anchorWeekStats(item.id, thisMonday) }))
      .filter(item => item.week.tokensUsed > 0);
    el("tokenPipsRow").innerHTML = usedThisWeek.length
      ? usedThisWeek.map(({ anchor, week }) => `<span class="today-pip-group" title="${anchor.label}: ${week.tokensUsed} of 2 freeze tokens used"><i class="week-dot ${anchor.id} on"></i>${[0, 1].map(i => `<span class="token-pip ${i < week.tokensUsed ? "used" : ""}"></span>`).join("")}</span>`).join("")
      : "";
  }
  el("startNextButton").textContent = completed === state.anchors.length ? "✓" : "▶";
  el("startNextButton").disabled = completed === state.anchors.length;
  el("minimumModeButton").textContent = state.minimumMode ? "Minimum" : "Standard";

  el("anchorList").classList.toggle("details", Boolean(state.anchorDetails));
  el("anchorDisplayButton").textContent = state.anchorDetails ? "Compact" : "Details";
  el("anchorList").innerHTML = state.anchors.map(anchor => {
    const done = data.completions[anchor.id];
    const mode = done?.mode === "minimum" ? "Floor" : "Done";
    return `<article class="anchor-row ${done ? "done" : ""}" style="--anchor:${anchor.color}">
      <div class="anchor-icon">${escapeHtml(anchor.icon)}</div>
      <div class="anchor-copy"><strong>${escapeHtml(anchor.label)}</strong><small>${escapeHtml(anchor.title)} · ${state.minimumMode ? anchor.minimum : anchor.standard} min</small><p class="anchor-detail">${escapeHtml(anchor.description)}</p></div>
      <button class="anchor-status" type="button" data-anchor="${anchor.id}">${done ? `✓ ${mode}` : "○"}</button>
    </article>`;
  }).join("");
  document.querySelectorAll("[data-anchor]").forEach(button => button.addEventListener("click", () => toggleOrStartAnchor(button.dataset.anchor)));

  renderTaskList("todayTaskList", todayTasks());
}

function todayTasks() {
  const today = localDateKey();
  return state.tasks
    .filter(task => !task.cancelled && (task.due === today || (!task.completedAt && task.due && task.due < today)))
    .sort(taskSort);
}

function taskSort(a, b) {
  return Number(Boolean(b.important)) - Number(Boolean(a.important)) || Number(Boolean(a.completedAt)) - Number(Boolean(b.completedAt)) || String(a.due || "9999").localeCompare(String(b.due || "9999"));
}

function renderTaskList(targetId, tasks) {
  const target = el(targetId);
  if (!tasks.length) {
    target.innerHTML = `<p class="task-empty">No tasks here. Add only what deserves a place.</p>`;
    return;
  }
  target.innerHTML = tasks.map(task => {
    const overdue = !task.completedAt && task.due && task.due < localDateKey();
    const proof = task.verification === "self" ? `<span class="proof-badge">Self-verified proof</span>` : task.proofMode !== "manual" ? `<span class="proof-badge">Proof ${task.proofMode}</span>` : "";
    return `<article class="task-item ${task.important ? "important" : ""} ${task.completedAt ? "done" : ""}">
      <button class="task-check" type="button" data-task-action="toggle" data-task-id="${task.id}" aria-label="Toggle task">${task.completedAt ? "✓" : ""}</button>
      <div class="task-copy"><strong>${escapeHtml(task.title)}</strong><small>${escapeHtml(task.category || "Life")}${overdue ? " · Overdue" : task.due ? ` · ${formatShortDate(task.due)}` : ""}${proof ? ` · ${proof}` : ""}</small></div>
      <div class="task-menu">
        ${task.proofMode !== "manual" && !task.completedAt ? `<button type="button" data-task-action="proof" data-task-id="${task.id}" aria-label="Submit proof">◎</button>` : ""}
        <button type="button" data-task-action="edit" data-task-id="${task.id}" aria-label="Edit task">⋯</button>
      </div>
    </article>`;
  }).join("");
  target.querySelectorAll("[data-task-action]").forEach(button => button.addEventListener("click", () => handleTaskAction(button.dataset.taskAction, button.dataset.taskId)));
}

function formatShortDate(key) {
  const date = new Date(`${key}T12:00:00`);
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function toggleOrStartAnchor(anchorId) {
  const data = dayData();
  if (data.completions[anchorId]) {
    delete data.completions[anchorId];
    saveState();
    render();
    toast("Completion removed. The data stays honest.");
    return;
  }
  openRep(anchorId);
}

function openRep(anchorId) {
  const anchor = state.anchors.find(item => item.id === anchorId);
  if (!anchor) return;
  activeAnchorId = anchorId;
  repRemaining = (state.minimumMode ? anchor.minimum : anchor.standard) * 60;
  el("repDialogIcon").textContent = anchor.icon;
  el("repDialogIcon").style.color = anchor.color;
  el("repDialogCategory").textContent = anchor.label;
  el("repDialogTitle").textContent = anchor.title;
  el("repDialogDescription").textContent = anchor.description;
  el("pauseRepTimerButton").textContent = "Pause";
  updateTimer(el("repTimerDisplay"), repRemaining);
  clearInterval(repTimerHandle);
  repTimerHandle = setInterval(() => {
    repRemaining = Math.max(0, repRemaining - 1);
    updateTimer(el("repTimerDisplay"), repRemaining);
    if (!repRemaining) {
      clearInterval(repTimerHandle);
      el("pauseRepTimerButton").textContent = "Finished";
    }
  }, 1000);
  el("repDialog").showModal();
}

function completeRep() {
  if (!activeAnchorId) return;
  const anchor = state.anchors.find(item => item.id === activeAnchorId);
  const todayKeyStr = localDateKey();
  const recovery = isRecoveryMoment(activeAnchorId, todayKeyStr);
  dayData().completions[activeAnchorId] = { mode: state.minimumMode ? "minimum" : "standard", minutes: state.minimumMode ? anchor.minimum : anchor.standard, at: new Date().toISOString() };
  clearInterval(repTimerHandle);
  el("repDialog").close();
  activeAnchorId = null;
  saveState();
  render();
  showReaction("rep");
  if (recovery) toast("↻ Recovery recorded.");
}

function updateTimer(target, seconds) {
  const min = String(Math.floor(seconds / 60)).padStart(2, "0");
  const sec = String(seconds % 60).padStart(2, "0");
  target.textContent = `${min}:${sec}`;
}

function renderCheckpoint() {
  el("currentGoal").value = state.checkpoint.goal || "";
  el("nextAction").value = state.checkpoint.next || "";
  el("neededInfo").value = state.checkpoint.info || "";
  el("checkpointStatus").textContent = state.checkpoint.at ? `Saved ${new Date(state.checkpoint.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "Not saved";
}

function saveCheckpoint() {
  state.checkpoint = { goal: el("currentGoal").value.trim(), next: el("nextAction").value.trim(), info: el("neededInfo").value.trim(), at: new Date().toISOString() };
  saveState();
  renderCheckpoint();
  toast("Mental thread saved.");
}

function clearCheckpoint() {
  state.checkpoint = createDefaults().checkpoint;
  saveState();
  renderCheckpoint();
}

function renderOpenLoops() {
  const target = el("loopList");
  if (!state.openLoops.length) {
    target.innerHTML = "";
    return;
  }
  target.innerHTML = state.openLoops.map((item, index) => `<li class="loop-item"><span>${escapeHtml(item.text)}</span><button class="secondary-button" type="button" data-loop-use="${index}">Use</button><button class="secondary-button" type="button" data-loop-remove="${index}">×</button></li>`).join("");
  target.querySelectorAll("[data-loop-use]").forEach(button => button.addEventListener("click", () => useLoop(Number(button.dataset.loopUse))));
  target.querySelectorAll("[data-loop-remove]").forEach(button => button.addEventListener("click", () => removeLoop(Number(button.dataset.loopRemove))));
}

function captureLoop() {
  const value = el("openLoopInput").value.trim();
  if (!value) return;
  state.openLoops.unshift({ text: value, at: new Date().toISOString() });
  state.openLoops = state.openLoops.slice(0, 12);
  el("openLoopInput").value = "";
  saveState();
  renderOpenLoops();
  toast("Parked. Stay with the current thread.");
}

function useLoop(index) {
  const item = state.openLoops[index];
  if (!item) return;
  state.checkpoint = { goal: item.text, next: "Choose the smallest visible action", info: "", at: new Date().toISOString() };
  state.openLoops.splice(index, 1);
  saveState();
  render();
  el("memoryPanel").open = true;
  el("currentGoal").focus();
}

function removeLoop(index) {
  state.openLoops.splice(index, 1);
  saveState();
  renderOpenLoops();
}

function openTask(taskId = "") {
  const task = state.tasks.find(item => item.id === taskId);
  el("taskDialogTitle").textContent = task ? "Edit task" : "Add task";
  el("taskIdInput").value = task?.id || "";
  el("taskTitleInput").value = task?.title || "";
  el("taskDueInput").value = task?.due || localDateKey();
  el("taskCategoryInput").value = task?.category || "Life";
  el("taskNotesInput").value = task?.notes || "";
  el("taskImportantInput").checked = Boolean(task?.important);
  el("taskProofInput").value = task?.proofMode || "manual";
  el("taskProofRuleInput").value = task?.proofRule || "";
  el("deleteTaskButton").hidden = !task;
  el("taskDialog").showModal();
  setTimeout(() => el("taskTitleInput").focus(), 50);
}

function deleteTask() {
  const taskId = el("taskIdInput").value;
  const task = state.tasks.find(item => item.id === taskId);
  if (!task || !confirm(`Delete “${task.title}”?`)) return;
  state.tasks = state.tasks.filter(item => item.id !== taskId);
  saveState();
  el("taskDialog").close();
  render();
  toast("Task deleted.");
}

function saveTask(event) {
  event.preventDefault();
  const taskId = el("taskIdInput").value;
  const existing = state.tasks.find(item => item.id === taskId);
  const payload = {
    id: taskId || id(),
    title: el("taskTitleInput").value.trim(),
    due: el("taskDueInput").value,
    category: el("taskCategoryInput").value,
    notes: el("taskNotesInput").value.trim(),
    important: el("taskImportantInput").checked,
    proofMode: el("taskProofInput").value,
    proofRule: el("taskProofRuleInput").value.trim(),
    createdAt: existing?.createdAt || new Date().toISOString(),
    completedAt: existing?.completedAt || "",
    verification: existing?.verification || ""
  };
  if (!payload.title) return;
  if (existing) Object.assign(existing, payload);
  else state.tasks.unshift(payload);
  saveState();
  el("taskDialog").close();
  render();
  toast(existing ? "Task updated." : "Task added.");
}

function handleTaskAction(action, taskId) {
  const task = state.tasks.find(item => item.id === taskId);
  if (!task) return;
  if (action === "edit") return openTask(taskId);
  if (action === "proof") return openProof(taskId);
  if (action === "toggle") {
    if (task.completedAt) {
      task.completedAt = "";
      task.verification = "";
    } else if (task.proofMode === "strict") {
      return openProof(taskId);
    } else {
      task.completedAt = new Date().toISOString();
      task.verification = "manual";
    }
    saveState();
    render();
    if (task.completedAt) showReaction("task");
  }
}

function openProof(taskId) {
  const task = state.tasks.find(item => item.id === taskId);
  if (!task) return;
  proofTaskId = taskId;
  el("proofTaskTitle").textContent = task.title;
  el("proofRule").textContent = task.proofRule || "No evidence rule was defined. Add a clear criterion before relying on strict proof.";
  el("proofFileInput").value = "";
  el("proofPreview").innerHTML = "";
  el("selfVerifyButton").disabled = true;
  el("proofDialog").showModal();
}

function previewProof() {
  const file = el("proofFileInput").files?.[0];
  if (!file) return;
  const url = URL.createObjectURL(file);
  el("proofPreview").innerHTML = `<img src="${url}" alt="Selected proof screenshot">`;
  el("selfVerifyButton").disabled = false;
}

function selfVerifyProof() {
  const task = state.tasks.find(item => item.id === proofTaskId);
  const file = el("proofFileInput").files?.[0];
  if (!task || !file) return;
  task.completedAt = new Date().toISOString();
  task.verification = "self";
  task.proofMeta = { name: file.name, type: file.type, size: file.size, at: new Date().toISOString() };
  saveState();
  el("proofDialog").close();
  render();
  showReaction("proof");
}

function renderProgress() {
  const lastSeven = dateRange(7);
  const possible = lastSeven.length * state.anchors.length;
  const completed = lastSeven.reduce((total, key) => total + state.anchors.filter(anchor => state.days[key]?.completions?.[anchor.id]).length, 0);
  const percent = possible ? Math.round(completed / possible * 100) : 0;
  el("weeklyRing").style.setProperty("--progress", `${percent * 3.6}deg`);
  el("weeklyPercent").textContent = `${percent}%`;
  el("progressSummary").textContent = completed ? `${completed} useful repetitions in the last seven days.` : "Start with one honest repetition.";
  const totalReps = Object.values(state.days).reduce((sum, day) => sum + Object.keys(day.completions || {}).length, 0);
  const completedTasks = state.tasks.filter(task => task.completedAt).length;
  const restartCount = totalRecoveries();
  el("statGrid").innerHTML = [
    [totalReps, "Total reps"],
    [completedTasks, "Tasks done"],
    [restartCount, "Recoveries"]
  ].map(([value, label]) => `<article class="stat-card"><strong>${value}</strong><small>${label}</small></article>`).join("");
  el("weekMatrix").innerHTML = lastSeven.map(key => `<div class="week-day"><span>${new Date(`${key}T12:00:00`).toLocaleDateString(undefined, { weekday: "narrow" })}</span><div class="week-dots">${state.anchors.map(anchor => `<i class="week-dot ${anchor.id} ${state.days[key]?.completions?.[anchor.id] ? "on" : ""}"></i>`).join("")}</div></div>`).join("");
  if (el("anchorStreakGrid")) {
    const thisMonday = weekKey();
    el("anchorStreakGrid").innerHTML = state.anchors.map(anchor => {
      const week = anchorWeekStats(anchor.id, thisMonday);
      const streak = anchorStreak(anchor.id);
      const recoveries = anchorRecoveries(anchor.id);
      const pips = week.tokensUsed > 0
        ? `<div class="token-pips" title="${week.tokensUsed} of 2 freeze tokens used this week">${[0, 1].map(i => `<span class="token-pip ${i < week.tokensUsed ? "used" : ""}"></span>`).join("")}</div>`
        : "";
      return `<article class="anchor-streak-card" style="--anchor:${anchor.color}">
        <div class="asc-label"><i class="week-dot ${anchor.id} on"></i>${escapeHtml(anchor.label)}</div>
        <div class="asc-stats">
          <span><strong>${week.completed}</strong>/7 this week</span>
          <span><strong>${streak}</strong> week streak</span>
          <span><strong>${recoveries}</strong> ↻ Recoveries</span>
          ${pips}
        </div>
      </article>`;
    }).join("");
  }
  renderMetrics();
  el("weeklyReview").value = state.weeklyReviews[weekKey()] || "";
}

function dateRange(count) {
  const values = [];
  for (let offset = count - 1; offset >= 0; offset -= 1) {
    const date = new Date();
    date.setDate(date.getDate() - offset);
    values.push(localDateKey(date));
  }
  return values;
}

// ---- Recoveries, weekly score & freeze tokens (SPEC §14.4/14.5; D11/D13/D14/D15) ----

function anchorCompletionDates(anchorId) {
  return Object.keys(state.days).filter(key => state.days[key]?.completions?.[anchorId]).sort();
}

function daysBetweenKeys(fromKey, toKey) {
  return Math.round((new Date(`${toKey}T00:00:00`) - new Date(`${fromKey}T00:00:00`)) / 86400000);
}

// Lifetime Recoveries for one anchor: one restart per gap of >=1 full missed day between
// two completions. No expiry window, gap length irrelevant (SPEC §14.4). Derived fresh from
// the completion history each time, so it self-heals after JSON import/export (D16) instead
// of relying on a separately-incremented counter that could drift out of sync.
function anchorRecoveries(anchorId) {
  const dates = anchorCompletionDates(anchorId);
  let restarts = 0;
  for (let i = 1; i < dates.length; i += 1) {
    if (daysBetweenKeys(dates[i - 1], dates[i]) >= 2) restarts += 1;
  }
  return restarts;
}

function totalRecoveries() {
  return state.anchors.reduce((sum, anchor) => sum + anchorRecoveries(anchor.id), 0);
}

// Did completing `anchorId` on `onKey` close a gap? Used to fire the "Recovery recorded"
// ceremony at the moment it happens (D15), before that completion is folded into history.
function isRecoveryMoment(anchorId, onKey) {
  const priorDates = anchorCompletionDates(anchorId).filter(key => key < onKey);
  if (!priorDates.length) return false;
  return daysBetweenKeys(priorDates[priorDates.length - 1], onKey) >= 2;
}

function mondayKeyOf(dateKey) {
  return weekKey(new Date(`${dateKey}T12:00:00`));
}

function weekDateKeys(mondayKeyStr) {
  const out = [];
  const date = new Date(`${mondayKeyStr}T12:00:00`);
  for (let i = 0; i < 7; i += 1) {
    out.push(localDateKey(date));
    date.setDate(date.getDate() + 1);
  }
  return out;
}

// Weekly score for one anchor, week starting mondayKeyStr: real completed/7, plus the
// freeze-token read of the same math — 2 tokens cover up to 2 misses, which is exactly
// the >=5/7 bar (SPEC §14.5). Days that haven't happened yet are never counted as misses.
function anchorWeekStats(anchorId, mondayKeyStr) {
  const todayKeyStr = localDateKey();
  let completed = 0;
  let missed = 0;
  weekDateKeys(mondayKeyStr).forEach(dayKey => {
    if (state.days[dayKey]?.completions?.[anchorId]) completed += 1;
    else if (dayKey < todayKeyStr) missed += 1;
  });
  const tokensUsed = Math.min(missed, 2);
  return { completed, missed, tokensUsed, tokensRemaining: 2 - tokensUsed, counts: completed >= 5 };
}

// Consecutive counting (>=5/7) COMPLETE weeks for one anchor, walking back from the most
// recently finished week. The in-progress week is never part of the streak (D13's spirit:
// no perfect-day pressure, and nothing is scored before it has actually happened).
function anchorStreak(anchorId) {
  let streak = 0;
  const cursor = new Date(`${mondayKeyOf(localDateKey())}T12:00:00`);
  cursor.setDate(cursor.getDate() - 7);
  for (let guard = 0; guard < 520; guard += 1) {
    if (!anchorWeekStats(anchorId, localDateKey(cursor)).counts) break;
    streak += 1;
    cursor.setDate(cursor.getDate() - 7);
  }
  return streak;
}

function renderMetrics() {
  el("metricGrid").innerHTML = state.metrics.map(metric => {
    const values = [...metric.values].sort((a, b) => a.date.localeCompare(b.date));
    const latest = values.at(-1);
    const previous = values.at(-2);
    const delta = latest && previous ? Number(latest.value) - Number(previous.value) : null;
    const heights = sparkHeights(values.slice(-8).map(item => Number(item.value)));
    return `<article class="metric-card" style="--metric-color:${metric.color}">${latest ? `<button class="metric-remove" type="button" data-metric-remove="${metric.id}" aria-label="Remove latest ${escapeHtml(metric.label)} measurement">×</button>` : ""}<small>${escapeHtml(metric.label)}</small><div class="metric-value"><strong>${latest ? escapeHtml(latest.value) : "—"}</strong><span>${escapeHtml(metric.unit)}</span></div><div class="metric-delta">${delta === null ? "No trend yet" : `${delta > 0 ? "+" : ""}${delta.toFixed(1)} ${metric.unit}`}</div><div class="sparkline">${heights.map(height => `<i style="height:${height}%"></i>`).join("")}</div></article>`;
  }).join("");
  el("metricGrid").querySelectorAll("[data-metric-remove]").forEach(button => button.addEventListener("click", () => removeLatestMeasurement(button.dataset.metricRemove)));
}

function removeLatestMeasurement(metricId) {
  const metric = state.metrics.find(item => item.id === metricId);
  if (!metric?.values?.length || !confirm(`Remove the latest ${metric.label} measurement?`)) return;
  metric.values.sort((a, b) => a.date.localeCompare(b.date));
  metric.values.pop();
  saveState();
  renderProgress();
  toast("Measurement removed.");
}

function sparkHeights(values) {
  if (!values.length) return [8, 8, 8, 8, 8];
  const min = Math.min(...values);
  const max = Math.max(...values);
  return values.map(value => max === min ? 45 : 18 + ((value - min) / (max - min)) * 72);
}

function openMeasurement() {
  el("metricSelect").innerHTML = state.metrics.map(metric => `<option value="${metric.id}">${escapeHtml(metric.label)} (${escapeHtml(metric.unit)})</option>`).join("");
  el("metricValueInput").value = "";
  el("metricDateInput").value = localDateKey();
  el("metricNoteInput").value = "";
  el("measurementDialog").showModal();
}

function saveMeasurement(event) {
  event.preventDefault();
  const metric = state.metrics.find(item => item.id === el("metricSelect").value);
  const value = Number(el("metricValueInput").value);
  if (!metric || !Number.isFinite(value)) return;
  metric.values.push({ value, date: el("metricDateInput").value || localDateKey(), note: el("metricNoteInput").value.trim(), at: new Date().toISOString() });
  metric.values.sort((a, b) => a.date.localeCompare(b.date));
  saveState();
  el("measurementDialog").close();
  renderProgress();
  toast(`${metric.label} recorded.`);
}

function renderPlan() {
  el("goalList").innerHTML = state.goals.length ? state.goals.map(goal => `<article class="goal-card"><div class="goal-card-head"><strong>${escapeHtml(goal.title)}</strong><button type="button" data-goal-remove="${goal.id}" aria-label="Remove goal">×</button></div><p>Next: ${escapeHtml(goal.next || "Define the next visible action")}</p></article>`).join("") : `<p class="empty-state">Keep only a few active goals.</p>`;
  el("goalList").querySelectorAll("[data-goal-remove]").forEach(button => button.addEventListener("click", () => removeGoal(button.dataset.goalRemove)));
  document.querySelectorAll("#taskFilters .filter-chip").forEach(button => button.classList.toggle("active", button.dataset.filter === currentTaskFilter));
  let tasks = [...state.tasks].sort(taskSort);
  if (currentTaskFilter === "open") tasks = tasks.filter(task => !task.completedAt);
  if (currentTaskFilter === "done") tasks = tasks.filter(task => task.completedAt);
  renderTaskList("backlogTaskList", tasks);
}

function addGoal(event) {
  event.preventDefault();
  const title = el("goalTitleInput").value.trim();
  if (!title) return;
  state.goals.push({ id: id(), title, next: el("goalNextInput").value.trim(), createdAt: new Date().toISOString() });
  el("goalTitleInput").value = "";
  el("goalNextInput").value = "";
  saveState();
  renderPlan();
}

function removeGoal(goalId) {
  state.goals = state.goals.filter(goal => goal.id !== goalId);
  saveState();
  renderPlan();
}

function renderSupport() {
  el("techniqueGrid").innerHTML = techniques.map(item => `<button class="technique-card" type="button" data-technique="${item.id}"><span class="tech-icon">${item.icon}</span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.category)} · ${item.minutes} min</small></button>`).join("");
  document.querySelectorAll("[data-technique]").forEach(button => button.addEventListener("click", () => openTechnique(button.dataset.technique)));
  renderCues();
}

function openTechnique(techniqueId) {
  const item = techniques.find(value => value.id === techniqueId);
  if (!item) return;
  activeTechniqueId = techniqueId;
  techniqueRemaining = item.minutes * 60;
  clearInterval(techniqueTimerHandle);
  el("techniqueIcon").textContent = item.icon;
  el("techniqueCategory").textContent = item.category;
  el("techniqueTitle").textContent = item.title;
  el("techniquePurpose").textContent = item.purpose;
  el("techniqueSteps").innerHTML = item.steps.map(step => `<li>${escapeHtml(step)}</li>`).join("");
  updateTimer(el("techniqueTimer"), techniqueRemaining);
  el("techniqueReview").hidden = true;
  el("startTechniqueButton").textContent = "Start guided timer";
  el("techBefore").value = 5;
  el("techAfter").value = 5;
  el("techNote").value = "";
  el("techniqueDialog").showModal();
}

function toggleTechniqueTimer() {
  if (techniqueTimerHandle) {
    clearInterval(techniqueTimerHandle);
    techniqueTimerHandle = null;
    el("techniqueReview").hidden = false;
    el("startTechniqueButton").textContent = "Restart timer";
    return;
  }
  const item = techniques.find(value => value.id === activeTechniqueId);
  if (!item) return;
  if (!techniqueRemaining) techniqueRemaining = item.minutes * 60;
  el("startTechniqueButton").textContent = "Finish and review";
  techniqueTimerHandle = setInterval(() => {
    techniqueRemaining = Math.max(0, techniqueRemaining - 1);
    updateTimer(el("techniqueTimer"), techniqueRemaining);
    if (!techniqueRemaining) {
      clearInterval(techniqueTimerHandle);
      techniqueTimerHandle = null;
      el("techniqueReview").hidden = false;
      el("startTechniqueButton").textContent = "Restart timer";
    }
  }, 1000);
}

function saveTechniqueReview() {
  const item = techniques.find(value => value.id === activeTechniqueId);
  if (!item) return;
  state.techniqueReviews.unshift({ id: id(), techniqueId: item.id, title: item.title, before: Number(el("techBefore").value), after: Number(el("techAfter").value), note: el("techNote").value.trim(), at: new Date().toISOString() });
  saveState();
  el("techniqueDialog").close();
  toast("Technique review saved.");
}

function openCircuit() {
  selectedUrge = "";
  selectedCircuitTool = "Grounding";
  clearInterval(circuitTimerHandle);
  circuitTimerHandle = null;
  el("circuitStart").hidden = false;
  el("circuitBridge").hidden = true;
  el("circuitReview").hidden = true;
  el("circuitEmergency").hidden = true;
  el("alreadyUsedInput").checked = false;
  el("urgeBeforeInput").value = 5;
  el("urgeBeforeValue").textContent = 5;
  el("circuitTitle").textContent = "Name what is happening.";
  document.querySelectorAll("#urgeOptions button").forEach(button => button.classList.remove("active"));
  el("circuitDialog").showModal();
}

function beginCircuit() {
  if (!selectedUrge) return toast("Choose the urge you are interrupting.");
  el("circuitStart").hidden = true;
  if (el("alreadyUsedInput").checked) {
    el("circuitTitle").textContent = "Safety comes before a task.";
    el("circuitEmergency").hidden = false;
    return;
  }
  el("circuitTitle").textContent = "Create five minutes of distance.";
  el("circuitBridge").hidden = false;
  el("circuitInstruction").textContent = selectedUrge === "Gaming"
    ? "Close the launcher or game, activate Focus Mode if available, and choose one bridge tool below."
    : "Put physical distance between you and access. Change location if possible, then choose one bridge tool below.";
  const tools = ["Grounding", "Paced breathing", "Observe the urge", "Simple visual task"];
  el("circuitTools").innerHTML = tools.map(tool => `<button type="button" class="${tool === selectedCircuitTool ? "active" : ""}" data-circuit-tool="${escapeHtml(tool)}">${escapeHtml(tool)}</button>`).join("");
  el("circuitTools").querySelectorAll("[data-circuit-tool]").forEach(button => button.addEventListener("click", () => {
    selectedCircuitTool = button.dataset.circuitTool;
    el("circuitTools").querySelectorAll("button").forEach(item => item.classList.toggle("active", item === button));
  }));
  circuitRemaining = 5 * 60;
  updateTimer(el("circuitTimer"), circuitRemaining);
  circuitTimerHandle = setInterval(() => {
    circuitRemaining = Math.max(0, circuitRemaining - 1);
    updateTimer(el("circuitTimer"), circuitRemaining);
    if (!circuitRemaining) clearInterval(circuitTimerHandle);
  }, 1000);
}

function finishCircuit() {
  clearInterval(circuitTimerHandle);
  circuitTimerHandle = null;
  el("circuitBridge").hidden = true;
  el("circuitReview").hidden = false;
  el("circuitTitle").textContent = "What changed?";
  el("urgeAfterInput").value = el("urgeBeforeInput").value;
  el("urgeAfterValue").textContent = el("urgeBeforeInput").value;
  el("circuitNote").value = "";
}

function saveCircuit() {
  state.circuitLogs.unshift({ id: id(), urge: selectedUrge, before: Number(el("urgeBeforeInput").value), after: Number(el("urgeAfterInput").value), tool: selectedCircuitTool, note: el("circuitNote").value.trim(), at: new Date().toISOString() });
  saveState();
  el("circuitDialog").close();
  toast("Circuit logged. Honest interruption counts.");
}

function saveCue() {
  const quote = el("cueQuoteInput").value.trim();
  if (!quote) return;
  state.challengeCues.unshift({ id: id(), source: el("cueSourceInput").value.trim() || "Doubter", quote, actionLine: el("cueActionInput").value.trim() || "Complete one visible action.", category: el("cueCategoryInput").value, createdAt: new Date().toISOString() });
  el("cueSourceInput").value = "";
  el("cueQuoteInput").value = "";
  el("cueActionInput").value = "";
  saveState();
  renderCues();
  toast("Private challenge cue saved.");
}

function renderCues() {
  if (!el("cueList")) return;
  el("cueList").innerHTML = state.challengeCues.length ? state.challengeCues.map(cue => `<article class="cue-card"><strong>${escapeHtml(cue.source)}</strong><p>“${escapeHtml(cue.quote)}”</p><p class="cue-action">→ ${escapeHtml(cue.actionLine || "Complete one visible action.")}</p><small>${escapeHtml(cue.category)}</small></article>`).join("") : `<p class="settings-note">No cues saved. This mode remains dormant.</p>`;
}

function renderSettings() {
  el("reactionToggle").checked = state.reactionsEnabled;
  el("posturePhotoToggle").checked = state.showPosturePhoto !== false;
  el("defaultMinimumToggle").checked = state.minimumMode;
  el("privacyToggle").checked = state.privacyEnabled;
  el("lockButton").hidden = !state.privacyEnabled;
  document.querySelectorAll("#accentOptions .accent-swatch").forEach(button => button.classList.toggle("active", button.dataset.accent.toLowerCase() === String(state.accent).toLowerCase()));
}

async function hashPin(pin) {
  if (globalThis.crypto?.subtle) {
    const data = new TextEncoder().encode(pin);
    const digest = await crypto.subtle.digest("SHA-256", data);
    return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, "0")).join("");
  }
  return btoa(`preview:${pin}`);
}

async function savePin() {
  const pin = el("newPinInput").value.trim();
  if (!/^\d{4,8}$/.test(pin)) {
    el("pinStatus").textContent = "Use 4–8 digits.";
    return;
  }
  state.pinHash = await hashPin(pin);
  state.privacyEnabled = true;
  el("newPinInput").value = "";
  el("pinStatus").textContent = "";
  saveState();
  el("pinDialog").close();
  renderSettings();
  toast("Privacy screen enabled.");
}

function lockApp() {
  if (!state.privacyEnabled || !state.pinHash) return;
  el("unlockPin").value = "";
  el("unlockStatus").textContent = "";
  el("privacyCurtain").hidden = false;
  setTimeout(() => el("unlockPin").focus(), 50);
}

async function unlockApp() {
  const value = await hashPin(el("unlockPin").value);
  if (value !== state.pinHash) {
    el("unlockStatus").textContent = "Incorrect PIN.";
    el("unlockPin").value = "";
    return;
  }
  el("privacyCurtain").hidden = true;
}

function showReaction(type = "rep") {
  if (!state.reactionsEnabled) return;
  const reactions = {
    rep: [["⚡", "Rep recorded.", "No perfect plan. The evidence exists."], ["◉", "Signal received.", "One useful action is now real."], ["🔥", "Momentum detected.", "Do not negotiate with completed evidence."]],
    task: [["🫡", "Civilization restored.", "The avoided thing is no longer waiting."], ["✅", "Closed loop.", "That task has lost its leverage."], ["⚙️", "System updated.", "Action beats another internal meeting."]],
    proof: [["📡", "Proof received.", "Future AI witness slot: ready."], ["🧾", "Evidence recorded.", "No speech. The result exists."]]
  };
  const list = reactions[type] || reactions.rep;
  const choice = list[Math.floor(Math.random() * list.length)];
  el("reactionEmoji").textContent = choice[0];
  el("reactionTitle").textContent = choice[1];
  el("reactionText").textContent = choice[2];
  el("reactionDialog").showModal();
}

function saveWeeklyReview() {
  state.weeklyReviews[weekKey()] = el("weeklyReview").value.trim();
  saveState();
  toast("Weekly review saved.");
}

function saveSupportNote() {
  const text = el("supportNote").value.trim();
  if (!text) return;
  state.supportNotes.unshift({ id: id(), text, at: new Date().toISOString() });
  el("supportNote").value = "";
  saveState();
  toast("Private support note saved.");
}

function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `next-rep-backup-${localDateKey()}.json`;
  link.click();
  URL.revokeObjectURL(url);
  toast("Backup prepared.");
}

async function importData() {
  const file = el("importInput").files?.[0];
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    const normalized = normalizeState({ ...createDefaults(), ...parsed });
    Object.keys(state).forEach(key => delete state[key]);
    Object.assign(state, normalized);
    saveState();
    render();
    toast("Backup imported.");
  } catch {
    toast("That backup could not be read.");
  }
}

function resetData() {
  if (!confirm("Reset all local Next Rep data on this device?")) return;
  localStorage.removeItem(STORAGE_KEY);
  location.reload();
}

function navigate(view, persist = true) {
  const target = document.querySelector(`[data-view="${view}"]`);
  if (!target) view = "today";
  document.querySelectorAll(".app-view").forEach(section => {
    const active = section.dataset.view === view;
    section.hidden = !active;
    section.classList.toggle("active", active);
  });
  document.querySelectorAll("[data-nav]").forEach(button => button.classList.toggle("active", button.dataset.nav === view));
  const titles = { today: "Today", diary: "Diary", chat: "Companion", progress: "Progress", plan: "Plan", support: "Support", settings: "Settings" };
  el("viewTitle").textContent = titles[view] || "Today";
  state.currentView = view;
  if (persist) saveState();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function toast(message) {
  clearTimeout(toastHandle);
  el("toast").textContent = message;
  el("toast").classList.add("show");
  toastHandle = setTimeout(() => el("toast").classList.remove("show"), 2300);
}

document.querySelectorAll("[data-nav]").forEach(button => button.addEventListener("click", () => navigate(button.dataset.nav)));
document.querySelectorAll("[data-close]").forEach(button => button.addEventListener("click", () => el(button.dataset.close).close()));

el("minimumModeButton").addEventListener("click", () => { state.minimumMode = !state.minimumMode; render(); });
el("anchorDisplayButton").addEventListener("click", () => { state.anchorDetails = !state.anchorDetails; renderToday(); saveState(); });
el("startNextButton").addEventListener("click", () => {
  const next = state.anchors.find(anchor => !dayData().completions[anchor.id]);
  if (next) openRep(next.id);
});
el("completeRepButton").addEventListener("click", completeRep);
el("pauseRepTimerButton").addEventListener("click", () => {
  if (repTimerHandle) { clearInterval(repTimerHandle); repTimerHandle = null; el("pauseRepTimerButton").textContent = "Resume"; }
  else if (repRemaining > 0) { repTimerHandle = setInterval(() => { repRemaining = Math.max(0, repRemaining - 1); updateTimer(el("repTimerDisplay"), repRemaining); if (!repRemaining) clearInterval(repTimerHandle); }, 1000); el("pauseRepTimerButton").textContent = "Pause"; }
});

el("addTaskButton").addEventListener("click", () => openTask());
el("planAddTaskButton").addEventListener("click", () => openTask());
el("taskForm").addEventListener("submit", saveTask);
el("deleteTaskButton").addEventListener("click", deleteTask);
el("showTaskBacklogButton").addEventListener("click", () => navigate("plan"));
el("proofFileInput").addEventListener("change", previewProof);
el("selfVerifyButton").addEventListener("click", selfVerifyProof);

el("saveCheckpointButton").addEventListener("click", saveCheckpoint);
el("finishCheckpointButton").addEventListener("click", clearCheckpoint);
el("captureLoopButton").addEventListener("click", captureLoop);
el("openLoopInput").addEventListener("keydown", event => { if (event.key === "Enter") captureLoop(); });

el("addMeasurementButton").addEventListener("click", openMeasurement);
el("measurementForm").addEventListener("submit", saveMeasurement);
el("saveWeeklyReviewButton").addEventListener("click", saveWeeklyReview);
el("goalForm").addEventListener("submit", addGoal);
document.querySelectorAll("#taskFilters .filter-chip").forEach(button => button.addEventListener("click", () => { currentTaskFilter = button.dataset.filter; renderPlan(); }));

el("startTechniqueButton").addEventListener("click", toggleTechniqueTimer);
el("saveTechniqueReviewButton").addEventListener("click", saveTechniqueReview);
el("saveSupportNoteButton").addEventListener("click", saveSupportNote);
el("openChallengeButton").addEventListener("click", () => { renderCues(); el("challengeDialog").showModal(); });
el("saveCueButton").addEventListener("click", saveCue);

["quickCircuitButton", "todayCircuitButton", "supportCircuitButton"].forEach(target => el(target).addEventListener("click", openCircuit));
document.querySelectorAll("#urgeOptions button").forEach(button => button.addEventListener("click", () => {
  selectedUrge = button.dataset.urge;
  document.querySelectorAll("#urgeOptions button").forEach(item => item.classList.toggle("active", item === button));
}));
el("urgeBeforeInput").addEventListener("input", event => el("urgeBeforeValue").textContent = event.target.value);
el("urgeAfterInput").addEventListener("input", event => el("urgeAfterValue").textContent = event.target.value);
el("beginCircuitButton").addEventListener("click", beginCircuit);
el("finishCircuitButton").addEventListener("click", finishCircuit);
el("saveCircuitButton").addEventListener("click", saveCircuit);
el("openSafetyButton").addEventListener("click", () => el("safetyDialog").showModal());

document.querySelectorAll("#accentOptions .accent-swatch").forEach(button => button.addEventListener("click", () => { state.accent = button.dataset.accent; render(); }));
el("reactionToggle").addEventListener("change", event => { state.reactionsEnabled = event.target.checked; saveState(); });
el("posturePhotoToggle").addEventListener("change", event => { state.showPosturePhoto = event.target.checked; saveState(); renderToday(); });
el("defaultMinimumToggle").addEventListener("change", event => { state.minimumMode = event.target.checked; saveState(); render(); });
el("privacyToggle").addEventListener("change", event => {
  if (event.target.checked && !state.pinHash) { event.target.checked = false; el("pinDialog").showModal(); return; }
  state.privacyEnabled = event.target.checked;
  saveState();
  renderSettings();
});
el("setPinButton").addEventListener("click", () => { el("pinStatus").textContent = ""; el("newPinInput").value = ""; el("pinDialog").showModal(); });
el("savePinButton").addEventListener("click", savePin);
el("lockButton").addEventListener("click", lockApp);
el("unlockButton").addEventListener("click", unlockApp);
el("unlockPin").addEventListener("keydown", event => { if (event.key === "Enter") unlockApp(); });
el("previewReactionButton").addEventListener("click", () => showReaction("task"));
el("exportButton").addEventListener("click", exportData);
el("importInput").addEventListener("change", importData);
el("resetButton").addEventListener("click", resetData);

document.addEventListener("visibilitychange", () => {
  if (document.hidden && state.privacyEnabled && state.pinHash) lockApp();
});

document.querySelectorAll("dialog").forEach(dialog => dialog.addEventListener("close", () => {
  if (dialog.id === "repDialog") clearInterval(repTimerHandle);
  if (dialog.id === "techniqueDialog") { clearInterval(techniqueTimerHandle); techniqueTimerHandle = null; }
  if (dialog.id === "circuitDialog") { clearInterval(circuitTimerHandle); circuitTimerHandle = null; }
}));

if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  navigator.serviceWorker.register("service-worker.js").catch(() => {});
}

render();
