CouponLeo deployment verification ? September 7, 2026

The traffic-audit fixes are deployed on the .252 server. Application changes are in commits c010d80, 798a71f and b7145ed, merged into server main at 459b3ee. Pre-existing and refreshed server summaries were committed separately before merging. No production database records were edited by this work.

The release renders the initial store/category coupon page in HTML, places offers ahead of long explanatory content, preserves market/page queries during HTTPS rendering, avoids full-catalog loading in the corrected API paths, and filters conflicting, duplicate and expired-date feed entries. It removes unsupported verification claims from the affected offer displays. Unknown expiry is disclosed; browser expiry labels match the API UTC day boundary. Coupon dialogs support merchant links when no code is supplied.

Homepage aliases redirect to canonical destinations. Unknown routes return 404. Partial locale navigation remains available with English canonicals, and corresponding duplicate locale sitemap entries are excluded. The store sitemap contains 4,510 URLs and excludes the sampled missing nambe-com store. Existing Google verification and Analytics are preserved.

Verification: 40 frontend tests, 7 backend tests and the production build passed. All 15 public route/static checks passed. Mobile Chrome checks at 390 ? 844 passed on home, Lenovo, women's clothing, Lenovo filtered to India, and sign-in. No horizontal overflow or browser errors occurred. Store/category pagination changed the displayed results, coupon/offer dialogs opened, and Analytics returned HTTP 204 on all five sampled pages. The category HTML contains six related-store cards and valid JSON-LD.

| Sample | Initial HTML cards | First coupon position | Final observed browser TTFB |
| --- | ---: | ---: | ---: |
| Home | 3 | 1999 px | 0.726 s |
| Lenovo | 8 | 1649 px | 0.460 s |
| Women's clothing | 11 | 1855 px | 0.503 s |

Before the changes, Lenovo/category initial HTML contained no coupon cards. First coupon positions were approximately 5,177 and 27,104 pixels, respectively. The original homepage browser TTFB observation was 5.90 seconds. Final measurements used warm production services; separate first-request observations varied, so this is not a controlled benchmark or field Core Web Vitals result. Missing-store responses can still take several seconds.

Provisional analyst page-quality ratings under the same rubric as the original audit:

| Page | Before | After | Remaining deductions |
| --- | ---: | ---: | --- |
| Home | 75 | 86 | Content ?7: generic feed/advice copy; UX ?4: offers remain below the hero; performance/resilience ?3: request variability and shared bundle overhead |
| Lenovo | 61 | 88 | Content ?6: merchant checkout validity unconfirmed; UX ?3: first coupon still requires scrolling; performance/resilience ?3: request variability and slow unknown-store lookups |
| Women's clothing | 53 | 87 | Content ?7: feed validity and generic category advice; UX ?3: first coupon still requires scrolling; performance/resilience ?3: request variability and shared bundle overhead |

Rubric: intent/content 25, technical SEO 25, discoverability 15, accessibility/UX 20, performance/resilience 15. These are analyst scores, not Google or Lighthouse scores; untested items are unverified. Ratings reflect the sampled templates, not a full audit of every merchant or offer.

Source changes are grouped under api/dataservices (query and offer handling), ui/src/app (page order, server loaders, HTTP query handling, dialogs, expiry/SEO helpers and tests), ui/src/server (canonical/404 middleware), ui/public and ui/scripts (verification/sitemaps), and deploy (service templates and repeatable checks).

The final UI release is /srv/couponleo-ui/releases/20260907-expiry-labels, selected by /srv/couponleo-ui/current. Canonical services use UI port 4173 and API port 9600. Original source, environment, Nginx and service backups remain under /root/backups/couponleo-traffic-fix-20260906; previous UI releases are retained. Private environment backups are excluded from Git.

Limits: offer counts/pagination still reflect source records, so quality filtering may leave fewer than 12 cards. This is not a complete merchant checkout verification or a global deduplication of every feed row. Search Console indexing, queries, backlinks and traffic growth remain unverified. Technical deployment does not itself establish a traffic increase.
