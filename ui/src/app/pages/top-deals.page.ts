import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { type PageServerLoad } from '@analogjs/router';
import { map, of, startWith, switchMap } from 'rxjs';
import {
  CouponleoCouponDialogComponent,
  type CouponleoCouponReveal,
} from '../components/couponleo-coupon-dialog.component';
import {
  CouponleoBreadcrumbsComponent,
  type CouponleoBreadcrumbItem,
} from '../components/couponleo-breadcrumbs.component';
import { CouponleoBrandmarkComponent } from '../components/couponleo-brandmark.component';
import { CouponleoEonIconComponent } from '../components/couponleo-eon-icon.component';
import { CouponleoFavoriteButtonComponent } from '../components/couponleo-favorite-button.component';
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
import { CouponleoI18nService } from '../services/couponleo-i18n.service';
import { couponleoCouponLogoUrl, couponleoStoreLogoUrl } from '../services/couponleo-logo.helpers';
import { CouponleoSavedService } from '../services/couponleo-saved.service';
import { CouponleoSeoSyncService } from '../services/couponleo-seo-sync.service';
import {
  buildCouponleoCategoryCardDescription,
  type CouponleoSeoFaqItem,
  buildCouponleoStoreCardDescriptionForMarket,
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
  formatExpiryLabel,
  isCouponLive,
  localizeCouponleoRoute,
  locationFilterForCountry,
  matchesCountry,
  normalizeCountryRouteValue,
  pageCountFor,
  paginateItems,
} from '../services/couponleo-ui.helpers';

import buildingStoreIconSvg from '@eonui/icons/svg/maps/eon-building-store.svg?raw';
import clockIconSvg from '@eonui/icons/svg/system/eon-clock.svg?raw';
import discountIconSvg from '@eonui/icons/svg/commerce/eon-rosette-discount-check.svg?raw';
import giftIconSvg from '@eonui/icons/svg/commerce/eon-gift.svg?raw';
import searchIconSvg from '@eonui/icons/svg/system/eon-search.svg?raw';
import shieldIconSvg from '@eonui/icons/svg/system/eon-shield-check.svg?raw';
import shieldLockIconSvg from '@eonui/icons/svg/system/eon-shield-lock.svg?raw';
import usersIconSvg from '@eonui/icons/svg/system/eon-users.svg?raw';
import walletIconSvg from '@eonui/icons/svg/commerce/eon-wallet.svg?raw';

interface TopPickCard extends CouponleoCouponReveal {
  id: string;
  store: string;
  storeRoute: string;
  offer: string;
  subtitle: string;
  expires: string;
  used: string;
  logoUrl: string;
  fallbackLogoUrl: string;
}

interface BrowseDealCard extends CouponleoCouponReveal {
  id: string;
  store: string;
  storeRoute: string;
  offer: string;
  expires: string;
  logoUrl: string;
  fallbackLogoUrl: string;
}

interface StoreDealCard {
  id: string;
  name: string;
  count: string;
  description: string;
  route: string;
  logoUrl: string;
}

interface DealStat {
  value: string;
  label: string;
  icon: string;
}

interface TopDealsGuideLink {
  id: string;
  label: string;
  detail: string;
  route: string;
}

interface TopDealsEditorialCopy {
  intro: string;
  introDetail: string;
  strategy: string;
  strategyDetail: string;
  marketNote: string;
  nextStops: string;
  nextStopsDetail: string;
}

const heroBenefits = [
  { title: 'Merchant offers', copy: 'Check eligibility and expiry', icon: shieldIconSvg },
  { title: 'Top Savings', copy: 'Sorted by live score', icon: discountIconSvg },
  { title: 'Daily Updates', copy: 'Search and filter ready', icon: clockIconSvg },
  { title: 'Secure', copy: 'Safer paths to checkout', icon: shieldLockIconSvg },
];
const topDealsCategoryFetchLimit = 120;
const topDealsCouponFetchLimit = 96;
const topDealsLocationFetchLimit = 80;
const topDealsStoreFetchLimit = 80;

export const routeMeta = createDynamicRouteMeta((route) => {
  const country = normalizeCountryRouteValue(route.queryParamMap.get('country'));

  if (country === 'all') {
    return {
      title: 'Best Coupon Deals and Promo Codes Today | CouponLeo',
      description: 'Browse the strongest coupon deals and promo codes right now, then narrow the list by store, category, or market until the savings feel worth using.',
    };
  }

  return {
    title: `Best Coupon Deals in ${country} | CouponLeo`,
    description: `Browse the strongest coupon deals and promo codes for shoppers in ${country}, with enough brand and market context to compare before checkout.`,
  };
});

const dealsPageSize = 4;

function emptyListResponse<T>() {
  return { items: [] as T[], total: 0 };
}

export async function load(pageServerLoad: PageServerLoad) {
  const country = normalizeCountryRouteValue(readCouponleoQueryParam(pageServerLoad, 'country'));
  const location = locationFilterForCountry(country);

  return {
    categories: await fetchCouponleoList(
      pageServerLoad,
      '/categories',
      { pageSize: topDealsCategoryFetchLimit },
      emptyListResponse<CouponleoCategory>(),
    ),
    coupons: await fetchCouponleoList(
      pageServerLoad,
      '/coupons',
      { active: true, location, pageSize: topDealsCouponFetchLimit },
      emptyListResponse<CouponleoCoupon>(),
    ),
    locations: await fetchCouponleoList(
      pageServerLoad,
      '/locations',
      { pageSize: topDealsLocationFetchLimit },
      emptyListResponse<CouponleoLocation>(),
    ),
    stores: await fetchCouponleoList(
      pageServerLoad,
      '/stores',
      { location, pageSize: topDealsStoreFetchLimit },
      emptyListResponse<CouponleoStore>(),
    ),
  };
}

