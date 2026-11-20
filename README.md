# CHEMVERSE — Structure + AI (s2m studio)

Static website (Vite + React) hosted on GitHub Pages.

## Deploy
1. Upload the **contents** of this folder to the root of your GitHub repo (`index.html` and `package.json` must be at the top level, not inside a sub-folder).
2. **Settings → Pages → Build and deployment → Source = GitHub Actions** (NOT "Deploy from a branch").
3. Push to `main` (or `master`), or run **Actions → Deploy CHEMVERSE to GitHub Pages → Run workflow**.
4. Open the URL shown in the green `deploy` job.

## AI server
`public/chemo-config.json` → `apiUrl` must be your Chemo AI backend, and that backend's CORS must allow your Pages origin (`https://<username>.github.io`). Never put secret keys in this repo (publishable Supabase key only).

## Local
```bash
npm install
npm run dev
```
