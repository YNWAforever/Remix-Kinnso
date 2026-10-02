# Whole-branch final review and rulings

Exactly one fresh read-only whole-branch reviewer (gpt-6-astra) assessed the committed source pair before the final fix pass. It raised two Critical and seven Important findings, no Minor findings. Its initial recommendation was not to ship. The executor completed the authorized fix pass and fresh verification; no second review or reviewer approval is claimed.

| Finding | Ruling and evidence |
|---|---|
| Captured revoked session could use legacy mutation RPCs | Fresh auth.sessions validation at SQL actor boundary, restrictive read policies. Real captured JWT cannot create/update/delete through legacy or v2 RPCs; private RED/GREEN + full suite. |
| Cross-tab logout retained old view or in-flight cache | Owner epoch invalidation, BroadcastChannel, identity checked inside IndexedDB transactions. Real two-tab A→logout→B with held A response cannot display or recache A; browser RED/GREEN. |
| Another offline command replaced an unresolved edit | One unresolved intent per trip; stable request/revision; different command blocked and input remains. Real offline/reload/retry persists the original edit once. |
| Null revision/version bypassed adoption checks | Non-null positive expected revision/version enforced; real RPC regression. |
| Suspended creator could withdraw | Fresh active creator authorization for publish and withdraw; real RPC regression. |
| Media reattachment escaped aggregate revision | stopId in media aggregate snapshot; concurrent attachments have one revision winner; real RPC regression. |
| Copied creator instructions disappeared | Separate sourceDescription and travellerNote; snapshot, browser display and downloaded JSON retain instructions. |
| Publishing transport error left controls busy | catch/finally retains content and stable request ID; DOM RED/GREEN and real commit-then-response-loss retry produces version1 once. |
| Event/performance evidence absent | Private first-party content-free events with replay/daily dedup, connected/ops context and eligible return visits. Real DB metrics regression; unthrottled local browser navigation samples retained. |

Additional final regression rulings: patched Sharp correctly refused an invalid hard-coded PNG. The fixture now generates a real PNG; production decoding remains strict. Multi-request integration tests retain 30-second bounded deadlines after 5-second contention failures. The failed full run and subsequent green run are both retained. Next/Sharp security patches were scoped to the reported dependencies; public npm audit is zero.

Additional test setup rulings: an existing status region is rendered empty before async feedback, so assertions now wait for the actual unchanged message. The new export assertion reads the existing versioned snapshot envelope. The first legacy subset mistakenly targeted the default unstarted port; the correct E2E_BASE_URL is explicit. Quality tests intentionally remove two R7 synthetic identities, so a guarded, atomic, idempotent fixture section restores them before browser checks. The whole seed is not reapplied because its article inserts are not idempotent. Two old merchant post redirect expectations contradicted unchanged authoritative main; tests now preserve anonymous307/apply behavior. Final legacy subset154 PASS/9 retained exceptions; final complete private tests execute with0 cached tasks.

Declined-to-judge items and resolutions: K17–K25 remain outside this batch; cross-host automatic SSO remains excluded and separate login is tested; offline scope is current-tab downloaded core text/JSON plus unsynced edits, with full offline reload/maps/photos unavailable; human author/cover rights, physical phones and screen reader remain external gates; cloud staging, scheduler/log redaction, backup/rollback and production remain unrun until a specific approved target is available. The executor supplies fresh complete test/performance evidence in EVIDENCE.json; that evidence is not attributed to the reviewer.

Instruction rulings: preserve the user's supplied pack/ledger/audit privately despite generic skill cleanup guidance. Private graph indexing was rejected by automatic approval review for source disclosure; use local private reads. Exporting local generated AGENTS.md/CLAUDE.md was separately rejected as unauthorized guidance distribution; both remain untracked and excluded. The archive honestly records dirty=true for those local files; every included path matches its committed canonical Git blob.
