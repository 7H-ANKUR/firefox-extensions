# LeetCode to GitHub Sync Extension

A Firefox extension that automatically pushes your accepted LeetCode solutions to your GitHub repository — complete with runtime stats, memory usage, and company interview data powered by Supabase.

---

## 📥 1. How to Install

**Official Installation (Recommended):**
Install directly from the Firefox Add-ons store:
👉 [**Install Leet Solution for Firefox**](https://addons.mozilla.org/en-US/firefox/addon/leet-solution/)

**Manual / Developer Mode:**
1. Download or clone this repository.
2. Open Firefox → `about:debugging` → **"This Firefox"**.
3. Click **"Load Temporary Add-on..."** and select any file inside the `leetcode-to-github/` folder (e.g., `manifest.json`).

---

## 🔑 2. How to Generate a GitHub Token

1. Go to [GitHub Fine-grained Tokens](https://github.com/settings/tokens?type=beta) and click **"Generate new token"**.
2. Name it (e.g., `LeetCode Sync`).
3. Under **Repository access** → select **"Only select repositories"** → choose your LeetCode solutions repo.
4. Under **Permissions → Repository permissions** → find **Contents** → set to **"Read and write"**.
5. Click **"Generate token"** and **copy it immediately** (shown only once).

---

## ⚙️ 3. Extension Setup

1. Click the extension icon in your Firefox toolbar to open the popup.
2. Go to the **⚙️ Settings** tab.
3. Enter your GitHub **Username** (Owner), **Repository Name**, and paste the **GitHub Token**.
4. Click **"Test Connection"** — you should see a green success message.

---

## 🚀 4. Features

### Auto Push
- Solve a problem on LeetCode. When it's **Accepted**, the extension auto-pushes it to GitHub with runtime & memory stats.
- Creates a clean folder structure: `0001-two-sum/solution.java` + `0001-two-sum/README.md`.

### Manual Push
- Open any accepted submission page and click the green **"⬆ Push to GitHub"** button.

### 🏢 Company Panel (on problem pages)
- A **"🏢 Companies"** button appears at the bottom-right of every LeetCode problem page.
- Click it to see a panel showing all companies that have asked this question, sorted by frequency.

### 🔍 Company Search (in popup)
- Open the popup and click the **🏢 Companies** tab.
- Type any company name (e.g., *Google*, *Meta*, *Amazon*) to instantly see all questions that company has asked, with difficulty badges and direct LeetCode links.

> **Note:** The company features require the Supabase database to be populated first.
> See the [setup scripts](../supabase_setup.sql) in the repo root.

---

## 📋 Release History

### v2.6.0 — Company Intelligence Update
- ✨ **NEW:** `🏢 Companies` floating button on every LeetCode problem page
- ✨ **NEW:** Company panel showing all companies that asked the current question, with frequency %
- ✨ **NEW:** `🏢 Companies` search tab in the extension popup with full question list per company
- ✨ **NEW:** Tabbed popup UI (Settings / Companies)
- 🔧 Supabase host permission added to manifest

### v2.5.0 — Stability & Race Condition Fix
- 🐛 Fixed: Concurrent push lock — auto-push and manual push can no longer run simultaneously for the same submission (prevented phantom 422 errors)

### v2.4.9 — Smart 422 Retry
- 🐛 Fixed: GitHub API 422 "not a fast-forward" error — extension now retries up to 4× with a 2s delay instead of force-pushing, completely preventing file deletion

### v2.4.8 — Atomic Commits & Auto-push Timeout
- 🐛 Fixed: Solution folders disappearing — all 4 files (code, problem README, stats.json, root README) now committed atomically in one push
- 🐛 Fixed: Auto-push timeout increased from 15s → 45s to handle slow LeetCode judges

### v2.4.6 — DOM Stats Fallback
- 🐛 Fixed: Runtime and memory showing "N/A" — extension now scrapes values directly from the page if the LeetCode API returns N/A

### v2.4.5 — URL Encoding Fix
- 🐛 Fixed: GitHub API error 422 caused by `encodeURIComponent('heads/main')` producing `heads%2Fmain`

### v2.4.x — Foundation
- ✨ Initial working release with GitHub push, version badge, and empty repo support
