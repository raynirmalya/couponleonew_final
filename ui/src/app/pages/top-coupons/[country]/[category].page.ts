import { isPlatformServer } from '@angular/common';
import { Component, computed, effect, inject, makeStateKey, PLATFORM_ID, TransferState } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Meta, Title } from '@angular/platform-browser';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { injectResponse } from '@analogjs/router/tokens';
import { catchError, combineLatest, distinctUntilChanged, map, of, shareReplay, startWith, switchMap, tap } from 'rxjs';

import {
  COUPONLEO_COUNTRY_PAGE_MIN_COUPONS,
  COUPONLEO_COUNTRY_PAGE_MIN_STORES,
  findCouponleoCountryPage,
} from '../../../content/couponleo-country-pages';
import {
  CouponleoApiService,
  type CouponleoCoupon,
  type CouponleoCountryHighlights,
  type CouponleoSeoGroupings,
} from '../../../services/couponleo-api.service';
import { createDynamicRouteMeta, humanizeSlug } from '../../../services/couponleo-route-meta';
import { buildStoreRoute, formatExpiryLabel, isCouponLive } from '../../../services/couponleo-ui.helpers';

export const routeMeta = createDynamicRouteMeta((route) => {
  const market = findCouponleoCountryPage(route.paramMap.get('country') ?? '');
  const category = humanizeSlug(route.paramMap.get('category') ?? 'category');
  if (!market) {
    return { title: 'Coupon Group Not Found | CouponLeo', description: 'This coupon group is unavailable.', robots: 'noindex,nofollow' };
  }
  return {
    title: `${category} Coupons in ${market.countryName} | CouponLeo`,
    description: `Compare current ${category.toLowerCase()} coupons and deals listed for ${market.countryName}. See stores, codes, offer conditions, and expiry details.`,
  };
});

type SeoGroup = CouponleoSeoGroupings['groups'][number];
interface GroupingState { data: CouponleoSeoGroupings; loading: boolean; error: boolean }
interface CouponState { data: CouponleoCountryHighlights; loading: boolean; error: boolean }
const emptyGroupings: CouponleoSeoGroupings = { countries: [], groups: [] };
const emptyCoupons: CouponleoCountryHighlights = { items: [], total: 0 };
const groupingsStateKey = makeStateKey<CouponleoSeoGroupings>('couponleo-seo-groupings');

