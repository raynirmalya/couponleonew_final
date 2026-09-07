# FlexOffers verification deployment ? 2026-09-07

- Added the shared `fo-verify` meta tag to `ui/index.html` in commit `7170d86`.
- Verification content: `a3999efc-a745-45d1-bf0d-fa0a1e924fe4`.
- Full UI build was not run: the production filesystem had approximately 328 MB free.
- Created an isolated release using hard links to the existing immutable release files. Replaced only the SSR renderer file through an atomic write, inserting the tag into its embedded HTML template. The previous renderer SHA-256 was checked unchanged.
- Ran Node syntax validation and all 15 existing `deploy/check-release.py` checks against the independent preview on port 4174; all passed.
- Routed Nginx to the healthy preview, drained old workers, switched the release symlink and restarted the main UI. Checked the main UI, returned traffic to port 4173, drained preview workers and stopped the preview.
- Nginx configuration was restored byte-for-byte; the API service was not restarted.
- All five HTTPS availability probes during the switch returned HTTP 200.
- Confirmed exactly one verification tag in the live homepage head on both couponleo.com and www.couponleo.com, and on a representative store page.
- FlexOffers account verification must still be confirmed in its dashboard; this deployment verifies publication of the requested tag.

Release: `/srv/couponleo-ui/releases/flexoffers-20260907-133613`

Previous release retained for rollback: `/srv/couponleo-ui/releases/20260907-no-timing`

Deployment manifests, checks and original configuration: `/root/backups/couponleo-flexoffers-20260907-133613`
