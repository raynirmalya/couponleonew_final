import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { type PageServerLoad } from '@analogjs/router';
import { map, of, startWith, switchMap } from 'rxjs';

import { CouponleoBrandmarkComponent } from '../components/couponleo-brandmark.component';
import { CouponleoEonIconComponent } from '../components/couponleo-eon-icon.component';
import { CouponleoPageLoaderComponent } from '../components/couponleo-page-loader.component';
import { CouponleoPaginationComponent } from '../components/couponleo-pagination.component';
import {
  CouponleoApiService,
  type CouponleoCategory,
  type CouponleoCoupon,
  type CouponleoLocation,
  type CouponleoStore,
} from '../services/couponleo-api.service';
import { createLoadingState, withHydratedRequestState } from '../services/couponleo-request-state.helpers';
import { createDynamicRouteMeta } from '../services/couponleo-route-meta';
import { couponleoStoreLogoUrl } from '../services/couponleo-logo.helpers';
import {
  buildCouponleoCategoryCardDescription,
  buildCouponleoStoreCardDescriptionForMarket,
  resolveCouponleoLocationSpotlight,
  resolveCouponleoStoreCategoryLabel,
} from '../services/couponleo-seo-copy.helpers';
import {
  fetchCouponleoList,
  readCouponleoQueryParam,
} from '../services/couponleo-server-load.helpers';
import {
  buildCategoryRoute,
  buildCategorySummaries,
  buildCountryRouteQuery,
  buildStoreRoute,
  formatCount,
  getCategoryPresentation,
  isCouponLive,
  localizeCouponleoRoute,
  locationFilterForCountry,
  matchesCountry,
  normalizeCountryRouteValue,
  pageCountFor,
  paginateItems,
} from '../services/couponleo-ui.helpers';
import { CouponleoI18nService } from '../services/couponleo-i18n.service';

import airplaneIconSvg from '@eonui/icons/svg/maps/eon-plane.svg?raw';
import usersIconSvg from '@eonui/icons/svg/system/eon-users.svg?raw';

interface CountryMarketCard {
  id: string;
  value: string;
  name: string;
  spotlight: string;
  deals: string;
  stores: string;
  active: boolean;
  icon: string;
}

interface CountryCategoryCard {
  id: string;
  name: string;
  headline: string;
  imageSrc: string;
  imageAlt: string;
  route: string;
  deals: string;
  stores: string;
}

interface CountryStoreCard {
  id: string;
  name: string;
  location: string;
  category: string;
  description: string;
  deals: string;
  route: string;
  logoUrl: string;
}

function emptyListResponse<T>() {
  return { items: [] as T[], total: 0 };
}

const countryDealsCategoryFetchLimit = 140;
const countryDealsCouponFetchLimit = 160;
const countryDealsLocationFetchLimit = 120;
const countryDealsStoreFetchLimit = 96;

export async function load(pageServerLoad: PageServerLoad) {
  const country = normalizeCountryRouteValue(readCouponleoQueryParam(pageServerLoad, 'country'));
  const location = locationFilterForCountry(country);

  return {
    categories: await fetchCouponleoList(
      pageServerLoad,
      '/categories',
      { pageSize: countryDealsCategoryFetchLimit },
      emptyListResponse<CouponleoCategory>(),
    ),
    coupons: await fetchCouponleoList(
      pageServerLoad,
      '/coupons',
      { active: true, location, pageSize: countryDealsCouponFetchLimit },
      emptyListResponse<CouponleoCoupon>(),
    ),
    locations: await fetchCouponleoList(
      pageServerLoad,
      '/locations',
      { pageSize: countryDealsLocationFetchLimit },
      emptyListResponse<CouponleoLocation>(),
    ),
    stores: await fetchCouponleoList(
      pageServerLoad,
      '/stores',
      { location, pageSize: countryDealsStoreFetchLimit },
      emptyListResponse<CouponleoStore>(),
    ),
  };
}

const countryMarketPageSize = 12;
const countryCategoryPageSize = 12;
const countryStorePageSize = 12;

