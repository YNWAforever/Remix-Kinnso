# Deploying the scan worker (`@kinnso/scan-app`) to Railway

The creator DNA scan worker is a **persistent Hono/Node server**: `POST /scan` returns
`202` immediately and then runs the fetch→LLM→DNA pipeline as fire-and-forget background
work. That background work makes it unsuitable for Vercel serverless (the function would be
frozen/killed after the response), so it runs on Railway as a long-lived container.

This directory ships everything Railway needs:

- [`Dockerfile`](./Dockerfile) — monorepo-root build via `turbo prune` (worker runs from TS source via `tsx`, no compile step).
- [`../railway.json`](../../railway.json) — points Railway at the Dockerfile, health-checks `/health`, restarts on failure.

## One-time setup

1. **Create the service** — Railway → *New Project* → *Deploy from GitHub repo* →
   `YNWAforever/Remix-Kinnso`. Leave the **Root Directory blank** (repo root) so the Docker
   build context includes the `@kinnso/*` workspace packages. Railway auto-detects
   `railway.json` and builds `apps/scan/Dockerfile`. Watch branch: `main`.

2. **Set environment variables** (Service → *Variables*). Do **not** set `PORT` — Railway
   injects it and the worker binds `0.0.0.0:$PORT`.

   | Variable | Value | Notes |
   |---|---|---|
   | `SUPABASE_URL` | `https://scryfkefedzuetfdtrvl.supabase.co` | public |
   | `SUPABASE_ANON_KEY` | *(anon key)* | public; used only to validate the caller's bearer token via `auth.getUser` |
   | `SUPABASE_SERVICE_ROLE_KEY` | *(service role key)* | **SECRET** — bypasses RLS for job/DNA writes; never expose client-side |
   | `RAPIDAPI_KEY` | *(RapidAPI key)* | **SECRET** — Instagram/Threads fetch |
   | `YOUTUBE_API_KEY` | *(YouTube Data API v3 key)* | **SECRET** |
   | `OPENROUTER_API_KEY` | *(OpenRouter key)* | **SECRET** — DNA synthesis LLM |
   | `OPENROUTER_MODEL` | `anthropic/claude-3.5-sonnet` | optional; this is the built-in default |
   | `WEB_ORIGIN` | `https://remix-kinnso-web.vercel.app` | locks CORS to the web app (defaults to `*` if unset) |

   Leave `SCAN_FIXTURE_MODE` **unset** in production (setting it to `1` swaps in fake
   fetch/LLM adapters — that's for CI/E2E only).

3. **Deploy** and grab the generated public URL (e.g.
   `https://remix-kinnso-scan-production.up.railway.app`). Confirm it's healthy:

   ```bash
   curl https://<your-railway-url>/health   # → {"ok":true}
   ```

## Wire the web app to the worker

The browser (`apps/web` `LiveProgress.tsx`) calls the worker cross-origin with a bearer
token, using `NEXT_PUBLIC_SCAN_URL`. Set it on the `remix-kinnso-web` Vercel project for
**Production + Preview**, then redeploy web (it's a `NEXT_PUBLIC_*` var, inlined at build time):

```bash
# from apps/web (linked to the remix-kinnso-web project)
printf 'https://<your-railway-url>' | vc env add NEXT_PUBLIC_SCAN_URL production
printf 'https://<your-railway-url>' | vc env add NEXT_PUBLIC_SCAN_URL preview
vc --prod                                  # or trigger a redeploy from the dashboard
```

Keep `WEB_ORIGIN` (on Railway) and `NEXT_PUBLIC_SCAN_URL` (on Vercel) in agreement: the
former is the web origin the worker trusts; the latter is the worker origin the web calls.
