import { CouponleoOfferVerificationComponent } from '../components/couponleo-offer-verification.component';
import { loadHome as load } from '../services/couponleo-page-loaders';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map, of, startWith, switchMap } from 'rxjs';
import {
  CouponleoCouponDialogComponent,
  type CouponleoCouponReveal,
} from '../components/couponleo-coupon-dialog.component';
import { CouponleoBrandmarkComponent } from '../components/couponleo-brandmark.component';
import { CouponleoEonIconComponent } from '../components/couponleo-eon-icon.component';
import { CouponleoFavoriteButtonComponent } from '../components/couponleo-favorite-button.component';
import {
  CouponleoApiService,
  type CouponleoCategory,
  type CouponleoCoupon,
  type CouponleoLocation,
  type CouponleoStore,
  type CouponleoStoreAnalytics,
} from '../services/couponleo-api.service';
import { createLoadingState, withHydratedRequestState } from '../services/couponleo-request-state.helpers';
import { createStaticRouteMeta } from '../services/couponleo-route-meta';
import { CouponleoI18nService } from '../services/couponleo-i18n.service';
import { couponleoCouponLogoUrl, couponleoStoreLogoUrl } from '../services/couponleo-logo.helpers';
import { CouponleoSavedService } from '../services/couponleo-saved.service';
import { CouponleoSeoSyncService } from '../services/couponleo-seo-sync.service';
import {
  buildCouponleoCategoryCardDescription,
  type CouponleoSeoFaqItem,
  resolveCouponleoLocationSpotlight,
  buildCouponleoStoreCardDescriptionForMarket,
  resolveCouponleoStoreCategoryLabel,
} from '../services/couponleo-seo-copy.helpers';
import {
  buildCategoryRoute,
  buildCountryRouteQuery,
  buildStoreRoute,
  formatCount,
  getCategoryPresentation,
  isCouponLive,
  localizeCouponleoRoute,
  locationFilterForCountry,
  matchesCountry,
  normalizeCountryRouteValue,
} from '../services/couponleo-ui.helpers';

import awardIconSvg from '@eonui/icons/svg/office/eon-award.svg?raw';
import buildingStoreIconSvg from '@eonui/icons/svg/maps/eon-building-store.svg?raw';
import cartIconSvg from '@eonui/icons/svg/commerce/eon-shopping-cart.svg?raw';
import discountIconSvg from '@eonui/icons/svg/commerce/eon-rosette-discount-check.svg?raw';
import searchIconSvg from '@eonui/icons/svg/system/eon-search.svg?raw';
import shieldIconSvg from '@eonui/icons/svg/system/eon-shield-check.svg?raw';
import ticketIconSvg from '@eonui/icons/svg/office/eon-ticket.svg?raw';
import usersIconSvg from '@eonui/icons/svg/system/eon-users.svg?raw';

interface HomeDealCard extends CouponleoCouponReveal {
  id: string;
  store: string;
  storeRoute: string;
  logoUrl: string;
  fallbackLogoUrl: string;
}

interface HomeCategoryCard {
  id: string;
  label: string;
  deals: string;
  summary: string;
  imageSrc: string;
  imageAlt: string;
  route: string;
}

interface HomeStoreCard {
  id: string;
  name: string;
  description: string;
  category: string;
  location: string;
  activeCoupons: number;
  route: string;
  logoUrl: string;
}

interface HomeStat {
  value: string;
  label: string;
  icon: string;
}

interface HomeResourceLink {
  id: string;
  label: string;
  detail: string;
  route: string;
  queryParams: Record<string, string | null>;
}

interface HomeEditorialCopy {
  intro: string;
  introDetail: string;
  stores: string;
  storesDetail: string;
  categories: string;
  categoriesDetail: string;
  markets: string;
  marketsDetail: string;
  overview: string;
  detail: string;
}

const benefits = [
  { title: 'Coupon offers', copy: 'Check merchant terms before checkout', icon: shieldIconSvg },
  { title: 'Top Stores', copy: 'Trusted brands worth a look', icon: awardIconSvg },
  { title: 'Store savings', copy: 'Availability depends on the merchant', icon: discountIconSvg },
];

const homeCategoryFetchLimit = 120;
const homeFeaturedCouponFetchLimit = 48;
const homeFeaturedStoreFetchLimit = 48;
const homeLocationFetchLimit = 120;

export const routeMeta = createStaticRouteMeta({
  title: 'CouponLeo | Live Coupon Codes, Promo Codes, and Store Deals',
  description: 'Compare live coupon codes, promo offers, stores, categories, and market-specific deals before you decide where to shop.',
});

function emptyListResponse<T>() {
  return { items: [] as T[], total: 0 };
}

function emptyAnalyticsSummary(): CouponleoStoreAnalytics {
  return {
    totalCoupons: 0,
    totalStores: 0,
    featuredCoupons: 0,
    liveMarkets: 0,
  };
}

export { loadHome as load } from '../services/couponleo-page-loaders';

function matchesHomeQuery(values: Array<string | undefined>, query: string): boolean {
  if (!query) {
    return true;
  }

  const normalizedQuery = query.toLowerCase();
  return values.some((value) => value?.toLowerCase().includes(normalizedQuery));
}

function topUniqueValues(values: Array<string | undefined>, limit = 3): string[] {
  const collected: string[] = [];

  for (const value of values) {
    const normalized = value?.trim();
    if (!normalized) {
      continue;
    }

    if (collected.some((entry) => entry.toLowerCase() === normalized.toLowerCase())) {
      continue;
    }

    collected.push(normalized);
    if (collected.length >= limit) {
      break;
    }
  }

  return collected;
}

