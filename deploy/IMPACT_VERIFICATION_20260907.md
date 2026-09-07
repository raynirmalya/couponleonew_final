# Impact verification deployment ? 2026-09-07

- Shared source tag committed as `3580924`: `impact-site-verification`, with the requested `value="c1f2e563-6bd6-4b01-a439-512319046702"` attribute.
- Existing FlexOffers verification and Google Analytics tags preserved.
- Used the same isolated release and preview rollout documented in `FLEXOFFERS_VERIFICATION_20260907.md`. Full UI build was not run because only approximately 358 MB remained on the production filesystem.
- Only the embedded HTML template in the copied SSR renderer was changed. The previous release renderer remained unchanged; Node syntax validation passed.
- All 15 existing release checks passed against the independent preview on port 4174.
- Both Nginx configuration checks passed. Old workers drained before service changes. Final configuration restored byte-for-byte; the API was not restarted.
- All 5 HTTPS availability probes during deployment returned HTTP 200.
- Both apex and www homepages, plus a representative store page, returned HTTP 200 with exactly one Impact tag and the existing FlexOffers tag.
- UI, API and Nginx remain active. Preview stopped; previous release retained.
- Publication of the tag is confirmed. Impact account verification must be completed in its dashboard.

Release: `/srv/couponleo-ui/releases/impact-20260907-134057`
Previous release: `/srv/couponleo-ui/releases/flexoffers-20260907-133613`
Backup and rollout evidence: `/root/backups/couponleo-impact-20260907-134057`