@Component({
  selector: 'app-couponleo-country-category-page',
  imports: [RouterLink],
  template: `
    <main class="couponleo-group-page">
      @if (groupings().loading) {
        <h1>Loading coupon group</h1>
      } @else if (groupings().error) {
        <h1>Offers are temporarily unavailable</h1>
        <p>Please try again later.</p>
      } @else if (market(); as country) {
        @if (group(); as current) {
          <nav class="couponleo-group-page__breadcrumbs" aria-label="Breadcrumb">
            <a routerLink="/">Home</a><span aria-hidden="true">/</span>
            <a routerLink="/top-coupons">Top coupons</a><span aria-hidden="true">/</span>
            <a [routerLink]="['/top-coupons', country.slug]">{{ country.countryName }} coupons</a><span aria-hidden="true">/</span>
            <span aria-current="page">{{ current.categoryName }}</span>
          </nav>
          <header class="couponleo-group-page__hero">
            <span class="couponleo-eyebrow">Coupons by country and category</span>
            <h1>{{ current.categoryName }} Coupons in {{ country.countryName }}</h1>
            <p>Compare current {{ current.categoryName.toLowerCase() }} offers listed for {{ country.countryName }}. The offers below come from different stores, so you can compare codes, conditions, and expiry dates before choosing one.</p>
            <p class="couponleo-group-page__count">{{ current.couponCount.toLocaleString() }} active offers across {{ current.storeCount.toLocaleString() }} stores in this group.</p>
            <a [routerLink]="['/top-coupons', country.slug]">Browse all {{ country.countryName }} coupons</a>
          </header>

          @if (coupons().loading) {
            <section class="couponleo-group-page__section" aria-live="polite"><h2>Loading current offers</h2></section>
          } @else if (coupons().error) {
            <section class="couponleo-group-page__section" aria-live="polite">
              <h2>Offers are temporarily unavailable</h2><p>Please try again later.</p>
            </section>
          } @else {
            <section class="couponleo-group-page__section" aria-labelledby="group-offers-heading">
              <h2 id="group-offers-heading">Current {{ current.categoryName.toLowerCase() }} offers</h2>
              <p>One current offer is shown per store. Check the merchant checkout for the final discount.</p>
              <div class="couponleo-group-page__grid">
                @for (coupon of selectedCoupons(); track coupon.slug) {
                  <article class="couponleo-card couponleo-group-page__card">
                    <a [routerLink]="buildStoreRoute(coupon.storeSlug)">{{ coupon.storeName }}</a>
                    <h3>{{ coupon.title }}</h3>
                    <p>{{ coupon.description }}</p>
                    <div class="couponleo-group-page__meta">
                      <span>{{ coupon.code ? 'Code: ' + coupon.code : 'No code listed' }}</span>
                      <span>{{ formatExpiryLabel(coupon.expiresAt) }}</span>
                    </div>
                    <a [routerLink]="buildStoreRoute(coupon.storeSlug)">See store offers</a>
                  </article>
                }
              </div>
            </section>
          }

          <section class="couponleo-group-page__section couponleo-group-page__method">
            <h2>How to compare these coupons</h2>
            <p>Start with a store that serves your location. Compare the listed discount and code with the merchant's current terms, including product exclusions, minimum spend, and expiry. A country label does not guarantee every order qualifies.</p>
            <h3>Do these offers all require a code?</h3>
            <p>No. Cards show a code when the catalog has one. Other deals may apply on the merchant site without a code.</p>
          </section>

          @if (relatedGroups().length > 0) {
            <nav class="couponleo-group-page__section" aria-label="Related categories">
              <h2>More categories in {{ country.countryName }}</h2>
              <div class="couponleo-group-page__links">
                @for (related of relatedGroups(); track related.categorySlug) {
                  <a [routerLink]="['/top-coupons', country.slug, related.categorySlug]">{{ related.categoryName }}</a>
                }
              </div>
            </nav>
          }
        } @else {
          <h1>Coupon group not found</h1>
          <p>This category does not currently have enough offers from different stores for a dedicated page.</p>
          <a [routerLink]="['/top-coupons', country.slug]">Browse {{ country.countryName }} coupons</a>
        }
      } @else {
        <h1>Country not found</h1>
        <a routerLink="/country-deals">Browse country deals</a>
      }
    </main>
  `,
  styles: [`
    .couponleo-group-page { max-width: 1180px; margin: 0 auto; padding: 28px 20px 72px; color: var(--couponleo-text); }
    .couponleo-group-page a { color: var(--couponleo-orange); text-underline-offset: 3px; }
    .couponleo-group-page a:focus-visible { outline: 3px solid var(--couponleo-orange); outline-offset: 4px; }
    .couponleo-group-page__breadcrumbs, .couponleo-group-page__links, .couponleo-group-page__meta { display: flex; flex-wrap: wrap; gap: 10px 20px; }
    .couponleo-group-page__breadcrumbs { margin-bottom: 28px; font-size: .9rem; }
    .couponleo-group-page__hero { padding: clamp(28px, 5vw, 64px); border-radius: 24px; background: var(--couponleo-surface-soft, #f7f7f7); }
    .couponleo-group-page__hero h1 { max-width: 850px; margin: 12px 0 18px; font-size: clamp(2rem, 5vw, 3.7rem); line-height: 1.12; }
    .couponleo-group-page__hero p { max-width: 800px; line-height: 1.7; }
    .couponleo-group-page__count { font-weight: 700; }
    .couponleo-group-page__section { margin-top: 46px; }
    .couponleo-group-page__section p { line-height: 1.7; }
    .couponleo-group-page__grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 20px; margin-top: 24px; }
    .couponleo-group-page__card { display: flex; flex-direction: column; gap: 12px; min-width: 0; padding: 22px; overflow-wrap: anywhere; }
    .couponleo-group-page__card h3, .couponleo-group-page__card p { margin: 0; }
    .couponleo-group-page__card > a:last-child { margin-top: auto; }
    .couponleo-group-page__meta { font-size: .9rem; }
    .couponleo-group-page__method { padding: 26px; border-radius: 20px; background: var(--couponleo-surface-soft, #f7f7f7); }
    @media (max-width: 900px) { .couponleo-group-page__grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @media (max-width: 600px) { .couponleo-group-page__grid { grid-template-columns: 1fr; } .couponleo-group-page__hero { padding: 26px 20px; } }
  `],
})
export default class CouponleoCountryCategoryPage {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(CouponleoApiService);
  private readonly meta = inject(Meta);
  private readonly title = inject(Title);
  private readonly response = injectResponse();
  private readonly platformId = inject(PLATFORM_ID);
  private readonly transferState = inject(TransferState);
  private readonly hydratedGroupings = this.transferState.hasKey(groupingsStateKey)
    ? this.transferState.get(groupingsStateKey, emptyGroupings)
    : null;
  private readonly key$ = this.route.paramMap.pipe(
    map((params) => ({ country: params.get('country') ?? '', category: params.get('category') ?? '' })),
    distinctUntilChanged((a, b) => a.country === b.country && a.category === b.category),
  );
  private readonly groupings$ = this.api.listSeoGroupings().pipe(
    map((data) => ({ data, loading: false, error: false } satisfies GroupingState)),
    startWith(this.hydratedGroupings
      ? { data: this.hydratedGroupings, loading: false, error: false } satisfies GroupingState
      : { data: emptyGroupings, loading: true, error: false } satisfies GroupingState),
    tap((state) => {
      if (isPlatformServer(this.platformId) && !state.loading && !state.error) {
        this.transferState.set(groupingsStateKey, state.data);
      }
    }),
    catchError(() => of({ data: emptyGroupings, loading: false, error: true } satisfies GroupingState)),
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  protected readonly key = toSignal(this.key$, { initialValue: {
    country: this.route.snapshot.paramMap.get('country') ?? '',
    category: this.route.snapshot.paramMap.get('category') ?? '',
  } });
  protected readonly market = computed(() => findCouponleoCountryPage(this.key().country));
  protected readonly groupings = toSignal(this.groupings$, { initialValue: { data: emptyGroupings, loading: true, error: false } });
  protected readonly group = computed<SeoGroup | undefined>(() => this.groupings().data.groups.find((item) => (
    item.countrySlug === this.key().country && item.categorySlug === this.key().category
  )));
  protected readonly relatedGroups = computed(() => this.groupings().data.groups
    .filter((item) => item.countrySlug === this.key().country && item.categorySlug !== this.key().category)
    .slice(0, 8));
  protected readonly coupons = toSignal(combineLatest([this.key$, this.groupings$]).pipe(
    switchMap(([key, groups]) => {
      if (groups.loading || groups.error || !groups.data.groups.some((item) => item.countrySlug === key.country && item.categorySlug === key.category)) {
        return of({ data: emptyCoupons, loading: groups.loading, error: groups.error } satisfies CouponState);
      }
      const market = findCouponleoCountryPage(key.country);
      if (!market) return of({ data: emptyCoupons, loading: false, error: false } satisfies CouponState);
      const highlightsStateKey = makeStateKey<CouponleoCountryHighlights>(`couponleo-seo-highlights:${key.country}:${key.category}`);
      const hydratedHighlights = this.transferState.hasKey(highlightsStateKey)
        ? this.transferState.get(highlightsStateKey, emptyCoupons)
        : null;
      return this.api.listCountryCouponHighlights(market.slug, key.category).pipe(
        map((data) => ({ data, loading: false, error: false } satisfies CouponState)),
        startWith(hydratedHighlights
          ? { data: hydratedHighlights, loading: false, error: false } satisfies CouponState
          : { data: emptyCoupons, loading: true, error: false } satisfies CouponState),
        tap((state) => {
          if (isPlatformServer(this.platformId) && !state.loading && !state.error) {
            this.transferState.set(highlightsStateKey, state.data);
          }
        }),
        catchError(() => of({ data: emptyCoupons, loading: false, error: true } satisfies CouponState)),
      );
    }),
  ), { initialValue: { data: emptyCoupons, loading: true, error: false } });
  protected readonly selectedCoupons = computed(() => {
    const stores = new Set<string>();
    const items: CouponleoCoupon[] = [];
    for (const coupon of this.coupons().data.items) {
      if (!coupon.storeSlug || !coupon.title || !isCouponLive(coupon.expiresAt) || stores.has(coupon.storeSlug)) continue;
      stores.add(coupon.storeSlug);
      items.push(coupon);
      if (items.length >= 12) break;
    }
    return items;
  });
  protected readonly buildStoreRoute = buildStoreRoute;
  protected readonly formatExpiryLabel = formatExpiryLabel;

  constructor() {
    effect(() => {
      const groups = this.groupings();
      const state = this.coupons();
      if (groups.loading || state.loading) return;
      if (groups.error || state.error) {
        if (this.response) this.response.statusCode = 503;
        this.meta.updateTag({ name: 'robots', content: 'noindex,follow' }, 'name="robots"');
      } else if (!this.market() || !this.group()) {
        if (this.response) this.response.statusCode = 404;
        this.meta.updateTag({ name: 'robots', content: 'noindex,nofollow' }, 'name="robots"');
      } else if (state.data.total < COUPONLEO_COUNTRY_PAGE_MIN_COUPONS || this.selectedCoupons().length < COUPONLEO_COUNTRY_PAGE_MIN_STORES) {
        this.meta.updateTag({ name: 'robots', content: 'noindex,follow' }, 'name="robots"');
      } else {
        this.meta.updateTag({ name: 'robots', content: 'index,follow' }, 'name="robots"');
      }
      const group = this.group();
      const market = this.market();
      if (group && market && !groups.error) {
        const title = `${group.categoryName} Coupons in ${market.countryName} | CouponLeo`;
        const description = `Compare ${group.couponCount.toLocaleString()} current ${group.categoryName.toLowerCase()} offers from ${group.storeCount.toLocaleString()} stores listed for ${market.countryName}. Check codes, terms, and expiry before checkout.`;
        this.title.setTitle(title);
        this.meta.updateTag({ name: 'description', content: description }, 'name="description"');
        this.meta.updateTag({ property: 'og:title', content: title }, 'property="og:title"');
        this.meta.updateTag({ property: 'og:description', content: description }, 'property="og:description"');
        this.meta.updateTag({ name: 'twitter:title', content: title }, 'name="twitter:title"');
        this.meta.updateTag({ name: 'twitter:description', content: description }, 'name="twitter:description"');
      }
    });
  }
}
