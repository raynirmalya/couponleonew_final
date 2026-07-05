import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { injectRequest } from '@analogjs/router/tokens';
import { filter } from 'rxjs';
import {
  COUPONLEO_DEFAULT_LOCALE,
  COUPONLEO_LOCALE_DEFINITIONS,
  couponleoLocaleDefinition,
  normalizeCouponleoLocale,
  type CouponleoSupportedLocale,
} from './couponleo-i18n.catalog';
import { COUPONLEO_LOCALE_STORAGE_KEY } from './couponleo-client-state';
import {
  extractCouponleoLocaleFromPathname,
  isCouponleoLocalizedPublicPath,
  localizeCouponleoPathname,
  stripCouponleoLocaleFromPathname,
} from './couponleo-locale-paths';

export interface CouponleoLocaleOption {
  label: string;
  value: string;
}

@Injectable({ providedIn: 'root' })
export class CouponleoLocaleService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly browser = isPlatformBrowser(this.platformId);
  private readonly router = inject(Router);
  private readonly request = injectRequest();
  private readonly localeState = signal<CouponleoSupportedLocale>(COUPONLEO_DEFAULT_LOCALE);

  readonly locale = this.localeState.asReadonly();
  readonly definition = computed(() => couponleoLocaleDefinition(this.localeState()));
  readonly direction = computed(() => this.definition().dir);
  readonly languageTag = computed(() => this.localeState().split('-')[0] ?? 'en');
  readonly localeOptions = computed<CouponleoLocaleOption[]>(() => (
    COUPONLEO_LOCALE_DEFINITIONS.map((definition) => ({
      value: definition.value,
      label: definition.nativeLabel,
    }))
  ));

  constructor() {
    const urlLocale = this.currentLocaleFromUrl();
    const storedLocale = this.readStoredLocale();
    const browserLocale = this.browser ? window.navigator.language : COUPONLEO_DEFAULT_LOCALE;
    this.localeState.set(this.normalizeLocale(urlLocale ?? storedLocale ?? browserLocale));

    if (this.browser) {
      this.router.events
        .pipe(filter((event) => event instanceof NavigationEnd))
        .subscribe(() => {
          const explicitLocale = this.currentLocaleFromUrl();

          if (explicitLocale) {
            const normalizedLocale = this.normalizeLocale(explicitLocale);

            if (normalizedLocale !== this.localeState()) {
              this.localeState.set(normalizedLocale);
            }

            this.persistLocale(normalizedLocale);
          }

          this.syncBrowserUrl();
        });

      queueMicrotask(() => this.syncBrowserUrl());
    }
  }

  setLocale(locale: string): void {
    const normalizedLocale = this.normalizeLocale(locale);
    this.localeState.set(normalizedLocale);
    this.persistLocale(normalizedLocale);
    this.navigateToLocalizedUrl(normalizedLocale);
  }

  localizedPublicUrl(url: string, locale: string): string {
    const normalizedLocale = this.normalizeLocale(locale);
    const targetUrl = new URL(url);
    const basePathname = stripCouponleoLocaleFromPathname(targetUrl.pathname).pathname;

    targetUrl.pathname = isCouponleoLocalizedPublicPath(basePathname)
      ? localizeCouponleoPathname(basePathname, normalizedLocale)
      : basePathname;
    targetUrl.searchParams.delete('lang');

    return targetUrl.toString();
  }

  withLocaleQuery(url: string, locale: string): string {
    return this.localizedPublicUrl(url, locale);
  }

  private currentLocaleFromUrl(): string | null {
    const currentUrl = this.currentUrl();
    return extractCouponleoLocaleFromPathname(currentUrl.pathname) ?? currentUrl.searchParams.get('lang');
  }

  private normalizeLocale(locale: string | null | undefined): CouponleoSupportedLocale {
    return normalizeCouponleoLocale(locale);
  }

  private readStoredLocale(): string | null {
    if (!this.browser) {
      return null;
    }

    return window.localStorage.getItem(COUPONLEO_LOCALE_STORAGE_KEY);
  }

  private currentUrl(): URL {
    const baseUrl = this.browser && window.location.origin
      ? window.location.origin
      : 'https://couponleo.com';
    const requestUrl = this.browser
      ? (this.router.url || '/')
      : (this.request?.url || this.router.url || '/');

    return new URL(requestUrl, baseUrl);
  }

  private navigateToLocalizedUrl(locale: CouponleoSupportedLocale): void {
    if (!this.browser) {
      return;
    }

    const currentUrl = this.currentUrl();
    const basePathname = stripCouponleoLocaleFromPathname(currentUrl.pathname).pathname;

    currentUrl.pathname = isCouponleoLocalizedPublicPath(basePathname)
      ? localizeCouponleoPathname(basePathname, locale)
      : basePathname;
    currentUrl.searchParams.delete('lang');

    const nextUrl = `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`;
    const currentRelativeUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;

    if (nextUrl !== currentRelativeUrl) {
      void this.router.navigateByUrl(nextUrl, { replaceUrl: true });
    }
  }

  private persistLocale(locale: CouponleoSupportedLocale): void {
    if (!this.browser) {
      return;
    }

    window.localStorage.setItem(COUPONLEO_LOCALE_STORAGE_KEY, locale);
  }

  private syncBrowserUrl(): void {
    if (!this.browser) {
      return;
    }

    const currentUrl = this.currentUrl();
    if (!currentUrl.searchParams.has('lang')) {
      return;
    }

    currentUrl.searchParams.delete('lang');

    const nextUrl = `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`;
    const currentRelativeUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;

    if (nextUrl !== currentRelativeUrl) {
      void this.router.navigateByUrl(nextUrl, { replaceUrl: true });
    }
  }
}
