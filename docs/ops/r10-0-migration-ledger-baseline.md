# Migration ledger baseline (R10.0)

## Decision

Production's `supabase_migrations.schema_migrations` ledger is accepted as the baseline as of
R10.0. Divergence between local migration filenames and production ledger rows that predates
`20260805120400_creator_social_handle_format.sql` is recorded here and is **not** reconciled
retroactively. No shipped migration is edited and no ledger row is rewritten.

## Why

R7.0 Track C found local files and production history are not 1:1 (87 files / 91 rows / 17 exact
matches as of 2026-07-12). The cause is historical: some migrations were applied through the
Supabase MCP `apply_migration` tool, which stamps its own version, while the file on disk carries a
different timestamp. The *schema* agrees; the *ledger* does not.

Rewriting the ledger to match the files would mean asserting a history that did not happen, and a
mistaken repair drops or double-applies a migration on a database holding real bookings and real
creator rows. The schema is what the application depends on, and the schema is correct.

## The rule from R10.0 onward

1. Every new migration is a new timestamped file under `supabase/migrations/`, sorting strictly
   after the highest stamp already present.
2. Migrations are applied by exactly one route per environment. Never run a bare
   `supabase db push` against production — this repository's ledger drift makes its
   file-vs-ledger diff unreliable, and it may attempt to replay already-applied migrations.
   Use `supabase db query --linked -f <file>` for a single deliberate apply, or
   `supabase migration repair --status applied <version>` to record one that was applied
   out of band.
3. Local verification always runs against a clean local stack (`supabase db reset`), which
   replays every file in order and is the real regression check on migration ordering.
4. Type generation for a phase in flight uses `--local`, never `--linked`.

## Verification of this baseline

Before R10.0's migration is applied to production, an operator runs, and records the output in
the phase PR:

```bash
supabase migration list --linked
```

The expected reading: local-only entries are the new R10 files; remote-only entries are the
known pre-R10 drift described above. Any remote-only entry dated after
`20260805120400` is NOT known drift and blocks the apply until explained.
