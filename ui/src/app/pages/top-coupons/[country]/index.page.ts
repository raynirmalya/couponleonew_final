import { Component, computed, effect, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Meta } from '@angular/platform-browser';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { injectResponse } from '@analogjs/router/tokens';
import { catchError, distinctUntilChanged, map, of, startWith, switchMap } from 'rxjs';

import {
  COUPONLEO_COUNTRY_PAGE_MIN_COUPONS,
  COUPONLEO_COUNTRY_PAGE_MIN_STORES,
  couponleoCountryPages,
  findCouponleoCountryPage,
} from '../../../content/couponleo-country-pages';
import { CouponleoApiService, type CouponleoCoupon, type CouponleoCountryHighlights } from '../../../services/couponleo-api.service';
import { createDynamicRouteMeta } from '../../../services/couponleo-route-meta';
import { buildCategoryRoute, buildStoreRoute, formatExpiryLabel, isCouponLive } from '../../../services/couponleo-ui.helpers';

export const routeMeta = createDynamicRouteMeta((route) => {
  const page = findCouponleoCountryPage(route.paramMap.get('country') ?? '');
  return page
    ? { title: page.title, description: page.description }
    : { title: 'Country Coupons Not Found | CouponLeo', description: 'This coupon market is unavailable.', robots: 'noindex,nofollow' };
});

interface CouponState {
  data: CouponleoCountryHighlights;
  loading: boolean;
  error: boolean;
}

const emptyResponse: CouponleoCountryHighlights = { items: [], total: 0 };
const loadingState: CouponState = { data: emptyResponse, loading: true, error: false };

