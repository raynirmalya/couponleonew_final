import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, effect, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { injectBaseURL } from '@analogjs/router/tokens';
import { CouponleoI18nService } from './couponleo-i18n.service';
import {
  isCouponleoLocalizedPublicPath,
  localizeCouponleoPathname,
  stripCouponleoLocaleFromPathname,
} from './couponleo-locale-paths';
import { CouponleoLocaleService } from './couponleo-locale.service';
import { humanizeSlug } from './couponleo-route-meta';
import { type CouponleoSeoFaqItem } from './couponleo-seo-copy.helpers';
import { getCategoryPresentation, normalizeCountryRouteValue } from './couponleo-ui.helpers';

const CANONICAL_REL = 'canonical';
const HREFLANG_SELECTOR = 'link[rel="alternate"][hreflang]';
const STRUCTURED_DATA_SCRIPT_ID = 'couponleo-structured-data';
const PUBLIC_SITE_ORIGIN = 'https://couponleo.com';
const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost']);
const CANONICAL_ROUTE_ALIASES: Record<string, string> = {
  '/blogs': '/blog',
  '/login': '/sign-in',
  '/saved': '/wishlist',
  '/signin': '/sign-in',
  '/signup': '/sign-up',
  '/terms-conditions': '/terms-of-use',
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
  private pageFaqs: CouponleoSeoFaqItem[] = [];

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
        this.pageFaqs = [];
        queueMicrotask(() => this.syncDocumentLinks());
      });

    if (this.router.navigated) {
      queueMicrotask(() => this.syncDocumentLinks());
    }
  }

  refreshDocumentMetadata(): void {
    queueMicrotask(() => this.syncDocumentLinks());
  }

  setPageFaqs(faqs: CouponleoSeoFaqItem[]): void {
    this.pageFaqs = [...faqs]
      .filter((item) => item.question.trim() && item.answer.trim())
      .slice(0, 6);
    this.refreshDocumentMetadata();
  }

  private syncDocumentLinks(): void {
    const canonicalUrl = this.currentAbsoluteUrl();
    const currentDescription = this.meta.getTag('name="description"')?.content || 'CouponLeo';
    const imageUrl = this.resolveAbsoluteImageUrl(canonicalUrl);
    const localizedSeo = this.i18n.localizeSeo(
      new URL(canonicalUrl).pathname,
      this.title.getTitle() || 'CouponLeo',
      currentDescription,
    );

    this.title.setTitle(localizedSeo.title);
    this.updateCanonicalLink(canonicalUrl);
    this.updateHreflangLinks(canonicalUrl);
    this.updateStructuredData(canonicalUrl, localizedSeo.title, localizedSeo.description);
    this.meta.updateTag({ name: 'description', content: localizedSeo.description }, 'name="description"');
    this.meta.updateTag({ property: 'og:title', content: localizedSeo.title }, 'property="og:title"');
    this.meta.updateTag({ property: 'og:description', content: localizedSeo.description }, 'property="og:description"');
    this.meta.updateTag({ property: 'og:url', content: canonicalUrl }, 'property="og:url"');
    this.meta.updateTag({ property: 'og:site_name', content: 'CouponLeo' }, 'property="og:site_name"');
    this.meta.updateTag({ property: 'og:locale', content: this.localeService.locale().replace('-', '_') }, 'property="og:locale"');
    this.meta.updateTag({ property: 'og:image', content: imageUrl }, 'property="og:image"');
    this.meta.updateTag({ property: 'og:image:alt', content: localizedSeo.title }, 'property="og:image:alt"');
    this.meta.updateTag({ name: 'twitter:title', content: localizedSeo.title }, 'name="twitter:title"');
    this.meta.updateTag({ name: 'twitter:description', content: localizedSeo.description }, 'name="twitter:description"');
    this.meta.updateTag({ name: 'twitter:image', content: imageUrl }, 'name="twitter:image"');
  }

  private currentAbsoluteUrl(): string {
    const baseUrl = this.resolveBaseUrl();
    const currentUrl = new URL(this.router.url || '/', baseUrl);
    const basePathname = stripCouponleoLocaleFromPathname(currentUrl.pathname).pathname;
    const canonicalBasePath = CANONICAL_ROUTE_ALIASES[basePathname] ?? basePathname;

    currentUrl.pathname = isCouponleoLocalizedPublicPath(canonicalBasePath)
      ? localizeCouponleoPathname(canonicalBasePath, this.localeService.locale())
      : canonicalBasePath;

    this.normalizeCanonicalQuery(currentUrl, canonicalBasePath);

    return currentUrl.toString();
  }

  private resolveBaseUrl(): string {
    if (this.baseUrl) {
      try {
        const parsedBaseUrl = new URL(this.baseUrl);
        return LOOPBACK_HOSTS.has(parsedBaseUrl.hostname) ? PUBLIC_SITE_ORIGIN : parsedBaseUrl.origin;
      } catch {
        return this.baseUrl;
      }
    }

    if (this.browser && window.location.origin) {
      return LOOPBACK_HOSTS.has(window.location.hostname) ? PUBLIC_SITE_ORIGIN : window.location.origin;
    }

    return PUBLIC_SITE_ORIGIN;
  }

  private normalizeCanonicalQuery(currentUrl: URL, pathname: string): void {
    const supportsCountry = COUNTRY_AWARE_ROUTE_PATTERNS.some((pattern) => pattern.test(pathname));
    const supportsPage = PAGE_ROUTE_PATTERNS.some((pattern) => pattern.test(pathname));

    for (const key of INTERNAL_QUERY_KEYS) {
      currentUrl.searchParams.delete(key);
    }

    if (!supportsCountry || normalizeCountryRouteValue(currentUrl.searchParams.get('country')) === 'all') {
      currentUrl.searchParams.delete('country');
    }

    currentUrl.searchParams.delete('lang');

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
      link.setAttribute('href', this.localeService.localizedPublicUrl(canonicalUrl, locale.value));
      this.document.head.appendChild(link);
    }

    const defaultLink = this.document.createElement('link');
    defaultLink.setAttribute('rel', 'alternate');
    defaultLink.setAttribute('hreflang', 'x-default');
    defaultLink.setAttribute('href', this.localeService.localizedPublicUrl(canonicalUrl, 'en-US'));
    this.document.head.appendChild(defaultLink);
  }

  private updateStructuredData(canonicalUrl: string, title: string, description: string): void {
    const head = this.document.head;
    let script = head.querySelector(`#${STRUCTURED_DATA_SCRIPT_ID}`) as HTMLScriptElement | null;

    if (!script) {
      script = this.document.createElement('script');
      script.id = STRUCTURED_DATA_SCRIPT_ID;
      script.type = 'application/ld+json';
      head.appendChild(script);
    }

    script.textContent = JSON.stringify(this.buildStructuredData(canonicalUrl, title, description));
  }

  private buildStructuredData(canonicalUrl: string, title: string, description: string): object[] {
    const siteUrl = new URL('/', canonicalUrl).toString();
    const currentUrl = new URL(canonicalUrl);
    const pathname = stripCouponleoLocaleFromPathname(currentUrl.pathname).pathname;
    const schema: object[] = [];
    const entityName = this.deriveStructuredEntityName(pathname, title, currentUrl);
    const breadcrumbs = this.buildBreadcrumbs(siteUrl, currentUrl, pathname, entityName);
    const imageUrl = this.resolveAbsoluteImageUrl(canonicalUrl);
    const market = normalizeCountryRouteValue(currentUrl.searchParams.get('country'));

    if (breadcrumbs.length > 1) {
      schema.push({
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: breadcrumbs.map((item, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          name: item.name,
          item: item.url,
        })),
      });
    }

    if (pathname === '/') {
      schema.push(
        {
          '@context': 'https://schema.org',
          '@type': 'Organization',
          name: 'CouponLeo',
          url: siteUrl,
          image: imageUrl,
        },
        {
          '@context': 'https://schema.org',
          '@type': 'WebSite',
          name: 'CouponLeo',
          url: siteUrl,
          image: imageUrl,
          inLanguage: this.localeService.locale(),
          potentialAction: {
            '@type': 'SearchAction',
            target: `${siteUrl}stores?q={search_term_string}`,
            'query-input': 'required name=search_term_string',
          },
        },
        {
          '@context': 'https://schema.org',
          '@type': 'CollectionPage',
          name: title,
          description,
          url: canonicalUrl,
          image: imageUrl,
          inLanguage: this.localeService.locale(),
          about: {
            '@type': 'Thing',
            name: 'Coupon codes, promo codes, and live shopping deals',
          },
          mainEntity: {
            '@type': 'OfferCatalog',
            name: 'CouponLeo live deals',
          },
        },
      );

      return schema;
    }

    const pageSchema: Record<string, unknown> = {
      '@context': 'https://schema.org',
      '@type': pathname === '/blog' ? 'Blog' : 'CollectionPage',
      name: title,
      description,
      url: canonicalUrl,
      image: imageUrl,
      inLanguage: this.localeService.locale(),
      isPartOf: {
        '@type': 'WebSite',
        name: 'CouponLeo',
        url: siteUrl,
      },
      publisher: {
        '@type': 'Organization',
        name: 'CouponLeo',
        url: siteUrl,
      },
    };

    if (/^\/stores\/[^/]+$/.test(pathname)) {
      pageSchema['about'] = {
        '@type': 'Organization',
        name: entityName,
      };
      pageSchema['mainEntity'] = {
        '@type': 'OfferCatalog',
        name: `${entityName} coupon codes and deals`,
      };
    } else if (/^\/categories\/[^/]+$/.test(pathname)) {
      pageSchema['about'] = {
        '@type': 'Thing',
        name: entityName,
      };
      pageSchema['mainEntity'] = {
        '@type': 'OfferCatalog',
        name: `${entityName} deals and coupon offers`,
      };
    } else if (pathname === '/top-deals') {
      pageSchema['about'] = market === 'all'
        ? { '@type': 'Thing', name: 'Top coupon deals and promo codes' }
        : { '@type': 'Place', name: market };
      pageSchema['mainEntity'] = {
        '@type': 'OfferCatalog',
        name: market === 'all' ? 'Top coupon deals today' : `Top coupon deals in ${market}`,
      };
    } else if (pathname === '/country-deals') {
      pageSchema['about'] = market === 'all'
        ? { '@type': 'Thing', name: 'Country and market deal discovery' }
        : { '@type': 'Place', name: market };
      pageSchema['mainEntity'] = {
        '@type': 'ItemList',
        name: market === 'all' ? 'CouponLeo country and market deals' : `CouponLeo deals in ${market}`,
      };
    } else if (pathname === '/stores') {
      pageSchema['mainEntity'] = {
        '@type': 'ItemList',
        name: market === 'all' ? 'CouponLeo store directory' : `Stores with deals in ${market}`,
      };
    } else if (pathname === '/categories') {
      pageSchema['mainEntity'] = {
        '@type': 'ItemList',
        name: market === 'all' ? 'CouponLeo category directory' : `Categories with deals in ${market}`,
      };
    }

    schema.push(pageSchema);

    if (this.pageFaqs.length > 0) {
      schema.push({
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: this.pageFaqs.map((item) => ({
          '@type': 'Question',
          name: item.question,
          acceptedAnswer: {
            '@type': 'Answer',
            text: item.answer,
          },
        })),
      });
    }

    return schema;
  }

  private resolveAbsoluteImageUrl(canonicalUrl: string): string {
    const currentUrl = new URL(canonicalUrl);
    const pathname = stripCouponleoLocaleFromPathname(currentUrl.pathname).pathname;
    let imagePath = '/assets/images/heroes/top-deals-hero.png';

    if (/^\/categories\/[^/]+$/.test(pathname)) {
      const slug = pathname.split('/').at(-1) ?? '';
      imagePath = getCategoryPresentation(slug).imageSrc;
    } else if (pathname === '/categories') {
      imagePath = '/assets/images/heroes/category-hero.png';
    } else if (pathname === '/stores' || /^\/stores\/[^/]+$/.test(pathname)) {
      imagePath = '/assets/images/heroes/stores-hero.png';
    } else if (pathname === '/blog') {
      imagePath = '/assets/images/blog/blog-hero-visual.png';
    }

    return new URL(imagePath, currentUrl).toString();
  }

  private buildBreadcrumbs(
    siteUrl: string,
    currentUrl: URL,
    pathname: string,
    entityName?: string,
  ): Array<{ name: string; url: string }> {
    const breadcrumbs = [{ name: 'CouponLeo', url: siteUrl }];
    const segments = pathname.split('/').filter(Boolean);

    if (segments.length === 0) {
      return breadcrumbs;
    }

    const routeLabels: Record<string, string> = {
      about: 'About',
      blog: 'Blog',
      categories: 'Categories',
      contact: 'Contact',
      'country-deals': 'Country Deals',
      'help-center': 'Help Center',
      'privacy-policy': 'Privacy Policy',
      stores: 'Stores',
      'terms-of-use': 'Terms of Use',
      'top-deals': 'Top Deals',
    };

    let cumulativePath = '';

    for (const [index, segment] of segments.entries()) {
      cumulativePath += `/${segment}`;
      let name = this.i18n.phrase(routeLabels[segment] ?? humanizeSlug(segment));
      const isLastSegment = index === segments.length - 1;

      if (cumulativePath === '/country-deals') {
        const country = normalizeCountryRouteValue(currentUrl.searchParams.get('country'));
        if (country !== 'all') {
          name = `${name}: ${country}`;
        }
      }

      if (isLastSegment && entityName && /^\/(?:stores|categories)\/[^/]+$/.test(pathname)) {
        name = entityName;
      }

      breadcrumbs.push({
        name,
        url: isLastSegment && currentUrl.search
          ? currentUrl.toString()
          : new URL(localizeCouponleoPathname(cumulativePath, this.localeService.locale()), siteUrl).toString(),
      });
    }

    return breadcrumbs;
  }

  private deriveStructuredEntityName(pathname: string, title: string, currentUrl: URL): string {
    const normalizedTitle = String(title ?? '').trim();

    if (/^\/stores\/[^/]+$/.test(pathname)) {
      const match = normalizedTitle.match(/^(.+?)\s+Coupon Codes\b/i);
      if (match?.[1]?.trim()) {
        return match[1].trim();
      }
    }

    if (/^\/categories\/[^/]+$/.test(pathname)) {
      const match = normalizedTitle.match(/^(.+?)\s+Coupons\b/i);
      if (match?.[1]?.trim()) {
        return match[1].trim();
      }
    }

    if (pathname === '/country-deals') {
      const market = normalizeCountryRouteValue(currentUrl.searchParams.get('country'));
      if (market !== 'all') {
        return market;
      }
    }

    return humanizeSlug(pathname.split('/').filter(Boolean).at(-1) ?? 'CouponLeo');
  }
}
