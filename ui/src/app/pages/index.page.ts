import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map, startWith, switchMap } from 'rxjs';
import {
  CouponleoCouponDialogComponent,
  type CouponleoCouponReveal,
} from '../components/couponleo-coupon-dialog.component';
import { CouponleoBrandmarkComponent } from '../components/couponleo-brandmark.component';
import { CouponleoEonIconComponent } from '../components/couponleo-eon-icon.component';
import { CouponleoFavoriteButtonComponent } from '../components/couponleo-favorite-button.component';
import { CouponleoPageLoaderComponent } from '../components/couponleo-page-loader.component';
import {
  CouponleoApiService,
  type CouponleoCategory,
  type CouponleoCoupon,
  type CouponleoLocation,
  type CouponleoStore,
} from '../services/couponleo-api.service';
import { createLoadingState, withRequestState } from '../services/couponleo-request-state.helpers';
import { createStaticRouteMeta } from '../services/couponleo-route-meta';
import { CouponleoI18nService } from '../services/couponleo-i18n.service';
import { couponleoCouponLogoUrl, couponleoStoreLogoUrl } from '../services/couponleo-logo.helpers';
import { CouponleoSavedService } from '../services/couponleo-saved.service';
import {
  buildCategorySummaries,
  buildCategoryRoute,
  buildCountryRouteQuery,
  buildStoreRoute,
  formatCount,
  getCategoryPresentation,
  isCouponLive,
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
  logoUrl: string;
  fallbackLogoUrl: string;
}

interface HomeCategoryCard {
  id: string;
  label: string;
  deals: string;
  imageSrc: string;
  imageAlt: string;
  route: string;
}

interface HomeStoreCard {
  id: string;
  name: string;
  description: string;
  route: string;
  logoUrl: string;
}

interface HomeStat {
  value: string;
  label: string;
  icon: string;
}

const benefits = [
  { title: 'Verified Coupons', copy: 'Pulled from the local API', icon: shieldIconSvg },
  { title: 'Top Stores', copy: 'Live merchant snapshots', icon: awardIconSvg },
  { title: 'Fresh Savings', copy: 'Filtered to active deals', icon: discountIconSvg },
];

export const routeMeta = createStaticRouteMeta({
  title: 'CouponLeo | Live Coupons, Stores, and Verified Deals',
  description: 'Discover live coupons, trending categories, verified stores, and market-aware deals on CouponLeo.',
});

function emptyListResponse<T>() {
  return { items: [] as T[], total: 0 };
}

function matchesHomeQuery(values: Array<string | undefined>, query: string): boolean {
  if (!query) {
    return true;
  }

  const normalizedQuery = query.toLowerCase();
  return values.some((value) => value?.toLowerCase().includes(normalizedQuery));
}

