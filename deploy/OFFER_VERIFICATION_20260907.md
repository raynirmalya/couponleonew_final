# Offer verification deployment — 7 September 2026

CouponLeo now separates automatic listing checks from evidence of an actual checkout test. Existing browsing, copying, merchant navigation, consent, authentication routes and SEO assets were preserved. No production coupon has been marked checkout tested by this release.

## Release

- Server: `165.22.201.252`; repository: `/root/code/couponleonew_final`.
- Source commits: `a848632` (verification layer and browser runner), `27833f9` (feed code checks), `11e8798` (code-check refinement and evidence storage reserve).
- Activated at `2026-09-07T15:20:45Z`.
- UI release: `/srv/couponleo-ui/releases/verification-20260907`.
- Previous UI: `/srv/couponleo-ui/releases/quality-20260907-analytics-consent`.
- Deployment state, source backups, scripts, test output and availability samples: `/root/backups/couponleo-verification-20260907`.

Both UI and API were first validated on separate loopback preview services. Nginx temporarily served those previews while the primary API and UI were restarted and checked. Existing Nginx workers drained before either set of services was stopped. The original Nginx configuration was restored, both primary services and Nginx are active, and previews were stopped. Eight paired public website/API availability samples returned HTTP 200 with no observed failures during the switch.

The existing timing-header fix remains enabled. FlexOffers and Impact verification tags, Google verification file, robots and sitemap assets remain available. The GA measurement ID is retained behind the existing optional analytics consent controls.

## Behavior and operation

- Automatic checks cover identity, supplied expiry, code presence/consistency, link format and conflicting percentage claims. They do not open merchant/affiliate links or establish code acceptance.
- A checkout-tested label requires a matching offer fingerprint, reviewed private evidence, reviewer attestation, country/conditions and a discount from the exact code on the same eligible cart. It lasts at most 24 hours and ends earlier at the supplied expiry. Merchant confirmation has a separate label and a maximum seven-day lifetime.
- Offer changes, stale results, later failures, revocations and missing/tampered evidence remove the claim. Unavailable verification storage withholds badges while shopping remains usable.
- Coupon dialogs request fresh verification on opening; the endpoint is read-only and returns `Cache-Control: no-store`. The displayed offer must match the review fingerprint. Visible badges expire automatically. Already-open cards do not continuously poll for administrative changes; reopening the dialog refreshes them.
- Evidence is private under `/var/lib/couponleo-verification` (directory 0700; database/evidence 0600). Successful evidence writes preserve at least 128 MiB of free disk. Public responses omit evidence paths, reviewer identity and private cart details. Production review count after deployment: **zero**.
- The optional browser runner captures cart observations and screenshots for a configured merchant. It does not publish reviews or place orders. Each real merchant needs a reviewed configuration and a human evidence review; no production merchant adapter is enabled by this release.

See [the operator guide](../api/dataservices/OFFER_VERIFICATION.md) for queue, candidate, evidence-import, revocation and browser-runner commands. No scheduled merchant testing is enabled.

## Validation

| Check | Result |
| --- | --- |
| Backend verification, routes, feed-quality and direct-store tests | 30 passed on the server |
| Relevant frontend verification/dialog/public-page/consent tests | 23 passed locally |
| Browser-runner tests | 2 passed, using only a local simulated merchant; scenarios include discount, rejection and blocked purchase operations |
| Production Vite build | Passed; existing static assets preserved |
| Preview browser checks | Passed at 390px and 1440px: store/category dialogs, pagination, country selection, sign-in/up, help/privacy and localized store routes |
| Consent regression checks | No optional requests before consent or after rejection; allow/withdraw behavior passed with analytics transport intercepted |
| Preview and live route checks | All 15 checks passed in each environment, including expected redirects and 404s, SSR offers and static verification/SEO assets |
| Live mobile dialogs | Lenovo and women's-clothing routes returned 200; five listing checks displayed; fresh verification requests returned 200/no-store; no page errors or horizontal overflow |
| Existing affiliate verification tags | Exact FlexOffers content and Impact value attributes preserved in live browser checks |

The automatic Lenovo sample at `2026-09-07T15:20:24Z` checked **37 offers / 185 checks: 184 passed and one failed**. Offer `67089479` mentions `LENOVOBUSINESSDEAL` in its title but has an empty coupon-code field. Its dialog correctly says “Listing needs review.” The source feed was not silently rewritten. This sample made **zero merchant requests and zero checkout tests**; passing listing checks do not mean the remaining codes work.

The existing standalone TypeScript check still reports TS7030 in `ui/src/server/middleware/canonical-routes.ts:9`; that unchanged baseline issue does not prevent the successful production build. Existing host-specific client canonical behavior was preserved. These checks do not establish Marketplace eligibility, merchant program approval, indexing improvements or real coupon redeemability.

All feature source changes are committed on the server. The existing runtime `api/dataservices/data/analytics-summary.json` remains outside source commits because it changes as the service runs.
