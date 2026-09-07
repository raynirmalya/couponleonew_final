CouponLeo website readiness fixes — September 7, 2026

Application commit: e7cdbd32d7573a6a7308721247f6fb6596c053db.
Deployed at 2026-09-07 14:29:27 UTC on 165.22.201.252.
Live release: /srv/couponleo-ui/releases/quality-20260907-analytics-consent.
Previous release retained: /srv/couponleo-ui/releases/impact-20260907-134057.
Backup and deployment evidence: /root/backups/couponleo-quality-20260907.

The site previously made blanket claims that coupons were tested or verified and promised exclusive member offers without supporting evidence. Google Analytics and CouponLeo browser telemetry also initialized before a privacy choice. These changes address those website behaviors; the Impact agreement and generic decline message do not identify the specific reason this account was declined.

Changes

- Replace unsupported verification and exclusivity copy in the footer, account pages, fallback metadata, and other affected catalog descriptions. Existing translation keys and account behavior are preserved; explicit English, Spanish, French, German, and Italian claims were corrected.
- Show an affiliate commission disclosure above page content and beside merchant links in coupon dialogs. Keep sponsored link attributes and require the existing user action before navigating to a merchant.
- Explain feed sourcing, untested checkout validity, merchant restrictions, commissions, and offer/content-rights correction requests at /help-center#offers-and-affiliate-links.
- Keep Google Analytics, CouponLeo usage telemetry, and browser IP-location requests off until the visitor allows analytics. Provide equally accessible reject/allow controls and a footer control to change the choice. Persist the choice, cancel pending telemetry and location work on withdrawal, and clear optional identifiers, queues, location cache, and accessible Google Analytics cookies without clearing account or saved-item state.
- Omit account email and URL query strings from new CouponLeo website telemetry events and redact sensitive metadata. The privacy page describes the optional website behavior and distinguishes the browser extension, which was not changed.
- Preserve the Google measurement ID G-HM2CS6185Y, FlexOffers verification meta tag, Impact verification meta tag including its value attribute, Google verification file, static sitemaps, Nitro timing controls, and Nginx header buffers.

Validation

- 22 tests passed across six relevant test files: consent/telemetry, coupon dialog, public pages, sign-in, sign-up, and localization. Six new privacy tests cover default rejection, persistence, opt-in, email/query redaction, cancellation, late location results, storage failures, and server rendering.
- Production Vite/Analog build passed. Existing static sitemap files were preserved, so the unrelated sitemap regeneration prebuild step was not run. All 456 files in the new public build matched their recorded hashes in the staged server release. All 18 changed source files matched the tested local source after newline normalization.
- All 15 existing release checks passed on the isolated preview and again on the public site: SSR offers, market filtering, localized route, aliases, 404 responses, sign-in, robots, sitemap, and Google verification.
- Chrome checks at widths 390 and 1440 passed on home, store, category, country-filtered store, sign-in, sign-up, Help Center, Privacy Policy, and Hindi store routes. Offer dialogs and pagination worked on populated English store/category pages. No JavaScript errors or horizontal overflow occurred in those checks.
- Browser checks observed no optional analytics requests before consent or after rejection, initialization after permission, and no further optional requests after withdrawal. External analytics and telemetry requests were intercepted during these tests to avoid recording test traffic. This does not establish that Google Analytics or affiliate dashboards have received real customer conversions.
- Final live Chrome checks passed on couponleo.com and www.couponleo.com, including both verification tags, privacy controls, and clearing a test Google Analytics cookie scoped to .couponleo.com.
- Eight HTTP availability samples across the switch attempts returned 200 with no failures. An initial guard saw the prior page immediately after an asynchronous Nginx reload and restored the old route before restarting any service. The final switch waited for old workers to drain, served traffic through the healthy preview during the main UI restart, restored the original Nginx configuration, and stopped the preview. No downtime was observed. The API process was not restarted.

Remaining limits

- Impact Marketplace approval, account eligibility, advertiser approvals, allowed promotion methods, and CouponAPI descriptions/image republication rights remain unverified. A published ownership tag does not establish those approvals. No appeal or third-party application was submitted.
- Imported content remains in use. These changes add transparency and shopper guidance; they do not establish checkout validity, unique merchant research, traffic growth, indexing gains, or rights to every imported asset.
- Existing partial localization remains. New explanatory copy falls back to English where there is no translation.
- Existing canonical generation follows the public request origin: www.couponleo.com remains self-canonical. Consolidating hostnames is a separate SEO follow-up; these changes did not alter that behavior.
- A standalone TypeScript noEmit check still reports the pre-existing TS7030 missing-return diagnostic in ui/src/server/middleware/canonical-routes.ts, which this release did not modify. The production build and targeted tests passed.
- Runtime-generated api/dataservices/data/analytics-summary.json was already modified and remains outside these source commits. All source changes for this task are committed.
