import { HttpClient, HttpParams } from '@angular/common/http';
import { isPlatformServer } from '@angular/common';
import { inject, Injectable, InjectionToken, PLATFORM_ID } from '@angular/core';
import { EMPTY, Observable, catchError, expand, reduce, shareReplay, throwError, timeout } from 'rxjs';

export interface CouponleoListResponse<T> {
  items: T[];
  total: number;
  page?: number;
  pageSize?: number;
  pageCount?: number;
  hasNextPage?: boolean;
  hasPreviousPage?: boolean;
}

export interface CouponleoDataResponse<T> {
  data: T;
}

export interface CouponleoCategory {
  id: number | string;
  name: string;
  slug: string;
  headline: string;
  description?: string;
  metaDescription?: string;
  seoParagraphs?: string[];
  keywordHighlights?: string[];
  couponCount: number;
  storeCount?: number;
}

export interface CouponleoOfferVerification {
  schemaVersion: number;
  offerFingerprint: string;
  status: 'unverified' | 'review_needed' | 'checkout_passed' | 'checkout_failed' | 'merchant_confirmed' | 'revoked' | 'offer_changed' | 'stale';
  checkedAt: string | null;
  validUntil: string | null;
  country: string;
  conditions: string;
  summary: string;
  listingCheckedAt: string;
  listingChecks: Array<{ name: string; status: 'pass' | 'fail' | 'unknown'; detail: string }>;
}

export interface CouponleoCoupon {
  id: number;
  slug: string;
  title: string;
  description: string;
  code: string;
  discountText: string;
  type: 'code' | 'deal';
  storeId: number | string;
  storeName: string;
  storeSlug: string;
  categorySlug: string;
  categoryName: string;
  featured: boolean;
  verified: boolean;
  verification?: CouponleoOfferVerification;
  expiresAt: string;
  ctaUrl: string;
  savingsNote: string;
  score: number;
  brand_logo?: string;
  image_url?: string;
  location?: string;
  primary_location?: string;
  locations?: string;
}

export interface CouponleoStore {
  id: number | string;
  name: string;
  slug: string;
  headline: string;
  description?: string;
  metaDescription?: string;
  category_hint?: string;
  websiteDescription?: string;
  websiteMetaDescription?: string;
  seoParagraphs?: string[];
  keywordHighlights?: string[];
  offerExamples?: string[];
  websiteHost?: string;
  location: string;
  category: string;
  activeCoupons: number;
  couponCount?: number;
  savings: string;
  featured: boolean;
  logoUrl?: string;
  logo_horizontal_url?: string;
  logo_square_url?: string;
  image_url?: string;
  url?: string;
}

export interface CouponleoLocation {
  id: number | string;
  code?: string;
  name: string;
  country: string;
  spotlight: string;
  couponCount?: number;
  storeCount?: number;
}

export interface CouponleoStoreAnalytics {
  totalCoupons: number;
  totalStores: number;
  featuredCoupons: number;
  liveMarkets: number;
}

