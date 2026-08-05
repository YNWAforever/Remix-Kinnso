# @kinnso/parity

Layer 1 **cutover parity gate** for KINNSO v3. Enumerates the published article set from Supabase
(anon, RLS-gated) and proves the live deploy serves every URL, redirect, sitemap entry, per-locale
count, and structured-data shape. Pure comparison engine (`src/checks/*` over injected source
adapters) + thin CLI (`src/bin.ts`). The engine's unit tests run in pre-merge `ci.yml`; the live run
runs in `verify.yml`.

## CLI

```bash
pnpm --filter @kinnso/parity parity -- \
  --base-url https://remix-kinnso-web.vercel.app \
  --supabase-url "$NEXT_PUBLIC_SUPABASE_URL" \
  --supabase-anon-key "$NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  [--legacy-sitemap <url>] \
  [--sample N] [--json] [--fail-fast]
```

Flags default to the env vars the web app uses (`BASE_URL`/`E2E_BASE_URL`,
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`). Exit codes: `0` pass, `1` parity fail,
`2` misconfiguration. `--json` emits the `ParityReport` for CI artifacts.

## Baseline modes

- **Default (this environment):** the expected baseline is the seed fixtures in
  `kinnso-v3/supabase/seed.sql`, encoded in `src/fixtures/baseline.ts`. The live deploy serves these.
- **`--legacy-sitemap <url>`:** baseline URL set = the legacy site's `/sitemap.xml` (cutover, no DB).
- **`--legacy-mysql <dsn>`: NOT IMPLEMENTED — the flag exits `2` with an error.** The baseline
  queries in `sources/legacy.ts` are still TODO, and an empty baseline makes every check vacuously
  true, so the mode would have exited `0` without proving anything. It fails loudly instead of
  certifying an unverified cutover. Implement the queries (published URL paths, per-locale
  `post_translations` counts) before this mode can gate anything.

## Production acceptance gate (master spec §10 — documented, NOT executed in this plan)

At real cutover, run with `--legacy-sitemap` (or `--legacy-mysql`, once its queries exist) against
the **legacy production URL** to assert: every legacy published URL still resolves (200 or intended
301), the new sitemap is a superset of the legacy sitemap, per-locale counts match legacy
`post_translations`, and a real redirect sample maps 1:1. Pair with a Google Search Console 2-week
index watch. These run in the deferred cutover plan, not here.
