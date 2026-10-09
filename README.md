# Firefox Extensions 🦊

Welcome to my personal repository of custom-built Firefox extensions! This repository is structured to hold multiple independent extensions, with each extension living inside its own dedicated folder.

## 📦 Current Extensions

### 1. [LeetCode to GitHub Sync](./leetcode-to-github)
A powerful Firefox extension that automatically pushes your accepted LeetCode solutions directly to your personal GitHub repository. 

**Features:**
- ⚡ **Auto-Push:** Automatically detects when a solution is "Accepted" on LeetCode and pushes it in the background.
- 🕒 **Stats Extraction:** Automatically scrapes and includes your Time Complexity (ms/percentile) and Space Complexity (MB/percentile) in the commit messages and README.
- 🗂️ **Organized Repo Structure:** Creates clean folders for each problem (e.g., `0179-largest-number/`) with both your code and a dynamically generated problem `README.md`.
- 📊 **Main Dashboard:** Automatically maintains a root `README.md` and `stats.json` in your repository with a table tracking all your solved problems, languages, runtimes, and memory usage.
- 🛡️ **Race-Condition Proof:** Safely handles GitHub API replication lag and prevents duplicate pushes if you click the manual push button while an auto-push is running.

## 🛠️ How to Install (Developer Mode)

To install any of the extensions in this repository locally on your machine:
1. Clone this repository or download the code as a ZIP file.
2. Open Firefox and navigate to `about:debugging`.
3. Click on **"This Firefox"** in the left sidebar.
4. Click the **"Load Temporary Add-on..."** button.
5. Select any file (like `manifest.json`) inside the folder of the extension you want to install (e.g., inside `leetcode-to-github/`).

---
*Created by [Ankur Pratap Singh](https://github.com/7H-ANKUR).*
