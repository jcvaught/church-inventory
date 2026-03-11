# Church Inventory — Setup Guide

Welcome! This guide will walk you through getting your Church Inventory app live on the web so your whole team can use it from any phone, tablet, or computer.

**Time needed:** About 30–45 minutes
**Cost:** Free (Firebase and Vercel both have free tiers that are more than enough)
**Skill level:** You should be comfortable copy-pasting commands into a terminal

---

## What You'll Set Up

1. **Firebase** — The database that stores your inventory (free)
2. **Vercel** — The web host that makes your app available at a URL (free)
3. **Your app** — The React web app you'll share with your team

Once it's live, anyone with the link can use it — on their phone, tablet, or computer. They can even add it to their home screen so it looks and feels like an app.

---

## Before You Start

You'll need to install **Node.js** on your computer. This is the tool that builds the app.

1. Go to **https://nodejs.org**
2. Download the **LTS** version (the big green button)
3. Install it — just click through the installer, all defaults are fine
4. To verify it worked, open your terminal (on Mac: search "Terminal"; on Windows: search "Command Prompt") and type:
   ```
   node --version
   ```
   You should see something like `v20.11.0` — any version 18 or higher is fine.

---

## Step 1: Download and Prepare the Project

1. Move the `church-inventory` folder to a convenient location on your computer (like your Desktop or Documents folder).

2. Open your terminal and navigate to the project folder:
   ```
   cd ~/Desktop/church-inventory
   ```
   (Adjust the path if you put it somewhere else.)

3. Install the project dependencies:
   ```
   npm install
   ```
   This will take a minute — it's downloading all the libraries the app needs. You'll see a `node_modules` folder appear.

---

## Step 2: Set Up Firebase (Your Database)

Firebase is Google's app platform. The free "Spark" plan gives you more than enough for a church team.

### Create a Firebase project

1. Go to **https://console.firebase.google.com**
2. Sign in with a Google account (any Gmail works)
3. Click **"Create a project"** (or "Add project")
4. Name it something like `church-inventory`
5. You can disable Google Analytics when asked — you don't need it
6. Click **Create project** and wait for it to finish

### Enable Firestore (the database)

