/**
 * background.js — MV3 background (service worker on Chrome/Edge, event page
 * on Firefox — manifest.json declares both so the same file runs on either).
 *
 * Two responsibilities:
 *   1. Answer { type: "LEETCODE_SUBMISSION" } by watching
 *      chrome.webNavigation.onHistoryStateUpdated for LeetCode's SPA
 *      updating the URL to .../submissions/<id>/ after a submit, and
 *      returning that id. (This is how the real LeetHub extension gets the
 *      submission id too — there's no network request to intercept for a
 *      same-document History API navigation.)
 *   2. Answer { type: "PUSH_SOLUTION" | "TEST_CONNECTION" } by talking to
 *      the GitHub REST/Git-Data API.
 *
 * Two commits are made per accepted submission:
 *   1. "Time: 40 ms (36.45%), Space: 47.1 MB (59.34%) - <prefix>"
 *      — writes NNNN-slug/solution.ext and NNNN-slug/README.md together,
 *        as ONE atomic commit (via the Git Data API).
 *   2. "Updated stats"
 *      — rewrites the repo-root stats.json and README.md (a solved-problems
 *        table) from the accumulated data in stats.json.
 */

const api = typeof browser !== "undefined" ? browser : chrome;

// ---------- submission-id capture via webNavigation ----------

api.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message && message.type === "LEETCODE_SUBMISSION") {
    let settled = false;
    const listener = (details) => {
      const match = details.url && details.url.match(/\/submissions\/(\d+)\/?/);
      if (!match) return;
      finish(match[1]);
    };
    function finish(submissionId) {
      if (settled) return;
      settled = true;
      try {
        api.webNavigation.onHistoryStateUpdated.removeListener(listener);
      } catch (e) {
        /* ignore */
      }
      sendResponse({ submissionId: submissionId || null });
    }

    try {
      api.webNavigation.onHistoryStateUpdated.addListener(listener, {
        url: [{ hostSuffix: "leetcode.com", pathContains: "submissions" }],
      });
    } catch (err) {
      finish(null);
      return true;
    }

    // Safety net: don't hang forever if the navigation event never fires.
    setTimeout(() => finish(null), 20000);
    return true; // keep the message channel open for the async response
  }

const inFlightSubmissions = new Set();

  if (message && message.type === "PUSH_SOLUTION") {
    const subId = message.payload.submissionId;
    if (subId && inFlightSubmissions.has(subId)) {
      sendResponse({ ok: false, error: "Push already in progress for this submission." });
      return true;
    }
    if (subId) inFlightSubmissions.add(subId);

    pushSolution(message.payload)
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((err) => sendResponse({ ok: false, error: err.message }))
      .finally(() => {
        if (subId) inFlightSubmissions.delete(subId);
      });
    return true;
  }

  if (message && message.type === "TEST_CONNECTION") {
    testConnection()
      .then((result) => sendResponse(result))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }
});

// ---------- settings ----------

async function getSettings() {
  const s = await api.storage.sync.get(["ghToken", "ghOwner", "ghRepo", "ghBranch", "commitPrefix"]);
  if (!s.ghToken || !s.ghOwner || !s.ghRepo) {
    throw new Error(
      "GitHub isn't configured yet. Open the extension popup and add your token, owner and repo."
    );
  }
  return {
    token: s.ghToken,
    owner: s.ghOwner.trim(),
    repo: s.ghRepo.trim(),
    branch: (s.ghBranch || "main").trim(),
    commitPrefix: (s.commitPrefix || "LeetCode").trim(),
  };
}

function slugToTitle(slug) {
  return slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// ---------- GitHub API plumbing ----------

async function ghFetch(url, token, options = {}) {
  return fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(options.headers || {}),
    },
  });
}

/**
 * Turns a GitHub API failure into a clear, actionable message. 403 in
 * particular is almost always "the token can read this repo but isn't
 * actually allowed to write to it right now" — either the Contents
 * permission isn't set to Read & write, the repo isn't in the token's
 * Repository access list, or a just-edited token issued a new value that
 * never got re-pasted into the popup. Those are indistinguishable from a
 * raw "Resource not accessible by personal access token" message, so this
 * spells out what to check instead of passing that string through as-is.
 */
