# LeetCode → GitHub Auto Push

A Manifest V3 browser extension that automatically pushes your **accepted**
LeetCode solutions to a GitHub repository. Runs unmodified on **Brave,
Chrome, Edge, and Firefox**.

## Two ways a push happens (v2.1.0)

**Automatic (Accepted-only):** submit as normal. If the result is
Accepted, it's pushed with no further action from you.

**Manual (any verdict, on demand):** open any of your submissions from
LeetCode's **Submissions** tab (a URL like
`leetcode.com/problems/<slug>/submissions/<id>/`). A **"⬆ Push to GitHub"**
button appears next to LeetCode's own Solution/Analysis buttons — click it
to push that exact submission right away. This works for old submissions
too, and — like the real LeetHub extension's own manual button — it
doesn't check the verdict first, so it'll push a Wrong Answer attempt if
that's what you're looking at. If LeetCode's layout means that button row
isn't found, a floating button appears bottom-right instead after a couple
of seconds, so there's always a way to trigger it.

## How detection works (v2.0.0 — rewritten)

Earlier versions tried to intercept LeetCode's `fetch`/`XHR` traffic
directly, which turned out to be fragile. **v2.0+ uses the same detection
strategy as the real, actively-maintained
[LeetHub-2.0](https://github.com/arunbhardwaj/LeetHub-2.0) extension**
(698 stars, in active use) instead of re-guessing one — this covers the
*automatic* path; the manual button (above) uses the same extension's
proven toolbar-injection approach too:

1. A `MutationObserver` waits for LeetCode's actual **Submit** button
   (`[data-e2e-locator="console-submit-button"]`) to exist, then attaches a
   real click listener to it — no network sniffing.
2. On click, the content script asks `background.js` for the submission ID.
   Background gets it via `chrome.webNavigation.onHistoryStateUpdated`:
   LeetCode's SPA updates the URL to `/problems/<slug>/submissions/<id>/`
   via the History API once judging starts, and `webNavigation` sees that
   even though it's a same-document navigation with no network request to
   catch.
3. The content script polls the DOM (up to 15s) for the result banner
   (`[data-e2e-locator="submission-result"]`) and reads its text.
4. **Only if the text starts with "Accepted"**, it fetches the full result
   — code, runtime, memory, percentiles, language, problem metadata —
   directly from LeetCode's own GraphQL API (`submissionDetails`), using
   field names verified against LeetHub-2.0's current, working query.
   Anything else (Wrong Answer, TLE, etc.) is skipped — you'll see a small
   "Not synced (Wrong Answer)" toast instead of a push.
5. `background.js` pushes to GitHub via the Contents/Git-Data API and shows
   a toast confirming success or failure.

Nothing about LeetCode's own submit flow is touched.

## What gets committed

Two commits per accepted solve, matching the format popular LeetCode-sync
tools use:

1. **`NNNN-slug/solution.ext`** + **`NNNN-slug/README.md`** together, in
   one atomic commit:
   `Time: 40 ms (36.45%), Space: 47.1 MB (59.34%) - LeetCode`
2. Repo-root **`stats.json`** + **`README.md`** (a solved-problems table),
   committed as `Updated stats`.

## Install for testing (Firefox — primary target)

1. Open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on…** and select `manifest.json` inside
   this folder.
3. Click the toolbar icon (puzzle-piece menu if not pinned) to open the
   popup and configure GitHub.

**Note:** "Load Temporary Add-on" resets when Firefox restarts — fine for
testing. For something permanent, see **Publishing** below (free,
self-distributed signed `.xpi`, no store review needed if you choose "On
your own").

**Brave / Chrome / Edge** (all Chromium, same steps — this extension also
runs unmodified there):
1. Open `brave://extensions`, `chrome://extensions`, or `edge://extensions`.
2. Toggle **Developer mode** on (top right).
3. Click **Load unpacked** and select this `leethub-extension` folder.

## Configure

1. Create a GitHub **fine-grained personal access token** at
   <https://github.com/settings/tokens>, scoped to your target repo, with
   **Contents: Read and write** permission (nothing else needed).
2. In the popup, fill in **GitHub Token**, **Owner**, **Repository**
   (must already exist), **Branch** (default `main`), and **Commit
   prefix** (default `LeetCode` — shown at the end of each commit
   message).
3. Click **Test connection**, then **Save**.

## v2.3.0 — reliability fixes

- **The "🔗 LC→GH ready" badge is now clickable too**, not just decorative.
  It pushes whatever submission the current URL points to, same as the
  dedicated manual button — so whichever element you instinctively click,
  something happens.
- **Submit-button detection no longer depends on one exact attribute.**
  It now also falls back to finding any `<button>` whose visible text is
  literally "Submit" — if the primary selector ever stops matching
  LeetCode's current layout, this still catches it, so auto-push and the
  safety-net button don't go silently dead.
- **Auto-push success now shows a blocking `alert()`** (not just a toast)
  so you can't miss it even if you've looked away from the tab. If the
  push doesn't happen automatically for any reason, the safety-net button
  (appears within ~1-2s of clicking Submit) and the ready badge are both
  there to manually trigger it instead — no alert for those cases, just an
  available button, as that's a normal day-to-day path, not confirmation
  of a completed action.
- If auto-detection still can't find a Submit button after 8 seconds, the
  console logs a specific diagnostic (`[LC→GH] still haven't found/bound a
  Submit button...`) telling you whether any "Submit" text exists on the
  page at all — paste that line if something's still wrong, it pinpoints
  exactly where.

## v2.4.0 — real write-access check + clearer GitHub errors

Some users saw **"Test connection"** succeed in the popup, then a real push
fail with `GitHub API error 403: Resource not accessible by personal access
token`. Root cause: "Test connection" only did a `GET` on the repo, which
succeeds as long as the token can *read* it — it never actually checked
whether the token could *write*, which is a separate GitHub permission.

- **"Test connection" now performs a real write check.** It creates a
  throwaway git blob through the same Git Data API endpoint every real push
  uses. A blob is just a content-addressed object — it's invisible in your
  repo (no file, no commit, no branch change) until something points a tree
  at it, so this check has **zero footprint** on your repo while still
  proving write access actually works, not just read access.
- **403 errors now explain exactly what to check**, instead of surfacing
  GitHub's raw "Resource not accessible by personal access token" string:
  1. On `github.com/settings/tokens`, open the token and confirm
     **Repository permissions → Contents = "Read and write"** (not
     "Read-only"), and that the repo is listed under **Repository access**.
  2. If you just edited those settings, GitHub sometimes issues a **new
     token value** — the old value keeps failing even after the permissions
     look correct on github.com, so copy the new value and re-paste it into
     the extension popup.
  3. A classic (non-fine-grained) token needs the **`repo`** scope (or
     `public_repo` for a public repo).
- 404 ("repo not found/no access") and 401 ("bad token") errors are also
  now worded consistently and apply everywhere the GitHub API is called,
  not just in "Test connection".

If you previously edited a fine-grained token's repository access and
"Test connection" now fails with the 403 message above, that's almost
always the fix: GitHub re-issued the token value — grab the new one from
`github.com/settings/tokens` and re-save it in the popup.

## Verifying it's working

- The moment the extension loads on any `leetcode.com/problems/...` page,
  a small **"🔗 LC→GH ready"** badge appears bottom-left. If you don't see
  this, the extension isn't running on that page — reload it from the
  extensions page and hard-refresh the tab.
- Open DevTools (`F12`) → Console, filter for `[LC→GH]`. Submitting a
  solution should log, in order: `submit clicked` → `submission id: ...` →
  `verdict banner text: "Accepted..."` → `pushing to GitHub: ...`.
- A green toast (bottom-right) confirms the push, or shows the error if
  one occurred.

## Publishing (free on both Edge and Firefox)

**Microsoft Edge Add-ons** — no fee: zip this folder's contents and submit
at the [Partner Center](https://partner.microsoft.com/dashboard/microsoftedge/overview)
(free account). Works as-is.

**Firefox Add-ons (AMO)** — no fee: zip this folder's contents and submit
at [addons.mozilla.org/developers](https://addons.mozilla.org/developers/)
(free account). Before submitting, replace the placeholder in
`manifest.json` → `browser_specific_settings.gecko.id` with your own
unique string (e.g. `you@yourdomain.example` — doesn't need to be real).

Chrome Web Store is the only one of the three with the one-time $5 fee.

## Known limitations

- The automatic path only catches literal clicks on the Submit button —
  the Ctrl+Enter / Cmd+Enter keyboard shortcut isn't wired up yet (use the
  manual button afterward if you submit that way).
- The manual button's toolbar placement depends on a LeetCode CSS class
  pattern that could change; the floating fallback exists specifically so
  a button always shows up even if that happens.
- If LeetCode changes these DOM attributes or GraphQL field names again in
  the future, detection will need updating — but this is the same exposure
  any LeetCode-sync tool has, LeetHub-2.0 included.
