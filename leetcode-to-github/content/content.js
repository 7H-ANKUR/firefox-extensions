/**
 * content.js — runs on every https://leetcode.com/problems/* page.
 *
 * Two ways a push happens:
 *
 *  AUTO (Accepted-only): a MutationObserver binds a click listener straight
 *  onto LeetCode's real Submit button ([data-e2e-locator="console-submit-button"]).
 *  On click we ask background.js for the submission id (it gets this via
 *  chrome.webNavigation.onHistoryStateUpdated — LeetCode's SPA updates the
 *  URL to /problems/<slug>/submissions/<id>/ via the History API once
 *  judging starts), then poll the DOM for the result banner
 *  ([data-e2e-locator="submission-result"]) and only push if it says
 *  "Accepted".
 *
 *  MANUAL (any verdict, on demand): when you're viewing a submission's own
 *  page (.../submissions/<id>/ — e.g. from your Submissions list), a
 *  "⬆ Push to GitHub" button appears next to LeetCode's own Solution/
 *  Analysis buttons. Clicking it pushes THAT submission's code straight
 *  away, no Accepted check — this mirrors the real LeetHub extension's own
 *  manual "Sync w/ LeetHub" button, which behaves the same way.
 *
 * This detection strategy (selectors, GraphQL field names, the
 * webNavigation trick, the manual-button toolbar target) is adapted from
 * the real, actively-maintained LeetHub-2.0 extension
 * (github.com/arunbhardwaj/LeetHub-2.0) rather than re-guessed.
 */
