# Approved integration boundary

Public KinnsoOS owns newly authored UI, minimal DTOs and a cookie-aware BFF. Private Remix-Kinnso owns business rules, SQL migrations, role checks, privileged media decoding and immutable revision ledgers. Every environment uses one approved identity/data origin shared by the two apps. Different hostnames require separate login; no automatic SSO is claimed. Local previews must use 127.0.0.1 for the new app and localhost for private Studio when testing cookie separation.

No private source, supplied implementation pack, full database types, audit or credentials belong in public distribution. Public source uses an explicit reviewed file manifest, per-file hashes and revision metadata. Source packaging rejects traversal, secrets and symlink escapes.

Auth/catalog require an approved backend. Trips/bookmarks/media/sharing require explicit flags and actual server acknowledgements. Demo is selected by /demo routes. Missing services return unavailable, never sample success. Booking/payment stay disabled. Existing private actions are retained rather than invoked as REST endpoints.

Trip commands lock the aggregate, validate expected revision, write atomically, mint one history entry and bind owner/request ID to a SHA-256 payload digest. Day/stop/note/media changes participate in the same boundary. Authenticated direct DML and column UPDATE grants are removed. Legacy metadata RPCs remain and are tested against the new aggregate.

Summary guides do not imply days/stops. Active creators explicitly author immutable versions; adoptions copy a published version and credit. Later source edits cannot overwrite private notes. Withdrawal prevents new adoption and marks existing source credit withdrawn. Imported local source credit is unverified. Unknown legacy photo MIME/size remain null and pending until a real upload is decoded.

Sharing is an explicit allowlisted snapshot, read only, at most seven days, with selected media. Tokens contain 32 random bytes; only hashes are stored, and tokens are returned once. Owner metadata enables revocation after reload. New requests after revocation/expiry/deletion fail closed. Already downloaded copies cannot be recalled. Platform access logs must redact token-bearing paths before cloud enablement.

Private media uses a private bucket and 10 MiB JPEG/PNG/WebP limit. The narrow private service-role exception is lib/media/service.ts: fresh network auth, fresh actor and owner/trip RLS checks precede actual download, MIME/checksum/EXIF and full pixel decode; service_role may only finalize validated media, serve a currently authorized share object, or drain cleanup candidates. Public code never receives service credentials. The cleanup worker must be scheduled by the environment owner; until configured, uploaded-object retention is an explicit gate.

Local snapshots/drafts are IndexedDB device copies, labeled unsynced without server acknowledgement. Account changes clear this app's account cache; logout does not remove original demo/guest data. Guest drafts have an explicit device identity and require import preview/confirmation after login. They do not prove a server-side adoption or author credit.

No migration reset targets an unknown remote. Production/main merge, DNS, live funds and production migration are outside this authorization. Cloud staging, real content rights, iOS/Android and screen-reader gates remain explicit.