function describeGitHubError(status, rawMessage, { owner, repo } = {}) {
  const where = owner && repo ? `${owner}/${repo}` : "this repository";
  if (status === 403) {
    return (
      `GitHub API error 403: Resource not accessible by personal access token. ` +
      `GitHub can see ${where} but is refusing the write — the token doesn't currently have write ` +
      `access saved for it. Check: (1) on github.com/settings/tokens, open this token and confirm ` +
      `Repository permissions → Contents is "Read and write" (not "Read-only"), and that ${where} is ` +
      `listed under Repository access; (2) if you just edited those settings, GitHub sometimes issues ` +
      `a NEW token value — copy it and re-paste it into the extension popup, since the old value keeps ` +
      `failing even once the permissions look correct; (3) a classic (non-fine-grained) token needs the ` +
      `"repo" scope (or "public_repo" for a public repo).`
    );
  }
  if (status === 404) {
    return `GitHub API error 404: Repository "${where}" wasn't found, or your token doesn't have access to it. Double-check the owner/repo spelling and that the repo exists.`;
  }
  if (status === 401) {
    return `GitHub API error 401: GitHub rejected the token. Check that it's valid, not expired, and pasted without extra spaces.`;
  }
  return `GitHub API error ${status}: ${rawMessage || "Unknown error"}`;
}

function ownerRepoFromPath(path) {
  const m = path.match(/^\/repos\/([^/]+)\/([^/]+)/);
  return m ? { owner: m[1], repo: m[2] } : {};
}

async function ghJson(path, token, options) {
  const res = await ghFetch(`https://api.github.com${path}`, token, options);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const error = new Error(describeGitHubError(res.status, err.message || res.statusText, ownerRepoFromPath(path)));
    error.status = res.status;
    throw error;
  }
  return res.json();
}

async function ensureRepoAccess(owner, repo, token) {
  const res = await ghFetch(`https://api.github.com/repos/${owner}/${repo}`, token);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const error = new Error(describeGitHubError(res.status, err.message || res.statusText, { owner, repo }));
    error.status = res.status;
    throw error;
  }
  return res.json();
}

/**
 * Verifies the token can actually WRITE to the repo, not just read it, by
 * creating a throwaway git blob via the same Git Data API endpoint
 * commitFiles() uses for every real push. A blob is just a content-addressed
 * object — it's invisible in the repo (no file, no commit, no branch change)
 * until something points a tree at it, so this has zero footprint on the
 * user's repo while still exercising the exact permission a real push needs.
 */
async function testWriteAccess(owner, repo, token) {
  try {
    // Blob API works on initialized repos — fastest, zero footprint test
    await ghJson(`/repos/${owner}/${repo}/git/blobs`, token, {
      method: "POST",
      body: JSON.stringify({
        content: "LeetHub connection test — not attached to any commit or file, safe to ignore.",
        encoding: "utf-8",
      }),
    });
  } catch (err) {
    if (err.status !== 409) throw err;
    // 409 = repo is empty (no commits yet). Blob API doesn't work on empty repos.
    // Verify write access using the Contents API instead, which works on empty repos.
    const testPath = ".leethub-writetest";
    const res = await ghJson(`/repos/${owner}/${repo}/contents/${testPath}`, token, {
      method: "PUT",
      body: JSON.stringify({
        message: "LeetHub write test (safe to delete)",
        content: utf8ToBase64("LeetHub write test"),
      }),
    });
    // Clean up the test file immediately so it doesn't pollute the repo
    await ghJson(`/repos/${owner}/${repo}/contents/${testPath}`, token, {
      method: "DELETE",
      body: JSON.stringify({
        message: "Remove LeetHub write test",
        sha: res.content.sha,
      }),
    });
  }
}

function base64ToUtf8(b64) {
  const binary = atob(b64.replace(/\n/g, ""));
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder("utf-8").decode(bytes);
}

function utf8ToBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