function topEditorialCategoryValues(values: Array<string | undefined>, limit = 3): string[] {
  const genericCategoryNames = new Set(['other', 'general', 'misc', 'miscellaneous']);
  const preferredValues = values.filter((value) => {
    const normalized = value?.trim().toLowerCase();
    return normalized ? !genericCategoryNames.has(normalized) : false;
  });

  const refinedValues = topUniqueValues(preferredValues, limit);
  return refinedValues.length > 0 ? refinedValues : topUniqueValues(values, limit);
}

function joinReadableList(values: string[], fallback: string): string {
  if (values.length === 0) {
    return fallback;
  }

  if (values.length === 1) {
    return values[0];
  }

  if (values.length === 2) {
    return `${values[0]} and ${values[1]}`;
  }

  return `${values.slice(0, -1).join(', ')}, and ${values.at(-1)}`;
}

@Component({
  selector: 'app-home',
  imports: [
    CouponleoOfferVerificationComponent,
    RouterLink,
    CouponleoCouponDialogComponent,
    CouponleoBrandmarkComponent,
    CouponleoEonIconComponent,
    CouponleoFavoriteButtonComponent,
  ],
  template: `
    <section class="couponleo-hero">
      <div class="couponleo-hero__copy">
        <span class="couponleo-eyebrow">{{ labels().eyebrow }}</span>
        <h1 class="couponleo-hero__title">
          <span class="couponleo-hero__title-main">{{ labels().discoverSmarter }}</span>
          <span class="couponleo-hero__title-accent">{{ labels().couponsAnd }}</span>
          <span class="couponleo-hero__title-accent">{{ labels().strongerDeals }}</span>
        </h1>
        <div class="couponleo-hero__underline" aria-hidden="true"></div>
        <p class="couponleo-hero__lede">{{ labels().heroCopy }}</p>
        <p class="couponleo-hero__support">{{ heroContextCopy() }}</p>

        <form class="couponleo-searchbar" (submit)="$event.preventDefault()" data-telemetry-event="home_search_submit" data-telemetry-label="Homepage search">
          <span class="couponleo-searchbar__icon" aria-hidden="true">
            <app-couponleo-eon-icon [svg]="searchIconSvg"></app-couponleo-eon-icon>
          </span>
          <input
            type="search"
            [placeholder]="labels().searchPlaceholder"
            [attr.aria-label]="labels().searchStores"
            [value]="searchQuery()"
            data-telemetry-event="home_search_input"
            data-telemetry-label="Homepage search"
            (input)="updateSearch($event)"
          >
          <button
            type="submit"
            class="couponleo-searchbar__button"
            [attr.aria-label]="i18n.phrase('Search')"
            data-telemetry-event="home_search_button"
            data-telemetry-label="Homepage search"
          >
            <app-couponleo-eon-icon [svg]="searchIconSvg"></app-couponleo-eon-icon>
          </button>
        </form>

        <div class="couponleo-hero__actions">
          <a
            class="couponleo-button couponleo-button--solid"
            [routerLink]="localizeRoute('/top-deals')"
            [queryParams]="countryRouteQuery()"
            data-telemetry-event="home_top_deals_cta"
            [attr.data-telemetry-label]="labels().exploreTopDeals"
          >
            {{ labels().exploreTopDeals }}
          </a>
          <a
            class="couponleo-button couponleo-button--ghost"
            [routerLink]="localizeRoute('/stores')"
            [queryParams]="countryRouteQuery()"
            data-telemetry-event="home_stores_cta"
            [attr.data-telemetry-label]="labels().browseStoresCta"
          >
            {{ labels().browseStoresCta }}
          </a>
        </div>

        <div class="couponleo-hero__summary">
          @for (stat of heroStats(); track stat.label) {
            <div class="couponleo-hero__summary-card">
              <strong>{{ stat.value }}</strong>
              <span>{{ stat.label }}</span>
            </div>
          }
        </div>

        <div class="couponleo-hero__benefits">
          @for (benefit of benefits(); track benefit.title) {
            <div class="couponleo-hero-benefit">
              <span class="couponleo-hero-benefit__icon" aria-hidden="true">
                <app-couponleo-eon-icon [svg]="benefit.icon"></app-couponleo-eon-icon>
              </span>
              <div>
                <strong>{{ benefit.title }}</strong>
                <span>{{ benefit.copy }}</span>
              </div>
            </div>
          }
        </div>
      </div>

      <div class="couponleo-hero__visual couponleo-hero__visual--home">
        <span class="couponleo-hero__spark couponleo-hero__spark--blue-top"></span>
        <span class="couponleo-hero__spark couponleo-hero__spark--orange-mid"></span>
        <span class="couponleo-hero__spark couponleo-hero__spark--blue-dot"></span>
        <span class="couponleo-hero__spark couponleo-hero__spark--orange-tri"></span>
        <span class="couponleo-hero__dots" aria-hidden="true"></span>
        <div class="couponleo-hero__visual-aura couponleo-hero__visual-aura--blue" aria-hidden="true"></div>
        <div class="couponleo-hero__visual-aura couponleo-hero__visual-aura--orange" aria-hidden="true"></div>
        <div class="couponleo-hero__visual-ring" aria-hidden="true"></div>
        <div class="couponleo-hero__visual-base" aria-hidden="true"></div>
        <article class="couponleo-hero__snapshot-card">
          <span class="couponleo-eyebrow couponleo-eyebrow--soft">{{ labels().shoppingSnapshot }}</span>
          <strong>{{ heroSnapshotHeading() }}</strong>
          <p>{{ heroSnapshotCopy() }}</p>
          <div class="couponleo-hero__snapshot-links">
            <a
              [routerLink]="localizeRoute('/categories')"
              [queryParams]="countryRouteQuery()"
              data-telemetry-event="home_snapshot_categories_open"
              [attr.data-telemetry-label]="labels().viewAllCategories"
            >{{ labels().viewAllCategories }}</a>
            <a
              [routerLink]="localizeRoute('/country-deals')"
              [queryParams]="countryRouteQuery()"
              data-telemetry-event="home_snapshot_markets_open"
              [attr.data-telemetry-label]="labels().browseMarkets"
            >{{ labels().browseMarkets }}</a>
          </div>
        </article>
        <img
          class="couponleo-hero__image couponleo-hero__image--home"
          src="/images/couponleo-hero-product-cutout-v2.png"
          alt="Shopping bag, discount tag, and gift box"
        >
        <div class="couponleo-hero__market-pill">
          <strong>{{ selectedMarketLabel() }}</strong>
          <span>{{ selectedMarketCopy() }}</span>
        </div>
        <div class="couponleo-hero__cart-badge" aria-hidden="true">
          <app-couponleo-eon-icon [svg]="cartIconSvg"></app-couponleo-eon-icon>
        </div>
      </div>
    </section>

    @if (featuredDeals().length > 0) {
      <section class="couponleo-page-section">
        <div class="couponleo-section-heading">
          <h2>{{ labels().featuredDeals }}</h2>
          <a
            [routerLink]="localizeRoute('/top-deals')"
            [queryParams]="countryRouteQuery()"
            data-telemetry-event="home_featured_deals_open_all"
            [attr.data-telemetry-label]="labels().viewAllDeals"
          >{{ labels().viewAllDeals }}</a>
        </div>

        <div class="couponleo-deal-grid">
          @for (deal of featuredDeals(); track deal.id) {
            <article class="couponleo-deal-card">
              <div class="couponleo-deal-card__top">
                <span class="couponleo-deal-card__brand-group">
                  <span class="couponleo-deal-card__brand-icon" aria-hidden="true">
                    <app-couponleo-brandmark
                      [name]="deal.store"
                      [src]="deal.logoUrl"
                      [fallbackSrc]="deal.fallbackLogoUrl"
                    ></app-couponleo-brandmark>
                  </span>
                  <a
                    class="couponleo-store-name-link couponleo-deal-card__brand"
                    [routerLink]="localizeRoute(deal.storeRoute)"
                    [queryParams]="countryRouteQuery()"
                    data-telemetry-event="home_featured_deal_store_open"
                    [attr.data-telemetry-label]="deal.store"
                  >{{ deal.store }}</a>
                </span>
                <span class="couponleo-card-toolbar">
                  <span class="couponleo-deal-card__flag"><app-couponleo-offer-verification [verification]="deal.verification" /></span>
                  <app-couponleo-favorite-button
                    [active]="isSaved(deal.id)"
                    ariaLabel="Save featured deal"
                    (toggled)="toggleDealSaved(deal)"
                  ></app-couponleo-favorite-button>
                </span>
              </div>
              <h3>{{ deal.title }}</h3>
              <p>{{ deal.description }}</p>
              <div class="couponleo-deal-card__actions">
                <button
                  type="button"
                  class="couponleo-code couponleo-code--masked"
                  (click)="openCoupon(deal)"
                  data-telemetry-event="home_featured_deal_code_open"
                  [attr.data-telemetry-label]="deal.store + ' ' + deal.title"
                >
                  {{ maskCode(deal.code) }}
                </button>
                <button
                  type="button"
                  class="couponleo-button couponleo-button--solid"
                  (click)="openCoupon(deal)"
                  data-telemetry-event="home_featured_deal_show_code"
                  [attr.data-telemetry-label]="deal.store + ' ' + deal.title"
                >
                  {{ labels().showCode }}
                </button>
              </div>
            </article>
          }
        </div>
      </section>
    }

      <section class="couponleo-page-section">
        <div class="couponleo-section-heading">
          <h2>{{ labels().trendingCategories }}</h2>
          <a
            [routerLink]="localizeRoute('/categories')"
            [queryParams]="countryRouteQuery()"
            data-telemetry-event="home_categories_open_all"
            [attr.data-telemetry-label]="labels().viewAllCategories"
          >{{ labels().viewAllCategories }}</a>
        </div>

        @if (categories().length > 0) {
          <div class="couponleo-orb-grid">
            @for (category of categories(); track category.id) {
              <a
                class="couponleo-orb-card"
                [routerLink]="localizeRoute(category.route)"
                [queryParams]="countryRouteQuery()"
                data-telemetry-event="home_category_open"
                [attr.data-telemetry-label]="category.label"
              >
                <div class="couponleo-orb-card__media">
                  <img [src]="category.imageSrc" [alt]="category.imageAlt" loading="lazy">
                </div>
                <div class="couponleo-orb-card__content">
                  <strong>{{ category.label }}</strong>
                  <span>{{ category.deals }}</span>
                  <small class="couponleo-orb-card__summary">{{ category.summary }}</small>
                </div>
              </a>
            }
          </div>
        } @else {
          <div class="couponleo-empty-card">
            <h3>{{ labels().noCategories }}</h3>
            <p>{{ labels().noCategoriesCopy }}</p>
          </div>
        }
      </section>

      <section class="couponleo-page-section">
        <div class="couponleo-section-heading">
          <h2>{{ labels().topStores }}</h2>
          <a
            [routerLink]="localizeRoute('/stores')"
            [queryParams]="countryRouteQuery()"
            data-telemetry-event="home_stores_open_all"
            [attr.data-telemetry-label]="labels().viewAllStores"
          >{{ labels().viewAllStores }}</a>
        </div>

        @if (stores().length > 0) {
          <div class="couponleo-store-row">
            @for (store of stores(); track store.id) {
              <article class="couponleo-store-pill">
                <span class="couponleo-store-pill__favorite">
                  <app-couponleo-favorite-button
                    [active]="isSaved(store.id)"
                    ariaLabel="Save store"
                    (toggled)="toggleStoreSaved(store)"
                  ></app-couponleo-favorite-button>
                </span>
                <a
                  class="couponleo-store-pill__body"
                  [routerLink]="localizeRoute(store.route)"
                  [queryParams]="countryRouteQuery()"
                  data-telemetry-event="home_store_open"
                  [attr.data-telemetry-label]="store.name"
                >
                  <span class="couponleo-store-pill__icon" aria-hidden="true">
                    <app-couponleo-brandmark [name]="store.name" [src]="store.logoUrl"></app-couponleo-brandmark>
                  </span>
                  <span class="couponleo-store-pill__name">{{ store.name }}</span>
                  <span class="couponleo-store-pill__meta">{{ store.category }} | {{ i18n.formatNumber(store.activeCoupons) }} {{ i18n.phrase('live deals') }}</span>
                  <span class="couponleo-store-pill__summary">{{ store.description }}</span>
                  <span class="couponleo-store-pill__link">{{ labels().viewDeals }}</span>
                </a>
              </article>
            }
          </div>
        } @else {
          <div class="couponleo-empty-card">
            <h3>{{ labels().noStores }}</h3>
            <p>{{ labels().noStoresCopy }}</p>
          </div>
        }
      </section>

      <section class="couponleo-page-section">
        <div class="couponleo-stat-band">
          @for (stat of stats(); track stat.label) {
            <div>
              <span class="couponleo-stat-band__icon" aria-hidden="true">
                <app-couponleo-eon-icon [svg]="stat.icon"></app-couponleo-eon-icon>
              </span>
              <strong>{{ stat.value }}</strong>
              <span>{{ stat.label }}</span>
            </div>
          }
        </div>
      </section>

      <section class="couponleo-page-section couponleo-copy-section">
        <div class="couponleo-section-heading couponleo-section-heading--stacked">
          <h2>{{ labels().homeGuideTitle }}</h2>
          <p>{{ editorialCopy().intro }}</p>
          <p>{{ editorialCopy().introDetail }}</p>
        </div>

        <div class="couponleo-copy-grid couponleo-copy-grid--home">
          <article class="couponleo-copy-card">
            <h3>{{ labels().storeDirectoryTitle }}</h3>
            <p>{{ editorialCopy().stores }}</p>
            <p>{{ editorialCopy().storesDetail }}</p>
            @if (storeLinks().length > 0) {
              <div class="couponleo-copy-card__links">
                @for (link of storeLinks(); track link.id) {
                  <a
                    class="couponleo-copy-link"
                    [routerLink]="localizeRoute(link.route)"
                    [queryParams]="link.queryParams"
                    data-telemetry-event="home_editorial_link"
                    [attr.data-telemetry-label]="link.label"
                  >
                    <strong>{{ link.label }}</strong>
                    <span>{{ link.detail }}</span>
                  </a>
                }
              </div>
            }
          </article>

          <article class="couponleo-copy-card">
            <h3>{{ labels().categoryHubTitle }}</h3>
            <p>{{ editorialCopy().categories }}</p>
            <p>{{ editorialCopy().categoriesDetail }}</p>
            @if (categoryLinks().length > 0) {
              <div class="couponleo-copy-card__links">
                @for (link of categoryLinks(); track link.id) {
                  <a
                    class="couponleo-copy-link"
                    [routerLink]="localizeRoute(link.route)"
                    [queryParams]="link.queryParams"
                    data-telemetry-event="home_editorial_link"
                    [attr.data-telemetry-label]="link.label"
                  >
                    <strong>{{ link.label }}</strong>
                    <span>{{ link.detail }}</span>
                  </a>
                }
              </div>
            }
          </article>

          <article class="couponleo-copy-card">
            <h3>{{ labels().marketPagesTitle }}</h3>
            <p>{{ editorialCopy().markets }}</p>
            <p>{{ editorialCopy().marketsDetail }}</p>
            @if (marketLinks().length > 0) {
              <div class="couponleo-copy-card__links">
                @for (link of marketLinks(); track link.id) {
                  <a
                    class="couponleo-copy-link"
                    [routerLink]="localizeRoute(link.route)"
                    [queryParams]="link.queryParams"
                    data-telemetry-event="home_editorial_link"
                    [attr.data-telemetry-label]="link.label"
                  >
                    <strong>{{ link.label }}</strong>
                    <span>{{ link.detail }}</span>
                  </a>
                }
              </div>
            }
          </article>
        </div>

        <article class="couponleo-copy-card couponleo-copy-card--wide">
          <h3>{{ labels().seoOverviewTitle }}</h3>
          <p>{{ editorialCopy().overview }}</p>
          <p>{{ editorialCopy().detail }}</p>
        </article>
      </section>

      <section class="couponleo-page-section">
        <div class="couponleo-section-heading couponleo-section-heading--stacked">
          <h2>{{ labels().faqTitle }}</h2>
          <p>{{ labels().faqIntro }}</p>
        </div>

        <div class="couponleo-copy-grid couponleo-copy-grid--home">
          @for (faq of homeFaqs(); track faq.question) {
            <article class="couponleo-copy-card">
              <h3>{{ faq.question }}</h3>
              <p>{{ faq.answer }}</p>
            </article>
          }
        </div>
      </section>

    <app-couponleo-coupon-dialog
      [coupon]="activeCoupon()"
      (closeRequested)="closeCoupon()"
    ></app-couponleo-coupon-dialog>
  `,
})
export default class HomePage {
  private readonly api = inject(CouponleoApiService);
  protected readonly i18n = inject(CouponleoI18nService);
  private readonly route = inject(ActivatedRoute);
  private readonly savedService = inject(CouponleoSavedService);
  private readonly seoSync = inject(CouponleoSeoSyncService);
  private readonly initialLoad = this.route.snapshot.data['load'] as Awaited<ReturnType<typeof load>> | undefined;
  private readonly initialCountry = normalizeCountryRouteValue(this.route.snapshot.queryParamMap.get('country'));
  private readonly countryQueryParamMap = this.route.queryParamMap.pipe(
    map((params) => normalizeCountryRouteValue(params.get('country'))),
  );