@Component({
  selector: 'app-couponleo-country-coupons-page',
  imports: [RouterLink],
  template: `
    @if (definition(); as market) {
      <div class="couponleo-country-coupons">
        <nav class="couponleo-country-coupons__breadcrumbs" aria-label="Breadcrumb">
          <a routerLink="/">Home</a><span aria-hidden="true">/</span>
          <a routerLink="/top-coupons">Top coupons</a><span aria-hidden="true">/</span>
          <span aria-current="page">{{ market.countryName }} coupons</span>
        </nav>

        <header class="couponleo-country-coupons__hero">
          <span class="couponleo-eyebrow">Country coupon guide</span>
          <h1>Top Coupons in {{ market.inName }}</h1>
          <p>{{ market.introduction }}</p>
          @if (!couponsState().loading && !couponsState().error) {
            <p class="couponleo-country-coupons__count">
              {{ couponsState().data.total.toLocaleString() }} available offers listed for {{ market.inName }}
            </p>
          }
          <div class="couponleo-country-coupons__links">
            <a [routerLink]="'/country-deals'" [queryParams]="{ country: market.apiLocation }">Browse categories and stores in {{ market.inName }}</a>
            <a [routerLink]="'/top-deals'" [queryParams]="{ country: market.apiLocation }">Open the full deal browser</a>
          </div>
        </header>

        @if (couponsState().loading) {
          <section aria-live="polite" class="couponleo-country-coupons__message">
            <h2>Loading current offers</h2>
            <p>Checking the coupon catalog for this market.</p>
          </section>
        } @else if (couponsState().error) {
          <section aria-live="polite" class="couponleo-country-coupons__message">
            <h2>Offers are temporarily unavailable</h2>
            <p>Please try again later or browse the country directory.</p>
          </section>
        } @else if (selectedCoupons().length === 0) {
          <section class="couponleo-country-coupons__message">
            <h2>No current coupons listed</h2>
            <p>Check back later or explore another country.</p>
          </section>
        } @else {
          <section class="couponleo-country-coupons__section" aria-labelledby="country-coupon-list-title">
            <div class="couponleo-country-coupons__section-heading">
              <div>
                <h2 id="country-coupon-list-title">Current coupon codes and deals</h2>
                <p>Compare offers from different stores, then confirm the final discount at checkout.</p>
              </div>
            </div>

            <div class="couponleo-country-coupons__grid">
              @for (coupon of selectedCoupons(); track coupon.slug) {
                <article class="couponleo-card couponleo-country-coupons__card">
                  <div class="couponleo-country-coupons__card-top">
                    <a [routerLink]="buildStoreRoute(coupon.storeSlug)">{{ coupon.storeName }}</a>
                    @if (coupon.verified) { <span class="couponleo-country-coupons__verified">Verified by source</span> }
                  </div>
                  <h3>{{ coupon.title }}</h3>
                  <p>{{ coupon.description }}</p>
                  <div class="couponleo-country-coupons__card-meta">
                    <span>{{ coupon.code ? 'Code: ' + coupon.code : 'No code listed' }}</span>
                    <span>{{ formatExpiryLabel(coupon.expiresAt) }}</span>
                  </div>
                  <div class="couponleo-country-coupons__card-actions">
                    @if (coupon.categorySlug) {
                      <a [routerLink]="buildCategoryRoute(coupon.categorySlug)">{{ coupon.categoryName }}</a>
                    }
                    <a [routerLink]="buildStoreRoute(coupon.storeSlug)">See store offers</a>
                  </div>
                </article>
              }
            </div>
          </section>

          @if (categories().length > 0) {
            <section class="couponleo-country-coupons__section" aria-labelledby="country-coupon-categories-title">
              <h2 id="country-coupon-categories-title">Explore categories in this selection</h2>
              <div class="couponleo-country-coupons__chips">
                @for (category of categories(); track category.slug) {
                  <a [routerLink]="buildCategoryRoute(category.slug)" [queryParams]="{ country: market.apiLocation }">
                    {{ category.name }}
                  </a>
                }
              </div>
            </section>
          }
        }

        @if (groupCategories().length > 0) {
          <section class="couponleo-country-coupons__section" aria-labelledby="market-category-groups-title">
            <h2 id="market-category-groups-title">Browse {{ market.countryName }} coupons by category</h2>
            <p>These categories currently have offers from several stores in this market.</p>
            <div class="couponleo-country-coupons__chips">
              @for (group of groupCategories(); track group.categorySlug) {
                <a [routerLink]="['/top-coupons', market.slug, group.categorySlug]">
                  {{ group.categoryName }} ({{ group.couponCount.toLocaleString() }})
                </a>
              }
            </div>
          </section>
        }

        <section class="couponleo-country-coupons__section couponleo-country-coupons__method">
          <h2>How these offers are selected</h2>
          <p>CouponLeo shows available offers from its catalog, favoring featured and source-marked verified offers and showing different stores where possible. An offer may change or expire; the merchant checkout determines whether it applies to your order.</p>
          <p>{{ market.marketNote }}</p>
        </section>

        <section class="couponleo-country-coupons__section" aria-labelledby="country-coupon-questions-title">
          <h2 id="country-coupon-questions-title">Common questions</h2>
          @for (item of market.questions; track item.question) {
            <div class="couponleo-country-coupons__answer">
              <h3>{{ item.question }}</h3>
              <p>{{ item.answer }}</p>
            </div>
          }
        </section>

        <nav class="couponleo-country-coupons__other" aria-label="Other country coupon pages">
          <span>Compare another market:</span>
          @for (other of otherPages(); track other.slug) {
            <a [routerLink]="['/top-coupons', other.slug]">{{ other.countryName }} coupons</a>
          }
        </nav>
      </div>
    } @else {
      <section class="couponleo-page-section">
        <h1>Country coupons not found</h1>
        <p>This market page is unavailable. Browse current country deals instead.</p>
        <a routerLink="/country-deals">Browse country deals</a>
      </section>
    }
  `,
  styles: [`
    .couponleo-country-coupons { max-width: 1180px; margin: 0 auto; padding: 28px 20px 72px; color: var(--couponleo-text); }
    .couponleo-country-coupons__breadcrumbs { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 28px; font-size: .9rem; }
    .couponleo-country-coupons a { color: var(--couponleo-orange); text-underline-offset: 3px; }
    .couponleo-country-coupons a:focus-visible { outline: 3px solid var(--couponleo-orange); outline-offset: 4px; }
    .couponleo-country-coupons__hero { padding: clamp(28px, 5vw, 64px); border-radius: 24px; background: var(--couponleo-surface-soft, #f7f7f7); }
    .couponleo-country-coupons__hero h1 { max-width: 820px; margin: 12px 0 18px; font-size: clamp(2rem, 5vw, 3.7rem); line-height: 1.12; }
    .couponleo-country-coupons__hero > p { max-width: 780px; line-height: 1.7; }
    .couponleo-country-coupons__count { font-weight: 700; }
    .couponleo-country-coupons__links, .couponleo-country-coupons__card-actions, .couponleo-country-coupons__other { display: flex; flex-wrap: wrap; gap: 14px 24px; }
    .couponleo-country-coupons__links { margin-top: 24px; }
    .couponleo-country-coupons__section, .couponleo-country-coupons__message { margin-top: 46px; }
    .couponleo-country-coupons__section h2, .couponleo-country-coupons__message h2 { font-size: clamp(1.45rem, 3vw, 2rem); }
    .couponleo-country-coupons__section p, .couponleo-country-coupons__message p { line-height: 1.7; }
    .couponleo-country-coupons__grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 20px; margin-top: 24px; }
    .couponleo-country-coupons__card { display: flex; flex-direction: column; gap: 12px; min-width: 0; padding: 22px; overflow-wrap: anywhere; }
    .couponleo-country-coupons__card h3, .couponleo-country-coupons__card p { margin: 0; }
    .couponleo-country-coupons__card h3 { font-size: 1.2rem; line-height: 1.35; }
    .couponleo-country-coupons__card-top, .couponleo-country-coupons__card-meta { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 8px 14px; }
    .couponleo-country-coupons__verified { font-size: .8rem; font-weight: 700; }
    .couponleo-country-coupons__card-meta { font-size: .88rem; }
    .couponleo-country-coupons__card-actions { margin-top: auto; padding-top: 10px; }
    .couponleo-country-coupons__chips { display: flex; flex-wrap: wrap; gap: 12px; }
    .couponleo-country-coupons__chips a { padding: 9px 15px; border-radius: 999px; background: var(--couponleo-surface-soft, #f7f7f7); }
    .couponleo-country-coupons__method { padding: 26px; border-radius: 20px; background: var(--couponleo-surface-soft, #f7f7f7); }
    .couponleo-country-coupons__answer { max-width: 850px; margin-top: 24px; }
    .couponleo-country-coupons__answer h3 { margin-bottom: 8px; }
    .couponleo-country-coupons__other { margin-top: 48px; align-items: center; }
    @media (max-width: 900px) { .couponleo-country-coupons__grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @media (max-width: 600px) { .couponleo-country-coupons__grid { grid-template-columns: 1fr; } .couponleo-country-coupons__hero { padding: 26px 20px; } }
  `],
})
export default class CouponleoCountryCouponsPage {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(CouponleoApiService);
  private readonly meta = inject(Meta);
  private readonly response = injectResponse();
  private readonly initialCountry = this.route.snapshot.paramMap.get('country') ?? '';
  private readonly countrySlug$ = this.route.paramMap.pipe(
    map((params) => params.get('country') ?? ''),
    startWith(this.initialCountry),
    distinctUntilChanged(),
  );