function matchesDealQuery(coupon: CouponleoCoupon, query: string): boolean {
  if (!query) {
    return true;
  }

  const normalizedQuery = query.toLowerCase();
  return [
    coupon.title,
    coupon.description,
    coupon.storeName,
    coupon.categoryName,
    coupon.discountText,
    coupon.savingsNote,
  ].some((value) => value.toLowerCase().includes(normalizedQuery));
}

@Component({
  selector: 'app-top-deals-page',
  imports: [
    RouterLink,
    CouponleoBreadcrumbsComponent,
    CouponleoCouponDialogComponent,
    CouponleoBrandmarkComponent,
    CouponleoEonIconComponent,
    CouponleoFavoriteButtonComponent,
    CouponleoPageLoaderComponent,
    CouponleoPaginationComponent,
  ],
  template: `
    <app-couponleo-breadcrumbs [items]="breadcrumbs()"></app-couponleo-breadcrumbs>

    <section class="couponleo-route-hero">
      <div class="couponleo-route-hero__copy">
        <span class="couponleo-eyebrow">{{ labels().eyebrow }}</span>
        <h1 class="couponleo-route-hero__title">{{ labels().title }}</h1>
        <p>{{ labels().description }}</p>

        <form class="couponleo-searchbar" (submit)="$event.preventDefault()" data-telemetry-event="top_deals_search_submit" data-telemetry-label="Top deals search">
          <span class="couponleo-searchbar__icon" aria-hidden="true">
            <app-couponleo-eon-icon [svg]="searchIconSvg"></app-couponleo-eon-icon>
          </span>
          <input
            type="search"
            [placeholder]="labels().searchPlaceholder"
            [attr.aria-label]="i18n.phrase('Search deals')"
            [value]="searchQuery()"
            data-telemetry-event="top_deals_search_input"
            data-telemetry-label="Top deals search"
            (input)="updateSearch($event)"
          >
          <button
            type="submit"
            class="couponleo-searchbar__button"
            [attr.aria-label]="i18n.phrase('Search')"
            data-telemetry-event="top_deals_search_button"
            data-telemetry-label="Top deals search"
          >
            <app-couponleo-eon-icon [svg]="searchIconSvg"></app-couponleo-eon-icon>
          </button>
        </form>

        <div class="couponleo-hero__benefits couponleo-hero__benefits--four">
          @for (benefit of heroBenefits(); track benefit.title) {
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

      <div class="couponleo-hero__visual couponleo-hero__visual--page">
        <span class="couponleo-hero__spark couponleo-hero__spark--blue-top"></span>
        <span class="couponleo-hero__spark couponleo-hero__spark--orange-mid"></span>
        <span class="couponleo-hero__spark couponleo-hero__spark--blue-dot"></span>
        <span class="couponleo-hero__spark couponleo-hero__spark--orange-tri"></span>
        <span class="couponleo-hero__dots" aria-hidden="true"></span>
        <div class="couponleo-hero__visual-aura couponleo-hero__visual-aura--blue" aria-hidden="true"></div>
        <div class="couponleo-hero__visual-aura couponleo-hero__visual-aura--orange" aria-hidden="true"></div>
        <div class="couponleo-hero__visual-ring" aria-hidden="true"></div>
        <div class="couponleo-hero__visual-base" aria-hidden="true"></div>
        <img
          class="couponleo-hero__image couponleo-route-hero__image couponleo-route-hero__image--top-deals"
          src="/assets/images/heroes/top-deals-hero.png"
          alt="Top deals hero featuring discount tickets, a sale badge, and a gift box"
          loading="eager"
        >
      </div>
    </section>

    @if (isLoading()) {
      <section class="couponleo-page-section">
        <app-couponleo-page-loader [cards]="5" [columns]="4" [statsCount]="5"></app-couponleo-page-loader>
      </section>
    } @else {
      <section class="couponleo-page-section">
        <div class="couponleo-section-heading">
          <h2>{{ labels().topPicks }}</h2>
          <a
            [routerLink]="localizeRoute('/top-deals')"
            [queryParams]="countryRouteQuery()"
            data-telemetry-event="top_deals_featured_open_all"
            [attr.data-telemetry-label]="labels().viewFeaturedCoupons"
          >{{ labels().viewFeaturedCoupons }}</a>
        </div>

        <div class="couponleo-picks-grid">
          @for (pick of topPicks(); track pick.id) {
            <article class="couponleo-pick-card">
              <div class="couponleo-pick-card__header">
                <div class="couponleo-pick-card__brand-wrap">
                  <span class="couponleo-pick-card__brandmark" aria-hidden="true">
                    <app-couponleo-brandmark
                      [name]="pick.store"
                      [src]="pick.logoUrl"
                      [fallbackSrc]="pick.fallbackLogoUrl"
                    ></app-couponleo-brandmark>
                  </span>
                  <div class="couponleo-pick-card__header-copy">
                    <a
                      class="couponleo-store-name-link couponleo-pick-card__brand"
                      [routerLink]="localizeRoute(pick.storeRoute)"
                      [queryParams]="countryRouteQuery()"
                      data-telemetry-event="top_deals_pick_store_open"
                      [attr.data-telemetry-label]="pick.store"
                    >{{ pick.store }}</a>
                    <span class="couponleo-pick-card__offer">{{ pick.offer }}</span>
                  </div>
                </div>
                <app-couponleo-favorite-button
                  [active]="isSaved(pick.id)"
                  [ariaLabel]="labels().saveTopDeal"
                  (toggled)="toggleDealSaved(pick)"
                ></app-couponleo-favorite-button>
              </div>
              <h3>{{ pick.title }}</h3>
              <p>{{ pick.description }}</p>
              <div class="couponleo-pick-card__meta">
                <span class="couponleo-pick-card__verified">
                  <app-couponleo-eon-icon [svg]="shieldIconSvg"></app-couponleo-eon-icon>
                  {{ labels().verified }}
                </span>
                <span>{{ pick.used }}</span>
              </div>
              <button
                type="button"
                class="couponleo-code couponleo-code--masked couponleo-pick-card__code"
                (click)="openCoupon(pick)"
                data-telemetry-event="top_deals_pick_code_open"
                [attr.data-telemetry-label]="pick.store + ' ' + pick.offer"
              >
                {{ maskCode(pick.code) }}
              </button>
              <span class="couponleo-pick-card__expires">{{ pick.expires }}</span>
              <button
                type="button"
                class="couponleo-button couponleo-button--solid"
                (click)="openCoupon(pick)"
                data-telemetry-event="top_deals_pick_claim"
                [attr.data-telemetry-label]="pick.store + ' ' + pick.offer"
              >{{ labels().claimDeal }}</button>
            </article>
          }

        </div>
      </section>

      <section class="couponleo-page-section">
        <div class="couponleo-chip-row">
          @for (filter of dealFilters(); track filter.value) {
            <button
              type="button"
              class="couponleo-chip"
              [class.is-active]="selectedCategory() === filter.value"
              data-telemetry-event="top_deals_filter_select"
              [attr.data-telemetry-label]="filter.label"
              (click)="selectCategory(filter.value)"
            >
              {{ filter.label }}
            </button>
          }
        </div>
      </section>

      <section class="couponleo-page-section">
        <div class="couponleo-section-heading">
          <h2>{{ labels().browseLiveDeals }}</h2>
          <span class="couponleo-deal-summary">{{ formatCount(browseDealsTotal(), 'active deal', 'active deals') }}</span>
        </div>

        @if (browseDeals().length > 0) {
          <div class="couponleo-deal-grid">
            @for (deal of browseDeals(); track deal.id) {
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
                      data-telemetry-event="top_deals_browse_store_open"
                      [attr.data-telemetry-label]="deal.store"
                    >{{ deal.store }}</a>
                  </span>
                  <span class="couponleo-card-toolbar">
                    <span class="couponleo-deal-card__flag">{{ labels().verified }}</span>
                    <app-couponleo-favorite-button
                      [active]="isSaved(deal.id)"
                      [ariaLabel]="labels().saveDeal"
                      (toggled)="toggleDealSaved(deal)"
                    ></app-couponleo-favorite-button>
                  </span>
                </div>
                <h3>{{ deal.offer }}</h3>
                <p>{{ deal.description }}</p>
                <span class="couponleo-browse-deal__expires">{{ deal.expires }}</span>
                <div class="couponleo-deal-card__actions">
                  <button
                    type="button"
                    class="couponleo-code couponleo-code--masked"
                    (click)="openCoupon(deal)"
                    data-telemetry-event="top_deals_browse_code_open"
                    [attr.data-telemetry-label]="deal.store + ' ' + deal.offer"
                  >
                    {{ maskCode(deal.code) }}
                  </button>
                  <button
                    type="button"
                    class="couponleo-button couponleo-button--solid"
                    (click)="openCoupon(deal)"
                    data-telemetry-event="top_deals_browse_show_code"
                    [attr.data-telemetry-label]="deal.store + ' ' + deal.offer"
                  >
                    {{ i18n.phrase('Show Code') }}
                  </button>
                </div>
              </article>
            }
          </div>

          <app-couponleo-pagination
            [page]="dealPage()"
            [pageCount]="dealPageCount()"
            [totalItems]="browseDealsTotal()"
            [itemLabel]="i18n.phrase('live deals')"
            (pageChange)="setDealPage($event)"
          ></app-couponleo-pagination>
        } @else {
          <div class="couponleo-empty-card">
            <h3>{{ labels().noDeals }}</h3>
            <p>{{ labels().noDealsCopy }}</p>
          </div>
        }
      </section>

      <section class="couponleo-page-section">
        <div class="couponleo-section-heading">
          <h2>{{ labels().topDealsByStore }}</h2>
          <a
            [routerLink]="localizeRoute('/stores')"
            [queryParams]="countryRouteQuery()"
            data-telemetry-event="top_deals_stores_open_all"
            [attr.data-telemetry-label]="labels().viewAllStores"
          >{{ labels().viewAllStores }}</a>
        </div>

        <div class="couponleo-store-rail">
          @for (store of storeDeals(); track store.id) {
            <article class="couponleo-store-rail__card">
              <div class="couponleo-store-rail__card-head">
                <div class="couponleo-store-rail__brand">
                  <span class="couponleo-store-rail__brandmark" aria-hidden="true">
                    <app-couponleo-brandmark [name]="store.name" [src]="store.logoUrl"></app-couponleo-brandmark>
                  </span>
                  <strong>
                    <a
                      class="couponleo-store-name-link"
                      [routerLink]="localizeRoute(store.route)"
                      [queryParams]="countryRouteQuery()"
                      data-telemetry-event="top_deals_store_name_open"
                      [attr.data-telemetry-label]="store.name"
                    >{{ store.name }}</a>
                  </strong>
                </div>
                <app-couponleo-favorite-button
                  [active]="isSaved(store.id)"
                  [ariaLabel]="labels().saveStore"
                  (toggled)="toggleStoreSaved(store)"
                ></app-couponleo-favorite-button>
              </div>
              <span>{{ store.count }}</span>
              <a
                class="couponleo-store-rail__link"
                [routerLink]="localizeRoute(store.route)"
                [queryParams]="countryRouteQuery()"
                data-telemetry-event="top_deals_store_open"
                [attr.data-telemetry-label]="store.name"
              >{{ labels().viewDeals }}</a>
            </article>
          }
        </div>
      </section>

      <section class="couponleo-page-section">
        <div class="couponleo-inline-stats couponleo-inline-stats--five">
          @for (stat of stats(); track stat.label) {
            <div class="couponleo-inline-stats__item">
              <span class="couponleo-inline-stats__icon" aria-hidden="true">
                <app-couponleo-eon-icon [svg]="stat.icon"></app-couponleo-eon-icon>
              </span>
              <div>
                <strong>{{ stat.value }}</strong>
                <span>{{ stat.label }}</span>
              </div>
            </div>
          }
        </div>
      </section>

      <section class="couponleo-page-section couponleo-copy-section">
        <div class="couponleo-section-heading couponleo-section-heading--stacked">
          <h2>{{ labels().topDealsGuideTitle }}</h2>
          <p>{{ editorialCopy().intro }}</p>
          <p>{{ editorialCopy().introDetail }}</p>
        </div>

        <div class="couponleo-top-deals-copy-grid">
          <article class="couponleo-copy-card">
            <h3>{{ labels().narrowDealsTitle }}</h3>
            <p>{{ editorialCopy().strategy }}</p>
            <p>{{ editorialCopy().strategyDetail }}</p>
            <p>{{ editorialCopy().marketNote }}</p>
          </article>

          <article class="couponleo-copy-card">
            <h3>{{ labels().nextStopsTitle }}</h3>
            <p>{{ editorialCopy().nextStops }}</p>
            <p>{{ editorialCopy().nextStopsDetail }}</p>

            @if (guideLinks().length > 0) {
              <div class="couponleo-copy-card__links">
                @for (link of guideLinks(); track link.id) {
                  <a
                    class="couponleo-copy-link"
                    [routerLink]="localizeRoute(link.route)"
                    [queryParams]="countryRouteQuery()"
                    data-telemetry-event="top_deals_guide_link"
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
      </section>

      <section class="couponleo-page-section">
        <div class="couponleo-section-heading couponleo-section-heading--stacked">
          <h2>{{ labels().faqTitle }}</h2>
          <p>{{ labels().faqIntro }}</p>
        </div>

        <div class="couponleo-top-deals-copy-grid">
          @for (faq of topDealsFaqs(); track faq.question) {
            <article class="couponleo-copy-card">
              <h3>{{ faq.question }}</h3>
              <p>{{ faq.answer }}</p>
            </article>
          }
        </div>
      </section>
    }

    <app-couponleo-coupon-dialog
      [coupon]="activeCoupon()"
      (closeRequested)="closeCoupon()"
    ></app-couponleo-coupon-dialog>
  `,
  styles: [`
    :host {
      display: block;
    }

    .couponleo-route-hero {
      display: grid;
      grid-template-columns: minmax(0, 0.9fr) minmax(360px, 1.1fr);
      align-items: center;
      gap: clamp(28px, 4vw, 56px);
      width: var(--couponleo-shell-width);
      margin: 0 auto;
      padding: 28px 0 10px;
    }

    .couponleo-route-hero__copy {
      display: grid;
      gap: 18px;
      max-width: 36rem;
    }

    .couponleo-route-hero__title {
      margin: 0;
      color: var(--couponleo-navy);
      font-size: clamp(3.5rem, 5.6vw, 5.2rem);
      line-height: 0.92;
      letter-spacing: -0.06em;
    }

    .couponleo-route-hero__copy p {
      margin: 0;
      max-width: 31rem;
      color: var(--couponleo-muted);
      font-size: 1.06rem;
      line-height: 1.7;
    }

    .couponleo-hero__benefits--four {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }

    .couponleo-hero__visual--page {
      min-height: 30rem;
    }

    .couponleo-top-deals-copy-grid {
      display: grid;
      grid-template-columns: minmax(0, 1.05fr) minmax(0, 0.95fr);
      gap: 18px;
    }

    .couponleo-route-hero__image {
      right: 2%;
      bottom: 2%;
      width: min(92%, 36rem);
      max-height: 86%;
      height: auto;
      object-fit: contain;
      object-position: center bottom;
      transform: none;
    }

    .couponleo-route-hero__image--top-deals {
      right: 3%;
      bottom: 3%;
      width: min(90%, 34rem);
    }

    .couponleo-picks-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 18px;
    }

    .couponleo-pick-card {
      display: grid;
      gap: 14px;
      min-width: 0;
      padding: 20px;
      border: 1px solid rgba(255, 255, 255, 0.94);
      border-radius: 24px;
      background: rgba(255, 255, 255, 0.9);
      box-shadow: var(--couponleo-shadow);
    }

    .couponleo-pick-card__header {
      display: flex;
      align-items: start;
      justify-content: space-between;
      gap: 12px;
    }

    .couponleo-pick-card__brand-wrap,
    .couponleo-pick-card__header-copy {
      display: grid;
      min-width: 0;
    }

    .couponleo-pick-card__brand-wrap {
      flex: 1 1 auto;
      width: 100%;
      grid-template-columns: auto minmax(0, 1fr);
      align-items: center;
      gap: 10px;
    }

    .couponleo-pick-card__header-copy {
      gap: 10px;
      align-content: start;
    }

    .couponleo-pick-card__brandmark {
      width: 4.75rem;
      height: 4.75rem;
      min-width: 4.75rem;
      border-radius: 20px;
    }

    .couponleo-pick-card__brand {
      display: -webkit-box;
      max-width: 100%;
      overflow: hidden;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
      color: var(--couponleo-navy);
      font-size: clamp(1.35rem, 2vw, 1.7rem);
      font-weight: 900;
      line-height: 1.02;
      letter-spacing: -0.05em;
      overflow-wrap: break-word;
      word-break: break-word;
    }

    .couponleo-pick-card__offer {
      display: inline-flex;
      width: fit-content;
      max-width: 100%;
      padding: 8px 10px;
      border-radius: 14px;
      background: var(--couponleo-orange-soft);
      color: var(--couponleo-orange);
      font-size: 0.82rem;
      font-weight: 800;
      line-height: 1.25;
    }

    .couponleo-pick-card__header app-couponleo-favorite-button,
    .couponleo-store-rail__card-head app-couponleo-favorite-button {
      flex-shrink: 0;
    }

    .couponleo-pick-card h3,
    .couponleo-pick-card p {
      margin: 0;
    }

    .couponleo-pick-card h3 {
      color: var(--couponleo-navy);
      font-size: 1.12rem;
    }

    .couponleo-pick-card p {
      color: var(--couponleo-muted);
      line-height: 1.58;
    }

    .couponleo-pick-card__meta {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      color: var(--couponleo-muted);
      font-size: 0.84rem;
    }

    .couponleo-pick-card__verified {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      color: #16825b;
      font-weight: 700;
    }

    .couponleo-pick-card__verified app-couponleo-eon-icon {
      width: 1rem;
      height: 1rem;
    }

    .couponleo-pick-card__code {
      justify-self: start;
    }

    .couponleo-pick-card__expires,
    .couponleo-browse-deal__expires {
      display: inline-flex;
      width: fit-content;
      padding: 7px 12px;
      border-radius: 999px;
      background: rgba(22, 36, 74, 0.05);
      color: var(--couponleo-muted);
      font-size: 0.8rem;
      font-weight: 700;
    }

    .couponleo-pick-card .couponleo-button {
      width: 100%;
    }

    .couponleo-chip-row {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }

    .couponleo-chip {
      min-height: 42px;
      padding: 0 16px;
      border: 1px solid rgba(22, 36, 74, 0.1);
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.92);
      color: var(--couponleo-text);
      font-weight: 700;
    }

    .couponleo-chip.is-active {
      background: linear-gradient(135deg, #3480ff 0%, #2355f6 100%);
      border-color: transparent;
      color: #fff;
    }

    .couponleo-deal-summary {
      color: var(--couponleo-muted);
      font-weight: 700;
    }

    .couponleo-store-rail {
      display: grid;
      grid-template-columns: repeat(6, minmax(0, 1fr));
      gap: 14px;
    }

    .couponleo-store-rail__card {
      display: grid;
      gap: 8px;
      min-width: 0;
      min-height: 88px;
      padding: 18px 16px;
      border: 1px solid rgba(22, 36, 74, 0.08);
      border-radius: 20px;
      background: rgba(255, 255, 255, 0.9);
      box-shadow: 0 12px 28px rgba(18, 35, 77, 0.06);
    }

    .couponleo-store-rail__card-head {
      display: flex;
      align-items: start;
      justify-content: space-between;
      gap: 12px;
    }

    .couponleo-store-rail__brand {
      flex: 1 1 auto;
      width: 100%;
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      align-items: center;
      gap: 12px;
      min-width: 0;
    }

    .couponleo-store-rail__brandmark {
      width: 3.8rem;
      height: 3.8rem;
      min-width: 3.8rem;
      border-radius: 19px;
    }

    .couponleo-store-rail__card strong {
      display: -webkit-box;
      overflow: hidden;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
      color: var(--couponleo-navy);
      font-size: 1.2rem;
      line-height: 1.08;
      letter-spacing: -0.04em;
      overflow-wrap: break-word;
      word-break: break-word;
    }

    .couponleo-store-rail__card span {
      color: var(--couponleo-muted);
      font-size: 0.88rem;
    }

    .couponleo-store-rail__link {
      color: var(--couponleo-blue);
      font-size: 0.88rem;
      font-weight: 800;
    }

    .couponleo-inline-stats {
      display: grid;
      gap: 1px;
      overflow: hidden;
      border: 1px solid rgba(22, 36, 74, 0.08);
      border-radius: 24px;
      background: rgba(22, 36, 74, 0.08);
      box-shadow: 0 18px 40px rgba(18, 35, 77, 0.08);
    }

    .couponleo-inline-stats--five {
      grid-template-columns: repeat(5, minmax(0, 1fr));
    }

    .couponleo-inline-stats__item {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 18px 20px;
      background: rgba(255, 255, 255, 0.94);
    }

    .couponleo-inline-stats__icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 3rem;
      height: 3rem;
      padding: 12px;
      box-sizing: border-box;
      border-radius: 999px;
      background: rgba(52, 120, 255, 0.08);
      color: var(--couponleo-blue);
    }

    .couponleo-inline-stats__icon app-couponleo-eon-icon {
      width: 1.3rem;
      height: 1.3rem;
    }

    .couponleo-inline-stats__item strong,
    .couponleo-inline-stats__item span {
      display: block;
    }

    .couponleo-inline-stats__item strong {
      color: var(--couponleo-navy);
      font-size: 1.55rem;
      line-height: 1;
    }

    .couponleo-inline-stats__item span {
      margin-top: 4px;
      color: var(--couponleo-muted);
    }

    @media (max-width: 1260px) {
      .couponleo-route-hero,
      .couponleo-picks-grid {
        grid-template-columns: 1fr;
      }

      .couponleo-picks-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .couponleo-store-rail {
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }

      .couponleo-inline-stats--five {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .couponleo-top-deals-copy-grid {
        grid-template-columns: 1fr;
      }
    }

    @media (max-width: 780px) {
      .couponleo-route-hero {
        padding-top: 22px;
      }

      .couponleo-route-hero__title {
        font-size: clamp(2.7rem, 12vw, 4rem);
      }

      .couponleo-route-hero__image--top-deals {
        right: 50%;
        bottom: 2%;
        width: min(100%, 28rem);
        max-height: 80%;
        transform: translateX(50%);
      }

      .couponleo-hero__benefits--four,
      .couponleo-picks-grid,
      .couponleo-store-rail,
      .couponleo-inline-stats--five {
        grid-template-columns: 1fr;
      }

      .couponleo-pick-card__brandmark {
        width: 4rem;
        height: 4rem;
        min-width: 4rem;
      }
    }
  `],
})
export default class TopDealsPage {
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