/** Returns { content, sha } for a text file, or null if it doesn't exist. */
async function getFileContent(owner, repo, path, branch, token) {
  const res = await ghFetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURI(path)}?ref=${encodeURIComponent(branch)}`,
    token
  );
  if (res.status === 404) return null;
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`GitHub API error ${res.status}: ${err.message || res.statusText}`);
  }
  const data = await res.json();
  return { content: base64ToUtf8(data.content), sha: data.sha };
}

async function putFileSimple(owner, repo, path, branch, token, content, message, knownSha) {
  const body = { message, content: utf8ToBase64(content), branch };
  if (knownSha) body.sha = knownSha;
  return ghJson(`/repos/${owner}/${repo}/contents/${encodeURI(path)}`, token, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

/**
 * Writes several files in ONE commit using the Git Data API
 * (blob -> tree -> commit -> ref update). Falls back to one Contents-API
 * commit per file when the branch has no commits yet (empty repo).
 */
async function commitFiles(owner, repo, branch, token, files, message) {
  // Check if repo is empty first
  let isRepoEmpty = false;
  try {
    await ghJson(`/repos/${owner}/${repo}/git/refs/heads/${branch}`, token);
  } catch (err) {
    if (err.status === 404 || err.status === 409) isRepoEmpty = true;
    else throw err;
  }

  // Fallback for completely empty repos
  if (isRepoEmpty) {
    let last;
    let currentSha = null;
    for (const f of files) {
      last = await putFileSimple(owner, repo, f.path, branch, token, f.content, message, currentSha);
      try {
        const updatedRef = await ghJson(`/repos/${owner}/${repo}/git/refs/heads/${branch}`, token);
        currentSha = updatedRef.object.sha;
      } catch (e) { /* ignore */ }
    }
    return last;
  }

  // Upload blobs (only needs to be done once per push)
  const treeEntries = await Promise.all(
    files.map(async (f) => {
      const blob = await ghJson(`/repos/${owner}/${repo}/git/blobs`, token, {
        method: "POST",
        body: JSON.stringify({ content: f.content, encoding: "utf-8" }),
      });
      return { path: f.path, mode: "100644", type: "blob", sha: blob.sha };
    })
  );

  // Safely loop tree + commit + ref update to survive GitHub replica lag
  let attempts = 4;
  while (attempts > 0) {
    attempts--;
    try {
      const ref = await ghJson(`/repos/${owner}/${repo}/git/refs/heads/${branch}`, token);
      const headSha = ref.object.sha;
      const headCommit = await ghJson(`/repos/${owner}/${repo}/git/commits/${headSha}`, token);
      const baseTreeSha = headCommit.tree.sha;

      const tree = await ghJson(`/repos/${owner}/${repo}/git/trees`, token, {
        method: "POST",
        body: JSON.stringify({ base_tree: baseTreeSha, tree: treeEntries }),
      });

      const commit = await ghJson(`/repos/${owner}/${repo}/git/commits`, token, {
        method: "POST",
        body: JSON.stringify({ message, tree: tree.sha, parents: [headSha] }),
      });

      await ghJson(`/repos/${owner}/${repo}/git/refs/heads/${branch}`, token, {
        method: "PATCH",
        body: JSON.stringify({ sha: commit.sha, force: false }), // NEVER force push!
      });

      return commit;
    } catch (err) {
      // 422 means our headSha was stale due to replica lag or a concurrent push
      if (err.status === 422 && attempts > 0) {
        console.warn("[LC→GH] 422 fast-forward error, likely replica lag. Retrying...");
        await new Promise((r) => setTimeout(r, 2000));
      } else {
        throw err;
      }
    }
  }
}

// ---------- content builders ----------

function formatCommitMessage(payload, prefix) {
  const parts = [];
  if (payload.runtime) {
    const pct = typeof payload.runtimePercentile === "number" ? ` (${payload.runtimePercentile.toFixed(2)}%)` : "";
    parts.push(`Time: ${payload.runtime}${pct}`);
  }
  if (payload.memory) {
    const pct = typeof payload.memoryPercentile === "number" ? ` (${payload.memoryPercentile.toFixed(2)}%)` : "";
    parts.push(`Space: ${payload.memory}${pct}`);
  }
  const stats = parts.join(", ");
  return stats ? `${stats} - ${prefix}` : `${prefix}: ${payload.title || payload.slug}`;
}

function buildProblemReadme(payload, number, title) {
  const lines = [
    `# ${number}. ${title}`,
    "",
    payload.difficulty ? `**Difficulty:** ${payload.difficulty}` : null,
    `**Language:** ${payload.lang}`,
    payload.runtime
      ? `**Runtime:** ${payload.runtime}${
          typeof payload.runtimePercentile === "number" ? ` (better than ${payload.runtimePercentile.toFixed(2)}%)` : ""
        }`
      : null,
    payload.memory
      ? `**Memory:** ${payload.memory}${
          typeof payload.memoryPercentile === "number" ? ` (better than ${payload.memoryPercentile.toFixed(2)}%)` : ""
        }`
      : null,
    payload.topics && payload.topics.length ? `**Topics:** ${payload.topics.join(", ")}` : null,
    "",
    `[View on LeetCode](https://leetcode.com/problems/${payload.slug}/)`,
    "",
  ].filter((line) => line !== null);
  return lines.join("\n");
}

