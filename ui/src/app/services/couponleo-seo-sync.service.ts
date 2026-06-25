import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, effect, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { injectBaseURL } from '@analogjs/router/tokens';
import { COUPONLEO_DEFAULT_LOCALE } from './couponleo-i18n.catalog';
import { CouponleoI18nService } from './couponleo-i18n.service';
import { CouponleoLocaleService } from './couponleo-locale.service';
import { normalizeCountryRouteValue } from './couponleo-ui.helpers';

const CANONICAL_REL = 'canonical';
const HREFLANG_SELECTOR = 'link[rel="alternate"][hreflang]';
const CANONICAL_ROUTE_ALIASES: Record<string, string> = {
  '/blogs': '/blog',
  '/login': '/sign-in',
  '/saved': '/wishlist',
  '/signin': '/sign-in',
  '/signup': '/sign-up',
};
const COUNTRY_AWARE_ROUTE_PATTERNS = [
  /^\/$/,
  /^\/categories$/,
  /^\/categories\/[^/]+$/,
  /^\/country-deals$/,
  /^\/stores$/,
  /^\/stores\/[^/]+$/,
  /^\/top-deals$/,
];
const PAGE_ROUTE_PATTERNS = [
  /^\/categories$/,
  /^\/categories\/[^/]+$/,
  /^\/stores$/,
  /^\/stores\/[^/]+$/,
  /^\/top-deals$/,
];
const COUNTRY_DEALS_PAGE_QUERY_KEYS = ['marketPage', 'categoryPage', 'storePage'] as const;
const INTERNAL_QUERY_KEYS = ['activationToken', 'close', 'email', 'intent', 'mode', 'next', 'resetToken', 'returnUrl'];

@Injectable({ providedIn: 'root' })
export class CouponleoSeoSyncService {
  private readonly document = inject(DOCUMENT);
  private readonly meta = inject(Meta);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly browser = isPlatformBrowser(this.platformId);
  private readonly router = inject(Router);
  private readonly title = inject(Title);
  private readonly baseUrl = injectBaseURL() as string | null;
  private readonly i18n = inject(CouponleoI18nService);
  private readonly localeService = inject(CouponleoLocaleService);

  constructor() {
    effect(() => {
      this.document.documentElement.lang = this.localeService.locale();
      this.document.documentElement.dir = this.localeService.direction();
    });

    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
      )
      .subscribe(() => {
        queueMicrotask(() => this.syncDocumentLinks());
      });

