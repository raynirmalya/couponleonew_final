import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  COUPONLEO_DEFAULT_LOCALE,
  COUPONLEO_LOCALE_DEFINITIONS,
  couponleoLocaleDefinition,
  normalizeCouponleoLocale,
  type CouponleoSupportedLocale,
} from './couponleo-i18n.catalog';
import { COUPONLEO_LOCALE_STORAGE_KEY } from './couponleo-client-state';

export interface CouponleoLocaleOption {
  label: string;
  value: string;
}

@Injectable({ providedIn: 'root' })
export class CouponleoLocaleService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly browser = isPlatformBrowser(this.platformId);
  private readonly router = inject(Router);
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
  }

  setLocale(locale: string): void {
    const normalizedLocale = this.normalizeLocale(locale);
    this.localeState.set(normalizedLocale);

    if (this.browser) {
      window.localStorage.setItem(COUPONLEO_LOCALE_STORAGE_KEY, normalizedLocale);
    }

    const urlTree = this.router.parseUrl(this.router.url || '/');
    const nextQueryParams = { ...urlTree.queryParams };

    if (normalizedLocale === COUPONLEO_DEFAULT_LOCALE) {
      delete nextQueryParams['lang'];
    } else {
      nextQueryParams['lang'] = normalizedLocale;
    }

    urlTree.queryParams = nextQueryParams;
    void this.router.navigateByUrl(urlTree, { replaceUrl: true });
  }

  withLocaleQuery(url: string, locale: string): string {
    const normalizedLocale = this.normalizeLocale(locale);
    const targetUrl = new URL(url);

    if (normalizedLocale === COUPONLEO_DEFAULT_LOCALE) {
      targetUrl.searchParams.delete('lang');
    } else {
      targetUrl.searchParams.set('lang', normalizedLocale);
    }

    return targetUrl.toString();
  }

  private currentLocaleFromUrl(): string | null {
    const urlTree = this.router.parseUrl(this.router.url || '/');
    const langParam = urlTree.queryParams['lang'];
    return typeof langParam === 'string' ? langParam : null;
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
}
