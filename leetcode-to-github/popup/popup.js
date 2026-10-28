const api = typeof browser !== "undefined" ? browser : chrome;

const SUPABASE_URL  = "https://tpgpxgbrguiogufizenw.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRwZ3B4Z2JyZ3Vpb2d1Zml6ZW53Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI0OTMzOTIsImV4cCI6MjEwODA2OTM5Mn0.JKXfXN0jkxgChz2STKzahRFofihF2MG9wwfm1271d5Q";

// ---------- helpers ----------

const el     = (id) => document.getElementById(id);
const fields = ["ghToken", "ghOwner", "ghRepo", "ghBranch", "commitPrefix"];
const statusEl = el("status");

function setStatus(text, kind) {
  statusEl.textContent = text;
  statusEl.className = "status" + (kind ? ` ${kind}` : "");
}

// ---------- tab switching ----------

document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", async () => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    el("tab-" + btn.dataset.tab).classList.add("active");

    if (btn.dataset.tab === "companies" && api.permissions && api.permissions.request) {
      const has = await api.permissions.contains({ origins: ["https://tpgpxgbrguiogufizenw.supabase.co/*"] }).catch(() => true);
      if (!has) {
        await api.permissions.request({ origins: ["https://tpgpxgbrguiogufizenw.supabase.co/*"] }).catch(() => {});
      }
    }
  });
});

// ---------- settings tab ----------

async function load() {
  const stored = await api.storage.sync.get(fields);
  el("ghToken").value      = stored.ghToken      || "";
  el("ghOwner").value      = stored.ghOwner      || "";
  el("ghRepo").value       = stored.ghRepo       || "";
  el("ghBranch").value     = stored.ghBranch     || "main";
  el("commitPrefix").value = stored.commitPrefix || "LeetCode";

  const manifest = api.runtime.getManifest();
  const badge = el("versionBadge");
  if (badge && manifest && manifest.version) badge.textContent = `v${manifest.version}`;
}

async function save() {
  const owner = el("ghOwner").value.trim();
  const repo  = el("ghRepo").value.trim();
  const token = el("ghToken").value.trim();

  if (!token || !owner || !repo) {
    setStatus("Token, owner and repo are all required.", "err");
    return;
  }

  await api.storage.sync.set({
    ghToken:      token,
    ghOwner:      owner,
    ghRepo:       repo,
    ghBranch:     el("ghBranch").value.trim()     || "main",
    commitPrefix: el("commitPrefix").value.trim() || "LeetCode",
  });

  setStatus("Saved. Go solve a problem — accepted runs push automatically.", "ok");
}

async function test() {
  setStatus("Testing…");
  const testBtn = el("testBtn");
  testBtn.disabled = true;
  try {
    await save();
    const response = await api.runtime.sendMessage({ type: "TEST_CONNECTION" });
    if (response && response.ok) {
      setStatus(
        `Connected with write access. Pushing to branch "${response.usingBranch}"${response.private ? " (private repo)" : ""}.`,
        "ok"
      );
    } else {
      setStatus((response && response.error) || "Connection failed.", "err");
    }
  } catch (err) {
    setStatus(err.message || "Connection failed.", "err");
  } finally {
    testBtn.disabled = false;
  }
}

el("saveBtn").addEventListener("click", save);
el("testBtn").addEventListener("click", test);

// ---------- companies tab ----------

async function fetchCompanyQuestions(company) {
  const q = company.trim();
  const response = await api.runtime.sendMessage({
    type: "FETCH_COMPANY_DATA",
    urlPath: `/rest/v1/question_companies?company=ilike.*${encodeURIComponent(q)}*&select=question_id,title,slug,difficulty,frequency,company&order=frequency.desc&limit=200`,
  });
  if (!response || !response.ok) throw new Error(response ? response.error : "Supabase fetch failed");
  return response.data;
}

function renderQuestions(questions, company) {
  const container = el("companyResults");

  if (!questions || questions.length === 0) {
    container.innerHTML = `<p class="company-hint">No data found for "<b>${company}</b>".<br>Try another company name.</p>`;
    return;
  }

  const countLine = `<p class="company-count">${questions.length} question${questions.length !== 1 ? "s" : ""} asked by <b>${company}</b></p>`;
  const rows = questions.map((q) => {
    const diff = q.difficulty || "";
    const freq = q.frequency ? `${Math.round(q.frequency)}%` : "";
    const comp = q.company ? `<span style="font-size:10px;color:#6b7280;background:#f3f4f6;padding:1px 5px;border-radius:4px;margin-right:4px;">${q.company}</span>` : "";
    const link = `https://leetcode.com/problems/${q.slug}/`;
    return `
      <a class="question-row" href="${link}" target="_blank" rel="noopener noreferrer">
        <span class="q-num">#${q.question_id}</span>
        <span class="q-title" title="${q.title}">${comp}${q.title}</span>
        <span class="q-diff ${diff}">${diff}</span>
        <span class="q-freq">${freq}</span>
        <span class="q-link" title="Open on LeetCode">↗</span>
      </a>`;
  }).join("");

  container.innerHTML = countLine + rows;
}

let searchTimer = null;

el("companySearch").addEventListener("input", (e) => {
  clearTimeout(searchTimer);
  const query = e.target.value.trim();

  if (query.length < 2) {
    el("companyResults").innerHTML = `<p class="company-hint">Type a company name to see all questions it has asked.</p>`;
    return;
  }

  el("companyResults").innerHTML = `<p class="company-loading">Loading…</p>`;

  // Debounce 400ms so we don't hammer Supabase on every keystroke
  searchTimer = setTimeout(async () => {
    try {
      const questions = await fetchCompanyQuestions(query);
      renderQuestions(questions, query);
    } catch (err) {
      el("companyResults").innerHTML = `<p class="company-error">Error: ${err.message}</p>`;
    }
  }, 400);
});

// ---------- init ----------
document.addEventListener("DOMContentLoaded", load);
load();
