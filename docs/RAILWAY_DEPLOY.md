# Deploy backend to Railway

Step-by-step guide to deploy the AI Video Editing backend so testers can use the app.

---

## Prerequisites

- Code pushed to GitHub
- Supabase project (for auth)
- OpenAI API key

---

## Step 1: Create a Railway project

1. Go to [railway.app](https://railway.app) and sign in (GitHub is easiest).
2. Click **New Project**.
3. Choose **Deploy from GitHub repo**.
4. Select your **AI Video Editing** repository.
5. Railway creates a project and tries to deploy. It may fail at first—we'll fix that in Step 2.

---

## Step 2: Set the root directory

The backend lives in `server/`, not the repo root.

1. In your Railway project, click on the **service** (the box that represents your app).
2. Go to the **Settings** tab.
3. Under **Build**, find **Root Directory**.
4. Enter: `server` (no leading slash).
5. Click **Redeploy** or trigger a new deploy so it picks up the change.

---

## Step 3: Add environment variables

1. With your service selected, go to the **Variables** tab.
2. Add these variables (use **Add Variable** or **Bulk Add**):

| Variable | Value |
|----------|-------|
| `SUPABASE_URL` | Your Supabase URL (e.g. `https://wohmbobsuwgxluidfejp.supabase.co`) |
| `SUPABASE_JWT_SECRET` | From Supabase Dashboard → Project Settings → API → JWT Settings |
| `OPENAI_API_KEY` | Your OpenAI API key |

You can copy `SUPABASE_URL` and `SUPABASE_JWT_SECRET` from your local `server/.env`.

Railway will redeploy when you save variables.

---

## Step 4: Generate a public URL

1. With your service selected, go to the **Settings** tab.
2. Under **Networking**, click **Generate Domain**.
3. Railway assigns a URL like `https://ai-video-editing-server-production-xxxx.up.railway.app`.
4. Copy this URL—you'll need it for the app.

---

## Step 5: Verify deployment

1. Open your Railway URL in a browser.
2. Add `/health` to the end (e.g. `https://your-app.up.railway.app/health`).
3. You should see: `{"ok":true,"service":"ai-video-editing-api"}`.

If you see that, the backend is live.

---

## Step 6: Update the app for distribution

Before building an installer for testers:

1. Open `electron/config.js` in your project.
2. Replace `FALLBACK_API_URL` with your Railway URL:
   ```js
   const FALLBACK_API_URL = 'https://your-actual-railway-url.up.railway.app';
   ```
3. Run `npm run build:electron:full` to create the installer.

Distributed users will then connect to your Railway backend automatically.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Build fails / "No package.json" | Ensure Root Directory is set to `server`. |
| 500 on /api/generate-selects | Check `SUPABASE_JWT_SECRET` and `OPENAI_API_KEY` in Variables. |
| CORS errors | Backend uses `cors({ origin: true })`—should accept all origins. |
| App says "Cannot connect" | Ensure `FALLBACK_API_URL` in `electron/config.js` matches your Railway URL. |
