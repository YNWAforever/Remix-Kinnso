# Environment and release rehearsal

Approved execution target: local project `kinnsoos-b1-20261002`, API `http://127.0.0.1:58421`, database container `supabase_db_kinnsoos-b1-20261002`, DB port 58422. New preview uses `http://127.0.0.1:3491/en`; private Studio cookie-separation preview uses `http://localhost:3492/en`. Both use the same local identity. These URLs are local previews, not cloud staging.

Private CI uses its existing Docker project `kinnso-v3` at `http://127.0.0.1:54421` only when CI=true and the actual container label matches. Tests fail closed when target URL/project/container disagree. No linked project is used for type generation. Generated private types are from the verified migration ledger, with SQL-default nullability recovered from that same local schema.

Pinned Supabase CLI 2.106.0 is retained. Its official release notes change implicit public Data API exposure to false; new feature grants are explicit. Do not infer a required CLI upgrade from the available-update banner. Release notes: https://github.com/supabase/cli/releases/tag/v2.106.0 . Current local database version/extensions and schema ledger are recorded in REHEARSAL.json after the guarded rebuild.

Rehearsal sequence: verify exact config project/API ports and Docker label; record existing schema; reset only the synthetic local target to private main migration head 20260823090000; push candidate append-only migrations; verify schema and direct privileges; clean reset the same target through all candidate migrations; regenerate private types; run public integration/browser plus private complete regression. Commands use the pinned CLI with explicit --local and --workdir. Remote db-url/--linked are prohibited by the rehearsal script. Original deployments and other Docker projects are untouched.

Cloud staging is BLOCKED: no approved project/deployment target, secret installation, verified redirect allowlist or reviewer/device environment provided. Missing variable map: public KINNSO_SUPABASE_URL/publishable key and approved identity origins; private existing Supabase public/server keys for that same staging project; public KINNSO_SERVICES_ORIGIN/approved service origin; private KINNSO_JOURNEYS_ORIGIN; per-host SITE_URL and callback allowlist; capability flags only after schema verification. Keys must be installed through provider controls, never PRs/evidence.

Rollback is app/flag based: disable write capabilities for the new app, keep private legacy metadata reads/actions available, restore the previous app build, and retain the added tables/history. Do not drop new data or reverse applied migrations as an app rollback. An isolated backup restore to a separately approved target remains a later/full-release gate; no production backup has been taken or restored here.

Before share enablement, configure platform log filtering for /share/:token and shared-media paths. Before media enablement, schedule authenticated private cleanupMedia, inspect candidate counts, and retry without acknowledging failed object deletion. Uploaded originals remain private; account/trip deletion queues object paths for the worker. Storage service credentials never enter the public app.

Candidate release remains PARTIAL until current-head CI, actual staging U01/U02, true author rights, iOS Safari, Android and screen-reader checks pass. Production operation remains NOT_RUN.