  private readonly analyticsState = toSignal(
    withHydratedRequestState(
      of(undefined),
      () => this.api.getStoreAnalytics().pipe(map((response) => response.data)),
      emptyAnalyticsSummary(),
      () => this.initialLoad?.analytics,
    ),
    { initialValue: createLoadingState(emptyAnalyticsSummary()) },
  );
  private readonly categoriesState = toSignal(
    withHydratedRequestState(
      this.countryQueryParamMap.pipe(startWith(this.initialCountry)),
      (country) => this.api.listCategories({
        location: locationFilterForCountry(country),
        pageSize: homeCategoryFetchLimit,
      }),
      emptyListResponse<CouponleoCategory>(),
      () => this.initialLoad?.categories,
    ),
    { initialValue: createLoadingState(emptyListResponse<CouponleoCategory>()) },
  );
  private readonly featuredCouponsState = toSignal(
    withHydratedRequestState(
      this.countryQueryParamMap.pipe(startWith(this.initialCountry)),
      () => this.api.listFeaturedCoupons({
        active: true,
        pageSize: homeFeaturedCouponFetchLimit,
      }),
      emptyListResponse<CouponleoCoupon>(),
      () => this.initialLoad?.featuredCoupons,
    ),
    { initialValue: createLoadingState(emptyListResponse<CouponleoCoupon>()) },
  );
  private readonly storesState = toSignal(
    withHydratedRequestState(
      this.countryQueryParamMap.pipe(startWith(this.initialCountry)),
      (country) => this.api.listStores({
        featured: true,
        location: locationFilterForCountry(country),
        pageSize: homeFeaturedStoreFetchLimit,
      }),
      emptyListResponse<CouponleoStore>(),
      () => this.initialLoad?.stores,
    ),
    { initialValue: createLoadingState(emptyListResponse<CouponleoStore>()) },
  );
  private readonly locationsState = toSignal(
    withHydratedRequestState(
      of(undefined),
      () => this.api.listLocations({ pageSize: homeLocationFetchLimit }),
      emptyListResponse<CouponleoLocation>(),
      () => this.initialLoad?.locations,
    ),
    { initialValue: createLoadingState(emptyListResponse<CouponleoLocation>()) },
  );