(function () {
  if (window.__lc2gh_content_loaded__) return;
  window.__lc2gh_content_loaded__ = true;

  const api = typeof browser !== "undefined" ? browser : chrome;

  console.log("[LC→GH] content script loaded on", window.location.href);

  // LeetCode's GraphQL `lang.verboseName` strings -> file extension.
  const LANG_EXT = {
    C: "c",
    "C++": "cpp",
    "C#": "cs",
    Dart: "dart",
    Elixir: "ex",
    Erlang: "erl",
    Go: "go",
    Java: "java",
    JavaScript: "js",
    Javascript: "js",
    Kotlin: "kt",
    MySQL: "sql",
    "MS SQL Server": "sql",
    Oracle: "sql",
    PostgreSQL: "sql",
    Pandas: "py",
    PHP: "php",
    Python: "py",
    Python3: "py",
    Racket: "rkt",
    Ruby: "rb",
    Rust: "rs",
    Scala: "scala",
    Swift: "swift",
    TypeScript: "ts",
  };

  // ---------- Supabase company data ----------

  const SUPABASE_URL  = "https://tpgpxgbrguiogufizenw.supabase.co";
  const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRwZ3B4Z2JyZ3Vpb2d1Zml6ZW53Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI0OTMzOTIsImV4cCI6MjEwODA2OTM5Mn0.JKXfXN0jkxgChz2STKzahRFofihF2MG9wwfm1271d5Q";

  async function fetchCompanies(slug) {
    const url = `${SUPABASE_URL}/rest/v1/question_companies` +
      `?slug=eq.${encodeURIComponent(slug)}` +
      `&select=company,frequency` +
      `&order=frequency.desc`;
    const res = await fetch(url, {
      headers: {
        "apikey":        SUPABASE_ANON,
        "Authorization": `Bearer ${SUPABASE_ANON}`,
      },
    });
    if (!res.ok) throw new Error(`Supabase ${res.status}`);
    return res.json();
  }

  function getProblemSlugFromUrl() {
    const m = window.location.pathname.match(/\/problems\/([^/]+)/);
    return m ? m[1] : null;
  }

  // ---------- companies panel ----------

  function removeCompaniesPanel() {
    const el = document.getElementById("lc2gh-companies-panel");
    if (el) el.remove();
  }

  function showCompaniesPanel(companies) {
    removeCompaniesPanel();
    const panel = document.createElement("div");
    panel.id = "lc2gh-companies-panel";
    panel.style.cssText = `
      position: fixed; bottom: 80px; right: 24px; z-index: 2147483646;
      background: #fff; border: 1px solid #e0e0e0;
      border-radius: 12px; box-shadow: 0 8px 28px rgba(0,0,0,.18);
      padding: 14px 16px; width: 300px; max-height: 360px;
      overflow-y: auto; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    `;

    if (!companies || companies.length === 0) {
      panel.innerHTML = `
        <div style="font-weight:700;font-size:13px;margin-bottom:8px;">🏢 Companies</div>
        <p style="font-size:12px;color:#888;margin:0;">No company data found for this problem.</p>
        <button id="lc2gh-cp-close" style="margin-top:10px;padding:4px 10px;border-radius:6px;border:1px solid #ddd;background:#fff;font-size:11px;cursor:pointer;float:right;">Close</button>`;
    } else {
      const chips = companies.map((c) => {
        const pct = c.frequency ? ` <span style="opacity:.6;font-size:10px">${Math.round(c.frequency)}%</span>` : "";
        return `<span style="display:inline-flex;align-items:center;gap:3px;background:#f0f6ff;color:#1a5ed8;border:1px solid #c8deff;border-radius:20px;padding:3px 9px;font-size:11.5px;font-weight:600;margin:3px 3px 0 0;">${c.company}${pct}</span>`;
      }).join("");

      panel.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
          <span style="font-weight:700;font-size:13px;">🏢 Asked by ${companies.length} ${companies.length === 1 ? "company" : "companies"}</span>
          <button id="lc2gh-cp-close" style="padding:2px 8px;border-radius:6px;border:1px solid #ddd;background:#fff;font-size:11px;cursor:pointer;">✕</button>
        </div>
        <div style="line-height:1.8">${chips}</div>`;
    }

    document.body.appendChild(panel);
    document.getElementById("lc2gh-cp-close").addEventListener("click", removeCompaniesPanel);
  }

  async function fetchCompanyQuestions(company) {
    const q = company.trim();
    const url = `${SUPABASE_URL}/rest/v1/question_companies` +
      `?company=ilike.*${encodeURIComponent(q)}*` +
      `&select=question_id,title,slug,difficulty,frequency,company` +
      `&order=frequency.desc&limit=200`;
    const res = await fetch(url, {
      headers: { "apikey": SUPABASE_ANON, "Authorization": `Bearer ${SUPABASE_ANON}` },
    });
    if (!res.ok) throw new Error(`Supabase ${res.status}`);
    return res.json();
  }

  // Company search panel — shown on non-problem pages
  function showCompanySearchPanel() {
    removeCompaniesPanel();
    const panel = document.createElement("div");
    panel.id = "lc2gh-companies-panel";
    panel.style.cssText = `
      position: fixed; bottom: 80px; right: 24px; z-index: 2147483646;
      background: #fff; border: 1px solid #e0e0e0;
      border-radius: 12px; box-shadow: 0 8px 28px rgba(0,0,0,.18);
      padding: 14px 16px; width: 320px; max-height: 420px;
      display: flex; flex-direction: column;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    `;
    panel.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
        <span style="font-weight:700;font-size:13px;">🏢 Company Search</span>
        <button id="lc2gh-cp-close" style="padding:2px 8px;border-radius:6px;border:1px solid #ddd;background:#fff;font-size:11px;cursor:pointer;">✕</button>
      </div>
      <input id="lc2gh-cp-search" type="text" placeholder="Search company (e.g. Google, Amazon…)"
        style="width:100%;padding:7px 9px;border:1px solid #d7d7d7;border-radius:6px;font-size:12px;outline:none;box-sizing:border-box;"/>
      <div id="lc2gh-cp-results" style="margin-top:10px;overflow-y:auto;flex:1;">
        <p style="font-size:12px;color:#aaa;text-align:center;margin:16px 0;">Type to search a company…</p>
      </div>
    `;
    document.body.appendChild(panel);
    document.getElementById("lc2gh-cp-close").addEventListener("click", removeCompaniesPanel);

    let timer = null;
    const searchInput = document.getElementById("lc2gh-cp-search");
    const results     = document.getElementById("lc2gh-cp-results");
    searchInput.focus();

    searchInput.addEventListener("input", () => {
      clearTimeout(timer);
      const q = searchInput.value.trim();
      if (q.length < 2) {
        results.innerHTML = `<p style="font-size:12px;color:#aaa;text-align:center;margin:16px 0;">Type to search a company…</p>`;
        return;
      }
      results.innerHTML = `<p style="font-size:12px;color:#888;text-align:center;margin:16px 0;">Loading…</p>`;
      timer = setTimeout(async () => {
        try {
          const questions = await fetchCompanyQuestions(q);
          if (!questions.length) {
            results.innerHTML = `<p style="font-size:12px;color:#999;text-align:center;margin:16px 0;">No results for "${q}"</p>`;
            return;
          }
          const rows = questions.map(qn => {
            const d = qn.difficulty || '';
            const dColor = d==='Easy'?'#d1fae5;color:#065f46':d==='Medium'?'#fef3c7;color:#92400e':'#fee2e2;color:#991b1b';
            const freq = qn.frequency ? `<span style="font-size:10px;color:#aaa;">${Math.round(qn.frequency)}%</span>` : '';
            const comp = qn.company ? `<span style="font-size:9.5px;color:#555;background:#f3f4f6;padding:1px 5px;border-radius:4px;margin-right:4px;">${qn.company}</span>` : '';
            return `<div style="display:flex;align-items:center;gap:6px;padding:6px 0;border-bottom:1px solid #f0f0f0;font-size:12px;">
              <span style="flex-shrink:0;font-size:10px;color:#aaa;width:28px;text-align:right;">#${qn.question_id}</span>
              <span style="flex:1;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font-weight:500;">${comp}${qn.title}</span>
              <span style="flex-shrink:0;font-size:10px;font-weight:700;padding:1px 5px;border-radius:8px;background:${dColor};">${d}</span>
              ${freq}
              <a href="https://leetcode.com/problems/${qn.slug}/" target="_blank"
                style="flex-shrink:0;color:#2f6feb;font-size:13px;text-decoration:none;" title="Open on LeetCode">↗</a>
            </div>`;
          }).join('');
          results.innerHTML = `<p style="font-size:11px;color:#888;margin:0 0 6px;">${questions.length} questions asked by <b>${q}</b></p>${rows}`;
        } catch(e) {
          results.innerHTML = `<p style="font-size:12px;color:#c00;text-align:center;margin:16px 0;">Error: ${e.message}</p>`;
        }
      }, 400);
    });
  }

  async function toggleCompaniesPanel() {
    if (document.getElementById("lc2gh-companies-panel")) {
      removeCompaniesPanel();
      return;
    }
    const slug = getProblemSlugFromUrl();

    if (slug) {
      // Problem page → show companies for THIS question
      const btn = document.getElementById("lc2gh-companies-btn");
      if (btn) { btn.textContent = "🏢 Loading…"; btn.style.opacity = "0.7"; }
      try {
        const companies = await fetchCompanies(slug);
        showCompaniesPanel(companies);
      } catch (err) {
        showToast(`⚠️ Company data error: ${err.message}`, true);
      } finally {
        if (btn) { btn.textContent = "🏢 Companies"; btn.style.opacity = "1"; }
      }
    } else {
      // Any other LeetCode page → show company search panel
      showCompanySearchPanel();
    }
  }

  function showCompaniesButton() {
    if (document.getElementById("lc2gh-companies-btn")) return;
    const btn = document.createElement("div");
    btn.id = "lc2gh-companies-btn";
    btn.textContent = "🏢 Companies";
    btn.title = getProblemSlugFromUrl()
      ? "See which companies asked this problem"
      : "Search companies and their interview questions";
    btn.style.cssText = `
      position: fixed; bottom: 24px; right: 180px; z-index: 2147483647;
      background: #1a1a1a; color: #fde68a;
      padding: 10px 16px; border-radius: 8px; border: none;
      font: 600 13px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      cursor: pointer; user-select: none; pointer-events: auto;
      box-shadow: 0 4px 14px rgba(0,0,0,.28);
    `;
    btn.addEventListener("click", toggleCompaniesPanel);
    (document.body || document.documentElement).appendChild(btn);
  }

  // ---------- tiny UI helpers (problem-page only) ----------

  function showReadyBadge() {
    // Only show on problem pages — not on every LeetCode page
    if (!getProblemSlugFromUrl()) return;
    if (document.getElementById("lc2gh-ready-badge")) return;
    const badge = document.createElement("div");
    badge.id = "lc2gh-ready-badge";
    badge.textContent = "🔗 LC→GH ready";
    badge.title = "Click to manually push the submission open in this tab (if any)";
    badge.style.cssText = `
      position: fixed; bottom: 24px; left: 24px; z-index: 2147483647;
      background: #1a1a1a; color: #9adf9a;
      padding: 5px 10px; border-radius: 20px;
      font: 500 11px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      box-shadow: 0 2px 8px rgba(0,0,0,.25); opacity: 0.55;
      cursor: pointer; pointer-events: auto; transition: opacity .2s;
    `;
    badge.addEventListener("mouseover", () => (badge.style.opacity = "1"));
    badge.addEventListener("mouseout", () => (badge.style.opacity = "0.55"));
    // Clicking the badge is a reasonable thing for a user to try even
    // though it's primarily a status indicator — so it should actually do
    // something: push whatever submission the current URL points to, same
    // as the dedicated manual button.
    badge.addEventListener("click", async () => {
      if (badge.dataset.busy) return;
      const submissionId = getSubmissionIdFromUrl();
      if (!submissionId) {
        showToast(
          "ℹ️ Submit a solution, or open one from your Submissions list, then click again.",
          false
        );
        return;
      }
      badge.dataset.busy = "true";
      const original = badge.textContent;
      badge.textContent = "Pushing…";
      await pushSubmissionById(submissionId);
      badge.textContent = original;
      delete badge.dataset.busy;
    });
    (document.body || document.documentElement).appendChild(badge);
    console.log("[LC→GH] ready badge shown");
  }

  function removeReadyBadge() {
    const el = document.getElementById("lc2gh-ready-badge");
    if (el) el.remove();
  }

  function showToast(text, isError) {
    const el = document.createElement("div");
    el.textContent = text;
    // Deliberately positioned top-right — NOT bottom-right, which is where
    // the manual push button lives. The two used to share a spot, and
    // since toasts render after (and therefore on top of) the button in
    // DOM order, a toast could silently swallow clicks meant for the
    // button underneath it. pointer-events: none below is a second,
    // independent safeguard against that same class of bug.
    el.style.cssText = `
      position: fixed; top: 24px; right: 24px; z-index: 2147483647;
      background: ${isError ? "#e53935" : "#1a7f37"}; color: #fff;
      padding: 10px 16px; border-radius: 8px;
      font: 500 13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      box-shadow: 0 4px 14px rgba(0,0,0,.28); max-width: 340px;
      opacity: 0; transition: opacity .25s ease;
      pointer-events: none;
    `;
    document.body.appendChild(el);
    requestAnimationFrame(() => (el.style.opacity = "1"));
    setTimeout(() => {
      el.style.opacity = "0";
      setTimeout(() => el.remove(), 400);
    }, 4500);
  }

  function whenBodyReady(fn) {
    if (document.body) fn();
    else document.addEventListener("DOMContentLoaded", fn, { once: true });
  }

  whenBodyReady(showReadyBadge);

  // ---------- LeetCode GraphQL calls ----------

  // Field names copied verbatim from the real LeetHub extension's proven,
  // currently-working query — not re-guessed.
  const SUBMISSION_DETAILS_QUERY = `
    query submissionDetails($submissionId: Int!) {
      submissionDetails(submissionId: $submissionId) {
        runtime
        runtimeDisplay
        runtimePercentile
        memory
        memoryDisplay
        memoryPercentile
        code
        statusCode
        lang {
          name
          verboseName
        }
        question {
          questionId
          title
          titleSlug
          difficulty
          topicTags {
            name
          }
        }
      }
    }
  `;

  const QUESTION_FRONTEND_ID_QUERY = `
    query questionFrontendId($titleSlug: String!) {
      question(titleSlug: $titleSlug) {
        questionFrontendId
      }
    }
  `;

  async function graphql(query, variables) {
    const res = await fetch("https://leetcode.com/graphql/", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query, variables }),
    });
    const json = await res.json();
    if (json.errors) {
      console.warn("[LC→GH] GraphQL error:", json.errors);
      return null;
    }
    return json.data;
  }

  async function fetchSubmissionDetails(submissionId) {
    const data = await graphql(SUBMISSION_DETAILS_QUERY, { submissionId: Number(submissionId) });
    return data && data.submissionDetails;
  }

  async function fetchQuestionFrontendId(titleSlug) {
    const data = await graphql(QUESTION_FRONTEND_ID_QUERY, { titleSlug });
    return data && data.question && data.question.questionFrontendId;
  }

  // ---------- shared: fetch a submission by id and push it ----------

  function extractStatsFromDOM() {
    let runtimeDisplay = null;
    let memoryDisplay = null;
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
    let n;
    while ((n = walk.nextNode())) {
      const text = n.nodeValue.trim();
      if (!runtimeDisplay && /^\d+\s*ms$/i.test(text)) runtimeDisplay = text;
      if (!memoryDisplay && /^\d+(?:\.\d+)?\s*(MB|KB)$/i.test(text)) memoryDisplay = text;
    }
    return { runtimeDisplay, memoryDisplay };
  }

  // useAlert: when true, a successful push shows a blocking window.alert()
  // instead of a toast — used specifically for the automatic (post-Submit)
  // path, since a toast can be missed if you've looked away, while alert()
  // forces you to notice and dismiss it. Manual pushes (clicking the badge
  // or the dedicated button) keep using the toast, since you're already
  // looking at the screen when you click.
  async function pushSubmissionById(submissionId, { useAlert = false } = {}) {
    console.log("[LC→GH] fetching submission details for", submissionId);
    const details = await fetchSubmissionDetails(submissionId);
    if (!details) {
      showToast("⚠️ Could not read that submission from LeetCode", true);
      return false;
    }

    const titleSlug = details.question && details.question.titleSlug;
    const frontendId = titleSlug ? await fetchQuestionFrontendId(titleSlug) : null;
    const verboseName = details.lang && details.lang.verboseName;

    const domStats = extractStatsFromDOM();
    const runtimeDisp = (details.runtimeDisplay && details.runtimeDisplay !== "N/A") ? details.runtimeDisplay : domStats.runtimeDisplay;
    const memoryDisp = (details.memoryDisplay && details.memoryDisplay !== "N/A") ? details.memoryDisplay : domStats.memoryDisplay;

    const payload = {
      submissionId,
      slug: titleSlug || window.location.pathname.split("/")[2],
      lang: LANG_EXT[verboseName] || (verboseName || "txt").toLowerCase(),
      code: details.code,
      runtime: runtimeDisp || null,
      runtimePercentile: typeof details.runtimePercentile === "number" ? details.runtimePercentile : null,
      memory: memoryDisp || null,
      memoryPercentile: typeof details.memoryPercentile === "number" ? details.memoryPercentile : null,
      title: (details.question && details.question.title) || null,
      questionNumber: frontendId || null,
      difficulty: (details.question && details.question.difficulty) || null,
      topics: (details.question && details.question.topicTags && details.question.topicTags.map((t) => t.name)) || [],
    };

    if (!payload.code) {
      console.warn("[LC→GH] submission details had no code field");
      showToast("⚠️ No code was returned for this submission by LeetCode", true);
      return false;
    }

    console.log("[LC→GH] pushing to GitHub:", payload.slug, payload.lang);
    const response = await api.runtime.sendMessage({ type: "PUSH_SOLUTION", payload });

    if (response && response.ok) {
      const label = payload.title || payload.slug;
      if (useAlert) {
        alert(`✅ Pushed "${label}" to GitHub!\n\n${payload.runtime || ""}${payload.runtime && payload.memory ? " · " : ""}${payload.memory || ""}`);
      } else {
        showToast(`✅ Pushed "${label}" to GitHub`);
      }
      return true;
    }
    showToast(`⚠️ GitHub push failed: ${(response && response.error) || "unknown error"}`, true);
    return false;
  }

  // ==========================================================
  // AUTO PATH — bind to the real Submit button, push only if Accepted
  // ==========================================================

  function requestSubmissionId() {
    console.log("[LC→GH] asking background for submission id…");
    return api.runtime
      .sendMessage({ type: "LEETCODE_SUBMISSION" })
      .then((res) => res && res.submissionId)
      .catch((err) => {
        console.warn("[LC→GH] could not reach background script:", err);
        return null;
      });
  }

  // LeetCode's own verdict strings. Used both to recognize the primary
  // result element and as a fallback text scan if that element's exact
  // attribute isn't present in a given UI state (LeetCode has more than
  // one layout for showing a result — a fresh "just submitted" panel vs.
  // switching to an "Accepted" tab on an already-open problem — and we
  // can't be certain both use the same data-e2e-locator).
  const VERDICT_WORDS = [
    "Accepted",
    "Wrong Answer",
    "Time Limit Exceeded",
    "Memory Limit Exceeded",
    "Runtime Error",
    "Compile Error",
    "Output Limit Exceeded",
  ];

  function findVerdictElement() {
    const primary = document.querySelector('[data-e2e-locator="submission-result"]');
    if (primary) return primary;

    // Fallback: scan for a small, mostly-leaf element whose own text starts
    // with a known verdict word — catches layouts the primary selector misses.
    const candidates = document.querySelectorAll("div, span, h1, h2, h3");
    for (const el of candidates) {
      const text = (el.textContent || "").trim();
      if (text.length > 0 && text.length < 80 && el.children.length <= 2 && VERDICT_WORDS.some((w) => text.startsWith(w))) {
        return el;
      }
    }
    return null;
  }

  function waitForResult(maxAttempts = 90, intervalMs = 500) {
    return new Promise((resolve) => {
      let attempts = 0;
      const tick = () => {
        const el = findVerdictElement();
        if (el) {
          resolve(el.textContent ? el.textContent.trim() : "");
          return;
        }
        attempts++;
        if (attempts >= maxAttempts) {
          resolve(null);
          return;
        }
        setTimeout(tick, intervalMs);
      };
      tick();
    });
  }

  let autoInFlight = false;

  async function handleSubmitClick() {
    if (autoInFlight) return;
    autoInFlight = true;
    console.log("[LC→GH] submit clicked");

    try {
      const submissionId = await requestSubmissionId();
      if (!submissionId) {
        console.warn("[LC→GH] no submission id received — can't track this run");
        showToast("⚠️ Couldn't get a submission id for this run — open it from your Submissions list and use the manual button instead.", true);
        return;
      }
      console.log("[LC→GH] submission id:", submissionId);
      ensureManualButtonVisible(submissionId);

      const verdictText = await waitForResult();
      if (verdictText === null) {
        console.warn("[LC→GH] timed out waiting for a result to render");
        showToast("⚠️ Didn't detect a result in time — open this submission from your Submissions list and use the manual button instead.", true);
        return;
      }
      console.log("[LC→GH] verdict banner text:", JSON.stringify(verdictText));

      if (!verdictText.startsWith("Accepted")) {
        showToast(`Not synced (${verdictText || "no verdict"})`, false);
        return;
      }

      console.log("[LC→GH] Accepted — pushing automatically");
      removeReadyBadge();
      await pushSubmissionById(submissionId, { useAlert: true });
      showReadyBadge();
    } catch (err) {
      console.error("[LC→GH] unexpected error:", err);
      showToast(`⚠️ ${err.message || "Unexpected error"}`, true);
    } finally {
      autoInFlight = false;
    }
  }

  function findSubmitButton() {
    const primary = document.querySelector('[data-e2e-locator="console-submit-button"]');
    if (primary) return primary;

    // Fallback: a <button> whose own visible text is "Submit" — the
    // literal label LeetCode shows regardless of its internal attributes.
    // Relying only on the exact attribute above would silently break
    // everything downstream (no auto-push, no safety-net button either,
    // since handleSubmitClick never runs) if that attribute ever changes.
    const buttons = document.querySelectorAll("button");
    for (const btn of buttons) {
      if ((btn.textContent || "").trim() === "Submit") return btn;
    }
    for (const btn of buttons) {
      const text = (btn.textContent || "").trim();
      if (text.length < 20 && /^submit\b/i.test(text)) return btn;
    }
    return null;
  }

  function tryBindSubmitButton() {
    const btn = findSubmitButton();
    if (btn && !btn.dataset.lc2ghBound) {
      btn.dataset.lc2ghBound = "true";
      btn.addEventListener("click", handleSubmitClick);
      console.log("[LC→GH] bound to Submit button:", (btn.outerHTML || btn.textContent || "").slice(0, 120));
      return true;
    }
    return false;
  }

  // ==========================================================
  // MANUAL PATH — a button on any /submissions/<id>/ page, any verdict
  // ==========================================================

  function getSubmissionIdFromUrl() {
    const m = window.location.pathname.match(/\/submissions\/(\d+)/);
    return m ? m[1] : null;
  }

  // Same toolbar LeetHub-2.0 targets: the row of small buttons that
  // includes "Solution" (and "Analysis") on a submission's own page.
  function findSubmissionToolbar() {
    const candidates = document.querySelectorAll(".flex.flex-none.gap-2:not(.justify-center):not(.justify-between)");
    for (const el of candidates) {
      if (el.textContent && el.textContent.includes("Solution")) return el;
    }
    return null;
  }

  async function runManualPush(btn, submissionId) {
    if (btn.dataset.busy) return;
    btn.dataset.busy = "true";
    const original = btn.textContent;
    btn.textContent = "Pushing…";
    btn.style.opacity = "0.7";
    btn.style.cursor = "default";
    await pushSubmissionById(submissionId);
    btn.textContent = original;
    btn.style.opacity = "1";
    btn.style.cursor = "pointer";
    delete btn.dataset.busy;
  }

  function makeManualButtonElement(submissionId, floating) {
    const btn = document.createElement(floating ? "div" : "button");
    btn.id = "lc2gh-manual-btn";
    btn.textContent = "⬆ Push to GitHub";
    btn.title = "Push this submission's code to GitHub now";
    // pointer-events: auto is explicit (not just the default) because this
    // sits at the exact z-index ceiling (2147483647) specifically so
    // nothing — including our own toasts — can end up stacked on top of
    // it and silently eat clicks meant for this button.
    btn.style.cssText = floating
      ? `
        position: fixed; bottom: 24px; right: 24px; z-index: 2147483647;
        padding: 10px 18px; border-radius: 8px; border: none;
        background: #2ea043; color: #fff;
        font: 600 13px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        cursor: pointer; user-select: none; pointer-events: auto;
        box-shadow: 0 4px 14px rgba(0,0,0,.28);
      `
      : `
        display: inline-flex; align-items: center; gap: 6px;
        padding: 5px 14px; border-radius: 8px; border: none;
        background: #2ea043; color: #fff;
        font: 600 13px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        cursor: pointer; margin-left: 8px; pointer-events: auto;
      `;
    btn.addEventListener("click", () => runManualPush(btn, submissionId));
    return btn;
  }

  // Safety net: as soon as we know a submission id (right after you click
  // Submit), show a manual button immediately — before we even know the
  // verdict. If Accepted-detection below succeeds, the auto-push happens
  // on its own anyway; if it times out or the page layout doesn't match
  // what we expect, you're never left with nothing to click.
  function ensureManualButtonVisible(submissionId) {
    if (document.getElementById("lc2gh-manual-btn")) return;
    document.body.appendChild(makeManualButtonElement(submissionId, true));
    console.log("[LC→GH] manual push button shown after submit (safety net)");
  }

  function setupManualButton() {
    let lastHandledId = null;
    let attemptsForCurrentId = 0;
    const maxAttempts = 10;

    function clearExisting() {
      const el = document.getElementById("lc2gh-manual-btn");
      if (el) el.remove();
    }

    function attempt() {
      const submissionId = getSubmissionIdFromUrl();
      if (!submissionId) return; // not on a submission's own page

      if (submissionId !== lastHandledId) {
        // URL moved to a different submission — reset and start over.
        clearExisting();
        lastHandledId = submissionId;
        attemptsForCurrentId = 0;
      }

      if (document.getElementById("lc2gh-manual-btn")) return; // already placed

      const toolbar = findSubmissionToolbar();
      if (toolbar) {
        toolbar.appendChild(makeManualButtonElement(submissionId, false));
        console.log("[LC→GH] manual push button placed in toolbar");
        return;
      }

      attemptsForCurrentId++;
      if (attemptsForCurrentId >= maxAttempts) {
        document.body.appendChild(makeManualButtonElement(submissionId, true));
        console.log("[LC→GH] manual push button shown (floating fallback)");
        return;
      }
      setTimeout(attempt, 500);
    }

    attempt();

    // Keep watching: LeetCode's SPA can navigate between submissions (or
    // from the live coding page to a submission page after you submit)
    // without a full reload.
    const observer = new MutationObserver(() => attempt());
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  // ---------- wire everything up ----------

  if (!tryBindSubmitButton()) {
    const observer = new MutationObserver(() => {
      tryBindSubmitButton();
      // keep observing — LeetCode's SPA can remount the button when
      // navigating between problems without a full page reload.
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });

    // Diagnostic only: if we still haven't found a Submit button after a
    // generous wait, say so loudly in the console — this is the single
    // most useful thing to check if auto-push isn't firing at all. (The
    // manual button on a submission's own page still works regardless,
    // since it doesn't depend on this.)
    setTimeout(() => {
      if (!document.querySelector('[data-e2e-locator="console-submit-button"]') && !document.querySelector("button[data-lc2gh-bound]")) {
        const anySubmitText = Array.from(document.querySelectorAll("button")).some((b) => /submit/i.test(b.textContent || ""));
        console.warn(
          "[LC→GH] still haven't found/bound a Submit button after 8s.",
          anySubmitText
            ? "A button containing 'Submit' text exists but wasn't matched — please report this."
            : "No button on the page contains the text 'Submit' at all — are you on a problem page with the code editor visible?"
        );
      }
    }, 8000);
  }

  // GitHub push features: only on problem pages
  if (getProblemSlugFromUrl() !== null || document.readyState === 'loading') {
    whenBodyReady(setupManualButton);
    whenBodyReady(showReadyBadge);
  }
  // Companies button: on ALL LeetCode pages
  whenBodyReady(showCompaniesButton);
})();
