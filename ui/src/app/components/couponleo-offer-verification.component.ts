import { isPlatformBrowser } from '@angular/common';
import { Component, DestroyRef, Injectable, PLATFORM_ID, computed, inject, input, signal } from '@angular/core';
import { CouponleoOfferVerification } from '../services/couponleo-api.service';
import { CouponleoI18nService } from '../services/couponleo-i18n.service';

/** One shared clock expires visible badges without a full page reload. */
@Injectable({ providedIn: 'root' })
export class CouponleoVerificationClock {
  readonly now = signal(Date.now());
  constructor() {
    if (isPlatformBrowser(inject(PLATFORM_ID))) {
      const timer = setInterval(() => this.now.set(Date.now()), 1000);
      inject(DestroyRef).onDestroy(() => clearInterval(timer));
    }
  }
}

export function currentVerificationStatus(proof: CouponleoOfferVerification | undefined, now: number): string {
  if (!proof || proof.schemaVersion !== 1) return 'unverified';
  if (proof.status !== 'checkout_passed' && proof.status !== 'merchant_confirmed') return proof.status;
  const checked = Date.parse(proof.checkedAt ?? '');
  const until = Date.parse(proof.validUntil ?? '');
  const maximumAge = proof.status === 'checkout_passed' ? 86_400_000 : 604_800_000;
  if (!proof.offerFingerprint || !proof.country || !proof.conditions || !Number.isFinite(checked) || !Number.isFinite(until)
      || checked > now + 300_000 || until > checked + maximumAge) return 'unverified';
  return until > now ? proof.status : 'stale';
}

@Component({
  selector: 'app-couponleo-offer-verification',
  template: `
    @if (expanded()) {
      <section class="offer-checks" aria-label="Offer verification">
        <h4>{{ i18n.phrase('Verification checks') }}</h4>
        <strong class="offer-checks__status">{{ i18n.phrase(detailLabel()) }}</strong>
        @if (freshReview() && verification(); as proof) {
          <p>{{ i18n.phrase('Checked') }} {{ date(proof.checkedAt) }} · {{ proof.country }}</p>
          <p>{{ proof.conditions }}</p>
          <p>{{ i18n.phrase('This result applies to the tested conditions. Check the final price before paying.') }}</p>
        } @else {
          <p>{{ i18n.phrase(summary()) }}</p>
        }
        @if (verification()?.listingChecks?.length) {
          <details>
            <summary>{{ i18n.phrase('See automatic listing checks') }}</summary>
            <ul>
              @for (check of verification()!.listingChecks; track check.name) {
                <li [class.offer-checks__issue]="check.status === 'fail'">{{ i18n.phrase(check.detail) }}</li>
              }
            </ul>
            <p>{{ i18n.phrase('These checks do not test whether a merchant accepts the code.') }}</p>
          </details>
        }
      </section>
    } @else {
      <span class="offer-badge" [class.offer-badge--tested]="freshReview()">
        {{ i18n.phrase(freshReview() ? detailLabel() : 'Merchant offer') }}
        @if (freshReview() && verification(); as proof) {
          <span class="offer-badge__context">{{ date(proof.checkedAt) }} · {{ proof.country }}</span>
        }
      </span>
    }
  `,
  styles: [`
    :host { min-width: 0; } .offer-badge { display: inline-flex; flex-direction: column; gap: 2px; font-size: .75rem; line-height: 1.4; }
    .offer-badge--tested { color: #146342; } .offer-badge__context { font-size: .7rem; font-weight: 400; }
    .offer-checks { padding: 14px; border: 1px solid #d9e2ef; border-radius: 12px; background: #f5f8ff; color: #33435f; text-align: start; }
    h4 { margin: 0 0 8px; font-size: .95rem; } p, li { font-size: .82rem; line-height: 1.5; }
    p { margin: 6px 0; } ul { margin: 8px 0; padding-inline-start: 20px; } li { margin-block: 4px; }
    summary { cursor: pointer; padding-block: 8px; font-size: .85rem; color: #1646ad; }
    summary:focus-visible { outline: 3px solid #dc7300; outline-offset: 3px; } .offer-checks__issue { color: #962c25; }
  `],
})
export class CouponleoOfferVerificationComponent {
  readonly verification = input<CouponleoOfferVerification>();
  readonly expanded = input(false);
  protected readonly i18n = inject(CouponleoI18nService);
  private readonly clock = inject(CouponleoVerificationClock);
  protected readonly status = computed(() => {
    const proof = this.verification();
    const timed = proof?.status === 'checkout_passed' || proof?.status === 'merchant_confirmed';
    return currentVerificationStatus(proof, timed ? this.clock.now() : Date.now());
  });
  protected readonly freshReview = computed(() => ['checkout_passed', 'merchant_confirmed'].includes(this.status()));
  protected readonly detailLabel = computed(() => ({
    checkout_passed: 'Checkout tested', merchant_confirmed: 'Merchant confirmed',
    checkout_failed: 'Checkout test failed', stale: 'A new test is needed',
    offer_changed: 'Offer changed since review', revoked: 'Previous result withdrawn',
    review_needed: 'Listing needs review', unverified: 'Not checkout tested',
  }[this.status()] ?? 'Not checkout tested'));
  protected readonly summary = computed(() => this.status() === 'stale'
    ? 'The last review is out of date; a new test is needed.'
    : this.verification()?.summary ?? 'No current checkout test is recorded.');
  protected date(value: string | null): string {
    const parsed = Date.parse(value ?? '');
    return Number.isFinite(parsed) ? new Intl.DateTimeFormat(this.i18n.locale(), { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(parsed) : '';
  }
}