  protected readonly searchIconSvg = searchIconSvg;
  protected readonly cartIconSvg = cartIconSvg;
  protected readonly benefits = computed(() => benefits.map((benefit) => ({
    ...benefit,
    title: this.i18n.phrase(benefit.title),
    copy: this.i18n.phrase(benefit.copy),
  })));
  protected readonly activeCoupon = signal<CouponleoCouponReveal | null>(null);
  protected readonly searchQuery = signal('');
  protected readonly selectedCountry = toSignal(this.countryQueryParamMap, { initialValue: this.initialCountry });
  protected readonly countryRouteQuery = computed(() => buildCountryRouteQuery(this.selectedCountry()));
  protected readonly localizeRoute = (path: string) => localizeCouponleoRoute(path, this.i18n.locale());
  protected readonly labels = computed(() => ({
    eyebrow: this.i18n.phrase('Live coupon directory'),
    discoverSmarter: this.i18n.phrase('Discover smarter'),
    couponsAnd: this.i18n.phrase('coupons and'),
    strongerDeals: this.i18n.phrase('stronger deals'),
    heroCopy: this.i18n.phrase('See where shoppers are finding stronger coupon codes, brand offers, and category-level savings before you pay full price.'),
    searchPlaceholder: this.i18n.phrase('Search stores, brands, and categories'),
    searchStores: this.i18n.phrase('Search stores'),
    exploreTopDeals: this.i18n.phrase('Explore top deals'),
    browseStoresCta: this.i18n.phrase('Browse stores'),
    featuredDeals: this.i18n.phrase('Featured Deals'),
    viewAllDeals: this.i18n.phrase('View all deals'),
    verified: this.i18n.phrase('Merchant offer'),
    showCode: this.i18n.phrase('Show Code'),
    shoppingSnapshot: this.i18n.phrase('Today\'s deal snapshot'),
    browseMarkets: this.i18n.phrase('Browse markets'),
    noFeaturedDeals: this.i18n.phrase('No featured deals match this search'),
    noFeaturedDealsCopy: this.i18n.phrase('Try another keyword or switch markets to explore a wider set of live coupons.'),
    trendingCategories: this.i18n.phrase('Trending Categories'),
    viewAllCategories: this.i18n.phrase('View all categories'),
    noCategories: this.i18n.phrase('No categories match this search'),
    noCategoriesCopy: this.i18n.phrase('Try a broader keyword to bring back the category trends for the selected market.'),
    topStores: this.i18n.phrase('Top Stores'),
    viewAllStores: this.i18n.phrase('View all stores'),
    viewDeals: this.i18n.phrase('View Deals'),
    noStores: this.i18n.phrase('No stores match this search'),
    noStoresCopy: this.i18n.phrase('Try a different brand or category keyword to restore the top store list.'),
    liveDeals: this.i18n.phrase('Live Deals'),
    localStores: this.i18n.phrase('Local Stores'),
    featuredCoupons: this.i18n.phrase('Featured Coupons'),
    homeGuideTitle: this.i18n.phrase('Start where the market feels alive'),
    storeDirectoryTitle: this.i18n.phrase('When one brand already has your attention'),
    categoryHubTitle: this.i18n.phrase('When the buy is clear but the winner is not'),
    marketPagesTitle: this.i18n.phrase('When location can change the final answer'),
    seoOverviewTitle: this.i18n.phrase('A calmer way to choose the next click'),
    faqTitle: this.i18n.phrase('Before you open the next tab'),
    faqIntro: this.i18n.phrase('A few quick questions can save a lot of wandering once the shortlist starts taking shape.'),
  }));
  private readonly analyticsResponse = computed(() => this.analyticsState().data);
  private readonly categoriesResponse = computed(() => this.categoriesState().data);
  private readonly featuredCouponsResponse = computed(() => this.featuredCouponsState().data);
  private readonly storesResponse = computed(() => this.storesState().data);
  private readonly locationsResponse = computed(() => this.locationsState().data);
  private readonly selectedMarket = computed(() => {
    const selectedCountry = this.selectedCountry();
    if (selectedCountry === 'all') {
      return null;
    }

    return this.locationsResponse().items.find((location) => matchesCountry(selectedCountry, location.country || location.name)) ?? null;
  });