@Component({
  selector: 'app-home',
  imports: [
    RouterLink,
    CouponleoCouponDialogComponent,
    CouponleoBrandmarkComponent,
    CouponleoEonIconComponent,
    CouponleoFavoriteButtonComponent,
    CouponleoPageLoaderComponent,
  ],
  template: `
    <section class="couponleo-hero">
      <div class="couponleo-hero__copy">
        <h1 class="couponleo-hero__title">
          <span class="couponleo-hero__title-main">{{ labels().discoverSmarter }}</span>
          <span class="couponleo-hero__title-accent">{{ labels().couponsAnd }}</span>
          <span class="couponleo-hero__title-accent">{{ labels().strongerDeals }}</span>
        </h1>
        <div class="couponleo-hero__underline" aria-hidden="true"></div>
        <p class="couponleo-hero__lede">{{ labels().heroCopy }}</p>

        <form class="couponleo-searchbar" (submit)="$event.preventDefault()">
          <span class="couponleo-searchbar__icon" aria-hidden="true">
            <app-couponleo-eon-icon [svg]="searchIconSvg"></app-couponleo-eon-icon>
          </span>
          <input
            type="search"
            [placeholder]="labels().searchPlaceholder"
            [attr.aria-label]="labels().searchStores"
            [value]="searchQuery()"
            (input)="updateSearch($event)"
          >
          <button type="submit" class="couponleo-searchbar__button" [attr.aria-label]="i18n.phrase('Search')">
            <app-couponleo-eon-icon [svg]="searchIconSvg"></app-couponleo-eon-icon>
          </button>
        </form>

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

      <div class="couponleo-hero__visual">
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
          class="couponleo-hero__image"
          src="/images/couponleo-hero-product-cutout-v2.png"
          alt="Shopping bag, discount tag, and gift box"
        >
        <div class="couponleo-hero__cart-badge" aria-hidden="true">
          <app-couponleo-eon-icon [svg]="cartIconSvg"></app-couponleo-eon-icon>
        </div>
      </div>
    </section>

    @if (isLoading()) {
      <section class="couponleo-page-section">
        <app-couponleo-page-loader [cards]="4" [columns]="4" [statsCount]="4"></app-couponleo-page-loader>
      </section>
    } @else {
      <section class="couponleo-page-section">
        <div class="couponleo-section-heading">
          <h2>{{ labels().featuredDeals }}</h2>
          <a routerLink="/top-deals" [queryParams]="countryRouteQuery()">{{ labels().viewAllDeals }}</a>
        </div>

        @if (featuredDeals().length > 0) {
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
                    <span class="couponleo-deal-card__brand">{{ deal.store }}</span>
                  </span>
                  <span class="couponleo-card-toolbar">
                    <span class="couponleo-deal-card__flag">{{ labels().verified }}</span>
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
                  <button type="button" class="couponleo-code couponleo-code--masked" (click)="openCoupon(deal)">
                    {{ maskCode(deal.code) }}
                  </button>
                  <button type="button" class="couponleo-button couponleo-button--solid" (click)="openCoupon(deal)">
                    {{ labels().showCode }}
                  </button>
                </div>
              </article>
            }
          </div>
        } @else {
          <div class="couponleo-empty-card">
            <h3>{{ labels().noFeaturedDeals }}</h3>
            <p>{{ labels().noFeaturedDealsCopy }}</p>
          </div>
        }
      </section>

      <section class="couponleo-page-section">
        <div class="couponleo-section-heading">
          <h2>{{ labels().trendingCategories }}</h2>
          <a routerLink="/categories" [queryParams]="countryRouteQuery()">{{ labels().viewAllCategories }}</a>
        </div>

        @if (categories().length > 0) {
          <div class="couponleo-orb-grid">
            @for (category of categories(); track category.id) {
              <a class="couponleo-orb-card" [routerLink]="category.route" [queryParams]="countryRouteQuery()">
                <div class="couponleo-orb-card__media">
                  <img [src]="category.imageSrc" [alt]="category.imageAlt" loading="lazy">
                </div>
                <div class="couponleo-orb-card__content">
                  <strong>{{ category.label }}</strong>
                  <span>{{ category.deals }}</span>
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
          <a routerLink="/stores" [queryParams]="countryRouteQuery()">{{ labels().viewAllStores }}</a>
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
                <span class="couponleo-store-pill__icon" aria-hidden="true">
                  <app-couponleo-brandmark [name]="store.name" [src]="store.logoUrl"></app-couponleo-brandmark>
                </span>
                <span class="couponleo-store-pill__name">{{ store.name }}</span>
                <a class="couponleo-store-pill__link" [routerLink]="store.route" [queryParams]="countryRouteQuery()">{{ labels().viewDeals }}</a>
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
    }

    <app-couponleo-coupon-dialog
      [coupon]="activeCoupon()"
      (closeRequested)="closeCoupon()"
    ></app-couponleo-coupon-dialog>
  `,
})
export default class Home {
  private readonly api = inject(CouponleoApiService);
  protected readonly i18n = inject(CouponleoI18nService);
  private readonly route = inject(ActivatedRoute);
  private readonly savedService = inject(CouponleoSavedService);
  private readonly initialCountry = normalizeCountryRouteValue(this.route.snapshot.queryParamMap.get('country'));
  private readonly countryQueryParamMap = this.route.queryParamMap.pipe(
    map((params) => normalizeCountryRouteValue(params.get('country'))),
  );

