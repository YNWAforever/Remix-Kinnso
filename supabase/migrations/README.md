# Supabase migrations — applied via MCP, **not** `supabase db push`

These migrations are applied to the live project (`scryfkefedzuetfdtrvl`) through the
Supabase **MCP `apply_migration`** tool, not `supabase db push`. Because of that, the
committed filename version prefixes here do **not** match the version strings recorded
in the live `schema_migrations` ledger, and the live ledger contains a few entries with
no standalone committed file (e.g. `creator_grants_revoke_anon`, folded into
`20260614000012_creator_grants.sql`, and a second `travelpayouts_partner_link_rpc`).

## Consequences

- **Do NOT run `supabase db push` against the live project.** `db push` keys off the
  version-timestamp prefix; it would treat every committed file as "not yet applied" and
  re-run `create table` / `create policy` DDL, which fails (already-exists / duplicate).
- The schema **content** matches live — every committed table/constraint/RLS/trigger has
  been verified identical to the live DB. A fresh `supabase db reset` reproduces the
  correct schema from this tree.
- To reconcile the committed tree with the live ledger (align versions, import the
  live-only migrations), use `supabase migration repair` **deliberately** — it is a
  separate ops task, out of scope for feature PRs.

## How to apply a new migration

Add the `.sql` file here (next free `YYYYMMDD…` prefix) **and** apply it to the live
project via the MCP `apply_migration` tool with a matching snake_case name. Keep the two
in sync — the committed file documents what is live.