  private readonly countryStores = computed(() => (
    this.storesResponse().items.filter((store) => matchesCountry(this.selectedCountry(), store.location))
  ));

  private readonly filteredCountryStores = computed(() => {
    const query = this.searchQuery().trim();
    return this.countryStores().filter((store) => matchesHomeQuery([
      store.name,
      store.headline,
      store.category,
      resolveCouponleoStoreCategoryLabel(store),
      store.location,
      store.savings,
    ], query));
  });

  private readonly filteredCountryCategories = computed(() => {
    const query = this.searchQuery().trim();
    return this.categoriesResponse().items.filter((category) => matchesHomeQuery([
      category.name,
      category.headline,
      category.description,
      category.metaDescription,
    ], query));
  });

  private readonly featuredCountryCoupons = computed(() => {
    const coupons = this.featuredCouponsResponse().items.filter((coupon) => matchesCountry(
      this.selectedCountry(),
      coupon.location ?? coupon.primary_location,
    ));
    const liveCoupons = coupons.filter((coupon) => isCouponLive(coupon.expiresAt));
    return liveCoupons.length > 0 ? liveCoupons : coupons;
  });

  private readonly filteredFeaturedCountryCoupons = computed(() => {
    const query = this.searchQuery().trim();
    return this.featuredCountryCoupons().filter((coupon) => matchesHomeQuery([
      coupon.title,
      coupon.description,
      coupon.storeName,
      coupon.categoryName,
      coupon.discountText,
    ], query));
  });