export interface CouponleoBlogArticle {
  id: number | string;
  sourceName: string;
  sourceHomeUrl: string;
  articleUrl: string;
  canonicalUrl: string;
  slug: string;
  title: string;
  excerpt: string;
  imageUrl?: string;
  authorName?: string;
  publishedAt: string;
  topic: string;
  languageCode: string;
  marketScope: string;
  featured: boolean;
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export type CouponleoTelemetryMetadata = Record<string, unknown> | unknown[] | string | number | boolean | null;

export interface CouponleoTelemetryEventPayload {
  eventId?: string;
  occurredAt?: string;
  eventType: string;
  eventName?: string;
  pagePath?: string;
  pageQuery?: string;
  pageTitle?: string;
  referrerUrl?: string;
  targetUrl?: string;
  actionLabel?: string;
  elementTag?: string;
  elementRole?: string;
  sessionId?: string;
  visitorId?: string;
  userEmail?: string;
  authState?: string;
  selectedCountry?: string;
  countryCode?: string;
  countryName?: string;
  regionName?: string;
  cityName?: string;
  selectedLocale?: string;
  browserLanguage?: string;
  timezone?: string;
  screenWidth?: number;
  screenHeight?: number;
  viewportWidth?: number;
  viewportHeight?: number;
  userAgent?: string;
  source?: string;
  metadata?: CouponleoTelemetryMetadata;
}

export interface CouponleoTelemetryEvent extends CouponleoTelemetryEventPayload {
  receivedAt?: string;
  ipAddress?: string;
  ipHash?: string;
  forwardedFor?: string;
  countryCode?: string;
  countryName?: string;
  regionName?: string;
  cityName?: string;
  locationSource?: string;
  requestHost?: string;
  requestMethod?: string;
}

export interface CouponleoTelemetrySummary {
  enabled: boolean;
  windowDays: number;
  generatedAt: string;
  totals: {
    totalEvents: number;
    pageViews: number;
    uniqueSessions: number;
    uniqueVisitors: number;
    countryCount: number;
  };
  topPages: Array<{
    pagePath: string;
    views: number;
    uniqueVisitors: number;
    lastSeenAt: string;
  }>;
  topActions: Array<{
    eventType: string;
    label: string;
    total: number;
    lastSeenAt: string;
  }>;
  topCountries: Array<{
    country: string;
    total: number;
    uniqueVisitors: number;
  }>;
  timeline: Array<{
    day: string;
    totalEvents: number;
    pageViews: number;
    uniqueVisitors: number;
  }>;
  limit?: number;
}

export interface CouponleoTelemetryIngestResult {
  accepted: number;
  stored: number;
  enabled: boolean;
}

export interface CouponleoCategoryListParams {
  location?: string;
  q?: string;
  page?: number;
  pageSize?: number;
}

export interface CouponleoCountryHighlights {
  items: CouponleoCoupon[];
  total: number;
}

export interface CouponleoSeoGroupings {
  countries: { slug: string; name: string; couponCount: number; storeCount: number }[];
  groups: { countrySlug: string; countryName: string; categorySlug: string; categoryName: string; couponCount: number; storeCount: number }[];
}

export interface CouponleoCouponListParams {
  active?: boolean;
  category?: string;
  featured?: boolean;
  location?: string;
  page?: number;
  pageSize?: number;
  q?: string;
  store?: string;
}

export interface CouponleoStoreListParams {
  category?: string;
  featured?: boolean;
  location?: string;
  page?: number;
  pageSize?: number;
  q?: string;
  startsWith?: string;
}

export interface CouponleoLocationListParams {
  page?: number;
  pageSize?: number;
}

export interface CouponleoBlogArticleListParams {
  featured?: boolean;
  page?: number;
  pageSize?: number;
  q?: string;
  source?: string;
  topic?: string;
}

export interface CouponleoTelemetrySummaryParams {
  days?: number;
  limit?: number;
}

export interface CouponleoTelemetryEventListParams {
  days?: number;
  eventType?: string;
  page?: number;
  pagePath?: string;
  pageSize?: number;
}

export const COUPONLEO_API_BASE_URL = new InjectionToken<string>('COUPONLEO_API_BASE_URL');

function couponleoServerReadTimeoutMs(): number {
  const rawValue = (globalThis as { process?: { env?: Record<string, string | undefined> } })
    .process?.env?.['COUPONLEO_SERVER_FETCH_TIMEOUT_MS'];
  const parsedValue = Number(rawValue);
  return Number.isFinite(parsedValue) && parsedValue >= 3_000
    ? parsedValue
    : 15_000;
}

@Injectable({ providedIn: 'root' })
export class CouponleoApiService {
  private readonly http = inject(HttpClient);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly baseUrl = inject(COUPONLEO_API_BASE_URL, { optional: true }) ?? '/couponleo/api';
  private readonly responseCache = new Map<string, { expiresAt: number; response$: Observable<unknown> }>();
  private readonly publicReadCacheTtlMs = 600_000;
  private readonly detailReadCacheTtlMs = 1_800_000;
  private readonly marketReadCacheTtlMs = 900_000;
  private readonly couponReadCacheTtlMs = 30_000;

  listCategories(params: CouponleoCategoryListParams = {}): Observable<CouponleoListResponse<CouponleoCategory>> {
    const httpParams = this.buildParams(params);
    return this.cachedGet<CouponleoListResponse<CouponleoCategory>>(
      `${this.baseUrl}/categories`,
      httpParams,
      params.q ? this.publicReadCacheTtlMs : this.marketReadCacheTtlMs,
    );
  }

  getCategory(identifier: string): Observable<CouponleoDataResponse<CouponleoCategory>> {
    return this.cachedGet<CouponleoDataResponse<CouponleoCategory>>(
      `${this.baseUrl}/categories/${encodeURIComponent(identifier)}`,
      undefined,
      this.detailReadCacheTtlMs,
    );
  }