    if (this.router.navigated) {
      queueMicrotask(() => this.syncDocumentLinks());
    }
  }

  private syncDocumentLinks(): void {
    const canonicalUrl = this.currentAbsoluteUrl();
    const currentDescription = this.meta.getTag('name="description"')?.content || 'CouponLeo';
    const localizedSeo = this.i18n.localizeSeo(
      new URL(canonicalUrl).pathname,
      this.title.getTitle() || 'CouponLeo',
      currentDescription,
    );

    this.title.setTitle(localizedSeo.title);
    this.updateCanonicalLink(canonicalUrl);
    this.updateHreflangLinks(canonicalUrl);
    this.meta.updateTag({ name: 'description', content: localizedSeo.description }, 'name="description"');
    this.meta.updateTag({ property: 'og:title', content: localizedSeo.title }, 'property="og:title"');
    this.meta.updateTag({ property: 'og:description', content: localizedSeo.description }, 'property="og:description"');
    this.meta.updateTag({ property: 'og:url', content: canonicalUrl }, 'property="og:url"');
    this.meta.updateTag({ property: 'og:site_name', content: 'CouponLeo' }, 'property="og:site_name"');
    this.meta.updateTag({ property: 'og:locale', content: this.localeService.locale().replace('-', '_') }, 'property="og:locale"');
    this.meta.updateTag({ name: 'twitter:title', content: localizedSeo.title }, 'name="twitter:title"');
    this.meta.updateTag({ name: 'twitter:description', content: localizedSeo.description }, 'name="twitter:description"');
  }

  private currentAbsoluteUrl(): string {
    const baseUrl = this.resolveBaseUrl();
    const currentUrl = new URL(this.router.url || '/', baseUrl);
    const canonicalPath = CANONICAL_ROUTE_ALIASES[currentUrl.pathname];

    if (canonicalPath) {
      currentUrl.pathname = canonicalPath;
    }

    this.normalizeCanonicalQuery(currentUrl);

    return currentUrl.toString();
  }

  private resolveBaseUrl(): string {
    if (this.baseUrl) {
      return this.baseUrl;
    }

    if (this.browser && window.location.origin) {
      return window.location.origin;
    }

    return 'https://couponleo.com';
  }

  private normalizeCanonicalQuery(currentUrl: URL): void {
    const pathname = currentUrl.pathname.replace(/\/+$/, '') || '/';
    const supportsCountry = COUNTRY_AWARE_ROUTE_PATTERNS.some((pattern) => pattern.test(pathname));
    const supportsPage = PAGE_ROUTE_PATTERNS.some((pattern) => pattern.test(pathname));

    for (const key of INTERNAL_QUERY_KEYS) {
      currentUrl.searchParams.delete(key);
    }

    if (!supportsCountry || normalizeCountryRouteValue(currentUrl.searchParams.get('country')) === 'all') {
      currentUrl.searchParams.delete('country');
    }

    if (currentUrl.searchParams.get('lang') === COUPONLEO_DEFAULT_LOCALE) {
      currentUrl.searchParams.delete('lang');
    }

    if (supportsPage) {
      this.normalizePageQueryParam(currentUrl, 'page');
    } else {
      currentUrl.searchParams.delete('page');
    }

    if (pathname === '/country-deals') {
      for (const key of COUNTRY_DEALS_PAGE_QUERY_KEYS) {
        this.normalizePageQueryParam(currentUrl, key);
      }
    } else {
      for (const key of COUNTRY_DEALS_PAGE_QUERY_KEYS) {
        currentUrl.searchParams.delete(key);
      }
    }
  }

  private normalizePageQueryParam(currentUrl: URL, key: string): void {
    const normalizedPage = this.normalizePageRouteValue(currentUrl.searchParams.get(key));

    if (normalizedPage <= 1) {
      currentUrl.searchParams.delete(key);
      return;
    }

    currentUrl.searchParams.set(key, String(normalizedPage));
  }

  private normalizePageRouteValue(value: string | number | null | undefined): number {
    const parsedValue = Number.parseInt(String(value ?? ''), 10);
    return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : 1;
  }

  private updateCanonicalLink(href: string): void {
    const head = this.document.head;
    let canonicalLink = head.querySelector(`link[rel="${CANONICAL_REL}"]`) as HTMLLinkElement | null;

    if (!canonicalLink) {
      canonicalLink = this.document.createElement('link');
      canonicalLink.setAttribute('rel', CANONICAL_REL);
      head.appendChild(canonicalLink);
    }

    canonicalLink.href = href;
  }

  private updateHreflangLinks(canonicalUrl: string): void {
    for (const link of Array.from(this.document.head.querySelectorAll(HREFLANG_SELECTOR))) {
      link.remove();
    }

    for (const locale of this.localeService.localeOptions()) {
      const link = this.document.createElement('link');
      link.setAttribute('rel', 'alternate');
      link.setAttribute('hreflang', locale.value.toLowerCase());
      link.setAttribute('href', this.localeService.withLocaleQuery(canonicalUrl, locale.value));
      this.document.head.appendChild(link);
    }

    const defaultLink = this.document.createElement('link');
    defaultLink.setAttribute('rel', 'alternate');
    defaultLink.setAttribute('hreflang', 'x-default');
    defaultLink.setAttribute('href', this.localeService.withLocaleQuery(canonicalUrl, 'en-US'));
    this.document.head.appendChild(defaultLink);
  }
}
