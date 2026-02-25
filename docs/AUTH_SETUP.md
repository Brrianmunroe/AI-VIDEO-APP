# Auth setup (Supabase + backend)

The app uses **Supabase Auth** for sign-in. Follow these steps once.

---

## 1. Add env vars for the app

In `.env.local` at the project root, add:

```
VITE_SUPABASE_URL=https://wohmbobsuwgxluidfejp.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_YOUR_KEY_HERE
```

Replace `YOUR_KEY_HERE` with your publishable key from Supabase (Project Settings → API).

These must be prefixed with `VITE_` so Vite exposes them to the app.

---

## 2. Add env vars for the backend

In `server/.env` (create it from `server/.env.example`), add:

```
SUPABASE_URL=https://wohmbobsuwgxluidfejp.supabase.co
SUPABASE_JWT_SECRET=your-jwt-secret-from-supabase
```

To find the JWT secret: Supabase Dashboard → Project Settings → API → JWT Settings.

---

## 3. Create a test user

In Supabase Dashboard → Authentication → Users → **Add user**:

- Email: your test account email
- Password: choose a temporary password

Share this with testers if using a shared account.

---

## 4. Deploy backend to Railway

See [RAILWAY_DEPLOY.md](RAILWAY_DEPLOY.md) for step-by-step instructions.

When deployed, you get a URL like `https://your-app.up.railway.app`. Before building the packaged app for users:

1. Open `electron/config.js`
2. Replace `FALLBACK_API_URL` with your Railway URL (e.g. `https://ai-video-editing-api.up.railway.app`)
3. Run `npm run build:electron:full` to create the installer

Then distributed users will connect to your live backend.

---

## 6. Run the backend (required for Generate Selects)

The app uses the backend for Generate Selects when you're logged in. Start it before using that feature:

```bash
npm run server
```

Or from the server folder:

```bash
cd server
npm install
npm run dev
```

The API will be at `http://localhost:3001`. Health check: `GET /health`.

If you see "Port 3001 is already in use", another process has it. Free it with:
`lsof -ti:3001 | xargs kill -9`

---

## 7. Google Sign-in (optional)

To enable "Sign in with Google":

1. In Supabase: Authentication → Providers → enable Google.
2. Create OAuth credentials in Google Cloud Console.
3. Add Client ID and Secret to Supabase.

Note: In Electron, Google OAuth may open an external browser. Email/password works fully in-app.
