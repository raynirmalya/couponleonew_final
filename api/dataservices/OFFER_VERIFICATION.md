# CouponLeo offer verification

There are two separate outputs: automatic listing checks and evidence-backed reviews. An imported `verified` flag cannot produce a checkout badge. The original coupon database/feed stays unchanged.

## Automatic checks and public display

`prepare_offers` retains the existing expiry, conflict and duplicate filtering, then calls `annotate_offers`. Each returned offer gets additive `verification` metadata. Checks cover identity, supplied expiry, code presence, HTTP(S) link format, and conflicting percentage claims. Unknown expiry is disclosed. Link checking does not contact the merchant or follow affiliate redirects.

Only a current `checkout_passed` review sets the compatibility field `verified: true`. `merchant_confirmed` has a separate label. The UI shows the date and country for a current review and the conditions in the offer dialog. It never derives a claim from the old boolean alone.

The dialog refreshes `GET /couponleo/api/coupons/{id}/verification` on opening. The response must match the fingerprint of the displayed offer; a changed offer requires reloading its details. Verification failures leave copying and merchant navigation usable. Coupon API responses use `Cache-Control: no-store`; the application coupon cache lasts at most 30 seconds. Already-open cards do not continuously poll for administrative changes; a fresh dialog request picks up revocation. A shared clock expires displayed badges at their deadline without requiring a reload.

Checkout reviews last at most 24 hours. Merchant confirmations last at most seven days. Both end earlier at the end of the supplied UTC expiry day. These are CouponLeo review policies, not a guarantee that an offer remains redeemable throughout that period. Changes to the code, merchant, wording, market, link, expiry or discount invalidate the recorded fingerprint. A later failure or revocation overrides earlier success. Missing, modified or unreadable evidence removes the badge.

## Private storage and operator workflow

The default database is `/var/lib/couponleo-verification/reviews.sqlite3`, configurable with `COUPONLEO_VERIFICATION_DB`. Store it outside every public/static directory. The deployment creates this directory with mode 0700; database and evidence files use 0600. Public requests only read the database; they never initialize it or create reviews. A missing, corrupt or busy store withholds badges and keeps browsing available.

Only a trusted operator with SSH/filesystem access can record results. No public verification write endpoint is exposed. Reviews are append-only, with private reviewer identity, timestamps and a SHA-256 fingerprint of the offer and evidence. Public responses omit reviewer identity, notes, artifact paths and cart details. Existing records can be withdrawn with a new revocation; do not delete history to hide a failed test.

On the server:

```sh
cd /root/code/couponleonew_final/api/dataservices
/root/code/venv/bin/python verify_offers.py init
/root/code/venv/bin/python verify_offers.py check --store lenovo-com --limit 50 --output /var/lib/couponleo-verification/lenovo-queue.json
/root/code/venv/bin/python verify_offers.py candidate --id ACTUAL_COUPON_ID --output /var/lib/couponleo-verification/candidate.json
```

The queue records which checks passed, failed or remain unknown. It does not create successful checkout reviews. Pagination is explicit through `--page` and `--limit` (maximum 250). Use the real coupon ID from the queue to create a candidate.

Test that exact code with an eligible cart on the merchant's direct site. Record the actual country, items, currency, minimum spend and restrictions. Do not use customer accounts or payment information, place an order, create affiliate clicks, or bypass anti-bot/access controls. Redact personal information from evidence. Save a screenshot, PDF, or structured evidence artifact of no more than 5 MiB.

Create a private review JSON file from the real observation:

