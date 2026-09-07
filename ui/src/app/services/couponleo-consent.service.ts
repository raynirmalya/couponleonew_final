import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { DestroyRef, Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { Subject } from 'rxjs';

export const ANALYTICS_CONSENT_KEY = 'couponleo.analytics-consent.v1';
export const GOOGLE_ANALYTICS_ID = 'G-HM2CS6185Y';
type AnalyticsChoice = 'allowed' | 'declined';
type AnalyticsWindow = Window & {
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
};

/** Optional analytics are blocked until an explicit, persisted choice allows them. */
@Injectable({ providedIn: 'root' })
export class CouponleoConsentService {
  private readonly document = inject(DOCUMENT);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly destroyRef = inject(DestroyRef);
  private readonly changed = new Subject<boolean>();
  private initialized = false;
  private googleConfigured = false;
  private lastAllowed: boolean | null = null;
  readonly choice = signal<AnalyticsChoice | null>(null);
  readonly ready = signal(false);
  readonly settingsOpen = signal(false);
  readonly analyticsAllowed = computed(() => this.choice() === 'allowed');
  readonly showChoices = computed(() => this.ready() && (this.choice() === null || this.settingsOpen()));
  readonly changes = this.changed.asObservable();

  initialize(): void {
    if (!this.browser || this.initialized) return;
    this.initialized = true;
    this.restoreChoice();
    this.ready.set(true);
    this.applyChoice();
    const onStorage = (event: StorageEvent) => {
      if (event.key === ANALYTICS_CONSENT_KEY || event.key === null) {
        this.restoreChoice();
        this.applyChoice();
      }
    };
    window.addEventListener('storage', onStorage);
    this.destroyRef.onDestroy(() => window.removeEventListener('storage', onStorage));
  }

  choose(choice: AnalyticsChoice): void {
    if (!this.browser) return;
    this.choice.set(choice);
    this.settingsOpen.set(false);
    try { window.localStorage.setItem(ANALYTICS_CONSENT_KEY, choice); } catch {
      // The choice still applies to this page if storage is unavailable.
    }
    this.applyChoice();
  }

  openSettings(): void {
    this.settingsOpen.set(true);
  }

  private restoreChoice(): void {
    let stored: string | null = null;
    try { stored = window.localStorage.getItem(ANALYTICS_CONSENT_KEY); } catch { /* Default to no analytics. */ }
    this.choice.set(stored === 'allowed' || stored === 'declined' ? stored : null);
  }

  private applyChoice(): void {
    const allowed = this.analyticsAllowed();
    // Notify our telemetry synchronously, including when consent is withdrawn.
    if (this.lastAllowed !== allowed) {
      this.lastAllowed = allowed;
      this.changed.next(allowed);
    }
    const client = window as AnalyticsWindow;
    (client as unknown as Record<string, unknown>)[`ga-disable-${GOOGLE_ANALYTICS_ID}`] = !allowed;
    if (!allowed) {
      if (this.googleConfigured) client.gtag?.('consent', 'update', this.googleConsent('denied'));
      this.clearGoogleCookies();
      return;
    }
    if (this.googleConfigured) {
      client.gtag?.('consent', 'update', this.googleConsent('granted'));
      return;
    }
    this.googleConfigured = true;
    client.dataLayer = client.dataLayer || [];
    client.gtag = function () { client.dataLayer!.push(arguments); };
    client.gtag('consent', 'default', this.googleConsent('denied'));
    client.gtag('consent', 'update', this.googleConsent('granted'));
    client.gtag('js', new Date());
    client.gtag('config', GOOGLE_ANALYTICS_ID, {
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
    });
    const script = this.document.createElement('script');
    script.id = 'couponleo-google-analytics';
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${GOOGLE_ANALYTICS_ID}`;
    this.document.head.appendChild(script);
  }

  private googleConsent(analytics: 'granted' | 'denied') {
    return { analytics_storage: analytics, ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' };
  }

  private clearGoogleCookies(): void {
    const cookies = this.document.cookie.split(';').map((part) => part.trim().split('=')[0]);
    const hostname = window.location.hostname;
    const parts = hostname.split('.');
    const domains = ['', hostname, ...parts.slice(0, -1).map((_, i) => `.${parts.slice(i).join('.')}`)];
    for (const name of cookies.filter((value) => /^_ga(?:_|$)/.test(value))) {
      for (const domain of domains) {
        this.document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax${domain ? `; Domain=${domain}` : ''}`;
      }
    }
  }
}