  private readonly countryCouponTotal = computed(() => {
    if (this.selectedCountry() === 'all') {
      return this.analyticsResponse().totalCoupons ?? 0;
    }

    return this.selectedMarket()?.couponCount ?? 0;
  });

  private readonly countryStoreTotal = computed(() => {
    if (this.selectedCountry() === 'all') {
      return this.analyticsResponse().totalStores ?? 0;
    }

    return this.selectedMarket()?.storeCount ?? this.storesResponse().total;
  });

  private readonly marketTotal = computed(() => {
    if (this.selectedCountry() === 'all') {
      return this.analyticsResponse().liveMarkets || this.locationsResponse().total || this.locationsResponse().items.length;
    }

    return this.selectedMarket() ? 1 : 0;
  });

  protected readonly featuredDeals = computed<HomeDealCard[]>(() => {
    const featuredCoupons = this.filteredFeaturedCountryCoupons();
    return [...featuredCoupons]
      .sort((left, right) => right.score - left.score)
      .slice(0, 4)
      .map((coupon) => ({
        id: `coupon-${coupon.slug}`,
        title: coupon.discountText,
        subtitle: coupon.storeName,
        description: coupon.description,
        code: coupon.code,
        couponId: coupon.id,
        verification: coupon.verification,
        route: '/top-deals',
        store: coupon.storeName,
        storeRoute: this.localizeRoute(buildStoreRoute(coupon.storeSlug)),
        logoUrl: couponleoCouponLogoUrl(coupon),
        fallbackLogoUrl: coupon.image_url ?? '',
      }));
  });

  protected readonly categories = computed<HomeCategoryCard[]>(() => (
    [...this.filteredCountryCategories()]
      .sort((left, right) => right.couponCount - left.couponCount || left.name.localeCompare(right.name))
      .slice(0, 6)
      .map((category) => {
        const presentation = getCategoryPresentation(category.slug);
        return {
          id: `category-${category.slug}`,
          label: category.name,
          deals: `${this.i18n.formatNumber(category.couponCount)} ${this.i18n.phrase('live deals')}`,
          summary: buildCouponleoCategoryCardDescription(category),
          imageSrc: presentation.imageSrc,
          imageAlt: presentation.imageAlt,
          route: this.localizeRoute(buildCategoryRoute(category.slug)),
        };
      })
  ));

  protected readonly stores = computed<HomeStoreCard[]>(() => {
    const allStores = this.filteredCountryStores();
    const featuredStores = allStores.filter((store) => store.featured);
    const storesToShow = featuredStores.length > 0 ? featuredStores : allStores;

    return [...storesToShow]
      .sort((left, right) => right.activeCoupons - left.activeCoupons)
      .slice(0, 6)
      .map((store) => ({
        id: `store-${store.slug}`,
        name: store.name,
        description: buildCouponleoStoreCardDescriptionForMarket(store, this.selectedCountry()),
        category: resolveCouponleoStoreCategoryLabel(store) || store.category,
        location: store.location,
        activeCoupons: store.activeCoupons,
        route: this.localizeRoute(buildStoreRoute(store.slug)),
        logoUrl: couponleoStoreLogoUrl(store),
      }));
  });