  protected readonly page = toSignal(this.countrySlug$, { initialValue: this.initialCountry });
  protected readonly definition = computed(() => findCouponleoCountryPage(this.page()));
  protected readonly groupings = toSignal(this.api.listSeoGroupings().pipe(
    catchError(() => of({ countries: [], groups: [] })),
  ), { initialValue: { countries: [], groups: [] } });
  protected readonly groupCategories = computed(() => this.groupings().groups
    .filter((group) => group.countrySlug === this.page())
    .slice(0, 12));
  protected readonly couponsState = toSignal(this.countrySlug$.pipe(
    switchMap((slug) => {
      const market = findCouponleoCountryPage(slug);
      if (!market) {
        return of({ data: emptyResponse, loading: false, error: false } satisfies CouponState);
      }
      return this.api.listCountryCouponHighlights(market.slug).pipe(
        map((data) => ({ data, loading: false, error: false } satisfies CouponState)),
        startWith(loadingState),
        catchError(() => of({ data: emptyResponse, loading: false, error: true } satisfies CouponState)),
      );
    }),
  ), { initialValue: loadingState });

  protected readonly selectedCoupons = computed(() => {
    const seenStores = new Set<string>();
    const selection: CouponleoCoupon[] = [];
    for (const coupon of this.couponsState().data.items) {
      if (!coupon.storeSlug || !coupon.title || !isCouponLive(coupon.expiresAt) || seenStores.has(coupon.storeSlug)) {
        continue;
      }
      seenStores.add(coupon.storeSlug);
      selection.push(coupon);
      if (selection.length === 12) break;
    }
    return selection;
  });
  protected readonly categories = computed(() => {
    const bySlug = new Map<string, { slug: string; name: string; count: number }>();
    for (const coupon of this.couponsState().data.items) {
      if (!coupon.categorySlug || !isCouponLive(coupon.expiresAt)) continue;
      const previous = bySlug.get(coupon.categorySlug);
      bySlug.set(coupon.categorySlug, {
        slug: coupon.categorySlug,
        name: coupon.categoryName || coupon.categorySlug,
        count: (previous?.count ?? 0) + 1,
      });
    }
    return [...bySlug.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).slice(0, 8);
  });
  protected readonly otherPages = computed(() => couponleoCountryPages.filter((item) => item.slug !== this.page()).slice(0, 12));
  protected readonly buildStoreRoute = buildStoreRoute;
  protected readonly buildCategoryRoute = buildCategoryRoute;
  protected readonly formatExpiryLabel = formatExpiryLabel;

  constructor() {
    effect(() => {
      const page = this.definition();
      const state = this.couponsState();
      if (!page) {
        if (this.response) this.response.statusCode = 404;
        return;
      }
      if (state.loading) return;

      if (state.error) {
        if (this.response) this.response.statusCode = 503;
        this.meta.updateTag({ name: 'robots', content: 'noindex,follow' }, 'name="robots"');
      } else if (state.data.total < COUPONLEO_COUNTRY_PAGE_MIN_COUPONS || this.selectedCoupons().length < COUPONLEO_COUNTRY_PAGE_MIN_STORES) {
        this.meta.updateTag({ name: 'robots', content: 'noindex,follow' }, 'name="robots"');
      } else {
        this.meta.updateTag({ name: 'robots', content: 'index,follow' }, 'name="robots"');
      }
    });
  }
}
