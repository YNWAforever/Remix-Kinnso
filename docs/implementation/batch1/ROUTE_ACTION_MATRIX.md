# Route/action ownership and permission sources

Complete route file inventory + TypeScript AST module/inline server actions; static owner/evidence mapping, not blanket per-route UAT. Each existing private route/action retains its authoritative module/domain. The new app owns UI/BFF and delegates business checks to private services. Every route is inventoried; NOT_RUN_PER_ROUTE explicitly does not mean a browser pass.

| Repo | Route | Actor hint | Decision | Owner | Permission source | Observed guards |
|---|---|---|---|---|---|---|
| public | /[locale]/[[...route]] | public | LOCAL_ROUTE_REVIEW_REQUIRED | KinnsoOS newly authored UI/BFF | app/[locale]/[[...route]]/page.tsx | delegated/domain-specific; see module |
| public | /[locale]/sign-in | traveller | LOCAL_ROUTE_REVIEW_REQUIRED | KinnsoOS newly authored UI/BFF | app/[locale]/sign-in/page.tsx | delegated/domain-specific; see module |
| public | /api/bookmarks | traveller | BFF_LOCAL_CONNECTED | KinnsoOS newly authored UI/BFF | app/api/bookmarks/route.ts | delegated/domain-specific; see module |
| public | /api/catalog | public | BFF_LOCAL_CONNECTED | KinnsoOS newly authored UI/BFF | app/api/catalog/route.ts | delegated/domain-specific; see module |
| public | /api/guides/[id] | public | BFF_LOCAL_CONNECTED | KinnsoOS newly authored UI/BFF | app/api/guides/[id]/route.ts | delegated/domain-specific; see module |
| public | /api/media/[id] | traveller | BFF_LOCAL_CONNECTED | KinnsoOS newly authored UI/BFF | app/api/media/[id]/route.ts | delegated/domain-specific; see module |
| public | /api/media/finalize | traveller | BFF_LOCAL_CONNECTED | KinnsoOS newly authored UI/BFF | app/api/media/finalize/route.ts | delegated/domain-specific; see module |
| public | /api/media | traveller | BFF_LOCAL_CONNECTED | KinnsoOS newly authored UI/BFF | app/api/media/route.ts | delegated/domain-specific; see module |
| public | /api/return-visit | public | BFF_LOCAL_CONNECTED | KinnsoOS newly authored UI/BFF | app/api/return-visit/route.ts | delegated/domain-specific; see module |
| public | /api/session | public | BFF_LOCAL_CONNECTED | KinnsoOS newly authored UI/BFF | app/api/session/route.ts | delegated/domain-specific; see module |
| public | /api/shared-media/[token]/[id] | public | BFF_LOCAL_CONNECTED | KinnsoOS newly authored UI/BFF | app/api/shared-media/[token]/[id]/route.ts | delegated/domain-specific; see module |
| public | /api/shares/[id] | traveller | BFF_LOCAL_CONNECTED | KinnsoOS newly authored UI/BFF | app/api/shares/[id]/route.ts | delegated/domain-specific; see module |
| public | /api/shares | traveller | BFF_LOCAL_CONNECTED | KinnsoOS newly authored UI/BFF | app/api/shares/route.ts | delegated/domain-specific; see module |
| public | /api/trips/[id]/adopt | traveller | BFF_LOCAL_CONNECTED | KinnsoOS newly authored UI/BFF | app/api/trips/[id]/adopt/route.ts | delegated/domain-specific; see module |
| public | /api/trips/[id]/commands | traveller | BFF_LOCAL_CONNECTED | KinnsoOS newly authored UI/BFF | app/api/trips/[id]/commands/route.ts | delegated/domain-specific; see module |
| public | /api/trips/[id]/facts | traveller | BFF_LOCAL_CONNECTED | KinnsoOS newly authored UI/BFF | app/api/trips/[id]/facts/route.ts | delegated/domain-specific; see module |
| public | /api/trips/[id]/reports | traveller | BFF_LOCAL_CONNECTED | KinnsoOS newly authored UI/BFF | app/api/trips/[id]/reports/route.ts | delegated/domain-specific; see module |
| public | /api/trips/[id] | traveller | BFF_LOCAL_CONNECTED | KinnsoOS newly authored UI/BFF | app/api/trips/[id]/route.ts | delegated/domain-specific; see module |
| public | /api/trips/import | traveller | BFF_LOCAL_CONNECTED | KinnsoOS newly authored UI/BFF | app/api/trips/import/route.ts | delegated/domain-specific; see module |
| public | /api/trips | traveller | BFF_LOCAL_CONNECTED | KinnsoOS newly authored UI/BFF | app/api/trips/route.ts | delegated/domain-specific; see module |
| public | /auth/callback | traveller | LOCAL_ROUTE_REVIEW_REQUIRED | KinnsoOS newly authored UI/BFF | app/auth/callback/route.ts | delegated/domain-specific; see module |
| public | /. | public | LOCAL_ROUTE_REVIEW_REQUIRED | KinnsoOS newly authored UI/BFF | app/page.tsx | delegated/domain-specific; see module |
| public | /share/[token] | public | LOCAL_ROUTE_REVIEW_REQUIRED | KinnsoOS newly authored UI/BFF | app/share/[token]/page.tsx | delegated/domain-specific; see module |
| private | /[locale]/about | public | RETAIN_PRIVATE | Remix-Kinnso existing route/domain | apps/web/app/[locale]/about/page.tsx | delegated/domain-specific; see module |
| private | /[locale]/admin/analytics | ops | RETAIN_PRIVATE | Remix-Kinnso existing route/domain | apps/web/app/[locale]/admin/analytics/page.tsx | requireOpsPage |
| private | /[locale]/admin/bookings | ops | RETAIN_PRIVATE | Remix-Kinnso existing route/domain | apps/web/app/[locale]/admin/bookings/page.tsx | requireOpsPage |
| private | /[locale]/admin/creators/[creatorId] | ops | RETAIN_PRIVATE | Remix-Kinnso existing route/domain | apps/web/app/[locale]/admin/creators/[creatorId]/page.tsx | requireOpsPage |
| private | /[locale]/admin/creators/directory | ops | RETAIN_PRIVATE | Remix-Kinnso existing route/domain | apps/web/app/[locale]/admin/creators/directory/page.tsx | requireOpsPage |
| private | /[locale]/admin/creators | ops | RETAIN_PRIVATE | Remix-Kinnso existing route/domain | apps/web/app/[locale]/admin/creators/page.tsx | requireOpsPage |
| private | /[locale]/admin/creators/payouts | ops | RETAIN_PRIVATE | Remix-Kinnso existing route/domain | apps/web/app/[locale]/admin/creators/payouts/page.tsx | requireOpsPage |
| private | /[locale]/admin/enquiries | ops | RETAIN_PRIVATE | Remix-Kinnso existing route/domain | apps/web/app/[locale]/admin/enquiries/page.tsx | requireOpsPage |
| private | /[locale]/admin/merchants/[merchantId] | ops | RETAIN_PRIVATE | Remix-Kinnso existing route/domain | apps/web/app/[locale]/admin/merchants/[merchantId]/page.tsx | requireOpsPage |
| private | /[locale]/admin/merchants/applications | ops | RETAIN_PRIVATE | Remix-Kinnso existing route/domain | apps/web/app/[locale]/admin/merchants/applications/page.tsx | requireOpsPage |
| private | /[locale]/admin/merchants/directory | ops | RETAIN_PRIVATE | Remix-Kinnso existing route/domain | apps/web/app/[locale]/admin/merchants/directory/page.tsx | requireOpsPage |
| private | /[locale]/admin/merchants | ops | RETAIN_PRIVATE | Remix-Kinnso existing route/domain | apps/web/app/[locale]/admin/merchants/page.tsx | requireOpsPage |
| private | /[locale]/admin/missions/[missionId] | ops | RETAIN_PRIVATE | Remix-Kinnso existing route/domain | apps/web/app/[locale]/admin/missions/[missionId]/page.tsx | requireOpsPage |
| private | /[locale]/admin/missions | ops | RETAIN_PRIVATE | Remix-Kinnso existing route/domain | apps/web/app/[locale]/admin/missions/page.tsx | requireOpsPage |
| private | /[locale]/admin/missions/review | ops | RETAIN_PRIVATE | Remix-Kinnso existing route/domain | apps/web/app/[locale]/admin/missions/review/page.tsx | requireOpsPage |
| private | /[locale]/admin | ops | RETAIN_PRIVATE | Remix-Kinnso existing route/domain | apps/web/app/[locale]/admin/page.tsx | requireOpsPage |
| private | /[locale]/admin/perks | ops | RETAIN_PRIVATE | Remix-Kinnso existing route/domain | apps/web/app/[locale]/admin/perks/page.tsx | requireOpsPage |
| private | /[locale]/admin/sessions | ops | RETAIN_PRIVATE | Remix-Kinnso existing route/domain | apps/web/app/[locale]/admin/sessions/page.tsx | requireOpsPage |
| private | /[locale]/admin/team/directory | ops | RETAIN_PRIVATE | Remix-Kinnso existing route/domain | apps/web/app/[locale]/admin/team/directory/page.tsx | requireOpsPage |
| private | /[locale]/admin/team | ops | RETAIN_PRIVATE | Remix-Kinnso existing route/domain | apps/web/app/[locale]/admin/team/page.tsx | requireOpsPage |
| private | /[locale]/admin/testimonials | ops | RETAIN_PRIVATE | Remix-Kinnso existing route/domain | apps/web/app/[locale]/admin/testimonials/page.tsx | requireOpsPage |
| private | /[locale]/admin/users | ops | RETAIN_PRIVATE | Remix-Kinnso existing route/domain | apps/web/app/[locale]/admin/users/page.tsx | requireOpsPage |
| private | /[locale]/agent | public | RETAIN_PRIVATE | Remix-Kinnso existing route/domain | apps/web/app/[locale]/agent/page.tsx | delegated/domain-specific; see module |
| private | /[locale]/articles/[category]/[url] | public | RETAIN_PRIVATE | Remix-Kinnso existing route/domain | apps/web/app/[locale]/articles/[category]/[url]/page.tsx | delegated/domain-specific; see module |
| private | /[locale]/articles/[category] | public | RETAIN_PRIVATE | Remix-Kinnso existing route/domain | apps/web/app/[locale]/articles/[category]/page.tsx | delegated/domain-specific; see module |
| private | /[locale]/articles | public | RETAIN_PRIVATE | Remix-Kinnso existing route/domain | apps/web/app/[locale]/articles/page.tsx | delegated/domain-specific; see module |
| private | /[locale]/auth/callback | traveller | RETAIN_PRIVATE | Remix-Kinnso existing route/domain | apps/web/app/[locale]/auth/callback/route.ts | delegated/domain-specific; see module |
| private | /[locale]/auth/reset-password | traveller | RETAIN_PRIVATE | Remix-Kinnso existing route/domain | apps/web/app/[locale]/auth/reset-password/page.tsx | delegated/domain-specific; see module |
| private | /[locale]/auth/sign-out | traveller | RETAIN_PRIVATE | Remix-Kinnso existing route/domain | apps/web/app/[locale]/auth/sign-out/route.ts | delegated/domain-specific; see module |
| private | /[locale]/c/[handle] | public | RETAIN_PRIVATE | Remix-Kinnso existing route/domain | apps/web/app/[locale]/c/[handle]/page.tsx | delegated/domain-specific; see module |
| private | /[locale]/contact | public | RETAIN_PRIVATE | Remix-Kinnso existing route/domain | apps/web/app/[locale]/contact/page.tsx | delegated/domain-specific; see module |
| private | /[locale]/creator | public | RETAIN_PRIVATE | Remix-Kinnso existing route/domain | apps/web/app/[locale]/creator/page.tsx | delegated/domain-specific; see module |
| private | /[locale]/creators/apply | public | RETAIN_PRIVATE | Remix-Kinnso existing route/domain | apps/web/app/[locale]/creators/apply/page.tsx | delegated/domain-specific; see module |
| private | /[locale]/creators | public | RETAIN_PRIVATE | Remix-Kinnso existing route/domain | apps/web/app/[locale]/creators/page.tsx | delegated/domain-specific; see module |
| private | /[locale]/destinations/[slug] | public | RETAIN_PRIVATE | Remix-Kinnso existing route/domain | apps/web/app/[locale]/destinations/[slug]/page.tsx | delegated/domain-specific; see module |
| private | /[locale]/destinations | public | RETAIN_PRIVATE | Remix-Kinnso existing route/domain | apps/web/app/[locale]/destinations/page.tsx | delegated/domain-specific; see module |
| private | /[locale]/experiences/[slug]/booked | public | RETAIN_PRIVATE | Remix-Kinnso existing route/domain | apps/web/app/[locale]/experiences/[slug]/booked/page.tsx | delegated/domain-specific; see module |
| private | /[locale]/experiences/[slug] | public | RETAIN_PRIVATE | Remix-Kinnso existing route/domain | apps/web/app/[locale]/experiences/[slug]/page.tsx | delegated/domain-specific; see module |
| private | /[locale]/explore | public | RETAIN_PRIVATE | Remix-Kinnso existing route/domain | apps/web/app/[locale]/explore/page.tsx | delegated/domain-specific; see module |
| private | /[locale]/feed | public | RETAIN_PRIVATE | Remix-Kinnso existing route/domain | apps/web/app/[locale]/feed/page.tsx | delegated/domain-specific; see module |
| private | /[locale]/for-creators | public | RETAIN_PRIVATE | Remix-Kinnso existing route/domain | apps/web/app/[locale]/for-creators/page.tsx | delegated/domain-specific; see module |
| private | /[locale]/for-merchants | public | RETAIN_PRIVATE | Remix-Kinnso existing route/domain | apps/web/app/[locale]/for-merchants/page.tsx | delegated/domain-specific; see module |
| private | /[locale]/forgot-password | public | RETAIN_PRIVATE | Remix-Kinnso existing route/domain | apps/web/app/[locale]/forgot-password/page.tsx | delegated/domain-specific; see module |
| private | /[locale]/g/[slug] | public | RETAIN_PRIVATE | Remix-Kinnso existing route/domain | apps/web/app/[locale]/g/[slug]/page.tsx | delegated/domain-specific; see module |
| private | /[locale]/legal/creator-terms | public | RETAIN_PRIVATE | Remix-Kinnso existing route/domain | apps/web/app/[locale]/legal/creator-terms/page.tsx | delegated/domain-specific; see module |
| private | /[locale]/m/[slug] | public | RETAIN_PRIVATE | Remix-Kinnso existing route/domain | apps/web/app/[locale]/m/[slug]/page.tsx | delegated/domain-specific; see module |
| private | /[locale]/merchants/apply | merchant | RETAIN_PRIVATE | Remix-Kinnso existing route/domain | apps/web/app/[locale]/merchants/apply/page.tsx | delegated/domain-specific; see module |
| private | /[locale]/merchants/creators | merchant | RETAIN_PRIVATE | Remix-Kinnso existing route/domain | apps/web/app/[locale]/merchants/creators/page.tsx | delegated/domain-specific; see module |
| private | /[locale]/merchants/dashboard/bookings | merchant | RETAIN_PRIVATE | Remix-Kinnso existing route/domain | apps/web/app/[locale]/merchants/dashboard/bookings/page.tsx | requireMerchantPage |
| private | /[locale]/merchants/dashboard/budget | merchant | RETAIN_PRIVATE | Remix-Kinnso existing route/domain | apps/web/app/[locale]/merchants/dashboard/budget/page.tsx | requireMerchantPage |
| private | /[locale]/merchants/dashboard/creators | merchant | RETAIN_PRIVATE | Remix-Kinnso existing route/domain | apps/web/app/[locale]/merchants/dashboard/creators/page.tsx | requireMerchantPage |
| private | /[locale]/merchants/dashboard/experiences/[experienceId]/availability | merchant | RETAIN_PRIVATE | Remix-Kinnso existing route/domain | apps/web/app/[locale]/merchants/dashboard/experiences/[experienceId]/availability/page.tsx | requireMerchantPage |
| private | /[locale]/merchants/dashboard/experiences/[experienceId]/edit | merchant | RETAIN_PRIVATE | Remix-Kinnso existing route/domain | apps/web/app/[locale]/merchants/dashboard/experiences/[experienceId]/edit/page.tsx | requireMerchantPage |
| private | /[locale]/merchants/dashboard/experiences/new | merchant | RETAIN_PRIVATE | Remix-Kinnso existing route/domain | apps/web/app/[locale]/merchants/dashboard/experiences/new/page.tsx | requireMerchantPage |
| private | /[locale]/merchants/dashboard/experiences | merchant | RETAIN_PRIVATE | Remix-Kinnso existing route/domain | apps/web/app/[locale]/merchants/dashboard/experiences/page.tsx | requireMerchantPage |
| private | /[locale]/merchants/dashboard/insights | merchant | RETAIN_PRIVATE | Remix-Kinnso existing route/domain | apps/web/app/[locale]/merchants/dashboard/insights/page.tsx | requireMerchantPage |
| private | /[locale]/merchants/dashboard/missions/[missionId] | merchant | RETAIN_PRIVATE | Remix-Kinnso existing route/domain | apps/web/app/[locale]/merchants/dashboard/missions/[missionId]/page.tsx | requireMerchantPage |
| private | /[locale]/merchants/dashboard/missions | merchant | RETAIN_PRIVATE | Remix-Kinnso existing route/domain | apps/web/app/[locale]/merchants/dashboard/missions/page.tsx | requireMerchantPage |
| private | /[locale]/merchants/dashboard/offers | merchant | RETAIN_PRIVATE | Remix-Kinnso existing route/domain | apps/web/app/[locale]/merchants/dashboard/offers/page.tsx | requireMerchantPage |
| private | /[locale]/merchants/dashboard | merchant | RETAIN_PRIVATE | Remix-Kinnso existing route/domain | apps/web/app/[locale]/merchants/dashboard/page.tsx | requireMerchantPage |
| private | /[locale]/merchants/dashboard/post | merchant | RETAIN_PRIVATE | Remix-Kinnso existing route/domain | apps/web/app/[locale]/merchants/dashboard/post/page.tsx | requireMerchantPage |
| private | /[locale]/merchants/dashboard/profile | merchant | RETAIN_PRIVATE | Remix-Kinnso existing route/domain | apps/web/app/[locale]/merchants/dashboard/profile/page.tsx | requireMerchantPage |
| private | /[locale]/merchants/dashboard/redeem | merchant | RETAIN_PRIVATE | Remix-Kinnso existing route/domain | apps/web/app/[locale]/merchants/dashboard/redeem/page.tsx | requireMerchantPage |
| private | /[locale]/merchants/insights | merchant | RETAIN_PRIVATE | Remix-Kinnso existing route/domain | apps/web/app/[locale]/merchants/insights/page.tsx | delegated/domain-specific; see module |
| private | /[locale]/merchants/missions/[missionId] | merchant | RETAIN_PRIVATE | Remix-Kinnso existing route/domain | apps/web/app/[locale]/merchants/missions/[missionId]/page.tsx | delegated/domain-specific; see module |
| private | /[locale]/merchants/missions | merchant | RETAIN_PRIVATE | Remix-Kinnso existing route/domain | apps/web/app/[locale]/merchants/missions/page.tsx | delegated/domain-specific; see module |
| private | /[locale]/merchants | merchant | RETAIN_PRIVATE | Remix-Kinnso existing route/domain | apps/web/app/[locale]/merchants/page.tsx | delegated/domain-specific; see module |
| private | /[locale]/merchants/post | merchant | RETAIN_PRIVATE | Remix-Kinnso existing route/domain | apps/web/app/[locale]/merchants/post/page.tsx | delegated/domain-specific; see module |
| private | /[locale]/offers/[claimId] | public | RETAIN_PRIVATE | Remix-Kinnso existing route/domain | apps/web/app/[locale]/offers/[claimId]/page.tsx | requireTravelerAction |
| private | /[locale]/ops/accept-invite | ops | RETAIN_PRIVATE | Remix-Kinnso existing route/domain | apps/web/app/[locale]/ops/accept-invite/page.tsx | delegated/domain-specific; see module |
| private | /[locale]/ops/place-reports | ops | RETAIN_PRIVATE | Remix-Kinnso existing route/domain | apps/web/app/[locale]/ops/place-reports/page.tsx | requireOpsPage |
| private | /[locale]/ops/settlements | ops | RETAIN_PRIVATE | Remix-Kinnso existing route/domain | apps/web/app/[locale]/ops/settlements/page.tsx | delegated/domain-specific; see module |
| private | /[locale] | public | RETAIN_PRIVATE | Remix-Kinnso existing route/domain | apps/web/app/[locale]/page.tsx | delegated/domain-specific; see module |
| private | /[locale]/sessions/[slug] | public | RETAIN_PRIVATE | Remix-Kinnso existing route/domain | apps/web/app/[locale]/sessions/[slug]/page.tsx | delegated/domain-specific; see module |
| private | /[locale]/sessions | public | RETAIN_PRIVATE | Remix-Kinnso existing route/domain | apps/web/app/[locale]/sessions/page.tsx | delegated/domain-specific; see module |
| private | /[locale]/sign-in | traveller | RETAIN_PRIVATE | Remix-Kinnso existing route/domain | apps/web/app/[locale]/sign-in/page.tsx | delegated/domain-specific; see module |
| private | /[locale]/sign-up | traveller | RETAIN_PRIVATE | Remix-Kinnso existing route/domain | apps/web/app/[locale]/sign-up/page.tsx | delegated/domain-specific; see module |
| private | /[locale]/studio/copilot | creator | RETAIN_PRIVATE | Remix-Kinnso existing route/domain | apps/web/app/[locale]/studio/copilot/page.tsx | requireCreatorPage |
| private | /[locale]/studio/earnings | creator | RETAIN_PRIVATE | Remix-Kinnso existing route/domain | apps/web/app/[locale]/studio/earnings/page.tsx | requireCreatorPage |
| private | /[locale]/studio/guides/[id]/edit | creator | RETAIN_PRIVATE | Remix-Kinnso existing route/domain | apps/web/app/[locale]/studio/guides/[id]/edit/page.tsx | requireCreatorPage |
| private | /[locale]/studio/guides/new | creator | RETAIN_PRIVATE | Remix-Kinnso existing route/domain | apps/web/app/[locale]/studio/guides/new/page.tsx | requireCreatorPage |
| private | /[locale]/studio/guides | creator | RETAIN_PRIVATE | Remix-Kinnso existing route/domain | apps/web/app/[locale]/studio/guides/page.tsx | requireCreatorPage |
| private | /[locale]/studio/inbox | creator | RETAIN_PRIVATE | Remix-Kinnso existing route/domain | apps/web/app/[locale]/studio/inbox/page.tsx | requireCreatorPage |
| private | /[locale]/studio/insights | creator | RETAIN_PRIVATE | Remix-Kinnso existing route/domain | apps/web/app/[locale]/studio/insights/page.tsx | requireCreatorPage |
| private | /[locale]/studio/missions/[id] | creator | RETAIN_PRIVATE | Remix-Kinnso existing route/domain | apps/web/app/[locale]/studio/missions/[id]/page.tsx | requireCreatorPage |
| private | /[locale]/studio/missions | creator | RETAIN_PRIVATE | Remix-Kinnso existing route/domain | apps/web/app/[locale]/studio/missions/page.tsx | requireCreatorPage |
| private | /[locale]/studio/offers | creator | RETAIN_PRIVATE | Remix-Kinnso existing route/domain | apps/web/app/[locale]/studio/offers/page.tsx | requireCreatorPage |
| private | /[locale]/studio | creator | RETAIN_PRIVATE | Remix-Kinnso existing route/domain | apps/web/app/[locale]/studio/page.tsx | delegated/domain-specific; see module |
| private | /[locale]/studio/perks | creator | RETAIN_PRIVATE | Remix-Kinnso existing route/domain | apps/web/app/[locale]/studio/perks/page.tsx | requireCreatorPage |
| private | /[locale]/studio/scan | creator | RETAIN_PRIVATE | Remix-Kinnso existing route/domain | apps/web/app/[locale]/studio/scan/page.tsx | delegated/domain-specific; see module |
| private | /[locale]/studio/sessions/[id]/edit | creator | RETAIN_PRIVATE | Remix-Kinnso existing route/domain | apps/web/app/[locale]/studio/sessions/[id]/edit/page.tsx | requireCreatorPage |
| private | /[locale]/studio/sessions/new | creator | RETAIN_PRIVATE | Remix-Kinnso existing route/domain | apps/web/app/[locale]/studio/sessions/new/page.tsx | requireCreatorPage |
| private | /[locale]/studio/sessions | creator | RETAIN_PRIVATE | Remix-Kinnso existing route/domain | apps/web/app/[locale]/studio/sessions/page.tsx | requireCreatorPage |
| private | /[locale]/studio/tier | creator | RETAIN_PRIVATE | Remix-Kinnso existing route/domain | apps/web/app/[locale]/studio/tier/page.tsx | requireCreatorPage |
| private | /[locale]/trips | traveller | RETAIN_PRIVATE | Remix-Kinnso existing route/domain | apps/web/app/[locale]/trips/page.tsx | delegated/domain-specific; see module |
| private | /api/admin/analytics | ops | RETAIN_PRIVATE | Remix-Kinnso existing route/domain | apps/web/app/api/admin/analytics/route.ts | delegated/domain-specific; see module |
| private | /api/agent | public | RETAIN_PRIVATE | Remix-Kinnso existing route/domain | apps/web/app/api/agent/route.ts | delegated/domain-specific; see module |
| private | /api/analytics | public | RETAIN_PRIVATE | Remix-Kinnso existing route/domain | apps/web/app/api/analytics/route.ts | delegated/domain-specific; see module |
| private | /api/copilot | public | RETAIN_PRIVATE | Remix-Kinnso existing route/domain | apps/web/app/api/copilot/route.ts | delegated/domain-specific; see module |
| private | /api/cron/traveller-analytics-retention | public | RETAIN_PRIVATE | Remix-Kinnso existing route/domain | apps/web/app/api/cron/traveller-analytics-retention/route.ts | delegated/domain-specific; see module |
| private | /api/cron/travelpayouts-sync | public | RETAIN_PRIVATE | Remix-Kinnso existing route/domain | apps/web/app/api/cron/travelpayouts-sync/route.ts | delegated/domain-specific; see module |
| private | /api/health | public | RETAIN_PRIVATE | Remix-Kinnso existing route/domain | apps/web/app/api/health/route.ts | delegated/domain-specific; see module |
| private | /api/kinnso/media/finalize | traveller | RETAIN_PRIVATE | Remix-Kinnso existing route/domain | apps/web/app/api/kinnso/media/finalize/route.ts | delegated/domain-specific; see module |
| private | /api/kinnso/shared-media/[token]/[id] | public | RETAIN_PRIVATE | Remix-Kinnso existing route/domain | apps/web/app/api/kinnso/shared-media/[token]/[id]/route.ts | delegated/domain-specific; see module |
| private | /api/revalidate | public | RETAIN_PRIVATE | Remix-Kinnso existing route/domain | apps/web/app/api/revalidate/route.ts | delegated/domain-specific; see module |
| private | /api/stripe/webhook | public | RETAIN_PRIVATE | Remix-Kinnso existing route/domain | apps/web/app/api/stripe/webhook/route.ts | delegated/domain-specific; see module |
| private | /. | public | RETAIN_PRIVATE | Remix-Kinnso existing route/domain | apps/web/app/page.tsx | delegated/domain-specific; see module |

Server actions (including inline directives) and workflow inventory are in ROUTE_ACTION_INVENTORY.json. No client role label authorizes a write; individual runtime coverage remains recorded in EVIDENCE.json.