export const routeMeta = createDynamicRouteMeta((route) => {
  const country = normalizeCountryRouteValue(route.queryParamMap.get('country'));

  if (country === 'all') {
    return {
      title: 'Country and Market Deals | CouponLeo',
      description: 'Compare countries and markets to see where the store mix, category coverage, and live savings feel strongest before you narrow your shopping plan.',
    };
  }

  return {
    title: `${country} Deals and Coupon Offers | CouponLeo`,
    description: `See which stores, coupon offers, and shopping categories look most worthwhile for shoppers in ${country}.`,
  };
});

@Component({
  selector: 'app-country-deals-page',
  imports: [
    RouterLink,
    CouponleoBrandmarkComponent,
    CouponleoEonIconComponent,
    CouponleoPageLoaderComponent,
    CouponleoPaginationComponent,
  ],
  template: `
    <section class="couponleo-page-hero couponleo-page-hero--soft couponleo-country-deals-hero">
      <div class="couponleo-country-deals-hero__layout">
        <div class="couponleo-country-deals-hero__copy">
          <span class="couponleo-eyebrow">{{ i18n.t('countryDeals.eyebrow') }}</span>
          <h1>{{ selectedCountryLabel() }}</h1>
          <p>{{ i18n.t('countryDeals.description') }}</p>

          <div class="couponleo-country-deals-hero__meta">
            <span>{{ formatCount(countryCouponTotal(), 'live deal', 'live deals') }}</span>
            <span>{{ formatCount(countryStoreTotal(), 'store', 'stores') }}</span>
            <span>{{ formatCount(categoryCards().length, 'active category', 'active categories') }}</span>
          </div>

          <div class="couponleo-country-deals-hero__actions">
            <a
              class="couponleo-button couponleo-button--ghost"
              [routerLink]="localizeRoute('/categories')"
              data-telemetry-event="country_deals_browse_categories"
              [attr.data-telemetry-label]="i18n.t('countryDeals.browseGlobalCategories')"
            >{{ i18n.t('countryDeals.browseGlobalCategories') }}</a>
            <a
              class="couponleo-button couponleo-button--solid"
              [routerLink]="localizeRoute('/top-deals')"
              [queryParams]="countryRouteQuery()"
              data-telemetry-event="country_deals_view_deals"
              [attr.data-telemetry-label]="selectedCountryLabel()"
            >{{ i18n.t('countryDeals.viewDeals') }}</a>
          </div>
        </div>

        <div class="couponleo-country-deals-hero__visual">
          <div class="couponleo-country-deals-hero__art">
            <img
              class="couponleo-country-deals-hero__image"
              src="/assets/images/heroes/top-deals-hero.png"
              alt="Country deals hero featuring savings and shopping illustrations"
              loading="eager"
            >
          </div>
        </div>
      </div>
    </section>

    @if (isLoading()) {
      <section class="couponleo-page-section">
        <app-couponleo-page-loader
          [cards]="6"
          [columns]="3"
          [showSidebar]="false"
          [statsCount]="4"
        ></app-couponleo-page-loader>
      </section>
    } @else {
      <section class="couponleo-page-section">
        <div class="couponleo-section-heading">
          <h2>{{ i18n.t('countryDeals.marketSpotlights') }}</h2>
          <span class="couponleo-country-deals__summary">{{ formatCount(marketCards().length, 'market', 'markets') }}</span>
        </div>

        <div class="couponleo-card-grid couponleo-country-market-grid">
          @for (market of pagedMarketCards(); track market.id) {
            <article class="couponleo-card couponleo-country-market-card" [class.is-active]="market.active">
              <button
                type="button"
                class="couponleo-country-market-card__surface"
                (click)="selectCountry(market.value)"
                data-telemetry-event="country_deals_market_select"
                [attr.data-telemetry-label]="market.name"
              >
                <span class="couponleo-card__badge" aria-hidden="true">
                  <app-couponleo-eon-icon [svg]="market.icon"></app-couponleo-eon-icon>
                </span>
                <h3>{{ market.name }}</h3>
                <p>{{ market.spotlight }}</p>
                <div class="couponleo-country-market-card__meta">
                  <span>{{ market.deals }}</span>
                  <span>{{ market.stores }}</span>
                </div>
              </button>
              <a
                class="couponleo-country-market-card__view-link"
                [routerLink]="localizeRoute('/top-deals')"
                [queryParams]="buildCountryQuery(market.value)"
                data-telemetry-event="country_deals_market_view_deals"
                [attr.data-telemetry-label]="market.name"
              >
                {{ i18n.t('countryDeals.viewDeals') }}
              </a>
            </article>
          }
        </div>

        @if (marketPageCount() > 1) {
          <app-couponleo-pagination
            [page]="marketPage()"
            [pageCount]="marketPageCount()"
            [totalItems]="marketCards().length"
            itemLabel="markets"
            (pageChange)="setMarketPage($event)"
          ></app-couponleo-pagination>
        }
      </section>

      <section class="couponleo-page-section">
        <div class="couponleo-section-heading">
          <h2>{{ i18n.t('countryDeals.categoriesIn', { country: selectedCountryLabel() }) }}</h2>
          <a
            [routerLink]="localizeRoute('/categories')"
            data-telemetry-event="country_deals_categories_directory"
            [attr.data-telemetry-label]="i18n.t('countryDeals.browseGlobalDirectory')"
          >{{ i18n.t('countryDeals.browseGlobalDirectory') }}</a>
        </div>

        @if (pagedCategoryCards().length > 0) {
          <div class="couponleo-card-grid couponleo-country-category-grid">
            @for (category of pagedCategoryCards(); track category.id) {
              <article class="couponleo-card couponleo-country-category-card">
                <div class="couponleo-country-category-card__media">
                  <img [src]="category.imageSrc" [alt]="category.imageAlt" loading="lazy">
                </div>
                <h3>{{ category.name }}</h3>
                <p>{{ category.headline }}</p>
                <div class="couponleo-country-category-card__meta">
                  <span>{{ category.deals }}</span>
                  <span>{{ category.stores }}</span>
                </div>
                <a
                  class="couponleo-button couponleo-button--ghost"
                  [routerLink]="localizeRoute(category.route)"
                  [queryParams]="countryRouteQuery()"
                  data-telemetry-event="country_deals_category_open"
                  [attr.data-telemetry-label]="category.name"
                >
                  {{ i18n.t('countryDeals.exploreDeals') }}
                </a>
              </article>
            }
          </div>

          @if (categoryPageCount() > 1) {
            <app-couponleo-pagination
              [page]="categoryPage()"
              [pageCount]="categoryPageCount()"
              [totalItems]="categoryCards().length"
              itemLabel="categories"
              (pageChange)="setCategoryPage($event)"
            ></app-couponleo-pagination>
          }
        } @else {
          <div class="couponleo-empty-card">
            <h3>{{ i18n.t('countryDeals.emptyCategoriesTitle') }}</h3>
            <p>{{ i18n.t('countryDeals.emptyCategoriesCopy') }}</p>
          </div>
        }
      </section>

      <section class="couponleo-page-section">
        <div class="couponleo-section-heading">
          <h2>{{ i18n.t('countryDeals.storesIn', { country: selectedCountryLabel() }) }}</h2>
          <a
            [routerLink]="localizeRoute('/stores')"
            [queryParams]="countryRouteQuery()"
            data-telemetry-event="country_deals_store_directory"
            [attr.data-telemetry-label]="i18n.t('countryDeals.openStoreDirectory')"
          >{{ i18n.t('countryDeals.openStoreDirectory') }}</a>
        </div>

        @if (pagedStoreCards().length > 0) {
          <div class="couponleo-card-grid couponleo-country-store-grid">
            @for (store of pagedStoreCards(); track store.id) {
              <article class="couponleo-card couponleo-country-store-card">
                <div class="couponleo-country-store-card__head">
                  <div class="couponleo-country-store-card__brand">
                    <span class="couponleo-country-store-card__brandmark" aria-hidden="true">
                      <app-couponleo-brandmark [name]="store.name" [src]="store.logoUrl"></app-couponleo-brandmark>
                    </span>
                    <div class="couponleo-country-store-card__copy">
                      <strong>
                        <a
                          class="couponleo-store-name-link"
                          [routerLink]="localizeRoute(store.route)"
                          [queryParams]="countryRouteQuery()"
                          data-telemetry-event="country_deals_store_name_open"
                          [attr.data-telemetry-label]="store.name"
                        >{{ store.name }}</a>
                      </strong>
                      <span>{{ store.location }} | {{ store.category }}</span>
                    </div>
                  </div>
                  <span class="couponleo-country-store-card__pill">{{ store.deals }}</span>
                </div>
                <p>{{ store.description }}</p>
                <a
                  class="couponleo-button couponleo-button--ghost"
                  [routerLink]="localizeRoute(store.route)"
                  [queryParams]="countryRouteQuery()"
                  data-telemetry-event="country_deals_store_open"
                  [attr.data-telemetry-label]="store.name"
                >
                  {{ i18n.t('countryDeals.viewStoreDeals') }}
                </a>
              </article>
            }
          </div>

          @if (storePageCount() > 1) {
            <app-couponleo-pagination
              [page]="storePage()"
              [pageCount]="storePageCount()"
              [totalItems]="storeCards().length"
              itemLabel="stores"
              (pageChange)="setStorePage($event)"
            ></app-couponleo-pagination>
          }
        } @else {
          <div class="couponleo-empty-card">
            <h3>{{ i18n.t('countryDeals.emptyStoresTitle') }}</h3>
            <p>{{ i18n.t('countryDeals.emptyStoresCopy') }}</p>
          </div>
        }
      </section>
    }
  `,
  styles: [`
    :host {
      display: block;
    }

    .couponleo-country-deals-hero {
      gap: 24px;
      padding-top: 32px;
    }

    .couponleo-country-deals-hero__layout {
      display: grid;
      grid-template-columns: minmax(0, 0.94fr) minmax(320px, 1.06fr);
      gap: 24px;
      align-items: center;
    }

    .couponleo-country-deals-hero__copy,
    .couponleo-country-deals-hero__visual,
    .couponleo-country-store-card,
    .couponleo-country-category-card,
    .couponleo-country-market-card {
      display: grid;
    }

    .couponleo-country-deals-hero__copy {
      gap: 18px;
      max-width: 38rem;
    }

    .couponleo-country-deals-hero__meta,
    .couponleo-country-deals-hero__actions,
    .couponleo-country-market-card__meta,
    .couponleo-country-category-card__meta {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }

    .couponleo-country-deals-hero__meta span,
    .couponleo-country-market-card__meta span,
    .couponleo-country-category-card__meta span,
    .couponleo-country-store-card__pill,
    .couponleo-country-deals__summary {
      color: var(--couponleo-muted);
      font-size: 0.9rem;
      font-weight: 700;
    }

    .couponleo-country-deals-hero__meta span,
    .couponleo-country-market-card__meta span,
    .couponleo-country-category-card__meta span,
    .couponleo-country-store-card__pill {
      display: inline-flex;
      width: fit-content;
      padding: 8px 12px;
      border-radius: 999px;
      background: rgba(22, 36, 74, 0.05);
    }

    .couponleo-country-deals-hero__visual {
      gap: 18px;
    }

    .couponleo-country-deals-hero__art {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 19rem;
      padding: 24px;
      border-radius: 26px;
      background: linear-gradient(180deg, rgba(255, 255, 255, 0.98) 0%, rgba(246, 239, 232, 0.96) 100%);
      box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.82);
    }

    .couponleo-country-deals-hero__image {
      width: min(100%, 28rem);
      height: auto;
      object-fit: contain;
    }

    .couponleo-country-market-card h3,
    .couponleo-country-category-card h3,
    .couponleo-country-store-card p {
      margin: 0;
    }

    .couponleo-country-market-grid,
    .couponleo-country-category-grid,
    .couponleo-country-store-grid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    .couponleo-country-market-card {
      gap: 14px;
      padding: 24px;
      border-radius: 22px;
      text-align: left;
    }

    .couponleo-country-market-card__surface {
      display: grid;
      gap: 14px;
      width: 100%;
      padding: 0;
      border: 0;
      background: transparent;
      color: inherit;
      text-align: left;
    }

    .couponleo-country-market-card.is-active {
      border-color: rgba(52, 120, 255, 0.26);
      background: linear-gradient(180deg, rgba(239, 245, 255, 0.98) 0%, rgba(255, 255, 255, 0.92) 100%);
      box-shadow: 0 20px 44px rgba(52, 120, 255, 0.12);
    }

    .couponleo-country-market-card__view-link {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 44px;
      width: 100%;
      border: 1px solid rgba(52, 120, 255, 0.18);
      border-radius: 14px;
      color: var(--couponleo-blue);
      font-weight: 800;
    }

    .couponleo-country-market-card p,
    .couponleo-country-category-card p,
    .couponleo-country-store-card p {
      color: var(--couponleo-muted);
      line-height: 1.65;
    }

    .couponleo-country-category-card,
    .couponleo-country-store-card {
      gap: 16px;
    }

    .couponleo-country-category-card__media {
      overflow: hidden;
      border-radius: 20px;
      aspect-ratio: 1 / 0.72;
      background: linear-gradient(180deg, #fffefd 0%, #f4eee7 100%);
      box-shadow: inset 0 0 0 1px rgba(238, 224, 208, 0.72);
    }

    .couponleo-country-category-card__media img {
      display: block;
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .couponleo-country-category-card .couponleo-button,
    .couponleo-country-store-card .couponleo-button {
      width: 100%;
    }

    .couponleo-country-store-card__head {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: start;
      gap: 12px;
    }

    .couponleo-country-store-card__brand {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      align-items: center;
      gap: 12px;
      min-width: 0;
    }

    .couponleo-country-store-card__copy {
      display: grid;
      gap: 8px;
      min-width: 0;
    }

    .couponleo-country-store-card__brandmark {
      width: 4rem;
      height: 4rem;
      min-width: 4rem;
      border-radius: 20px;
    }

    .couponleo-country-store-card__head strong,
    .couponleo-country-store-card__head span {
      display: block;
      min-width: 0;
    }

    .couponleo-country-store-card__head strong {
      color: var(--couponleo-navy);
      font-size: 1.4rem;
      line-height: 1.02;
      letter-spacing: -0.04em;
      overflow-wrap: anywhere;
    }

    .couponleo-country-store-card__head span {
      color: var(--couponleo-muted);
      font-size: 0.9rem;
      line-height: 1.35;
      overflow-wrap: anywhere;
    }

    .couponleo-country-store-card__pill {
      align-self: start;
      justify-self: end;
      flex-shrink: 0;
      white-space: nowrap;
    }

    @media (max-width: 1080px) {
      .couponleo-country-deals-hero__layout,
      .couponleo-country-market-grid,
      .couponleo-country-category-grid,
      .couponleo-country-store-grid {
        grid-template-columns: 1fr 1fr;
      }

      .couponleo-country-deals-hero__layout {
        grid-template-columns: 1fr;
      }
    }

    @media (max-width: 780px) {
      .couponleo-country-market-grid,
      .couponleo-country-category-grid,
      .couponleo-country-store-grid,
      .couponleo-country-store-card__head {
        grid-template-columns: 1fr;
      }

      .couponleo-country-store-card__head {
        display: grid;
      }

      .couponleo-country-store-card__pill {
        justify-self: start;
      }
    }
  `],
})
export default class CountryDealsPage {
  private readonly api = inject(CouponleoApiService);
  protected readonly i18n = inject(CouponleoI18nService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly initialLoad = this.route.snapshot.data['load'] as Awaited<ReturnType<typeof load>> | undefined;
  private readonly initialCountry = normalizeCountryRouteValue(this.route.snapshot.queryParamMap.get('country'));
  private readonly countryQueryParamMap = this.route.queryParamMap.pipe(
    map((params) => normalizeCountryRouteValue(params.get('country'))),
  );

  private readonly categoriesState = toSignal(
    withHydratedRequestState(
      of(undefined),
      () => this.api.listCategories({ pageSize: countryDealsCategoryFetchLimit }),
      emptyListResponse<CouponleoCategory>(),
      () => this.initialLoad?.categories,
    ),
    { initialValue: createLoadingState(emptyListResponse<CouponleoCategory>()) },
  );
  private readonly couponsState = toSignal(
    withHydratedRequestState(
      this.countryQueryParamMap.pipe(startWith(this.initialCountry)),
      (country) => this.api.listCoupons({
        active: true,
        location: locationFilterForCountry(country),
        pageSize: countryDealsCouponFetchLimit,
      }),
      emptyListResponse<CouponleoCoupon>(),
      () => this.initialLoad?.coupons,
    ),
    { initialValue: createLoadingState(emptyListResponse<CouponleoCoupon>()) },
  );
  private readonly storesState = toSignal(
    withHydratedRequestState(
      this.countryQueryParamMap.pipe(startWith(this.initialCountry)),
      (country) => this.api.listStores({
        location: locationFilterForCountry(country),
        pageSize: countryDealsStoreFetchLimit,
      }),
      emptyListResponse<CouponleoStore>(),
      () => this.initialLoad?.stores,
    ),
    { initialValue: createLoadingState(emptyListResponse<CouponleoStore>()) },
  );
  private readonly locationsState = toSignal(
    withHydratedRequestState(
      of(undefined),
      () => this.api.listLocations({ pageSize: countryDealsLocationFetchLimit }),
      emptyListResponse<CouponleoLocation>(),
      () => this.initialLoad?.locations,
    ),
    { initialValue: createLoadingState(emptyListResponse<CouponleoLocation>()) },
  );

  protected readonly formatCount = formatCount;
  protected readonly buildCountryQuery = buildCountryRouteQuery;
  protected readonly marketPage = signal(1);
  protected readonly categoryPage = signal(1);
  protected readonly storePage = signal(1);
  protected readonly selectedCountry = toSignal(this.countryQueryParamMap, { initialValue: this.initialCountry });
  protected readonly countryRouteQuery = computed(() => buildCountryRouteQuery(this.selectedCountry()));
  protected readonly isLoading = computed(() => (
    this.categoriesState().loading
    || this.couponsState().loading
    || this.storesState().loading
    || this.locationsState().loading
  ));

  private readonly categoriesResponse = computed(() => this.categoriesState().data);
  private readonly couponsResponse = computed(() => this.couponsState().data);
  private readonly storesResponse = computed(() => this.storesState().data);
  private readonly locationsResponse = computed(() => this.locationsState().data);

  protected readonly selectedCountryLabel = computed(() => this.selectedCountry() === 'all' ? this.i18n.t('countryDeals.allMarkets') : this.selectedCountry());

  private readonly liveCoupons = computed(() => {
    const coupons = this.couponsResponse().items;
    const liveCoupons = coupons.filter((coupon) => isCouponLive(coupon.expiresAt));
    return liveCoupons.length > 0 ? liveCoupons : coupons;
  });

  protected readonly countryCoupons = computed(() => (
    this.liveCoupons().filter((coupon) => matchesCountry(this.selectedCountry(), coupon.location ?? coupon.primary_location))
  ));

  protected readonly countryStores = computed(() => (
    this.storesResponse().items.filter((store) => matchesCountry(this.selectedCountry(), store.location))
  ));

  protected readonly countryCouponTotal = computed(() => this.couponsResponse().total);
  protected readonly countryStoreTotal = computed(() => this.storesResponse().total);

  private readonly marketTotal = computed(() => {
    if (this.selectedCountry() === 'all') {
      return this.locationsResponse().total || this.locationsResponse().items.length;
    }

    return this.countryCouponTotal() > 0 || this.countryStoreTotal() > 0 ? 1 : 0;
  });

  protected readonly marketCards = computed<CountryMarketCard[]>(() => {
    const locationCards = [...this.locationsResponse().items]
      .sort((left, right) => (
        (right.couponCount ?? 0) - (left.couponCount ?? 0)
        || left.name.localeCompare(right.name)
      ))
      .map((location) => ({
        id: `market-${location.code ?? location.name}`,
        value: location.name,
        name: location.name,
        spotlight: resolveCouponleoLocationSpotlight(location) || this.i18n.t('countryDeals.marketCatalogSpotlight', { market: location.name }),
        deals: formatCount(location.couponCount ?? 0, 'live deal', 'live deals'),
        stores: formatCount(location.storeCount ?? 0, 'store', 'stores'),
        active: this.selectedCountry() === location.name,
        icon: airplaneIconSvg,
      }));

    return [
      {
        id: 'market-all',
        value: 'all',
        name: this.i18n.t('countryDeals.allMarkets'),
        spotlight: this.i18n.t('countryDeals.combinedView'),
        deals: formatCount(this.liveCoupons().length, 'live deal', 'live deals'),
        stores: formatCount(this.storesResponse().items.length, 'store', 'stores'),
        active: this.selectedCountry() === 'all',
        icon: usersIconSvg,
      },
      ...locationCards,
    ];
  });
  protected readonly marketPageCount = computed(() => pageCountFor(this.marketCards().length, countryMarketPageSize));
  protected readonly pagedMarketCards = computed(() => paginateItems(this.marketCards(), this.marketPage(), countryMarketPageSize));

  protected readonly categoryCards = computed<CountryCategoryCard[]>(() => (
    buildCategorySummaries(this.countryCoupons(), this.categoriesResponse().items)
      .map((category) => {
        const presentation = getCategoryPresentation(category.slug);

        return {
          id: `country-category-${category.slug}`,
          name: category.name,
          headline: buildCouponleoCategoryCardDescription(category),
          imageSrc: presentation.imageSrc,
          imageAlt: presentation.imageAlt,
          route: this.localizeRoute(buildCategoryRoute(category.slug)),
          deals: formatCount(category.couponCount, 'live deal', 'live deals'),
          stores: formatCount(category.storeCount, 'store', 'stores'),
        };
      })
  ));
  protected readonly categoryPageCount = computed(() => pageCountFor(this.categoryCards().length, countryCategoryPageSize));
  protected readonly pagedCategoryCards = computed(() => (
    paginateItems(this.categoryCards(), this.categoryPage(), countryCategoryPageSize)
  ));

  protected readonly storeCards = computed<CountryStoreCard[]>(() => (
    [...this.countryStores()]
      .sort((left, right) => right.activeCoupons - left.activeCoupons || left.name.localeCompare(right.name))
      .map((store) => ({
        id: `country-store-${store.slug}`,
        name: store.name,
        location: store.location,
        category: resolveCouponleoStoreCategoryLabel(store) || store.category,
        description: buildCouponleoStoreCardDescriptionForMarket(store, this.selectedCountry()),
        deals: formatCount(store.activeCoupons, 'live deal', 'live deals'),
        route: this.localizeRoute(buildStoreRoute(store.slug)),
        logoUrl: couponleoStoreLogoUrl(store),
      }))
  ));

  protected readonly storePageCount = computed(() => pageCountFor(this.storeCards().length, countryStorePageSize));
  protected readonly pagedStoreCards = computed(() => (
    paginateItems(this.storeCards(), this.storePage(), countryStorePageSize)
  ));

  constructor() {
    effect(() => {
      this.selectedCountry();
      untracked(() => {
        this.marketPage.set(1);
        this.categoryPage.set(1);
        this.storePage.set(1);
      });
    });
  }

  protected selectCountry(country: string): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: buildCountryRouteQuery(country),
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  protected setMarketPage(pageNumber: number): void {
    const nextPage = Math.min(Math.max(pageNumber, 1), this.marketPageCount());
    this.marketPage.set(nextPage);
  }

  protected setCategoryPage(pageNumber: number): void {
    const nextPage = Math.min(Math.max(pageNumber, 1), this.categoryPageCount());
    this.categoryPage.set(nextPage);
  }

  protected setStorePage(pageNumber: number): void {
    const nextPage = Math.min(Math.max(pageNumber, 1), this.storePageCount());
    this.storePage.set(nextPage);
  }

  protected localizeRoute(path: string): string {
    return localizeCouponleoRoute(path, this.i18n.locale());
  }
}
