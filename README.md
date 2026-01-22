# Google-Trends-HTML — Serverless publish & secure PAT

This repository contains a small admin generator for Google Trends embed pages.

Changes included in this patch:
- admin.html updated to support server-side publishing and produce consistent filenames `keyword_country_period.html`.
- Serverless function implementations added:
  - Vercel: `api/publish.js`
  - Netlify: `netlify/functions/publish.js`
- Optional ISO mapper helper: `iso-map.js`

Recommended deployment (Vercel — easiest / recommended)
1. Push the branch to GitHub (see commands below).
2. Deploy to Vercel (import repository). In Project Settings, set Environment Variable:
   - Name: `GITHUB_TOKEN`
   - Value: a fine-grained PAT or an installation token with permission to update repository contents (repo:contents or specific repo write permission).
3. The admin page calls `/api/publish` by default. If your admin.html is served from a different origin (e.g., GitHub Pages), set the endpoint in admin.html to your deployed function URL (e.g., `https://your-app.vercel.app/api/publish`).

Alternative: Netlify
- Deploy and set `GITHUB_TOKEN` in Site settings → Build & deploy → Environment.

Security recommendations
- Don’t store sensitive tokens in browser localStorage in production.
- Use least privilege tokens (fine-grained PATs or GitHub App installation tokens).
- Rotate tokens regularly.
- Prefer GitHub App or server-side short-lived tokens if possible.

How to test locally
- Option A (quick): Use direct mode in admin.html, paste a short-lived PAT, and publish (not recommended for production).
- Option B (recommended): Deploy the serverless function to Vercel/Netlify with `GITHUB_TOKEN`, then use admin.html in server mode to publish.
