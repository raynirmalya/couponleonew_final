import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Observable, of, Subject, throwError } from 'rxjs';
import { CouponleoApiService, CouponleoOfferVerification } from '../services/couponleo-api.service';
import { CouponleoTelemetryService } from '../services/couponleo-telemetry.service';
import { CouponleoCouponDialogComponent } from './couponleo-coupon-dialog.component';
import { CouponleoOfferVerificationComponent, CouponleoVerificationClock, currentVerificationStatus } from './couponleo-offer-verification.component';

const now = Date.parse('2026-09-07T12:00:00Z');
const proof: CouponleoOfferVerification = {
  schemaVersion: 1, offerFingerprint: 'same-offer', status: 'checkout_passed', checkedAt: '2026-09-07T11:00:00Z',
  validUntil: '2026-09-08T11:00:00Z', country: 'India', conditions: 'Eligible product; minimum spend INR 1000.',
  summary: 'Code applied in the test cart.', listingCheckedAt: '2026-09-07T12:00:00Z', listingChecks: [],
};

describe('offer verification display', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('only accepts complete, current evidence and expires at its deadline', () => {
    expect(currentVerificationStatus(undefined, now)).toBe('unverified');
    expect(currentVerificationStatus(proof, now)).toBe('checkout_passed');
    expect(currentVerificationStatus({ ...proof, country: '' }, now)).toBe('unverified');
    expect(currentVerificationStatus({ ...proof, checkedAt: 'bad date' }, now)).toBe('unverified');
    expect(currentVerificationStatus({ ...proof, validUntil: '2026-10-01T00:00:00Z' }, now)).toBe('unverified');
    expect(currentVerificationStatus(proof, Date.parse(proof.validUntil!))).toBe('stale');
  });

  it('shows the test date, market and conditions; removes its badge when the clock expires it', async () => {
    TestBed.configureTestingModule({ imports: [CouponleoOfferVerificationComponent], providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(CouponleoOfferVerificationComponent);
    TestBed.inject(CouponleoVerificationClock).now.set(now);
    fixture.componentRef.setInput('verification', proof);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Checkout tested');
    expect(fixture.nativeElement.textContent).toContain('India');
    expect(fixture.nativeElement.textContent).toContain('2026');
    fixture.componentRef.setInput('expanded', true);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain(proof.conditions);
    TestBed.inject(CouponleoVerificationClock).now.set(Date.parse(proof.validUntil!));
    fixture.componentRef.setInput('expanded', false);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.offer-badge--tested')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Merchant offer');
  });

  async function dialog(response: Observable<unknown>) {
    const api = { getCouponVerification: vi.fn(() => response) };
    TestBed.configureTestingModule({ imports: [CouponleoCouponDialogComponent], providers: [provideRouter([]),
      { provide: CouponleoApiService, useValue: api }, { provide: CouponleoTelemetryService, useValue: { trackStructured: vi.fn() } }] });
    const fixture = TestBed.createComponent(CouponleoCouponDialogComponent);
    TestBed.inject(CouponleoVerificationClock).now.set(now);
    fixture.componentRef.setInput('coupon', { couponId: 123, title: 'Offer', subtitle: 'Shop', description: 'Terms',
      code: 'SAVE', route: '/stores/shop', ctaUrl: 'https://merchant.example', verification: proof });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, api };
  }

  it('refreshes on opening and honors a revoked result instead of an old card badge', async () => {
    const { fixture, api } = await dialog(of({ data: { ...proof, status: 'revoked', summary: 'Withdrawn after review.' } }));
    expect(api.getCouponVerification).toHaveBeenCalledWith(123);
    expect(fixture.nativeElement.textContent).toContain('Previous result withdrawn');
    expect(fixture.nativeElement.textContent).not.toContain('Checkout tested');
  });

  it('does not attach a new offer result to an older code in a cached dialog', async () => {
    const { fixture } = await dialog(of({ data: { ...proof, offerFingerprint: 'changed-offer' } }));
    expect(fixture.nativeElement.textContent).toContain('Offer changed since review');
    expect(fixture.nativeElement.textContent).not.toContain('Checkout tested');
  });

  it('keeps copying and the merchant link usable when verification cannot load', async () => {
    const { fixture } = await dialog(throwError(() => new Error('unavailable')));
    expect(fixture.nativeElement.textContent).toContain('Verification could not be refreshed');
    expect(fixture.nativeElement.querySelector('.couponleo-coupon-dialog__copy')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('a[rel~="sponsored"]')).not.toBeNull();
  });

  it('cancels an unfinished verification request when the dialog closes', async () => {
    const response = new Subject();
    const { fixture } = await dialog(response);
    expect(response.observed).toBe(true);
    fixture.componentRef.setInput('coupon', null);
    fixture.detectChanges();
    expect(response.observed).toBe(false);
  });
});
