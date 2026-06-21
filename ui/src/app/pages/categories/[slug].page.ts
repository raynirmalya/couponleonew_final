import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { combineLatest, debounceTime, distinctUntilChanged, map, of, startWith, switchMap } from 'rxjs';
import { injectResponse } from '@analogjs/router/tokens';

import {
  CouponleoCouponDialogComponent,
  type CouponleoCouponReveal,
} from '../../components/couponleo-coupon-dialog.component';
import { CouponleoBrandmarkComponent } from '../../components/couponleo-brandmark.component';
import { CouponleoEonIconComponent } from '../../components/couponleo-eon-icon.component';
import { CouponleoFavoriteButtonComponent } from '../../components/couponleo-favorite-button.component';
import { CouponleoPageLoaderComponent } from '../../components/couponleo-page-loader.component';
import { CouponleoPaginationComponent } from '../../components/couponleo-pagination.component';
import {
  CouponleoApiService,
  type CouponleoCategory,
  type CouponleoCoupon,
  type CouponleoListResponse,
  type CouponleoLocation,
  type CouponleoStore,
} from '../../services/couponleo-api.service';
import { CouponleoI18nService } from '../../services/couponleo-i18n.service';
import { couponleoCouponLogoUrl, couponleoStoreLogoUrl } from '../../services/couponleo-logo.helpers';
import { createLoadingState, withRequestState } from '../../services/couponleo-request-state.helpers';
import { createDynamicRouteMeta, humanizeSlug } from '../../services/couponleo-route-meta';
import { CouponleoSavedService } from '../../services/couponleo-saved.service';
import {
  buildCategoryRoute,
  buildCountryRouteQuery,
  buildCountryOptions,
  buildStoreRoute,
  formatCount,
  formatExpiryLabel,
  getCategoryPresentation,
  normalizeCountryRouteValue,
} from '../../services/couponleo-ui.helpers';

import buildingStoreIconSvg from '@eonui/icons/svg/maps/eon-building-store.svg?raw';
import searchIconSvg from '@eonui/icons/svg/system/eon-search.svg?raw';
import shieldIconSvg from '@eonui/icons/svg/system/eon-shield-check.svg?raw';
import tagIconSvg from '@eonui/icons/svg/commerce/eon-tag.svg?raw';
import usersIconSvg from '@eonui/icons/svg/system/eon-users.svg?raw';

interface CategoryDealCard extends CouponleoCouponReveal {
  id: string;
  store: string;
  offer: string;
  expires: string;
  logoUrl: string;
  fallbackLogoUrl: string;
}

interface CategoryStoreCard {
  id: string;
  name: string;
  count: string;
  description: string;
  location: string;
  route: string;
  logoUrl: string;
}

interface CategoryStat {
  value: string;
  label: string;
  icon: string;
}

const categoryDealsPageSize = 12;

export const routeMeta = createDynamicRouteMeta((route) => {
  const categoryName = humanizeSlug(route.paramMap.get('slug') ?? 'category');

  return {
    title: `${categoryName} Deals | CouponLeo`,
    description: `Browse live ${categoryName} deals, related stores, and category-specific offers on CouponLeo.`,
  };
});

function emptyCouponListResponse<T>(): CouponleoListResponse<T> {
  return {
    items: [] as T[],
    total: 0,
    page: 1,
    pageCount: 1,
    pageSize: categoryDealsPageSize,
    hasNextPage: false,
    hasPreviousPage: false,
  };
}

function emptyListResponse<T>(): CouponleoListResponse<T> {
  return {
    items: [] as T[],
    total: 0,
  };
}