  protected readonly stats = computed<HomeStat[]>(() => {
    const query = this.searchQuery().trim();
    const featuredCouponTotal = query
      ? this.filteredFeaturedCountryCoupons().length
      : this.featuredCountryCoupons().length;

    return [
      { value: this.i18n.formatNumber(this.countryCouponTotal()), label: this.labels().liveDeals, icon: ticketIconSvg },
      { value: this.i18n.formatNumber(this.countryStoreTotal()), label: this.labels().localStores, icon: buildingStoreIconSvg },
      { value: this.i18n.formatNumber(featuredCouponTotal), label: this.labels().featuredCoupons, icon: discountIconSvg },
      { value: this.i18n.formatNumber(this.marketTotal()), label: this.i18n.phrase('Markets'), icon: usersIconSvg },
    ];
  });
  protected readonly heroStats = computed<HomeStat[]>(() => {
    const allStats = this.stats();
    return [allStats[0], allStats[1], allStats[3]].filter(Boolean) as HomeStat[];
  });
  protected readonly selectedMarketLabel = computed(() => (
    this.selectedCountry() === 'all' ? this.i18n.phrase('All Markets') : this.selectedCountry()
  ));
  protected readonly selectedMarketCopy = computed(() => {
    const storeTotal = this.stats().at(1)?.value ?? this.i18n.formatNumber(0);
    const marketTotal = this.stats().at(3)?.value ?? this.i18n.formatNumber(0);
    return `${storeTotal} ${this.i18n.phrase('active brands')} | ${marketTotal} ${this.i18n.phrase('markets covered')}`;
  });
  protected readonly heroSnapshotHeading = computed(() => {
    const liveDeals = this.stats().at(0)?.value ?? this.i18n.formatNumber(0);
    return this.selectedCountry() === 'all'
      ? `${liveDeals} ${this.i18n.phrase('offers worth comparing across active markets')}`
      : `${liveDeals} ${this.i18n.phrase('offers worth comparing in')} ${this.selectedCountry()}`;
  });
  protected readonly heroSnapshotCopy = computed(() => (
    this.selectedCountry() === 'all'
      ? this.i18n.phrase('Start broad, notice which brands and categories feel strongest, and narrow the list only when an offer looks genuinely worth following.')
      : this.i18n.phrase('Stay focused on this market while you compare the brands, savings patterns, and shopping themes that feel most relevant where you live.')
  ));
  protected readonly heroContextCopy = computed(() => {
    const categoryText = joinReadableList(
      topEditorialCategoryValues(this.categories().map((category) => category.label)),
      this.i18n.phrase('popular categories'),
    );
    const storeText = joinReadableList(
      topUniqueValues(this.stores().map((store) => store.name)),
      this.i18n.phrase('featured stores'),
    );
    const marketText = joinReadableList(
      topUniqueValues(this.marketLinks().map((market) => market.label)),
      this.i18n.phrase('global markets'),
    );
    return `${this.i18n.phrase('A typical shopping path starts with')} ${categoryText}, ${this.i18n.phrase('moves through merchants such as')} ${storeText}, ${this.i18n.phrase('and then checks whether the strongest version of the deal is showing up in')} ${marketText}.`;
  });
  protected readonly storeLinks = computed<HomeResourceLink[]>(() => (
    this.stores().slice(0, 3).map((store) => {
      return {
        id: String(store.id),
        label: store.name,
        detail: store.description,
        route: store.route,
        queryParams: this.countryRouteQuery(),
      };
    })
  ));
  protected readonly categoryLinks = computed<HomeResourceLink[]>(() => (
    this.categories().slice(0, 3).map((category) => ({
      id: String(category.id),
      label: category.label,
      detail: buildCouponleoCategoryCardDescription({
        name: category.label,
        headline: category.summary,
        description: category.summary,
      }),
      route: category.route,
      queryParams: this.countryRouteQuery(),
    }))
  ));
  protected readonly marketLinks = computed<HomeResourceLink[]>(() => (
    [...this.locationsResponse().items]
      .sort((left, right) => (right.couponCount ?? 0) - (left.couponCount ?? 0))
      .slice(0, 3)
      .map((location) => ({
        id: `market-${location.id}`,
        label: location.country || location.name,
        detail: resolveCouponleoLocationSpotlight(location),
        route: '/country-deals',
        queryParams: buildCountryRouteQuery(location.country || location.name),
      }))
  ));
  protected readonly editorialCopy = computed<HomeEditorialCopy>(() => {
    const categoryText = joinReadableList(
      topEditorialCategoryValues(this.categories().map((category) => category.label)),
      this.i18n.phrase('popular categories'),
    );
    const storeText = joinReadableList(
      topUniqueValues(this.stores().map((store) => store.name)),
      this.i18n.phrase('featured stores'),
    );
    const marketText = joinReadableList(
      topUniqueValues(this.marketLinks().map((market) => market.label)),
      this.i18n.phrase('global markets'),
    );
    const liveDealCount = this.i18n.formatNumber(this.countryCouponTotal());
    const liveStoreCount = this.i18n.formatNumber(this.countryStoreTotal());
    const marketCount = this.i18n.formatNumber(this.marketTotal());

    return {
      intro: this.selectedCountry() === 'all'
        ? this.i18n.phrase('The smartest CouponLeo visits start a little wider: notice where the real discounting pressure is building, then let the strongest names earn your attention.')
        : `${this.i18n.phrase('This opening view is tuned to')} ${this.selectedCountry()}, ${this.i18n.phrase('so the merchants, shopping themes, and savings patterns stay closer to what shoppers there can actually use.')}`,
      introDetail: this.selectedCountry() === 'all'
        ? `${liveDealCount} ${this.i18n.phrase('live offers across')} ${liveStoreCount} ${this.i18n.phrase('stores and')} ${marketCount} ${this.i18n.phrase('markets give the homepage enough range to reward the better decision, not just the faster click.')}`
        : this.i18n.phrase('That keeps the journey practical instead of generic, so discovery can turn into a real buying decision without losing the local context around price, delivery, or offer quality.'),
      stores: `${this.i18n.phrase('If names like')} ${storeText} ${this.i18n.phrase('are already circling in your head, this is where you check whether the savings feel deep, steady, and worth trusting today.')}`,
      storesDetail: this.i18n.phrase('That extra pause often separates a single flashy code from a merchant that is quietly discounting with real conviction.'),
      categories: `${this.i18n.phrase('Shopping themes such as')} ${categoryText} ${this.i18n.phrase('work best when you know what you want but still want the strongest brand to reveal itself naturally.')}`,
      categoriesDetail: this.i18n.phrase('A wider comparison makes thin couponing obvious and gives genuine price pressure room to stand out.'),
      markets: this.selectedCountry() === 'all'
        ? `${this.i18n.phrase('Markets such as')} ${marketText} ${this.i18n.phrase('matter because the very same merchant can look compelling in one country and ordinary in another.')}`
        : `${this.i18n.phrase('Keeping the homepage focused on')} ${this.selectedCountry()} ${this.i18n.phrase('makes the shortlist more believable because it narrows the field to the offers, delivery expectations, and checkout rules most likely to matter where you shop.')}`,
      marketsDetail: this.selectedCountry() === 'all'
        ? this.i18n.phrase('Shipping thresholds, local exclusions, and region-only promotions can quietly change what a good deal really looks like.')
        : this.i18n.phrase('That narrower lens usually leads to quicker decisions, fewer dead-end clicks, and a much better feel for what the final checkout experience is likely to be.'),
      overview: this.i18n.phrase('Better savings decisions usually happen in two calm moves: read the field first, then choose the merchant.'),
      detail: this.i18n.phrase('Let the homepage show you where the energy is, then move deeper only when a brand, product lane, or market has genuinely earned the next click.'),
    };
  });
  protected readonly homeFaqs = computed<CouponleoSeoFaqItem[]>(() => {
    const topStore = this.stores()[0]?.name ?? 'a featured store';
    const topCategory = this.categories()[0]?.label ?? this.i18n.phrase('popular categories');
    const topMarket = this.marketLinks()[0]?.label ?? this.i18n.phrase('global markets');

    return [
      {
        question: this.i18n.phrase('How should shoppers use the homepage before opening a deal?'),
        answer: this.selectedCountry() === 'all'
          ? `${this.i18n.phrase('Start by reading the room. Notice which brands, product lanes, and regions feel genuinely active, then follow the option that keeps looking strong from more than one angle.')}`
          : `${this.i18n.phrase('Because the homepage is already narrowed to')} ${this.selectedCountry()}, ${this.i18n.phrase('it works best as a fast shortlist builder before you open the offer that still looks strongest in that market.')}`,
      },
      {
        question: this.i18n.phrase('When should shoppers stay broad instead of choosing a brand too early?'),
        answer: `${this.i18n.phrase('Stay broad when a shopping lane such as')} ${topCategory} ${this.i18n.phrase('is clear but the best merchant still is not. Narrow the field only after a brand such as')} ${topStore} ${this.i18n.phrase('keeps looking strong beyond one headline offer.')}`,
      },
      {
        question: this.i18n.phrase('Why do market filters matter on CouponLeo?'),
        answer: `${topMarket} ${this.i18n.phrase('matters because delivery rules, exclusions, and local promo pressure can change which merchant deserves the order. The same is true for')} ${topCategory.toLowerCase()}, ${this.i18n.phrase('where the strongest-looking option can shift once checkout conditions become market-specific.')}`,
      },
    ];
  });

