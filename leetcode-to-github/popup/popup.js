// Native `browser` (Firefox) is promise-based; Chrome/Edge's `chrome` API
// is promise-based too for storage/runtime when no callback is passed.
// Using one or the other lets this single file run unmodified everywhere.
const api = typeof browser !== "undefined" ? browser : chrome;

const fields = ["ghToken", "ghOwner", "ghRepo", "ghBranch", "commitPrefix"];
const el = (id) => document.getElementById(id);
const statusEl = el("status");

function setStatus(text, kind) {
  statusEl.textContent = text;
  statusEl.className = "status" + (kind ? ` ${kind}` : "");
}

async function load() {
  const stored = await api.storage.sync.get(fields);
  el("ghToken").value = stored.ghToken || "";
  el("ghOwner").value = stored.ghOwner || "";
  el("ghRepo").value = stored.ghRepo || "";
  el("ghBranch").value = stored.ghBranch || "main";
  el("commitPrefix").value = stored.commitPrefix || "LeetCode";

  // Show version badge so user always knows which build is loaded
  const manifest = api.runtime.getManifest();
  const badge = el("versionBadge");
  if (badge && manifest && manifest.version) {
    badge.textContent = `v${manifest.version}`;
  }
}

async function save() {
  const owner = el("ghOwner").value.trim();
  const repo = el("ghRepo").value.trim();
  const token = el("ghToken").value.trim();

  if (!token || !owner || !repo) {
    setStatus("Token, owner and repo are all required.", "err");
    return;
  }

  await api.storage.sync.set({
    ghToken: token,
    ghOwner: owner,
    ghRepo: repo,
    ghBranch: el("ghBranch").value.trim() || "main",
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
    // Promise-based form (no callback) works on both `browser.*` (Firefox,
    // where callbacks aren't supported) and `chrome.*` (Chrome/Edge, which
    // returns a promise when no callback is passed).
    const response = await api.runtime.sendMessage({ type: "TEST_CONNECTION" });
    if (response && response.ok) {
      setStatus(
        `Connected with write access. Pushing to branch "${response.usingBranch}"${
          response.private ? " (private repo)" : ""
        }.`,
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
document.addEventListener("DOMContentLoaded", load);
load();
