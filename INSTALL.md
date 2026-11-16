# Installing Personal Superpower: step by step

This guide assumes you've never installed developer software before. It takes about **20 minutes, once**. After that, starting the app is a double-click.

You'll install three free programs (Python, Node.js, GitHub Desktop), download the app, start it, and connect it to the AI.

| You need | Why |
|---|---|
| A Mac, Windows PC or Linux computer | The app runs on your own computer |
| Permission to install programs | For Python and Node.js |
| A GitHub account with access to `dosprompt82/mod` | That's where the app's code lives |
| An Anthropic account with a little credit | The AI that does the analysis (pay-as-you-go) |

---

## Step 1: Install Python (the language the app is written in)

**Mac**
1. Go to **https://www.python.org/downloads/** and click the yellow **Download Python 3.13…** button.
2. Open the file it downloaded (it's in your **Downloads** folder, ends in `.pkg`).
3. Click **Continue** → **Continue** → **Agree** → **Install**, and type your Mac password when asked.
4. When it finishes, a Finder window opens. Double-click **Install Certificates.command** in it. (This lets Python make secure connections.)

**Windows**
1. Go to **https://www.python.org/downloads/** and click the yellow **Download Python 3.13…** button.
2. Open the downloaded file.
3. ⚠️ On the first screen, **tick the box "Add python.exe to PATH"** at the bottom. This matters.
4. Click **Install Now**, then **Close**.

**Check it worked (optional)**
- Mac: press **Cmd + Space**, type **Terminal**, press Enter. Type `python3 --version` and press Enter. You should see `Python 3.13…` (3.12 is fine too).
- Windows: click Start, type **cmd**, press Enter. Type `py --version` and press Enter.

## Step 2: Install Node.js (used once to build the app's screens)

1. Go to **https://nodejs.org/** and click the big **LTS** download button.
2. Open the downloaded file and click through the installer, accepting the defaults.

## Step 3: Install GitHub Desktop and download the app

**What this step does.** The app's code is stored on **GitHub**, a website for storing code, in a project (a "repository") called **`dosprompt82/mod`**. **GitHub Desktop** is a free program that copies that project onto your computer ("cloning") and, later, downloads new versions with two clicks. You won't write any code or use any of its advanced features.

### 3a. Download and install GitHub Desktop

**Mac**
1. Go to **https://desktop.github.com/** and click **Download for macOS**.
2. Open your **Downloads** folder. Double-click the downloaded file (`GitHubDesktop-….zip`) if it hasn't unzipped by itself. You'll get an app called **GitHub Desktop**.
3. Drag **GitHub Desktop** into your **Applications** folder (in the Finder sidebar).
4. Open it from Applications. If macOS asks *"GitHub Desktop is an app downloaded from the Internet. Are you sure you want to open it?"*, click **Open**.

**Windows**
1. Go to **https://desktop.github.com/** and click **Download for Windows**.
2. Open the downloaded file (`GitHubDesktopSetup-x64.exe`). It installs by itself, with no questions, and opens when it's done (about 30 seconds).

### 3b. Sign in to GitHub

1. On the **Welcome to GitHub Desktop** screen, click **Sign in to GitHub.com**. Your web browser opens.
2. Sign in with the GitHub account that owns or has access to `dosprompt82/mod`. Don't have a GitHub account yet? Create one on that page, then ask the owner of `dosprompt82/mod` to add you.
3. The browser shows **Authorize GitHub Desktop**. Click **Authorize desktop**.
4. Your browser then asks whether to open GitHub Desktop. Click **Open GitHub Desktop** (Mac) / **Open** (Windows). You're back in GitHub Desktop.
5. A **Configure Git** screen appears, asking for a name and email. Leave the suggested option (**Use my GitHub account name and email address**) and click **Finish**.
   These are only labels for changes you make yourself, which you won't be doing.

### 3c. Download ("clone") the app

1. You now see **Let's get started!** On the right is a list called **Your repositories**. Click **dosprompt82/mod**, then click the blue **Clone dosprompt82/mod** button.
   - Don't see it in the list? Use the menu instead: **File → Clone repository…**, click the **URL** tab, and paste `https://github.com/dosprompt82/mod`.
2. A **Clone a repository** window opens. The bottom box, **Local path**, is where the app's folder will be created. Click **Choose…** and pick your **user folder**: `C:\Users\yourname` on Windows, or `/Users/yourname` (the folder with the house icon) on a Mac. Click **Select Folder** / **Open**. The box now ends in `yourname\mod` (Windows) or `yourname/mod` (Mac).
   - ⚠️ **Don't use Documents, Desktop, or any OneDrive, iCloud or Dropbox folder.** Windows often syncs Documents to OneDrive, and Macs may sync it to iCloud. Sync services can lock or damage the app's database (you'd see "database is locked").
3. Click **Clone**. A progress bar runs for a few seconds to a minute.
4. When it's finished, the top bar shows **Current repository: mod** and **Current branch: claude/new-session-nyeqzu**.
   - That branch is the app's version line and is selected automatically.
   - If the branch shows anything else, click **Current branch** and choose **claude/new-session-nyeqzu** from the list. You can type `claude` in the filter box to find it.
   - The middle of the window says *"No local changes"*. That's correct.

### 3d. Open the app's folder

Click **Show in Finder** (Mac) / **Show in Explorer** (Windows) in the middle of the window. You can also use the menu: **Repository → Show in Finder / Explorer**.

You should see folders called `backend`, `frontend` and `demo-data`, and files including **`start.command`**, **`start.bat`**, `INSTALL.md` and `README.md`. This is the app. Leave it where it is.

> **Tips**
> - **Your work is never uploaded.** The `data` folder, where all your workspaces and files will live, is excluded from GitHub, so GitHub Desktop can't upload it.
> - **Don't edit files in this folder.** If the left panel in GitHub Desktop ever lists "Changes", don't click **Commit** or **Push**. Just ignore it, or ask for help.
> - **You can close GitHub Desktop now.** You'll open it again only to get updates (see UPDATING.md).

### Alternative: download a ZIP instead (no GitHub Desktop)
1. Go to **https://github.com/dosprompt82/mod** and sign in. The branch button near the top left should say **claude/new-session-nyeqzu**; if not, click it and choose that branch.
2. Click the green **Code** button → **Download ZIP**.
3. Unzip it: double-click it on a Mac; on Windows, right-click → **Extract All**. Move the folder into your **user folder** (`C:\Users\yourname` or `/Users/yourname`), not into Documents, Desktop or a OneDrive, iCloud or Dropbox folder.

With a ZIP, every future update is a manual copy job (UPDATING.md, Option 3), which is why GitHub Desktop is recommended.

## Step 4: Start it for the first time

**Mac**
1. In the app's folder, double-click **`start.command`**.
2. If macOS says it "cannot be opened because it is from an unidentified developer": **right-click** (or Control-click) `start.command` → **Open** → **Open**. You only need to do this once.
3. A Terminal window opens and sets things up. **The first time takes 1–3 minutes.** Then your browser opens the app.

**Windows**
1. In the app's folder, double-click **`start.bat`**.
2. If you see "Windows protected your PC": click **More info** → **Run anyway**.
3. A black window opens and sets things up (**1–3 minutes the first time**). Then your browser opens the app.

**Linux**: open a terminal in the folder and run `./start.sh`.

✅ You should now see **"What's on your mind?"** in your browser at **http://127.0.0.1:8765**.

> **Keep the Terminal / black window open** while you use the app; it *is* the app. Closing it (or pressing **Ctrl + C** in it) stops the app.

## Step 5: Connect the AI

1. Go to **https://console.anthropic.com/** and sign up or log in.
2. Under **Billing**, add a payment method and some credit (a few dollars is plenty to start).
3. Under **API Keys**, click **Create Key**, name it "Personal Superpower", and **copy** the key (it starts with `sk-ant-`). You can't see it again later, so paste it somewhere safe for a minute.
4. In the app, click **Settings** (bottom of the left sidebar) → **AI provider**.
5. Paste the key into the **API key** box and click **Save**.
6. Click **Test connection**. You should see a green "Connected" message.

The key is saved only on your computer and is never shown again in full.

## Step 6: Try it

- **Explore with sample material:** Settings → Application → **Load demo workspaces**. Open one from the left sidebar and type the suggested request.
- **Use a real email:** take a screenshot of the email straight to your clipboard:
  - Mac: **Cmd + Ctrl + Shift + 4**, then drag over the email.
  - Windows: **Windows key + Shift + S**, then drag over the email.

  Then click into the app's big box and press **Cmd + V** / **Ctrl + V**. Type *"What do they want, and how should I respond?"* and press the arrow (or **Ctrl + Enter**).
- The first time you send something, the app asks you to confirm that content is sent to Anthropic for analysis. Click **I understand, continue**.

---

## Every day after this

1. Double-click **`start.command`** (Mac) or **`start.bat`** (Windows).
2. Your browser opens the app. (Tip: bookmark **http://127.0.0.1:8765**. The bookmark works whenever the app is running.)
3. When you're done, close the Terminal / black window.

Your work is saved automatically as you go.

## If something goes wrong

| What you see | What to do |
|---|---|
| "Python 3.12 or newer is required" | Redo Step 1. On Windows, make sure you ticked **Add python.exe to PATH** (run the installer again and choose **Modify** if needed), then restart your computer. |
| "Node.js 18 or newer is required" | Redo Step 2, then close and reopen the start file. |
| Mac: "start.command could not be executed because you do not have appropriate access privileges" | Open Terminal, type `chmod +x ` (with a space), drag the app folder's `start.command` into the Terminal window, press Enter. Then try again. |
| The window flashes and closes (Windows) | Open the folder, click the address bar, type `cmd`, press Enter, then type `start.bat` and Enter. Now you can read the error. |
| "The server stopped during startup… port 8765 is in use" | Another copy is already running (look for another Terminal/black window). Or create a file named `.env` in the folder containing `PS_PORT=8766` and use http://127.0.0.1:8766. |
| Browser says "This site can't be reached" | The app isn't running. Start it again and keep its window open. |
| "No Anthropic API key is configured" | Do Step 5. |
| "database is locked" or "The app is busy saving a large file" | Wait a few seconds and try again. If the app's folder is inside OneDrive, Dropbox or iCloud (the app warns you on the Home screen), move it: see **Moving the app** below. |
| "The Anthropic API key was rejected" | Copy the key again from console.anthropic.com (no spaces), remove the old one in Settings, and save the new one. |
| "rate-limiting" or "temporarily unavailable" | Wait a minute and try again. |
| Anything else | Settings → Application → **Health** shows diagnostics, and the log file location. Copy the error message into a Claude Code session on this repository and ask for help. |

## Moving the app

Do this if the app warns that it's in a OneDrive, Dropbox or iCloud folder. Your work moves with it, because it lives in the `data` folder inside.
1. Close the app's window, and close GitHub Desktop.
2. In File Explorer (or Finder), **cut** the app's folder (`mod`) and **paste** it into your user folder (`C:\Users\yourname` or `/Users/yourname`).
3. Inside the moved folder, open `backend` and **delete the `.venv` folder**. Setup recreates it, and a moved copy may not work.
4. Open GitHub Desktop. It says it can't find the repository: click **Locate…** and choose the new folder.
5. Start the app with `start.bat` / `start.command`. It runs setup again (a few minutes), and then everything is where you left it.

## Removing the app

Make a backup first if you want to keep your work (Settings → Privacy → **Create backup**, then copy the file from `data/backups` somewhere safe). Then delete the app's folder. **This deletes all your workspaces, files and drafts**, because they live in the folder's `data` subfolder.