  listCoupons(params: CouponleoCouponListParams = {}): Observable<CouponleoListResponse<CouponleoCoupon>> {
    const httpParams = this.buildParams(params);
    return this.cachedGet<CouponleoListResponse<CouponleoCoupon>>(`${this.baseUrl}/coupons`, httpParams, this.couponReadCacheTtlMs);
  }

  listSeoGroupings(): Observable<CouponleoSeoGroupings> {
    return this.cachedGet<CouponleoSeoGroupings>(`${this.baseUrl}/seo/groupings`, undefined, this.marketReadCacheTtlMs);
  }

  listCountryCouponHighlights(country: string, category?: string): Observable<CouponleoCountryHighlights> {
    return this.cachedGet<CouponleoCountryHighlights>(
      `${this.baseUrl}/seo/highlights`,
      this.buildParams({ country, category }),
      this.couponReadCacheTtlMs,
    );
  }

  listFeaturedCoupons(
    params: Pick<CouponleoCouponListParams, 'active' | 'page' | 'pageSize'> = {},
  ): Observable<CouponleoListResponse<CouponleoCoupon>> {
    const httpParams = this.buildParams(params);
    return this.cachedGet<CouponleoListResponse<CouponleoCoupon>>(`${this.baseUrl}/coupons/featured`, httpParams, this.couponReadCacheTtlMs);
  }

  listCouponsByStore(
    storeSlug: string,
    params: Omit<CouponleoCouponListParams, 'store'> = {},
  ): Observable<CouponleoListResponse<CouponleoCoupon>> {
    const httpParams = this.buildParams(params);
    return this.cachedGet<CouponleoListResponse<CouponleoCoupon>>(
      `${this.baseUrl}/coupons/store/${encodeURIComponent(storeSlug)}`,
      httpParams,
      this.couponReadCacheTtlMs,
    );
  }

  listCouponsByCategory(
    categorySlug: string,
    params: Omit<CouponleoCouponListParams, 'category'> = {},
  ): Observable<CouponleoListResponse<CouponleoCoupon>> {
    return this.listCoupons({
      ...params,
      category: categorySlug,
    });
  }

  listStores(params: CouponleoStoreListParams = {}): Observable<CouponleoListResponse<CouponleoStore>> {
    const httpParams = this.buildParams(params);
    return this.cachedGet<CouponleoListResponse<CouponleoStore>>(
      `${this.baseUrl}/stores`,
      httpParams,
      params.q ? this.publicReadCacheTtlMs : this.marketReadCacheTtlMs,
    );
  }

  getCouponVerification(identifier: number | string): Observable<CouponleoDataResponse<CouponleoOfferVerification>> {
    // Refresh when a shopper opens the offer; an old card may precede a revocation.
    return this.http.get<CouponleoDataResponse<CouponleoOfferVerification>>(
      `${this.baseUrl}/coupons/${encodeURIComponent(String(identifier))}/verification`,
    ).pipe(timeout(8000));
  }

  listAllStores(
    params: Omit<CouponleoStoreListParams, 'page' | 'pageSize'> = {},
    pageSize = 250,
  ): Observable<CouponleoListResponse<CouponleoStore>> {
    return this.listStores({ ...params, page: 1, pageSize }).pipe(
      expand((response) => {
        if (!response.hasNextPage) {
          return EMPTY;
        }

        return this.listStores({
          ...params,
          page: (response.page ?? 1) + 1,
          pageSize,
        });
      }),
      reduce(
        (combined, response) => {
          const items = [...combined.items, ...response.items];
          const total = response.total ?? combined.total;

          return {
            items,
            total,
            page: 1,
            pageSize: total || items.length,
            pageCount: 1,
            hasNextPage: false,
            hasPreviousPage: false,
          };
        },
        {
          items: [] as CouponleoStore[],
          total: 0,
          page: 1,
          pageSize: 0,
          pageCount: 1,
          hasNextPage: false,
          hasPreviousPage: false,
        } satisfies CouponleoListResponse<CouponleoStore>,
      ),
    );
  }

  getStore(identifier: string): Observable<CouponleoDataResponse<CouponleoStore>> {
    return this.cachedGet<CouponleoDataResponse<CouponleoStore>>(
      `${this.baseUrl}/stores/${encodeURIComponent(identifier)}`,
      undefined,
      this.detailReadCacheTtlMs,
    );
  }

