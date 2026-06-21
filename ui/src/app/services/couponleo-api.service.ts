import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable, InjectionToken } from '@angular/core';
import { EMPTY, Observable, expand, reduce } from 'rxjs';

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
  couponCount: number;
  storeCount?: number;
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
  location: string;
  category: string;
  activeCoupons: number;
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
  q?: string;
  page?: number;
  pageSize?: number;
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

@Injectable({ providedIn: 'root' })
export class CouponleoApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(COUPONLEO_API_BASE_URL, { optional: true }) ?? 'http://127.0.0.1:5000/couponleo/api';

  listCategories(params: CouponleoCategoryListParams = {}): Observable<CouponleoListResponse<CouponleoCategory>> {
    return this.http.get<CouponleoListResponse<CouponleoCategory>>(`${this.baseUrl}/categories`, {
      params: this.buildParams(params),
    });
  }

  getCategory(identifier: string): Observable<CouponleoDataResponse<CouponleoCategory>> {
    return this.http.get<CouponleoDataResponse<CouponleoCategory>>(`${this.baseUrl}/categories/${encodeURIComponent(identifier)}`);
  }

  listCoupons(params: CouponleoCouponListParams = {}): Observable<CouponleoListResponse<CouponleoCoupon>> {
    return this.http.get<CouponleoListResponse<CouponleoCoupon>>(`${this.baseUrl}/coupons`, {
      params: this.buildParams(params),
    });
  }

  listFeaturedCoupons(
    params: Pick<CouponleoCouponListParams, 'active' | 'page' | 'pageSize'> = {},
  ): Observable<CouponleoListResponse<CouponleoCoupon>> {
    return this.http.get<CouponleoListResponse<CouponleoCoupon>>(`${this.baseUrl}/coupons/featured`, {
      params: this.buildParams(params),
    });
  }

  listCouponsByStore(
    storeSlug: string,
    params: Omit<CouponleoCouponListParams, 'store'> = {},
  ): Observable<CouponleoListResponse<CouponleoCoupon>> {
    return this.http.get<CouponleoListResponse<CouponleoCoupon>>(`${this.baseUrl}/coupons/store/${encodeURIComponent(storeSlug)}`, {
      params: this.buildParams(params),
    });
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
    return this.http.get<CouponleoListResponse<CouponleoStore>>(`${this.baseUrl}/stores`, {
      params: this.buildParams(params),
    });
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
    return this.http.get<CouponleoDataResponse<CouponleoStore>>(`${this.baseUrl}/stores/${encodeURIComponent(identifier)}`);
  }

  listLocations(params: CouponleoLocationListParams = {}): Observable<CouponleoListResponse<CouponleoLocation>> {
    return this.http.get<CouponleoListResponse<CouponleoLocation>>(`${this.baseUrl}/locations`, {
      params: this.buildParams(params),
    });
  }

  getStoreAnalytics(): Observable<CouponleoDataResponse<CouponleoStoreAnalytics>> {
    return this.http.get<CouponleoDataResponse<CouponleoStoreAnalytics>>(`${this.baseUrl}/stores/analytics/summary`);
  }

  listBlogArticles(params: CouponleoBlogArticleListParams = {}): Observable<CouponleoListResponse<CouponleoBlogArticle>> {
    return this.http.get<CouponleoListResponse<CouponleoBlogArticle>>(`${this.baseUrl}/articles`, {
      params: this.buildParams(params),
    });
  }

  getBlogArticle(identifier: string): Observable<CouponleoDataResponse<CouponleoBlogArticle>> {
    return this.http.get<CouponleoDataResponse<CouponleoBlogArticle>>(`${this.baseUrl}/articles/${encodeURIComponent(identifier)}`);
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
