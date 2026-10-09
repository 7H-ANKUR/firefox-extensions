# LeetCode to GitHub Sync Extension

This extension seamlessly syncs your accepted LeetCode solutions directly to your GitHub repository. It automatically scrapes your code, runtime, and memory stats, and organizes them beautifully on GitHub.

## 📥 1. How to Install in Firefox

Since this is an unpacked developer extension, you need to load it manually into Firefox:

1. Download or clone this repository to your computer.
2. Open Firefox and type `about:debugging` in the URL/search bar.
3. In the left sidebar, click on **"This Firefox"**.
4. Click the **"Load Temporary Add-on..."** button.
5. In the file explorer that opens, navigate to the `leetcode-to-github` folder and select any file inside (like `manifest.json`).
6. The extension is now installed! You should see its icon in your Firefox toolbar (top right).

## 🔑 2. How to Generate a GitHub Token

To allow the extension to push code to your GitHub, you must provide it with a secure Personal Access Token (PAT).

1. Go to your GitHub account settings: [GitHub Fine-grained Tokens](https://github.com/settings/tokens?type=beta).
2. Click **"Generate new token"**.
3. Name your token (e.g., `LeetCode Sync`).
4. Under **Repository access**, select **"Only select repositories"** and choose the specific repository where you want to save your LeetCode solutions (e.g., `leetcode-solutions`).
5. Under **Permissions**, open **"Repository permissions"**.
6. Find **"Contents"** and change it to **"Read and write"**. *(This is required to push files).*
7. Click **"Generate token"** at the bottom of the page.
8. **Copy the generated token immediately!** (GitHub will only show it to you once).

## ⚙️ 3. Extension Setup & Configuration

Now that you have your token and the extension is installed:

1. Click the LeetCode Sync extension icon in your Firefox toolbar to open the popup.
2. Enter your GitHub **Username** (Owner). Example: `7H-ANKUR`.
3. Enter the exact **Repository Name** you selected earlier. Example: `leetcode-solutions`.
4. Paste the **GitHub Token** you just copied.
5. *(Optional)* Modify the branch or commit prefix if desired.
6. Click **"Test Connection"**. 
7. If everything is configured correctly (and your token has Write access), you will see a green success message.

## 🚀 4. How to Use

- **Auto-Push:** Simply solve a problem on LeetCode. When your solution is marked as **"Accepted"**, the extension will automatically extract the code, time complexity, and space complexity, and push it to GitHub in the background. You'll see a green toast pop up when it's done!
- **Manual Push:** If you want to push an older solution, just open any accepted submission on LeetCode and click the green **"⬆ Push to GitHub"** button added to the page toolbar.