  constructor() {
    effect(() => {
      const faqs = this.homeFaqs();
      this.seoSync.setPageFaqs(faqs);
    });
  }

  protected isSaved(id: string): boolean {
    return this.savedService.has(id);
  }

  protected updateSearch(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    this.searchQuery.set(target?.value ?? '');
  }

  protected toggleDealSaved(deal: HomeDealCard): void {
    this.savedService.toggle({
      id: deal.id,
      kind: 'coupon',
      title: deal.title,
      subtitle: deal.store,
      description: deal.description,
      route: deal.route,
      code: deal.code,
    });
  }

  protected toggleStoreSaved(store: HomeStoreCard): void {
    this.savedService.toggle({
      id: store.id,
      kind: 'store',
      title: store.name,
      subtitle: 'Live store snapshot',
      description: store.description,
      route: store.route,
    });
  }

  protected openCoupon(deal: HomeDealCard): void {
    this.activeCoupon.set({
      title: deal.title,
      subtitle: deal.store,
      description: deal.description,
      code: deal.code,
      couponId: deal.couponId,
      verification: deal.verification,
      route: deal.route,
    });
  }

  protected closeCoupon(): void {
    this.activeCoupon.set(null);
  }

  protected maskCode(code: string): string {
    const visibleCharacters = Math.max(2, Math.ceil(code.length / 2));
    const hiddenCharacters = Math.max(2, code.length - visibleCharacters);
    return `${code.slice(0, visibleCharacters)}${'*'.repeat(hiddenCharacters)}`;
  }
}