  listLocations(params: CouponleoLocationListParams = {}): Observable<CouponleoListResponse<CouponleoLocation>> {
    const httpParams = this.buildParams(params);
    return this.cachedGet<CouponleoListResponse<CouponleoLocation>>(
      `${this.baseUrl}/locations`,
      httpParams,
      this.marketReadCacheTtlMs,
    );
  }

  getStoreAnalytics(): Observable<CouponleoDataResponse<CouponleoStoreAnalytics>> {
    return this.cachedGet<CouponleoDataResponse<CouponleoStoreAnalytics>>(
      `${this.baseUrl}/stores/analytics/summary`,
      undefined,
      this.detailReadCacheTtlMs,
    );
  }

  listBlogArticles(params: CouponleoBlogArticleListParams = {}): Observable<CouponleoListResponse<CouponleoBlogArticle>> {
    if (params.pageSize === 18 && params.page === undefined && params.q === undefined
      && params.source === undefined && params.topic === undefined && params.featured === undefined) {
      return this.cachedGet<CouponleoListResponse<CouponleoBlogArticle>>(
        `${this.baseUrl}/seo/articles`, undefined, this.publicReadCacheTtlMs,
      );
    }
    const httpParams = this.buildParams(params);
    return this.cachedGet<CouponleoListResponse<CouponleoBlogArticle>>(`${this.baseUrl}/articles`, httpParams);
  }

  getBlogArticle(identifier: string): Observable<CouponleoDataResponse<CouponleoBlogArticle>> {
    return this.cachedGet<CouponleoDataResponse<CouponleoBlogArticle>>(
      `${this.baseUrl}/articles/${encodeURIComponent(identifier)}`,
    );
  }

  recordTelemetryEvents(
    events: CouponleoTelemetryEventPayload[],
  ): Observable<CouponleoDataResponse<CouponleoTelemetryIngestResult>> {
    return this.http.post<CouponleoDataResponse<CouponleoTelemetryIngestResult>>(`${this.baseUrl}/telemetry/events`, {
      events,
    });
  }

  getTelemetrySummary(
    params: CouponleoTelemetrySummaryParams = {},
  ): Observable<CouponleoDataResponse<CouponleoTelemetrySummary>> {
    return this.http.get<CouponleoDataResponse<CouponleoTelemetrySummary>>(`${this.baseUrl}/telemetry/summary`, {
      params: this.buildParams(params),
    });
  }

  listTelemetryEvents(
    params: CouponleoTelemetryEventListParams = {},
  ): Observable<CouponleoListResponse<CouponleoTelemetryEvent>> {
    return this.http.get<CouponleoListResponse<CouponleoTelemetryEvent>>(`${this.baseUrl}/telemetry/events`, {
      params: this.buildParams(params),
    });
  }

  private cachedGet<T>(url: string, params?: HttpParams, ttlMs = this.publicReadCacheTtlMs): Observable<T> {
    const cacheKey = this.buildCacheKey(url, params);
    const cachedEntry = this.responseCache.get(cacheKey);

    if (cachedEntry && cachedEntry.expiresAt > Date.now()) {
      return cachedEntry.response$ as Observable<T>;
    }

    if (cachedEntry) {
      this.responseCache.delete(cacheKey);
    }

    const request$ = this.http.get<T>(url, params ? { params } : {}).pipe(
      timeout({
        first: isPlatformServer(this.platformId)
          ? (url.includes('/seo/') ? Math.max(couponleoServerReadTimeoutMs(), 20_000) : couponleoServerReadTimeoutMs())
          : 30_000,
      }),
      catchError((error) => {
        this.responseCache.delete(cacheKey);
        return throwError(() => error);
      }),
      shareReplay({ bufferSize: 1, refCount: false }),
    );

    this.responseCache.set(cacheKey, {
      expiresAt: Date.now() + ttlMs,
      response$: request$,
    });

    return request$;
  }

  private buildCacheKey(url: string, params?: HttpParams): string {
    const queryString = params?.toString() ?? '';
    return queryString ? `${url}?${queryString}` : url;
  }

  private buildParams(params: object): HttpParams {
    let httpParams = new HttpParams();

    for (const [key, value] of Object.entries(params as Record<string, string | number | boolean | null | undefined>)) {
      if (value === undefined || value === null || value === '') {
        continue;
      }

      httpParams = httpParams.set(key, String(value));
    }

    return httpParams;
  }
}