const DEFAULT_STATS = () => ({ problems: {} });

function loadStatsFromText(text) {
  if (!text) return DEFAULT_STATS();
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object" && parsed.problems) return parsed;
  } catch (e) {
    /* corrupt/foreign stats.json — start fresh rather than fail the push */
  }
  return DEFAULT_STATS();
}

function applyProblemToStats(stats, payload, number, title, codePath) {
  stats.problems[number] = {
    slug: payload.slug,
    title,
    difficulty: payload.difficulty || null,
    language: payload.lang,
    runtime: payload.runtime || null,
    memory: payload.memory || null,
    path: codePath,
    solvedAt: new Date().toISOString(),
  };
  return stats;
}

function summarizeStats(stats) {
  const entries = Object.values(stats.problems);
  const counts = { Easy: 0, Medium: 0, Hard: 0 };
  for (const p of entries) {
    if (p.difficulty && counts[p.difficulty] !== undefined) counts[p.difficulty]++;
  }
  return { total: entries.length, easy: counts.Easy, medium: counts.Medium, hard: counts.Hard };
}

function buildStatsJson(stats) {
  const summary = summarizeStats(stats);
  const out = {
    totalSolved: summary.total,
    easySolved: summary.easy,
    mediumSolved: summary.medium,
    hardSolved: summary.hard,
    lastUpdated: new Date().toISOString(),
    problems: stats.problems,
  };
  return JSON.stringify(out, null, 2);
}

function buildRootReadme(stats) {
  const summary = summarizeStats(stats);
  const numbers = Object.keys(stats.problems).sort((a, b) => Number(a) - Number(b));

  const rows = numbers.map((num) => {
    const p = stats.problems[num];
    const n = Number(num);
    const folder = `${num}-${p.slug || "unknown"}`;
    return `| ${n} | [${p.title || p.slug || "Untitled"}](${folder}/README.md) | ${p.difficulty || "—"} | ${
      p.language || "—"
    } | ${p.runtime || "—"} | ${p.memory || "—"} |`;
  });

  return [
    "# LeetCode Solutions",
    "",
    `Auto-synced from LeetCode. **${summary.total} solved** — ${summary.easy} Easy, ${summary.medium} Medium, ${summary.hard} Hard.`,
    "",
    `_Last updated: ${new Date().toISOString()}_`,
    "",
    "| # | Title | Difficulty | Language | Runtime | Memory |",
    "|---|-------|------------|----------|---------|--------|",
    ...rows,
    "",
  ].join("\n");
}

// ---------- main entry points ----------

async function pushSolution(payload) {
  if (!payload || !payload.code || !payload.slug) {
    throw new Error("Missing submission data — nothing to push.");
  }

  const { owner, repo, branch, token, commitPrefix } = await getSettings();
  await ensureRepoAccess(owner, repo, token);

  const ext = payload.lang || "txt";
  const number = payload.questionNumber ? String(payload.questionNumber).padStart(4, "0") : "0000";
  const title = payload.title || slugToTitle(payload.slug);
  const folder = `${number}-${payload.slug}`;
  const codePath = `${folder}/solution.${ext}`;
  const readmePath = `${folder}/README.md`;

  const existingStats = await getFileContent(owner, repo, "stats.json", branch, token);
  const stats = loadStatsFromText(existingStats && existingStats.content);
  applyProblemToStats(stats, payload, number, title, codePath);

  await commitFiles(
    owner,
    repo,
    branch,
    token,
    [
      { path: codePath, content: payload.code },
      { path: readmePath, content: buildProblemReadme(payload, number, title) },
      { path: "stats.json", content: buildStatsJson(stats) },
      { path: "README.md", content: buildRootReadme(stats) },
    ],
    formatCommitMessage(payload, commitPrefix)
  );

  return { path: codePath };
}

async function testConnection() {
  const { owner, repo, token, branch } = await getSettings();
  const repoData = await ensureRepoAccess(owner, repo, token);

  // Read access alone isn't enough to promise pushes will work — this is
  // exactly the gap that let "Test connection" pass while a real push 403'd.
  // Exercise write access for real before reporting success.
  await testWriteAccess(owner, repo, token);

  return {
    ok: true,
    defaultBranch: repoData.default_branch,
    usingBranch: branch,
    private: repoData.private,
    writeAccess: true,
  };
}
