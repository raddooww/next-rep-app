// ai.js — Next Rep AI provider abstraction (D31 amended / D40)
// TODAY: key slot exists but stays EMPTY (machine not clean until 2026-07-13 reinstall).
// Without a key every AI feature degrades to copy-paste mode (clipboard prompt).
// After reinstall: paste the API key in Settings → AI and features go live. No other code change needed.

(function () {
  const KEY = "next-rep-ai-settings-v01";

  const defaults = {
    provider: "anthropic",
    model: "claude-haiku-4-5-20251001",
    apiKey: "",                    // NEVER prefilled. Entered manually post-reinstall.
    maxTokens: 400,
    monthlyCostCeilingEur: 5,     // soft ceiling; UI warns when estimate passes it
    spentEstimateEur: 0
  };

  function getSettings() {
    try { return { ...defaults, ...(JSON.parse(localStorage.getItem(KEY)) || {}) }; }
    catch { return { ...defaults }; }
  }
  function saveSettings(patch) {
    const merged = { ...getSettings(), ...patch };
    localStorage.setItem(KEY, JSON.stringify(merged));
    return merged;
  }
  const ready = () => Boolean(getSettings().apiKey);

  // The one instruction set every diary reply uses (D41: mirror the entry's language).
  const SYSTEM = "You are the reflection partner inside Next Rep, a private personal instrument panel. " +
    "Tone: short, factual, warm but never cheerleading. Never diagnose. Never praise for its own sake. " +
    "Reply in the SAME language the user wrote in (Slovak in, Slovak out; English in, English out). " +
    "When you claim a pattern, cite the entry and date it comes from.";

  function reflectPrompt(entries) {
    return "Below are my last " + entries.length + " diary entries, newest first. Do exactly this:\n" +
      "1. Name up to 3 patterns, each with a receipt (quote + date).\n" +
      "2. Ask me ONE deepening question.\n" +
      "3. Suggest ONE small concrete action for tomorrow (10-minute version).\n\n" +
      entries.map(e => "## " + e.date + " " + e.time + " (" + e.mode + ")\n" +
        e.qa.map(x => "Q: " + x.q + "\nA: " + x.a).join("\n")).join("\n\n");
  }

  function followupPrompt(question, answer) {
    return "In my diary I was asked: \"" + question + "\" and I answered: \"" + answer + "\". " +
      "Ask me exactly ONE short deepening follow-up question — the one a good therapist would ask. Nothing else.";
  }

  // send(): live API call when a key exists; otherwise {mode:"copy"} so the UI copies the prompt.
  // opts.system overrides the default system prompt; opts.history = [{role, content}] for chat threads.
  async function send(userPrompt, opts) {
    const o = opts || {};
    const sys = o.system || SYSTEM;
    const history = Array.isArray(o.history) ? o.history : [];
    const s = getSettings();
    const copyPayload = (reason) => {
      const flat = history.map(m => (m.role === "user" ? "ME: " : "YOU: ") + m.content).join("\n\n");
      return { mode: "copy", reason: reason || "", prompt: sys + "\n\n" + (flat ? "Conversation so far:\n" + flat + "\n\n" : "") + userPrompt };
    };
    if (!s.apiKey) return copyPayload();
    if (s.spentEstimateEur >= s.monthlyCostCeilingEur) {
      return { mode: "error", error: "Monthly AI cost ceiling reached (" + s.monthlyCostCeilingEur + "€). Raise it in Settings → AI." };
    }
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": s.apiKey,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true"
        },
        body: JSON.stringify({
          model: s.model,
          max_tokens: o.maxTokens || s.maxTokens,
          system: sys,
          messages: history.concat([{ role: "user", content: userPrompt }])
        })
      });
      if (!res.ok) {
        const errText = (await res.text()).slice(0, 300);
        // Billing/auth problems (no credit yet, bad key) degrade to copy-paste mode instead of a dead end.
        if (res.status === 401 || res.status === 402 || res.status === 403 || /credit|billing/i.test(errText)) {
          return copyPayload("API key not usable yet (no credit, or key invalid) — prompt copied to clipboard instead.");
        }
        return { mode: "error", error: "API " + res.status + ": " + errText.slice(0, 200) };
      }
      const data = await res.json();
      // rough cost estimate: ~1.6€/M output tokens for haiku-class; keep it pessimistic
      const outTokens = (data.usage && data.usage.output_tokens) || s.maxTokens;
      saveSettings({ spentEstimateEur: s.spentEstimateEur + outTokens * 0.000004 });
      return { mode: "live", text: data.content.map(c => c.text || "").join("") };
    } catch (e) {
      // Network failure (offline, DNS, CORS) — copy-paste mode still works.
      return copyPayload("No connection to the API — prompt copied to clipboard instead.");
    }
  }

  window.NR_AI = { getSettings, saveSettings, ready, send, reflectPrompt, followupPrompt, SYSTEM };
})();