  private readonly couponsState = toSignal(
    this.countryQueryParamMap.pipe(
      startWith(this.initialCountry),
      switchMap((country) => withRequestState(
        this.api.listCoupons({
          active: true,
          location: locationFilterForCountry(country),
          pageSize: 120,
        }),
        emptyListResponse<CouponleoCoupon>(),
      )),
    ),
    { initialValue: createLoadingState(emptyListResponse<CouponleoCoupon>()) },
  );
  private readonly categoriesState = toSignal(
    withRequestState(this.api.listCategories({ pageSize: 1000 }), emptyListResponse<CouponleoCategory>()),
    { initialValue: createLoadingState(emptyListResponse<CouponleoCategory>()) },
  );
  private readonly featuredCouponsState = toSignal(
    this.countryQueryParamMap.pipe(
      startWith(this.initialCountry),
      switchMap((country) => withRequestState(
        this.api.listCoupons({
          active: true,
          featured: true,
          location: locationFilterForCountry(country),
          pageSize: 120,
        }),
        emptyListResponse<CouponleoCoupon>(),
      )),
    ),
    { initialValue: createLoadingState(emptyListResponse<CouponleoCoupon>()) },
  );
  private readonly storesState = toSignal(
    this.countryQueryParamMap.pipe(
      startWith(this.initialCountry),
      switchMap((country) => withRequestState(
        this.api.listStores({
          featured: true,
          location: locationFilterForCountry(country),
          pageSize: 120,
        }),
        emptyListResponse<CouponleoStore>(),
      )),
    ),
    { initialValue: createLoadingState(emptyListResponse<CouponleoStore>()) },
  );
  private readonly locationsState = toSignal(
    withRequestState(this.api.listLocations({ pageSize: 120 }), emptyListResponse<CouponleoLocation>()),
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
  protected readonly labels = computed(() => ({
    discoverSmarter: this.i18n.phrase('Discover smarter'),
    couponsAnd: this.i18n.phrase('coupons and'),
    strongerDeals: this.i18n.phrase('stronger deals'),
    heroCopy: this.i18n.phrase('Live CouponLeo data from the local API, surfaced with featured deals, real category counts, and current store coverage.'),
    searchPlaceholder: this.i18n.phrase('Search stores, brands, and categories'),
    searchStores: this.i18n.phrase('Search stores'),
    featuredDeals: this.i18n.phrase('Featured Deals'),
    viewAllDeals: this.i18n.phrase('View all deals'),
    verified: this.i18n.phrase('Verified'),
    showCode: this.i18n.phrase('Show Code'),
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
  }));
  protected readonly isLoading = computed(() => (
    this.couponsState().loading
    || this.categoriesState().loading
    || this.featuredCouponsState().loading
    || this.storesState().loading
    || this.locationsState().loading
  ));

  private readonly couponsResponse = computed(() => this.couponsState().data);
  private readonly categoriesResponse = computed(() => this.categoriesState().data);
  private readonly featuredCouponsResponse = computed(() => this.featuredCouponsState().data);
  private readonly storesResponse = computed(() => this.storesState().data);
  private readonly locationsResponse = computed(() => this.locationsState().data);

  private readonly liveCoupons = computed(() => {
    const coupons = this.couponsResponse().items;
    const liveCoupons = coupons.filter((coupon) => isCouponLive(coupon.expiresAt));
    return liveCoupons.length > 0 ? liveCoupons : coupons;
  });

  private readonly countryCoupons = computed(() => (
    this.liveCoupons().filter((coupon) => matchesCountry(this.selectedCountry(), coupon.location ?? coupon.primary_location))
  ));

  private readonly countryStores = computed(() => (
    this.storesResponse().items.filter((store) => matchesCountry(this.selectedCountry(), store.location))
  ));

  private readonly countryCategorySummaries = computed(() => (
    buildCategorySummaries(this.countryCoupons(), this.categoriesResponse().items)
  ));

  private readonly filteredCountryCoupons = computed(() => {
    const query = this.searchQuery().trim();
    return this.countryCoupons().filter((coupon) => matchesHomeQuery([
      coupon.title,
      coupon.description,
      coupon.storeName,
      coupon.categoryName,
      coupon.discountText,
    ], query));
  });

  private readonly filteredCountryStores = computed(() => {
    const query = this.searchQuery().trim();
    return this.countryStores().filter((store) => matchesHomeQuery([
      store.name,
      store.headline,
      store.category,
      store.location,
      store.savings,
    ], query));
  });

  private readonly filteredCountryCategorySummaries = computed(() => {
    const query = this.searchQuery().trim();
    return this.countryCategorySummaries().filter((category) => matchesHomeQuery([
      category.name,
      category.headline,
    ], query));
  });

  private readonly featuredCountryCoupons = computed(() => {
    const coupons = this.featuredCouponsResponse().items;
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
    const query = this.searchQuery().trim();
    return query ? this.filteredCountryCoupons().length : this.couponsResponse().total;
  });

  private readonly countryStoreTotal = computed(() => {
    const query = this.searchQuery().trim();
    return query ? this.filteredCountryStores().length : this.storesResponse().total;
  });

  private readonly marketTotal = computed(() => {
    if (this.selectedCountry() === 'all') {
      return this.locationsResponse().total || this.locationsResponse().items.length;
    }

    return this.countryCouponTotal() > 0 || this.countryStoreTotal() > 0 ? 1 : 0;
  });

  protected readonly featuredDeals = computed<HomeDealCard[]>(() => {
    const featuredCoupons = this.filteredFeaturedCountryCoupons();
    const couponsToShow = featuredCoupons.length > 0 ? featuredCoupons : this.filteredCountryCoupons();

    return [...couponsToShow]
      .sort((left, right) => right.score - left.score)
      .slice(0, 4)
      .map((coupon) => ({
        id: `coupon-${coupon.slug}`,
        title: coupon.discountText,
        subtitle: coupon.storeName,
        description: coupon.description,
        code: coupon.code,
        route: '/top-deals',
        store: coupon.storeName,
        logoUrl: couponleoCouponLogoUrl(coupon),
        fallbackLogoUrl: coupon.image_url ?? '',
      }));
  });

  protected readonly categories = computed<HomeCategoryCard[]>(() => (
    this.filteredCountryCategorySummaries()
      .slice(0, 6)
      .map((category) => {
        const presentation = getCategoryPresentation(category.slug);
        return {
          id: `category-${category.slug}`,
          label: category.name,
          deals: `${this.i18n.formatNumber(category.couponCount)} ${this.i18n.phrase('live deals')}`,
          imageSrc: presentation.imageSrc,
          imageAlt: presentation.imageAlt,
          route: buildCategoryRoute(category.slug),
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
        description: store.headline,
        route: buildStoreRoute(store.slug),
        logoUrl: couponleoStoreLogoUrl(store),
      }));
  });

  protected readonly stats = computed<HomeStat[]>(() => {
    const query = this.searchQuery().trim();
    const featuredCouponTotal = query
      ? this.filteredFeaturedCountryCoupons().length
      : this.featuredCouponsResponse().total;

    return [
      { value: this.i18n.formatNumber(this.countryCouponTotal()), label: this.labels().liveDeals, icon: ticketIconSvg },
      { value: this.i18n.formatNumber(this.countryStoreTotal()), label: this.labels().localStores, icon: buildingStoreIconSvg },
      { value: this.i18n.formatNumber(featuredCouponTotal), label: this.labels().featuredCoupons, icon: discountIconSvg },
      { value: this.i18n.formatNumber(this.marketTotal()), label: this.i18n.phrase('Markets'), icon: usersIconSvg },
    ];
  });

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