  private readonly categoriesState = toSignal(
    withHydratedRequestState(
      of(undefined),
      () => this.api.listCategories({ pageSize: topDealsCategoryFetchLimit }),
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
        pageSize: topDealsCouponFetchLimit,
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
        pageSize: topDealsStoreFetchLimit,
      }),
      emptyListResponse<CouponleoStore>(),
      () => this.initialLoad?.stores,
    ),
    { initialValue: createLoadingState(emptyListResponse<CouponleoStore>()) },
  );
  private readonly locationsState = toSignal(
    withHydratedRequestState(
      of(undefined),
      () => this.api.listLocations({ pageSize: topDealsLocationFetchLimit }),
      emptyListResponse<CouponleoLocation>(),
      () => this.initialLoad?.locations,
    ),
    { initialValue: createLoadingState(emptyListResponse<CouponleoLocation>()) },
  );

  protected readonly searchIconSvg = searchIconSvg;
  protected readonly discountIconSvg = discountIconSvg;
  protected readonly shieldIconSvg = shieldIconSvg;
  protected readonly heroBenefits = computed(() => heroBenefits.map((benefit) => ({
    ...benefit,
    title: this.i18n.phrase(benefit.title),
    copy: this.i18n.phrase(benefit.copy),
  })));
  protected readonly activeCoupon = signal<CouponleoCouponReveal | null>(null);
  protected readonly searchQuery = signal('');
  protected readonly selectedCountry = toSignal(this.countryQueryParamMap, { initialValue: this.initialCountry });
  protected readonly countryRouteQuery = computed(() => buildCountryRouteQuery(this.selectedCountry()));
  protected readonly localizeRoute = (path: string) => localizeCouponleoRoute(path, this.i18n.locale());
  protected readonly selectedCategory = signal('all');
  protected readonly dealPage = signal(1);
  protected readonly labels = computed(() => ({
    eyebrow: this.i18n.phrase('Top Deals'),
    title: this.i18n.phrase('Top Deals'),
    description: this.i18n.phrase('Start with the offers that look strongest right now, then narrow the list until the savings match what you would actually buy.'),
    searchPlaceholder: this.i18n.phrase('Search deals, stores or categories'),
    topPicks: this.i18n.phrase('Top Picks'),
    viewFeaturedCoupons: this.i18n.phrase('View featured coupons'),
    verified: this.i18n.phrase('Merchant offer'),
    claimDeal: this.i18n.phrase('Claim Deal'),
    browseLiveDeals: this.i18n.phrase('Browse Live Deals'),
    activeDeals: this.i18n.phrase('active deals'),
    noDeals: this.i18n.phrase('No deals match these filters'),
    noDealsCopy: this.i18n.phrase('Try another search term or switch back to a broader category chip.'),
    topDealsByStore: this.i18n.phrase('Top Deals by Store'),
    viewAllStores: this.i18n.phrase('View all stores'),
    viewDeals: this.i18n.phrase('View Deals'),
    saveTopDeal: this.i18n.phrase('Save top deal'),
    saveDeal: this.i18n.phrase('Save deal'),
    saveStore: this.i18n.phrase('Save store'),
    availableAcross: this.i18n.phrase('available across'),
    topStores: this.i18n.phrase('Top Stores'),
    couponsAndDeals: this.i18n.phrase('Coupons & Deals'),
    activeNow: this.i18n.phrase('Active Now'),
    featured: this.i18n.phrase('Featured'),
    markets: this.i18n.phrase('Markets'),
    topDealsGuideTitle: this.i18n.phrase('How to read today\'s strongest deals'),
    narrowDealsTitle: this.i18n.phrase('How to separate real value from filler'),
    nextStopsTitle: this.i18n.phrase('Where to go after a deal catches your eye'),
    faqTitle: this.i18n.phrase('What top-deals shoppers usually want to know'),
    faqIntro: this.i18n.phrase('These quick answers help explain how to judge whether a deal deserves a closer look or should stay in the scroll.'),
  }));
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

  protected readonly liveCoupons = computed(() => {
    const coupons = this.couponsResponse().items;
    const liveCoupons = coupons.filter((coupon) => isCouponLive(coupon.expiresAt));
    return liveCoupons.length > 0 ? liveCoupons : coupons;
  });

  protected readonly countryCoupons = computed(() => (
    this.liveCoupons().filter((coupon) => matchesCountry(this.selectedCountry(), coupon.location ?? coupon.primary_location))
  ));

  private readonly filteredDeals = computed(() => {
    const query = this.searchQuery().trim();

    return [...this.countryCoupons()]
      .filter((coupon) => this.selectedCategory() === 'all' || coupon.categorySlug === this.selectedCategory())
      .filter((coupon) => matchesDealQuery(coupon, query))
      .sort((left, right) => right.score - left.score || left.title.localeCompare(right.title));
  });

  private readonly countryStores = computed(() => (
    this.storesResponse().items.filter((store) => matchesCountry(this.selectedCountry(), store.location))
  ));

  protected readonly countryCouponTotal = computed(() => (
    this.searchQuery().trim() || this.selectedCategory() !== 'all'
      ? this.filteredDeals().length
      : this.couponsResponse().total
  ));

  protected readonly countryStoreTotal = computed(() => this.storesResponse().total);

  protected readonly marketTotal = computed(() => {
    if (this.selectedCountry() === 'all') {
      return this.locationsResponse().total || this.locationsResponse().items.length;
    }

    return this.countryCouponTotal() > 0 || this.countryStoreTotal() > 0 ? 1 : 0;
  });

  protected readonly topPicks = computed<TopPickCard[]>(() => {
    const topPickSource = this.searchQuery().trim() || this.selectedCategory() !== 'all'
      ? this.filteredDeals()
      : this.countryCoupons();
    const featuredCoupons = topPickSource.filter((coupon) => coupon.featured);
    const couponsToShow = featuredCoupons.length > 0 ? featuredCoupons : topPickSource;

    return [...couponsToShow]
      .sort((left, right) => right.score - left.score)
      .slice(0, 4)
      .map((coupon) => ({
        id: `coupon-${coupon.slug}`,
        store: coupon.storeName,
        offer: coupon.discountText,
        title: coupon.title,
        subtitle: coupon.categoryName,
        description: coupon.description,
        used: coupon.savingsNote,
        expires: formatExpiryLabel(coupon.expiresAt),
        code: coupon.code,
        route: '/top-deals',
        storeRoute: this.localizeRoute(buildStoreRoute(coupon.storeSlug)),
        logoUrl: couponleoCouponLogoUrl(coupon),
        fallbackLogoUrl: coupon.image_url ?? '',
      }));
  });

  protected readonly dealFilters = computed(() => (
    [
      { label: this.i18n.phrase('All Deals'), value: 'all' },
      ...buildCategorySummaries(this.countryCoupons(), this.categoriesResponse().items).map((category) => ({
        label: category.name,
        value: category.slug,
      })),
    ]
  ));

  protected readonly browseDealsTotal = computed(() => this.filteredDeals().length);
  protected readonly dealPageCount = computed(() => pageCountFor(this.filteredDeals().length, dealsPageSize));
  protected readonly browseDeals = computed<BrowseDealCard[]>(() => (
    paginateItems(this.filteredDeals(), this.dealPage(), dealsPageSize).map((coupon) => ({
      id: `coupon-${coupon.slug}`,
      title: coupon.title,
      subtitle: coupon.categoryName,
      description: coupon.description,
      code: coupon.code,
      route: '/top-deals',
      store: coupon.storeName,
      storeRoute: this.localizeRoute(buildStoreRoute(coupon.storeSlug)),
      offer: coupon.discountText,
      expires: formatExpiryLabel(coupon.expiresAt),
      logoUrl: couponleoCouponLogoUrl(coupon),
      fallbackLogoUrl: coupon.image_url ?? '',
    }))
  ));

  protected readonly storeDeals = computed<StoreDealCard[]>(() => (
    [...this.countryStores()]
      .sort((left, right) => right.activeCoupons - left.activeCoupons)
      .slice(0, 6)
      .map((store) => ({
        id: `store-${store.slug}`,
        name: store.name,
        count: `${this.i18n.formatNumber(store.activeCoupons)} ${this.i18n.phrase('live deals')}`,
        description: buildCouponleoStoreCardDescriptionForMarket(store, this.selectedCountry()),
        route: this.localizeRoute(buildStoreRoute(store.slug)),
        logoUrl: couponleoStoreLogoUrl(store),
      }))
  ));

  protected readonly breadcrumbs = computed<CouponleoBreadcrumbItem[]>(() => [
    { label: 'CouponLeo', href: this.localizeRoute('/') },
    { label: this.labels().title },
  ]);

  protected readonly guideLinks = computed<TopDealsGuideLink[]>(() => {
    const categoryLinks = buildCategorySummaries(this.countryCoupons(), this.categoriesResponse().items)
      .slice(0, 2)
      .map((category) => ({
        id: `category-${category.slug}`,
        label: category.name,
        detail: buildCouponleoCategoryCardDescription({
          name: category.name,
          headline: category.headline,
          description: category.headline,
        }),
        route: this.localizeRoute(buildCategoryRoute(category.slug)),
      }));

    const storeLinks = this.storeDeals().slice(0, 2).map((store) => ({
      id: store.id,
      label: store.name,
      detail: store.description,
      route: store.route,
    }));

    return [...categoryLinks, ...storeLinks].slice(0, 4);
  });

  protected readonly editorialCopy = computed<TopDealsEditorialCopy>(() => ({
    intro: this.selectedCountry() === 'all'
      ? this.i18n.phrase('Top Deals works best at the start of the hunt, when you want to see which offers deserve a closer look and which ones only sound exciting in isolation.')
      : `${this.i18n.phrase('You are browsing')} ${this.selectedCountry()}, ${this.i18n.phrase('so this deals list already sits closer to the brands, stock conditions, and promo patterns that matter in that market.')}`,
    introDetail: this.selectedCountry() === 'all'
      ? `${this.i18n.formatNumber(this.countryCouponTotal())} ${this.i18n.phrase('live offers make more sense when you read the discount beside the merchant, category, and expiry signal instead of trusting the biggest number on the card.')}`
      : this.i18n.phrase('That makes it easier to tell whether a coupon is truly relevant or simply visible while remaining locally weak.'),
    strategy: this.i18n.phrase('Let the headline saving catch your eye, then use the merchant, category, and timing cues to decide whether the offer has real weight behind it.'),
    strategyDetail: this.i18n.phrase('The better deals usually come from stores that are discounting with depth, not from the ones shouting with a single banner code.'),
    marketNote: this.selectedCountry() === 'all'
      ? this.i18n.phrase('When something looks promising, open the store to check whether the merchant has range behind it, then use the category if you want to compare the same buying intent across competing brands.')
      : `${this.i18n.phrase('Keeping the market fixed to')} ${this.selectedCountry()} ${this.i18n.phrase('is useful when delivery costs, excluded products, or region-specific promo rules can quietly change the real value of a discount.')}`,
    nextStops: this.i18n.phrase('A deal card is not the finish line. It is the clue that tells you where to look next.'),
    nextStopsDetail: this.i18n.phrase('Used that way, this page turns raw coupon discovery into a cleaner shortlist instead of a long scroll of disconnected offers.'),
  }));
  protected readonly topDealsFaqs = computed<CouponleoSeoFaqItem[]>(() => {
    const topStore = this.storeDeals()[0]?.name ?? this.i18n.phrase('a strong store page');
    const topCategory = this.dealFilters().find((filter) => filter.value !== 'all')?.label ?? this.i18n.phrase('a useful category');

    return [
      {
        question: this.i18n.phrase('What makes a deal worth opening from this page?'),
        answer: this.i18n.phrase('The better deals usually combine a strong headline saving with the right merchant, a believable expiry, and enough supporting depth on the store page to suggest the discount is not a one-off decoration.'),
      },
      {
        question: this.i18n.phrase('When should you leave Top Deals and open a store page?'),
        answer: `${this.i18n.phrase('Leave this page once a merchant such as')} ${topStore} ${this.i18n.phrase('starts looking stronger than the rest. The store page will tell you whether the same value carries across the wider offer mix or fades after one attractive card.')}`,
      },
      {
        question: this.i18n.phrase('Why does category context still matter on a deal page?'),
        answer: `${this.i18n.phrase('Category context matters because a tempting deal is easier to judge when you can compare it against the rest of')} ${topCategory} ${this.i18n.phrase('instead of treating one coupon card as the whole market.')}`,
      },
    ];
  });

  protected readonly stats = computed<DealStat[]>(() => {
    const featuredCoupons = this.countryCoupons().filter((coupon) => coupon.featured).length;

    return [
      { value: this.i18n.formatNumber(this.countryStoreTotal()), label: this.labels().topStores, icon: buildingStoreIconSvg },
      { value: this.i18n.formatNumber(this.countryCouponTotal()), label: this.labels().couponsAndDeals, icon: giftIconSvg },
      { value: this.i18n.formatNumber(this.countryCouponTotal()), label: this.labels().activeNow, icon: usersIconSvg },
      { value: this.i18n.formatNumber(featuredCoupons), label: this.labels().featured, icon: walletIconSvg },
      { value: this.i18n.formatNumber(this.marketTotal()), label: this.labels().markets, icon: shieldLockIconSvg },
    ];
  });

  constructor() {
    effect(() => {
      const faqs = this.topDealsFaqs();
      this.seoSync.setPageFaqs(faqs);
    });

    effect(() => {
      this.selectedCountry();
      untracked(() => {
        this.selectedCategory.set('all');
        this.dealPage.set(1);
      });
    });
  }

  protected isSaved(id: string): boolean {
    return this.savedService.has(id);
  }

  protected updateSearch(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    this.searchQuery.set(target?.value ?? '');
    this.dealPage.set(1);
  }

  protected selectCategory(categorySlug: string): void {
    this.selectedCategory.set(categorySlug);
    this.dealPage.set(1);
  }

  protected setDealPage(pageNumber: number): void {
    const nextPage = Math.min(Math.max(pageNumber, 1), this.dealPageCount());
    this.dealPage.set(nextPage);
  }

  protected toggleDealSaved(deal: TopPickCard | BrowseDealCard): void {
    this.savedService.toggle({
      id: deal.id,
      kind: 'deal',
      title: deal.title,
      subtitle: deal.store,
      description: deal.description,
      route: deal.route,
      code: deal.code,
    });
  }

  protected toggleStoreSaved(store: StoreDealCard): void {
    this.savedService.toggle({
      id: store.id,
      kind: 'store',
      title: store.name,
      subtitle: this.i18n.phrase('Top Deals by Store'),
      description: store.description,
      route: store.route,
    });
  }

  protected openCoupon(deal: TopPickCard | BrowseDealCard): void {
    this.activeCoupon.set({
      title: deal.title,
      subtitle: `${deal.store} | ${deal.subtitle}`,
      description: deal.description,
      code: deal.code,
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

  protected formatCount(value: number, singular: string, plural: string): string {
    const unit = value === 1 ? singular : plural;
    return `${this.i18n.formatNumber(value)} ${this.i18n.phrase(unit)}`;
  }
}
