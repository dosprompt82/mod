# Installing Personal Superpower: step by step

This guide assumes you've never installed developer software before. It takes about **20 minutes, once**. After that, starting the app is a double-click.

You'll install three free programs, download the app, and connect it to the AI.

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

## Step 3: Install GitHub Desktop (gets the app, and later its updates, in one click)

1. Go to **https://desktop.github.com/** and download GitHub Desktop.
2. Open it and **sign in** with your GitHub account.

> Prefer not to install this? You can download a ZIP instead (Step 4, option B), but every future update will be a manual copy-and-paste job.

## Step 4: Download the app

**Option A: with GitHub Desktop (recommended)**
1. In GitHub Desktop: **File → Clone repository…**
2. Click the **GitHub.com** tab and select **dosprompt82/mod**.
3. Under **Local path**, choose a place you'll remember, e.g. your **Documents** folder. Click **Clone**.
4. At the top, click **Current branch** and choose **`claude/new-session-nyeqzu`**. (That's the branch the app is on.)
5. Click **Repository → Show in Finder** (Mac) or **Show in Explorer** (Windows). This is the app's folder.

**Option B: as a ZIP**
1. Go to **https://github.com/dosprompt82/mod** (sign in).
2. Click the branch button (it says **main**) and choose **`claude/new-session-nyeqzu`**.
3. Click the green **Code** button → **Download ZIP**.
4. Unzip it (double-click on Mac; right-click → **Extract All** on Windows) and move the folder to your **Documents** folder.

## Step 5: Start it for the first time

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

## Step 6: Connect the AI

1. Go to **https://console.anthropic.com/** and sign up or log in.
2. Under **Billing**, add a payment method and some credit (a few dollars is plenty to start).
3. Under **API Keys**, click **Create Key**, name it "Personal Superpower", and **copy** the key (it starts with `sk-ant-`). You can't see it again later, so paste it somewhere safe for a minute.
4. In the app, click **Settings** (bottom of the left sidebar) → **AI provider**.
5. Paste the key into the **API key** box and click **Save**.
6. Click **Test connection**. You should see a green "Connected" message.

The key is saved only on your computer and is never shown again in full.

## Step 7: Try it

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
| "No Anthropic API key is configured" | Do Step 6. |
| "The Anthropic API key was rejected" | Copy the key again from console.anthropic.com (no spaces), remove the old one in Settings, and save the new one. |
| "rate-limiting" or "temporarily unavailable" | Wait a minute and try again. |
| Anything else | Settings → Application → **Health** shows diagnostics, and the log file location. Copy the error message into a Claude Code session on this repository and ask for help. |

## Removing the app

Make a backup first if you want to keep your work (Settings → Privacy → **Create backup**, then copy the file from `data/backups` somewhere safe). Then delete the app's folder. **This deletes all your workspaces, files and drafts**, because they live in the folder's `data` subfolder.