1. In your Firebase project, click **"Build"** in the left sidebar, then **"Firestore Database"**
2. Click **"Create database"**
3. Choose **"Start in test mode"** (we'll secure it later)
4. Select a location close to your church (e.g., `us-east1` for East Coast, `us-central1` for Midwest, `us-west1` for West Coast)
5. Click **Enable**

### Get your Firebase config

1. In the Firebase console, click the **gear icon** (top left) → **"Project settings"**
2. Scroll down to **"Your apps"** section
3. Click the **web icon** (`</>`) to register a web app
4. Give it a nickname like "Church Inventory Web"
5. You do NOT need Firebase Hosting checked — skip that
6. Click **"Register app"**
7. You'll see a code block with your Firebase configuration. It looks like this:
   ```javascript
   const firebaseConfig = {
     apiKey: "AIzaSy...",
     authDomain: "church-inventory-xxxxx.firebaseapp.com",
     projectId: "church-inventory-xxxxx",
     storageBucket: "church-inventory-xxxxx.firebasestorage.app",
     messagingSenderId: "123456789",
     appId: "1:123456789:web:abcdef123456"
   };
   ```

### Paste your config into the app

1. Open the file `src/firebase.js` in any text editor (TextEdit on Mac, Notepad on Windows, or VS Code if you have it)
2. Replace each `"YOUR_..."` placeholder with the matching value from Firebase. For example:
   - Replace `"YOUR_API_KEY_HERE"` with `"AIzaSy..."`
   - Replace `"YOUR_PROJECT_ID"` (it appears 3 times!) with your actual project ID
   - And so on for `messagingSenderId` and `appId`
3. Save the file

---

## Step 3: Test It Locally

Before putting it online, let's make sure everything works on your computer:

```
npm run dev
```

You'll see a message like:
```
  Local:   http://localhost:5173/
```

Open that link in your browser. You should see the Church Inventory app with all your items loaded! Try clicking around — check out an item, look at the Supplies tab, etc.

If you see a "Connection Error" message, double-check that you pasted the Firebase config correctly in Step 2.

Press `Ctrl+C` in the terminal to stop the local server when you're done testing.

---

## Step 4: Deploy to the Web (Vercel)

Vercel is a free hosting service that makes deployment very simple.

### Option A: Deploy via Vercel website (easiest)

1. Create a free account at **https://vercel.com** (you can sign up with GitHub, GitLab, or email)
2. Push your code to a **GitHub repository**:
   - If you don't have a GitHub account, create one at https://github.com
   - Create a new repository called `church-inventory`
   - Follow GitHub's instructions to push your code:
     ```
     cd ~/Desktop/church-inventory
     git init
     git add .
     git commit -m "Initial church inventory app"
     git branch -M main
     git remote add origin https://github.com/YOUR-USERNAME/church-inventory.git
     git push -u origin main
     ```
3. Back on Vercel, click **"Add New..."** → **"Project"**
4. Import your GitHub repository
5. Vercel will auto-detect it's a Vite project — just click **"Deploy"**
6. Wait about 60 seconds — your app is now live at a URL like `church-inventory-xxxxx.vercel.app`!

### Option B: Deploy via command line

If you prefer to skip GitHub:

```
npm install -g vercel
vercel login
vercel
```

Follow the prompts — Vercel will build and deploy your app and give you a live URL.

### Custom domain (optional)

If your church has a website like `gracechurch.org`, you can point a subdomain like `inventory.gracechurch.org` to your Vercel app. In Vercel's dashboard, go to your project → Settings → Domains → Add your domain and follow the DNS instructions.

---

## Step 5: Share It With Your Team

Once deployed, share the URL with your team! Here are some tips:

### Add to phone home screen (acts like an app)

**iPhone:**
1. Open the URL in Safari
2. Tap the Share button (square with arrow)
3. Tap "Add to Home Screen"
4. Tap "Add"

**Android:**
1. Open the URL in Chrome
2. Tap the three-dot menu
3. Tap "Add to Home screen"
4. Tap "Add"

### Who should have access

Since this is Phase 1 (no login required), anyone with the link can access the inventory. Share it with:
- Ministry leaders
- Facilities / maintenance team
- Office staff
- AV / tech team
- Anyone who checks out equipment

Each person should select their name from the "Signed in" dropdown in the header so their check-outs are properly tracked.

---

## Day-to-Day Usage Tips

- **Adding new team members:** Click the "+" next to the name dropdown in the header
- **Adding new equipment:** Click "+ Add Item" in the header
- **Checking out equipment:** Find the item → click "Check Out" → fill in who/why/when
- **Returning equipment:** Dashboard shows all checked-out items with a "Return" button
- **Supplies running low:** You'll see a red alert banner on the Dashboard when anything hits its minimum stock level
- **Reserving equipment:** Ministry leaders can request items in advance from the Reservations tab
- **Printing labels:** Go to "Print Labels" tab → click any item → print the label with QR code

---

## Troubleshooting

**"Connection Error" when loading the app**
→ Your Firebase config in `src/firebase.js` has a typo. Double-check each value matches what Firebase gave you.

**Changes aren't showing on other devices**
→ Firestore syncs in real time, but the other device needs to have the page open. If they refresh, they'll see the latest data.

**The app loads but shows no items**
→ This is normal on first load! The app seeds itself with your initial inventory from Nancy's spreadsheet. If you previously reset the data, it will repopulate.

**Want to start fresh**
→ Click the "Reset to Original Data" button at the bottom of the Dashboard tab.

---

## Phase 2: When You're Ready to Grow

When you want to add login/authentication or open this up for other churches:

1. **Add Firebase Authentication** — Enable Email/Password sign-in in Firebase Console → Authentication
2. **Update Firestore rules** — The `firestore.rules` file has Phase 2 rules commented out. Swap them in to require login.
3. **Add a registration flow** — Each church gets a unique CHURCH_ID and their data stays completely separate.

You're welcome to bring this project back to Claude anytime and I can help you build Phase 2!

---

## Project File Overview

Here's what each file does, in case you need to make changes:

```
church-inventory/
├── index.html              ← Main HTML page
├── package.json            ← Project dependencies
├── vite.config.js          ← Build tool config
├── firebase.json           ← Firebase hosting config
├── firestore.rules         ← Database security rules
├── public/
│   ├── manifest.json       ← PWA config (home screen icon)
│   └── favicon.svg         ← Browser tab icon
└── src/
    ├── main.jsx            ← App entry point
    ├── firebase.js         ← ⭐ YOUR FIREBASE CONFIG GOES HERE
    ├── useFirestore.js     ← Database sync logic
    ├── App.jsx             ← All the app UI and logic
    └── data/
        └── seedData.js     ← Initial inventory from spreadsheet
```

The most important file is `src/firebase.js` — that's the only one you need to edit to get started.