```json
{
  "offerFingerprint": "COPY_FROM_THE_CANDIDATE",
  "status": "checkout_passed",
  "checkedAt": "ACTUAL_ISO_TIMESTAMP_WITH_TIMEZONE",
  "reviewer": "ACTUAL_REVIEWER",
  "country": "ACTUAL_TEST_COUNTRY",
  "conditions": "ACTUAL_ELIGIBILITY_AND_RESTRICTIONS",
  "summary": "PRIVATE_REVIEW_NOTES",
  "attested": true,
  "cart": {
    "before": "ACTUAL_BEFORE_TOTAL",
    "after": "ACTUAL_AFTER_TOTAL",
    "currency": "ACTUAL_THREE_LETTER_CURRENCY",
    "items": "ACTUAL_ELIGIBLE_ITEMS",
    "appliedCode": "EXACT_CODE_FROM_THE_CANDIDATE",
    "sameCart": true
  }
}
```

The placeholders intentionally cannot pass validation. Attest only after inspecting real evidence. Confirm that the discount belongs to this code, matches the advertised conditions, and compares the same cart, tax, currency and delivery settings. A positive price difference alone is not a substitute for this review.

```sh
/root/code/venv/bin/python verify_offers.py record --candidate /var/lib/couponleo-verification/candidate.json --review /var/lib/couponleo-verification/review.json --evidence /var/lib/couponleo-verification/checkout-proof.png
/root/code/venv/bin/python verify_offers.py revoke --id ACTUAL_COUPON_ID --reviewer ACTUAL_REVIEWER --reason "ACTUAL_REASON"
```

`record` fetches the current offer again and rejects stale or edited candidates. It requires a timezone, country/conditions, matching applied code, evidence and a same-cart discount for success. Use `checkout_failed` for an observed rejection and `merchant_confirmed` for actual merchant confirmation; merchant confirmation still requires an evidence artifact and attestation. A timeout or blocked page is inconclusive, not a failed coupon.

## Browser evidence runner

`verification-browser/checkout-runner.mjs` can repeat a configured merchant cart flow and capture before/after screenshots plus `result.json`. Each merchant needs a reviewed configuration with direct product/cart URLs, selectors and exact permitted cart POST paths. There is no universal merchant adapter. No production merchant selector configuration is bundled or enabled automatically.

Use Playwright from an installed module, optionally setting `COUPONLEO_PLAYWRIGHT_MODULE` to its absolute file URL and `COUPONLEO_CHROME_PATH` to an installed Chrome executable. Keep browser testing off the web-serving process:

```sh
node verification-browser/checkout-runner.mjs /PRIVATE/candidate.json /PRIVATE/merchant-plan.json /PRIVATE/run-directory
```

A merchant plan has `storeSlug`, `merchantOrigin`, `productUrl`, `cartUrl`, `country`, `currency`, `conditions`, `items`, optional `locale` and `decimalSeparator`, `allowedCartPostPaths`, and selectors named `addToCart`, `cartTotal`, `couponInput`, `applyCoupon`, `appliedCode`, optionally `couponError`. Configure these from the actual merchant UI and review its permitted testing methods. The total selector must identify one amount. Do not configure login, purchase, order or payment endpoints as cart operations.

The runner uses a fresh browser context, blocks service workers, external navigation, payment/order paths and writes outside the permitted cart POST paths. It refuses recognizable purchase controls. It supports adding to a cart and applying a code; no purchase step is provided. Merchant changes or blocked requests produce an inconclusive result. It does not bypass anti-bot checks or grant badges.

Even an observed successful run is emitted with `attested: false`, no reviewer, and `sameCart: false`. Inspect both screenshots and unchanged cart settings, complete the review fields, and import through the operator CLI. Synthetic fixtures must never be imported into production.

## Tests

```sh
python -m unittest discover -s tests -v
node --test verification-browser/checkout-runner.test.mjs
```

The browser test runs against a local simulated merchant only. It checks a discount, explicit rejection, blocked purchase controls/network requests, and external navigation configuration. Backend tests exercise evidence expiry, mutations, revocation, corrupted storage, privacy, read-only routes and stale candidate rejection. UI tests exercise scoped badges, expiry, fresh review requests, changed coupons, cancellation and usable shopping controls during verification outages.

This layer does not certify advertiser approvals, content licenses, exclusivity, or Impact Marketplace eligibility. It does not establish any real coupon as working until its evidence is reviewed and recorded.