@Component({
  selector: 'app-category-deals-page',
  imports: [
    RouterLink,
    CouponleoCouponDialogComponent,
    CouponleoBrandmarkComponent,
    CouponleoEonIconComponent,
    CouponleoFavoriteButtonComponent,
    CouponleoPageLoaderComponent,
    CouponleoPaginationComponent,
  ],
  template: `
    <section class="couponleo-page-hero couponleo-page-hero--warm couponleo-category-deals-hero">
      <div class="couponleo-category-deals-hero__top">
        <div class="couponleo-category-deals-hero__copy">
          <span class="couponleo-eyebrow">{{ selectedCountry() === 'all' ? i18n.t('common.allMarkets') : selectedCountry() }}</span>
          <h1>{{ categoryName() }}</h1>
          <p>{{ categoryHeadline() }}</p>

          <div class="couponleo-category-deals-hero__meta">
            <span>{{ categoryDealLabel() }}</span>
            <span>{{ categoryStoreLabel() }}</span>
            <span>{{ categoryStatusLabel() }}</span>
          </div>
        </div>

        <div class="couponleo-category-deals-hero__actions">
          <div class="couponleo-category-deals-hero__save">
            <app-couponleo-favorite-button
              [active]="isSaved(categorySavedId())"
              [ariaLabel]="labels().saveCategory"
              (toggled)="toggleCategorySaved()"
            ></app-couponleo-favorite-button>
            <span>{{ isSaved(categorySavedId()) ? labels().savedToFavorites : labels().saveCategory }}</span>
          </div>
          <a class="couponleo-button couponleo-button--ghost" routerLink="/categories" [queryParams]="countryRouteQuery()">{{ labels().backToCategories }}</a>
        </div>
      </div>

      <div class="couponleo-category-deals-hero__body">
        <div class="couponleo-category-deals-hero__art">
          <img
            class="couponleo-category-deals-hero__image"
            [src]="categoryImageSrc()"
            [alt]="categoryImageAlt()"
            loading="eager"
          >
        </div>

        <div class="couponleo-category-deals-hero__content">
          <form class="couponleo-searchbar" (submit)="$event.preventDefault()">
            <span class="couponleo-searchbar__icon" aria-hidden="true">
              <app-couponleo-eon-icon [svg]="searchIconSvg"></app-couponleo-eon-icon>
            </span>
            <input
              type="search"
              [placeholder]="searchPlaceholder()"
              [attr.aria-label]="labels().searchCategoryDeals"
              [value]="searchQuery()"
              (input)="updateSearch($event)"
            >
            <button type="submit" class="couponleo-searchbar__button" [attr.aria-label]="i18n.phrase('Search')">
              <app-couponleo-eon-icon [svg]="searchIconSvg"></app-couponleo-eon-icon>
            </button>
          </form>

          <div class="couponleo-category-deals-hero__stats">
            @for (stat of heroStats(); track stat.label) {
              <article class="couponleo-card couponleo-category-deals-hero__stat">
                <span class="couponleo-card__badge" aria-hidden="true">
                  <app-couponleo-eon-icon [svg]="stat.icon"></app-couponleo-eon-icon>
                </span>
                <h3>{{ stat.value }}</h3>
                <p>{{ stat.label }}</p>
              </article>
            }
          </div>
        </div>
      </div>
    </section>

    @if (isLoading()) {
      <section class="couponleo-page-section">
        <app-couponleo-page-loader
          [cards]="4"
          [columns]="4"
          [showSidebar]="false"
          [statsCount]="4"
        ></app-couponleo-page-loader>
      </section>
    } @else if (!category()) {
      <section class="couponleo-page-section">
        <div class="couponleo-empty-card">
          <h3>{{ labels().categoryNotFound }}</h3>
          <p>{{ labels().categoryNotFoundCopy }}</p>
          <a class="couponleo-button couponleo-button--solid" routerLink="/categories" [queryParams]="countryRouteQuery()">{{ i18n.phrase('Browse Categories') }}</a>
        </div>
      </section>
    } @else {
      <section class="couponleo-page-section">
        <div class="couponleo-section-heading">
          <h2>{{ labels().relatedStores }}</h2>
          <span class="couponleo-category-deals-summary">{{ categoryStoreLabel() }}</span>
        </div>

        @if (relatedStores().length > 0) {
          <div class="couponleo-category-store-grid">
            @for (store of relatedStores(); track store.id) {
              <article class="couponleo-card couponleo-category-store-card">
                <div class="couponleo-category-store-card__head">
                  <div class="couponleo-category-store-card__brand">
                    <span class="couponleo-category-store-card__brandmark" aria-hidden="true">
                      <app-couponleo-brandmark [name]="store.name" [src]="store.logoUrl"></app-couponleo-brandmark>
                    </span>
                    <div>
                      <strong>{{ store.name }}</strong>
                      <span>{{ store.location }}</span>
                    </div>
                  </div>
                </div>
                <p>{{ store.description }}</p>
                <div class="couponleo-category-store-card__footer">
                  <span class="couponleo-category-store-card__count">{{ store.count }}</span>
                  <a class="couponleo-button couponleo-button--ghost" [routerLink]="store.route" [queryParams]="countryRouteQuery()">{{ labels().viewStore }}</a>
                </div>
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
        <div class="couponleo-section-heading">
          <h2>{{ dealsHeading() }}</h2>
          <span class="couponleo-category-deals-summary">{{ dealsSummary() }}</span>
        </div>

        @if (deals().length > 0) {
          <div class="couponleo-deal-grid">
            @for (deal of deals(); track deal.id) {
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
                    <span class="couponleo-deal-card__flag">{{ i18n.phrase('Verified') }}</span>
                    <app-couponleo-favorite-button
                      [active]="isSaved(deal.id)"
                      [ariaLabel]="labels().saveCategoryDeal"
                      (toggled)="toggleDealSaved(deal)"
                    ></app-couponleo-favorite-button>
                  </span>
                </div>
                <h3>{{ deal.offer }}</h3>
                <p>{{ deal.description }}</p>
                <span class="couponleo-category-deals-card__meta">{{ deal.title }} | {{ categoryName() }}</span>
                <span class="couponleo-category-deals-card__expires">{{ deal.expires }}</span>
                <div class="couponleo-deal-card__actions">
                  <button type="button" class="couponleo-code couponleo-code--masked" (click)="openCoupon(deal)">
                    {{ maskCode(deal.code) }}
                  </button>
                  <button type="button" class="couponleo-button couponleo-button--solid" (click)="openCoupon(deal)">
                    {{ i18n.phrase('Show Code') }}
                  </button>
                </div>
              </article>
            }
          </div>

          <app-couponleo-pagination
            [page]="dealPageNumber()"
            [pageCount]="dealPageCount()"
            [totalItems]="dealTotal()"
            [itemLabel]="i18n.phrase('category deals')"
            (pageChange)="setDealPage($event)"
          ></app-couponleo-pagination>
        } @else {
          <div class="couponleo-empty-card">
            <h3>{{ i18n.phrase('No deals match these filters') }}</h3>
            <p>{{ labels().noDealsCopy }}</p>
          </div>
        }
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

    .couponleo-category-deals-hero {
      gap: 18px;
      padding-top: 24px;
    }

    .couponleo-category-deals-hero__top {
      display: flex;
      align-items: start;
      justify-content: space-between;
      gap: 14px;
    }

    .couponleo-category-deals-hero__copy {
      display: grid;
      gap: 10px;
      max-width: 38rem;
    }

    .couponleo-category-deals-hero__copy h1 {
      font-size: clamp(2.85rem, 4.8vw, 4.4rem);
    }

    .couponleo-category-deals-hero__copy p {
      margin: 0;
      font-size: 1rem;
      line-height: 1.65;
    }

    .couponleo-category-deals-hero__actions {
      display: inline-flex;
      align-items: center;
      gap: 12px;
      justify-content: end;
      flex-shrink: 0;
    }

    .couponleo-category-deals-hero__save {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      min-height: 2.75rem;
      padding: 0 12px 0 0;
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.72);
      color: var(--couponleo-muted);
      font-weight: 700;
      box-shadow: 0 12px 24px rgba(18, 35, 77, 0.08);
    }

    .couponleo-category-deals-hero__body {
      display: grid;
      grid-template-columns: minmax(220px, 0.34fr) minmax(0, 1fr);
      gap: 16px;
      align-items: start;
    }

    .couponleo-category-deals-hero__art {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 12.5rem;
      padding: 14px;
      border-radius: 22px;
      background: linear-gradient(180deg, rgba(255, 255, 255, 0.98) 0%, rgba(246, 239, 232, 0.96) 100%);
      box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.84);
    }

    .couponleo-category-deals-hero__image {
      width: min(100%, 14rem);
      height: auto;
      object-fit: contain;
    }

    .couponleo-category-deals-hero__content {
      display: grid;
      gap: 14px;
    }

    .couponleo-category-deals-hero__stats {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 14px;
    }

    .couponleo-category-deals-hero__meta {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }

    .couponleo-category-deals-hero__meta span,
    .couponleo-category-deals-card__meta,
    .couponleo-category-deals-card__expires,
    .couponleo-category-deals-summary {
      color: var(--couponleo-muted);
      font-size: 0.92rem;
    }

    .couponleo-category-deals-hero__meta span,
    .couponleo-category-deals-card__expires,
    .couponleo-category-store-card__count {
      display: inline-flex;
      width: fit-content;
      padding: 6px 10px;
      border-radius: 999px;
      background: rgba(22, 36, 74, 0.05);
      font-weight: 700;
    }

    .couponleo-category-deals-hero__stat,
    .couponleo-category-store-card {
      display: grid;
      gap: 10px;
      align-content: start;
    }

    .couponleo-category-deals-hero__stat {
      gap: 8px;
      min-height: 8.75rem;
      padding: 18px;
    }

    .couponleo-category-deals-hero__stat .couponleo-card__badge {
      width: 48px;
      height: 48px;
      margin-bottom: 2px;
      border-radius: 16px;
    }

    .couponleo-category-deals-hero__stat h3,
    .couponleo-category-deals-hero__stat p,
    .couponleo-category-deals-card__meta,
    .couponleo-category-store-card p {
      margin: 0;
    }

    .couponleo-category-deals-hero__stat h3 {
      font-size: 2rem;
      line-height: 1;
    }

    .couponleo-category-deals-hero__stat p {
      font-size: 0.96rem;
      line-height: 1.5;
    }

    .couponleo-category-deals-card__meta {
      line-height: 1.6;
    }

    .couponleo-category-store-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 16px;
    }

    .couponleo-category-store-card__head {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: start;
      gap: 12px;
    }

    .couponleo-category-store-card__brand {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      align-items: center;
      gap: 12px;
      min-width: 0;
    }

    .couponleo-category-store-card__brandmark {
      width: 4rem;
      height: 4rem;
      min-width: 4rem;
      border-radius: 20px;
    }

    .couponleo-category-store-card__head strong,
    .couponleo-category-store-card__head span {
      display: block;
    }

    .couponleo-category-store-card__head strong {
      color: var(--couponleo-navy);
      font-size: 1.35rem;
      line-height: 1;
      letter-spacing: -0.04em;
    }

    .couponleo-category-store-card__head span,
    .couponleo-category-store-card p {
      color: var(--couponleo-muted);
    }

    .couponleo-category-store-card__head span {
      margin-top: 8px;
      font-size: 0.9rem;
    }

    .couponleo-category-store-card p {
      line-height: 1.65;
    }

    .couponleo-category-store-card__footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }

    @media (max-width: 1080px) {
      .couponleo-category-deals-hero__body,
      .couponleo-category-store-grid {
        grid-template-columns: 1fr;
      }

      .couponleo-category-deals-hero__art {
        min-height: 10.5rem;
      }
    }

    @media (max-width: 780px) {
      .couponleo-category-deals-hero__top {
        display: grid;
      }

      .couponleo-category-deals-hero__stats {
        grid-template-columns: 1fr;
      }

      .couponleo-category-deals-hero__actions {
        width: 100%;
      }

      .couponleo-category-deals-hero__actions .couponleo-button,
      .couponleo-category-store-card__footer .couponleo-button {
        width: 100%;
      }

      .couponleo-category-deals-hero__image {
        width: min(100%, 12rem);
      }

      .couponleo-category-store-card__footer {
        display: grid;
      }
    }
  `],
})
export default class CategoryDealsPage {
  private readonly api = inject(CouponleoApiService);
  protected readonly i18n = inject(CouponleoI18nService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly response = injectResponse();
  private readonly savedService = inject(CouponleoSavedService);
  private readonly initialCountry = normalizeCountryRouteValue(this.route.snapshot.queryParamMap.get('country'));

  private readonly categorySlug$ = this.route.paramMap.pipe(
    map((params) => params.get('slug') ?? ''),
    distinctUntilChanged(),
  );
  private readonly countryQueryParamMap = this.route.queryParamMap.pipe(
    map((params) => normalizeCountryRouteValue(params.get('country'))),
    distinctUntilChanged(),
  );

  protected readonly searchIconSvg = searchIconSvg;
  protected readonly activeCoupon = signal<CouponleoCouponReveal | null>(null);
  protected readonly searchQuery = signal('');
  protected readonly selectedCountry = toSignal(this.countryQueryParamMap, { initialValue: this.initialCountry });
  protected readonly countryRouteQuery = computed(() => buildCountryRouteQuery(this.selectedCountry()));
  protected readonly dealPage = signal(1);
  protected readonly categorySlug = toSignal(this.categorySlug$, { initialValue: '' });

  private readonly categoryState = toSignal(
    this.categorySlug$.pipe(
      switchMap((slug) => (
        slug
          ? withRequestState(
            this.api.getCategory(slug).pipe(map((response) => response.data)),
            null as CouponleoCategory | null,
          )
          : of({ data: null, loading: false })
      )),
    ),
    { initialValue: createLoadingState<CouponleoCategory | null>(null) },
  );

  private readonly locationsState = toSignal(
    withRequestState(this.api.listLocations({ pageSize: 250 }), emptyListResponse<CouponleoLocation>()),
    { initialValue: createLoadingState(emptyListResponse<CouponleoLocation>()) },
  );

  private readonly couponsState = toSignal(
    combineLatest([
      this.categorySlug$,
      toObservable(this.searchQuery).pipe(
        debounceTime(150),
        distinctUntilChanged(),
        startWith(''),
      ),
      toObservable(this.selectedCountry).pipe(startWith('all')),
      toObservable(this.dealPage).pipe(startWith(1)),
    ]).pipe(
      switchMap(([slug, query, country, page]) => (
        slug
          ? withRequestState(
            this.api.listCouponsByCategory(slug, {
              active: true,
              location: country === 'all' ? undefined : country,
              page,
              pageSize: categoryDealsPageSize,
              q: query.trim() || undefined,
            }),
            emptyCouponListResponse<CouponleoCoupon>(),
          )
          : of({ data: emptyCouponListResponse<CouponleoCoupon>(), loading: false })
      )),
    ),
    { initialValue: createLoadingState(emptyCouponListResponse<CouponleoCoupon>()) },
  );

  private readonly storesState = toSignal(
    combineLatest([
      this.categorySlug$,
      toObservable(this.selectedCountry).pipe(startWith('all')),
    ]).pipe(
      switchMap(([slug, country]) => (
        slug
          ? withRequestState(
            this.api.listStores({
              category: slug,
              location: country === 'all' ? undefined : country,
              pageSize: 6,
            }),
            emptyListResponse<CouponleoStore>(),
          )
          : of({ data: emptyListResponse<CouponleoStore>(), loading: false })
      )),
    ),
    { initialValue: createLoadingState(emptyListResponse<CouponleoStore>()) },
  );

  protected readonly isLoading = computed(() => (
    this.categoryState().loading
    || this.locationsState().loading
    || this.couponsState().loading
    || this.storesState().loading
  ));
  protected readonly category = computed(() => this.categoryState().data);
  private readonly locationsResponse = computed(() => this.locationsState().data);
  private readonly couponsResponse = computed(() => this.couponsState().data);
  private readonly storesResponse = computed(() => this.storesState().data);
  protected readonly countryOptions = computed(() => buildCountryOptions(this.locationsResponse().items, this.i18n.t('common.allMarkets')));

  protected readonly dealTotal = computed(() => this.couponsResponse().total);
  protected readonly storeTotal = computed(() => this.storesResponse().total);
  protected readonly dealPageNumber = computed(() => this.couponsResponse().page ?? this.dealPage());
  protected readonly dealPageCount = computed(() => this.couponsResponse().pageCount ?? 1);
  protected readonly categoryRoute = computed(() => buildCategoryRoute(this.category()?.slug ?? this.categorySlug()));
  protected readonly categorySavedId = computed(() => `category-${this.category()?.slug ?? this.categorySlug()}`);
  protected readonly labels = computed(() => ({
    saveCategory: this.i18n.phrase('Save category'),
    savedToFavorites: this.i18n.phrase('Saved to favorites'),
    backToCategories: this.i18n.phrase('Back to Categories'),
    searchCategoryDeals: this.i18n.phrase('Search category deals'),
    categoryNotFound: this.i18n.phrase('Category not found'),
    categoryNotFoundCopy: this.i18n.phrase('This category route does not match the current local CouponLeo category directory.'),
    relatedStores: this.i18n.phrase('Related Stores'),
    viewStore: this.i18n.phrase('View Store'),
    noStores: this.i18n.phrase('No stores match this country filter'),
    noStoresCopy: this.i18n.phrase('Switch markets or keep browsing the live deals below for this category.'),
    saveCategoryDeal: this.i18n.phrase('Save category deal'),
    allMarketCoverage: this.i18n.phrase('All market coverage'),
    market: this.i18n.phrase('market'),
    liveDeals: this.i18n.phrase('Live Deals'),
    status: this.i18n.phrase('Status'),
    live: this.i18n.phrase('Live'),
    quiet: this.i18n.phrase('Quiet'),
    noDealsCopy: this.i18n.phrase('Try a broader keyword or switch countries to surface more live category deals.'),
  }));

  protected readonly categoryPresentation = computed(() => getCategoryPresentation(this.category()?.slug ?? this.categorySlug()));
  protected readonly categoryName = computed(() => this.category()?.name ?? this.i18n.phrase('Category Deals'));
  protected readonly categoryHeadline = computed(() => (
    this.category()?.headline ?? this.i18n.phrase('Browse the live CouponLeo deals for this category from the local API.')
  ));
  protected readonly categoryImageSrc = computed(() => this.categoryPresentation().imageSrc);
  protected readonly categoryImageAlt = computed(() => this.categoryPresentation().imageAlt);
  protected readonly categoryDealLabel = computed(() => (
    formatCount(this.dealTotal() || this.category()?.couponCount || 0, 'live deal', 'live deals')
  ));
  protected readonly categoryStoreLabel = computed(() => (
    formatCount(this.storeTotal() || this.category()?.storeCount || 0, 'store', 'stores')
  ));
  protected readonly categoryStatusLabel = computed(() => (
    this.selectedCountry() === 'all' ? this.labels().allMarketCoverage : `${this.selectedCountry()} ${this.labels().market}`
  ));
  protected readonly searchPlaceholder = computed(() => `${this.labels().searchCategoryDeals}: ${this.categoryName()}`);
  protected readonly dealsHeading = computed(() => `${this.i18n.phrase('Deals')} in ${this.categoryName()}`);
  protected readonly dealsSummary = computed(() => (
    `${formatCount(this.dealTotal(), 'active deal', 'active deals')} available for this category.`
  ));
  protected readonly countrySummary = computed(() => {
    const marketCount = this.selectedCountry() === 'all'
      ? (this.locationsResponse().total || this.locationsResponse().items.length)
      : (this.dealTotal() > 0 || this.storeTotal() > 0 ? 1 : 0);

    return `${formatCount(this.dealTotal(), 'live deal', 'live deals')} across ${formatCount(this.storeTotal(), 'store', 'stores')} in ${formatCount(marketCount, 'market', 'markets')}.`;
  });

  protected readonly heroStats = computed<CategoryStat[]>(() => {
    const marketCount = this.selectedCountry() === 'all'
      ? (this.locationsResponse().total || this.locationsResponse().items.length)
      : (this.dealTotal() > 0 || this.storeTotal() > 0 ? 1 : 0);

    return [
      { label: this.labels().liveDeals, value: this.i18n.formatNumber(this.dealTotal() || this.category()?.couponCount || 0), icon: tagIconSvg },
      { label: this.labels().relatedStores, value: this.i18n.formatNumber(this.storeTotal() || this.category()?.storeCount || 0), icon: buildingStoreIconSvg },
      { label: this.i18n.phrase('Markets'), value: this.i18n.formatNumber(marketCount), icon: usersIconSvg },
      { label: this.labels().status, value: this.dealTotal() > 0 ? this.labels().live : this.labels().quiet, icon: shieldIconSvg },
    ];
  });

  protected readonly relatedStores = computed<CategoryStoreCard[]>(() => (
    this.storesResponse().items.map((store) => ({
      id: `store-${store.slug}`,
      name: store.name,
      count: `${this.i18n.formatNumber(store.activeCoupons)} ${this.i18n.phrase('live deals')}`,
      description: store.headline,
      location: store.location,
      route: buildStoreRoute(store.slug),
      logoUrl: couponleoStoreLogoUrl(store),
    }))
  ));

  protected readonly deals = computed<CategoryDealCard[]>(() => (
    this.couponsResponse().items.map((coupon) => ({
      id: `coupon-${coupon.slug}`,
      title: coupon.title,
      subtitle: coupon.categoryName,
      description: coupon.description,
      code: coupon.code,
      route: this.categoryRoute(),
      store: coupon.storeName,
      offer: coupon.discountText,
      expires: formatExpiryLabel(coupon.expiresAt),
      logoUrl: couponleoCouponLogoUrl(coupon),
      fallbackLogoUrl: coupon.image_url ?? '',
    }))
  ));

  constructor() {
    effect(() => {
      this.categorySlug();
      untracked(() => {
        this.activeCoupon.set(null);
        this.searchQuery.set('');
        this.dealPage.set(1);
      });
    });

    effect(() => {
      this.selectedCountry();
      untracked(() => {
        this.dealPage.set(1);
      });
    });

    effect(() => {
      if (!this.categoryState().loading && !this.category() && this.response) {
        this.response.statusCode = 404;
      }
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

  protected selectCountry(country: string): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: buildCountryRouteQuery(country),
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  protected setDealPage(pageNumber: number): void {
    const nextPage = Math.min(Math.max(pageNumber, 1), this.dealPageCount());
    this.dealPage.set(nextPage);
  }

  protected toggleDealSaved(deal: CategoryDealCard): void {
    this.savedService.toggle({
      id: deal.id,
      kind: 'deal',
      title: deal.title,
      subtitle: `${deal.store} | ${this.categoryName()}`,
      description: deal.description,
      route: deal.route,
      code: deal.code,
    });
  }

  protected toggleCategorySaved(): void {
    const category = this.category();
    if (!category && !this.categorySlug()) {
      return;
    }

    this.savedService.toggle({
      id: this.categorySavedId(),
      kind: 'category',
      title: this.categoryName(),
      subtitle: this.categoryDealLabel(),
      description: this.categoryHeadline(),
      route: this.categoryRoute(),
    });
  }

  protected openCoupon(deal: CategoryDealCard): void {
    this.activeCoupon.set({
      title: deal.title,
      subtitle: `${deal.store} | ${this.categoryName()}`,
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
