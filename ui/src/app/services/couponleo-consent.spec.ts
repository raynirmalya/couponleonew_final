import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, Subject } from 'rxjs';
import { ANALYTICS_CONSENT_KEY, CouponleoConsentService, GOOGLE_ANALYTICS_ID } from './couponleo-consent.service';
import { CouponleoTelemetryService } from './couponleo-telemetry.service';
import { CouponleoApiService } from './couponleo-api.service';
import { COUPONLEO_SESSION_STORAGE_KEY, COUPONLEO_TELEMETRY_QUEUE_STORAGE_KEY,
  COUPONLEO_TELEMETRY_VISITOR_STORAGE_KEY, COUPONLEO_TELEMETRY_GEO_STORAGE_KEY } from './couponleo-client-state';

describe('optional website analytics', () => {
  let api: { recordTelemetryEvents: ReturnType<typeof vi.fn> };
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    sessionStorage.clear();
    document.getElementById('couponleo-google-analytics')?.remove();
    delete (window as any).gtag;
    delete (window as any).dataLayer;
    api = { recordTelemetryEvents: vi.fn(() => of({ success: true })) };
    fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ country_code: 'IN', country_name: 'India' }) });
    vi.stubGlobal('fetch', fetchMock);
    TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: CouponleoApiService, useValue: api }] });
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function start() {
    const consent = TestBed.inject(CouponleoConsentService);
    const telemetry = TestBed.inject(CouponleoTelemetryService);
    telemetry.start();
    consent.initialize();
    return { consent, telemetry };
  }

  it('makes no analytics or location requests by default, after rejection, or after reload', async () => {
    const { consent, telemetry } = start();
    telemetry.trackStructured({ eventType: 'click' });
    await vi.advanceTimersByTimeAsync(10000);
    expect(consent.showChoices()).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(api.recordTelemetryEvents).not.toHaveBeenCalled();
    expect(document.getElementById('couponleo-google-analytics')).toBeNull();
    expect(localStorage.getItem(COUPONLEO_TELEMETRY_VISITOR_STORAGE_KEY)).toBeNull();
    consent.choose('declined');
    expect(localStorage.getItem(ANALYTICS_CONSENT_KEY)).toBe('declined');
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: CouponleoApiService, useValue: api }] });
    const restored = start();
    await vi.advanceTimersByTimeAsync(10000);
    expect(restored.consent.showChoices()).toBe(false);
    expect(api.recordTelemetryEvents).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('starts only after permission and omits account email and URL queries from CouponLeo events', async () => {
    const { consent, telemetry } = start();
    localStorage.setItem(COUPONLEO_SESSION_STORAGE_KEY, JSON.stringify({ email: 'shopper@example.com' }));
    consent.choose('allowed');
    consent.choose('allowed');
    telemetry.trackStructured({ eventType: 'coupon_reveal', userEmail: 'shopper@example.com',
      targetUrl: 'https://merchant.example/buy?token=secret#private',
      metadata: { email: 'shopper@example.com', routeUrl: '/sign-in?token=secret', text: 'shopper@example.com' } });
    await vi.advanceTimersByTimeAsync(6000);
    expect(document.querySelectorAll('#couponleo-google-analytics').length).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(api.recordTelemetryEvents).toHaveBeenCalled();
    const events = api.recordTelemetryEvents.mock.calls.flatMap(([batch]) => batch);
    const event = events.find((entry: any) => entry.eventType === 'coupon_reveal');
    expect(event.targetUrl).toBe('https://merchant.example/buy');
    expect(event.authState).toBe('authenticated');
    expect(JSON.stringify(events)).not.toContain('shopper@example.com');
    expect(JSON.stringify(events)).not.toContain('secret');
    expect(events.filter((entry: any) => entry.eventType === 'page_view')).toHaveLength(1);
  });

  it('withdraws consent, clears only optional data, and ignores a late location result', async () => {
    let resolveLocation!: (value: unknown) => void;
    fetchMock.mockReturnValue(new Promise((resolve) => { resolveLocation = resolve; }));
    const { consent, telemetry } = start();
    localStorage.setItem(COUPONLEO_SESSION_STORAGE_KEY, JSON.stringify({ email: 'member@example.com' }));
    consent.choose('allowed');
    telemetry.trackStructured({ eventType: 'coupon_reveal' });
    document.cookie = '_ga=test; Path=/';
    const signal = fetchMock.mock.calls[0][1].signal as AbortSignal;
    consent.choose('declined');
    resolveLocation({ ok: true, json: async () => ({ country_code: 'IN' }) });
    await vi.advanceTimersByTimeAsync(20000);
    expect(signal.aborted).toBe(true);
    expect(api.recordTelemetryEvents).not.toHaveBeenCalled();
    for (const key of [COUPONLEO_TELEMETRY_QUEUE_STORAGE_KEY, COUPONLEO_TELEMETRY_VISITOR_STORAGE_KEY, COUPONLEO_TELEMETRY_GEO_STORAGE_KEY]) {
      expect(localStorage.getItem(key)).toBeNull();
    }
    expect(localStorage.getItem(COUPONLEO_SESSION_STORAGE_KEY)).toContain('member@example.com');
    expect(document.cookie).not.toMatch(/_ga=/);
    expect((window as any)[`ga-disable-${GOOGLE_ANALYTICS_ID}`]).toBe(true);
  });

  it('cancels an in-flight telemetry subscription on withdrawal', async () => {
    const response = new Subject();
    api.recordTelemetryEvents.mockReturnValue(response);
    const { consent } = start();
    consent.choose('allowed');
    await vi.advanceTimersByTimeAsync(6000);
    expect(response.observed).toBe(true);
    consent.choose('declined');
    await Promise.resolve();
    expect(response.observed).toBe(false);
    expect(localStorage.getItem(COUPONLEO_TELEMETRY_QUEUE_STORAGE_KEY)).toBeNull();
  });

  it('keeps browser storage failures out of the shopping flow', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('blocked'); });
    const { consent, telemetry } = start();
    expect(() => consent.choose('allowed')).not.toThrow();
    expect(() => telemetry.trackStructured({ eventType: 'coupon_reveal' })).not.toThrow();
    await vi.advanceTimersByTimeAsync(6000);
    expect(() => consent.choose('declined')).not.toThrow();
  });

  it('does not initialize browser analytics during server rendering', () => {
    TestBed.overrideProvider(PLATFORM_ID, { useValue: 'server' });
    const { consent, telemetry } = start();
    consent.choose('allowed');
    telemetry.trackStructured({ eventType: 'page_view' });
    expect(consent.ready()).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(document.getElementById('couponleo-google-analytics')).toBeNull();
  });
});
