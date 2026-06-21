import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, effect, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { NavigationEnd, Router } from '@angular/router';
import { filter, startWith } from 'rxjs';
import { injectBaseURL } from '@analogjs/router/tokens';
import { CouponleoI18nService } from './couponleo-i18n.service';
import { CouponleoLocaleService } from './couponleo-locale.service';

const CANONICAL_REL = 'canonical';
const HREFLANG_SELECTOR = 'link[rel="alternate"][hreflang]';
const CANONICAL_ROUTE_ALIASES: Record<string, string> = {
  '/blogs': '/blog',
  '/login': '/sign-in',
  '/saved': '/wishlist',
  '/signin': '/sign-in',
  '/signup': '/sign-up',
};

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
        startWith(null),
      )
      .subscribe(() => {
        this.syncDocumentLinks();
      });
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
