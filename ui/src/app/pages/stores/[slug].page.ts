import { Component, computed, effect, inject, signal } from '@angular/core';
import { toObservable, toSignal, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { combineLatest, map, of, startWith, debounceTime, distinctUntilChanged, switchMap } from 'rxjs';
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
  type CouponleoCoupon,
  type CouponleoListResponse,
  type CouponleoStore,
} from '../../services/couponleo-api.service';
import { CouponleoI18nService } from '../../services/couponleo-i18n.service';
import { couponleoCouponLogoUrl, couponleoStoreLogoUrl } from '../../services/couponleo-logo.helpers';
import { createLoadingState, withRequestState } from '../../services/couponleo-request-state.helpers';
import { createDynamicRouteMeta, humanizeSlug } from '../../services/couponleo-route-meta';
import { CouponleoSavedService } from '../../services/couponleo-saved.service';
import {
  buildCountryRouteQuery,
  buildStoreRoute,
  formatCount,
  formatExpiryLabel,
  locationFilterForCountry,
  normalizeCountryRouteValue,
} from '../../services/couponleo-ui.helpers';

import buildingStoreIconSvg from '@eonui/icons/svg/maps/eon-building-store.svg?raw';
import searchIconSvg from '@eonui/icons/svg/system/eon-search.svg?raw';
import shieldIconSvg from '@eonui/icons/svg/system/eon-shield-check.svg?raw';
import tagIconSvg from '@eonui/icons/svg/commerce/eon-tag.svg?raw';

interface StorePageCouponCard extends CouponleoCouponReveal {
  id: string;
  category: string;
  expires: string;
  offer: string;
  logoUrl: string;
  fallbackLogoUrl: string;
}

const storeDealsPageSize = 12;

export const routeMeta = createDynamicRouteMeta((route) => {
  const storeName = humanizeSlug(route.paramMap.get('slug') ?? 'store');

  return {
    title: `${storeName} Store Deals | CouponLeo`,
    description: `Browse live ${storeName} coupons, active offers, and verified store deals on CouponLeo.`,
  };
});

function emptyCouponListResponse<T>(): CouponleoListResponse<T> {
  return {
    items: [] as T[],
    total: 0,
    page: 1,
    pageCount: 1,
    pageSize: storeDealsPageSize,
    hasNextPage: false,
    hasPreviousPage: false,
  };
}

@Component({
  selector: 'app-store-deals-page',
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
    <section class="couponleo-page-hero couponleo-page-hero--warm couponleo-store-deals-hero">
      <div class="couponleo-store-deals-hero__top">
        <div class="couponleo-store-deals-hero__copy">
          <div class="couponleo-store-deals-hero__identity">
            <span class="couponleo-store-deals-hero__brandmark" aria-hidden="true">
              <app-couponleo-brandmark [name]="storeName()" [src]="storeLogoUrl()"></app-couponleo-brandmark>
            </span>
            <div class="couponleo-store-deals-hero__identity-copy">
              <span class="couponleo-eyebrow">{{ storeLocation() }}</span>
              <h1>{{ storeName() }}</h1>
              <p>{{ storeHeadline() }}</p>

              <div class="couponleo-store-deals-hero__meta">
                <span>{{ storeCategory() }}</span>
                <span>{{ storeFeaturedLabel() }}</span>
                <span>{{ storeActiveDealLabel() }}</span>
              </div>
            </div>
          </div>
        </div>

        <div class="couponleo-store-deals-hero__actions">
          <a class="couponleo-button couponleo-button--ghost" routerLink="/stores" [queryParams]="countryRouteQuery()">{{ labels().backToStores }}</a>
        </div>
      </div>

      <form class="couponleo-searchbar" (submit)="$event.preventDefault()">
        <span class="couponleo-searchbar__icon" aria-hidden="true">
          <app-couponleo-eon-icon [svg]="searchIconSvg"></app-couponleo-eon-icon>
        </span>
        <input
          type="search"
          [placeholder]="searchPlaceholder()"
          [attr.aria-label]="labels().searchStoreDeals"
          [value]="searchQuery()"
          (input)="updateSearch($event)"
        >
        <button type="submit" class="couponleo-searchbar__button" [attr.aria-label]="i18n.phrase('Search')">
          <app-couponleo-eon-icon [svg]="searchIconSvg"></app-couponleo-eon-icon>
        </button>
      </form>

      <div class="couponleo-store-deals-hero__stats">
        @for (stat of heroStats(); track stat.label) {
          <article class="couponleo-card couponleo-store-deals-hero__stat">
            <span class="couponleo-card__badge" aria-hidden="true">
              <app-couponleo-eon-icon [svg]="stat.icon"></app-couponleo-eon-icon>
            </span>
            <h3>{{ stat.value }}</h3>
            <p>{{ stat.label }}</p>
          </article>
        }
      </div>
    </section>

    @if (isLoading()) {
      <section class="couponleo-page-section">
        <app-couponleo-page-loader [cards]="4" [columns]="4"></app-couponleo-page-loader>
      </section>
    } @else if (!store()) {
      <section class="couponleo-page-section">
        <div class="couponleo-empty-card">
          <h3>{{ labels().storeNotFound }}</h3>
          <p>{{ labels().storeNotFoundCopy }}</p>
          <a class="couponleo-button couponleo-button--solid" routerLink="/stores" [queryParams]="countryRouteQuery()">{{ i18n.phrase('Browse Stores') }}</a>
        </div>
      </section>
    } @else {
      <section class="couponleo-page-section">
        <div class="couponleo-section-heading">
          <h2>{{ dealsHeading() }}</h2>
          <span class="couponleo-store-deals-summary">{{ dealsSummary() }}</span>
        </div>

        @if (deals().length > 0) {
          <div class="couponleo-deal-grid">
            @for (deal of deals(); track deal.id) {
              <article class="couponleo-deal-card">
                <div class="couponleo-deal-card__top">
                  <span class="couponleo-deal-card__brand-group">
                    <span class="couponleo-deal-card__brand-icon" aria-hidden="true">
                      <app-couponleo-brandmark
                        [name]="storeName()"
                        [src]="deal.logoUrl"
                        [fallbackSrc]="deal.fallbackLogoUrl"
                      ></app-couponleo-brandmark>
                    </span>
                    <span class="couponleo-deal-card__brand">{{ storeName() }}</span>
                  </span>
                  <span class="couponleo-card-toolbar">
                    <span class="couponleo-deal-card__flag">{{ i18n.phrase('Verified') }}</span>
                    <app-couponleo-favorite-button
                      [active]="isSaved(deal.id)"
                      [ariaLabel]="labels().saveStoreDeal"
                      (toggled)="toggleDealSaved(deal)"
                    ></app-couponleo-favorite-button>
                  </span>
                </div>
                <h3>{{ deal.offer }}</h3>
                <p>{{ deal.description }}</p>
                <span class="couponleo-store-deals-card__meta">{{ deal.title }} | {{ deal.category }}</span>
                <span class="couponleo-store-deals-card__expires">{{ deal.expires }}</span>
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
            [itemLabel]="i18n.phrase('store deals')"
            (pageChange)="setDealPage($event)"
          ></app-couponleo-pagination>
        } @else {
          <div class="couponleo-empty-card">
            <h3>{{ labels().noDeals }}</h3>
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

    .couponleo-store-deals-hero {
      gap: 24px;
      padding-top: 32px;
    }

    .couponleo-store-deals-hero__top {
      display: flex;
      align-items: start;
      justify-content: space-between;
      gap: 18px;
    }

    .couponleo-store-deals-hero__copy {
      display: grid;
      gap: 14px;
    }

    .couponleo-store-deals-hero__identity {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      align-items: center;
      gap: 16px;
      min-width: 0;
    }

    .couponleo-store-deals-hero__identity-copy {
      display: grid;
      gap: 14px;
      min-width: 0;
    }

    .couponleo-store-deals-hero__brandmark {
      width: 5.75rem;
      height: 5.75rem;
      min-width: 5.75rem;
      border-radius: 24px;
    }

    .couponleo-store-deals-hero__copy p {
      margin: 0;
      max-width: 42rem;
    }

    .couponleo-store-deals-hero__actions {
      display: inline-flex;
      justify-content: end;
      flex-shrink: 0;
    }

    .couponleo-store-deals-hero__meta {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }

    .couponleo-store-deals-hero__meta span,
    .couponleo-store-deals-card__meta,
    .couponleo-store-deals-card__expires,
    .couponleo-store-deals-summary {
      color: var(--couponleo-muted);
      font-size: 0.92rem;
    }

    .couponleo-store-deals-hero__meta span,
    .couponleo-store-deals-card__expires {
      display: inline-flex;
      width: fit-content;
      padding: 8px 12px;
      border-radius: 999px;
      background: rgba(22, 36, 74, 0.05);
      font-weight: 700;
    }

    .couponleo-store-deals-hero__stat {
      display: grid;
      gap: 8px;
      align-content: start;
      min-height: 0;
      padding: 18px;
    }

    .couponleo-store-deals-hero__stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
      gap: 14px;
    }

    .couponleo-store-deals-hero__stat .couponleo-card__badge {
      width: 46px;
      height: 46px;
      margin-bottom: 2px;
      border-radius: 14px;
    }

    .couponleo-store-deals-hero__stat h3,
    .couponleo-store-deals-hero__stat p,
    .couponleo-store-deals-card__meta {
      margin: 0;
    }

    .couponleo-store-deals-hero__stat h3 {
      font-size: clamp(1.45rem, 1.9vw, 1.95rem);
      line-height: 1.08;
    }

    .couponleo-store-deals-hero__stat p {
      font-size: 0.94rem;
      line-height: 1.45;
    }

    .couponleo-store-deals-card__meta {
      line-height: 1.6;
    }

    @media (max-width: 780px) {
      .couponleo-store-deals-hero__top {
        display: grid;
      }

      .couponleo-store-deals-hero__identity {
        grid-template-columns: 1fr;
      }

      .couponleo-store-deals-hero__brandmark {
        width: 4.75rem;
        height: 4.75rem;
        min-width: 4.75rem;
      }

      .couponleo-store-deals-hero__stats {
        grid-template-columns: 1fr;
      }

      .couponleo-store-deals-hero__actions {
        width: 100%;
      }

      .couponleo-store-deals-hero__actions .couponleo-button {
        width: 100%;
      }
    }
  `],
})
export default class StoreDealsPage {
  private readonly api = inject(CouponleoApiService);
  protected readonly i18n = inject(CouponleoI18nService);
  private readonly route = inject(ActivatedRoute);
  private readonly response = injectResponse();
  private readonly savedService = inject(CouponleoSavedService);
  private readonly initialCountry = normalizeCountryRouteValue(this.route.snapshot.queryParamMap.get('country'));

  private readonly storeSlug$ = this.route.paramMap.pipe(
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
  protected readonly dealPage = signal(1);
  protected readonly storeSlug = toSignal(this.storeSlug$, { initialValue: '' });
  protected readonly selectedCountry = toSignal(this.countryQueryParamMap, { initialValue: this.initialCountry });
  protected readonly countryRouteQuery = computed(() => buildCountryRouteQuery(this.selectedCountry()));

  private readonly storeState = toSignal(
    this.storeSlug$.pipe(
      switchMap((slug) => (
        slug
          ? withRequestState(
            this.api.getStore(slug).pipe(map((response) => response.data)),
            null as CouponleoStore | null,
          )
          : of({ data: null, loading: false })
      )),
    ),
    { initialValue: createLoadingState<CouponleoStore | null>(null) },
  );

  private readonly couponsState = toSignal(
    combineLatest([
      this.storeSlug$,
      toObservable(this.searchQuery).pipe(
        debounceTime(150),
        distinctUntilChanged(),
        startWith(''),
      ),
      toObservable(this.dealPage).pipe(startWith(1)),
      this.countryQueryParamMap.pipe(startWith(this.initialCountry)),
    ]).pipe(
      switchMap(([slug, query, page, country]) => (
        slug
          ? withRequestState(
            this.api.listCouponsByStore(slug, {
              active: true,
              location: locationFilterForCountry(country),
              page,
              pageSize: storeDealsPageSize,
              q: query.trim() || undefined,
            }),
            emptyCouponListResponse<CouponleoCoupon>(),
          )
          : of({ data: emptyCouponListResponse<CouponleoCoupon>(), loading: false })
      )),
    ),
    { initialValue: createLoadingState(emptyCouponListResponse<CouponleoCoupon>()) },
  );

  protected readonly isLoading = computed(() => this.storeState().loading || this.couponsState().loading);
  protected readonly store = computed(() => this.storeState().data);
  private readonly couponsResponse = computed(() => this.couponsState().data);
  protected readonly dealTotal = computed(() => this.couponsResponse().total);
  protected readonly dealPageNumber = computed(() => this.couponsResponse().page ?? this.dealPage());
  protected readonly dealPageCount = computed(() => this.couponsResponse().pageCount ?? 1);
  protected readonly storeRoute = computed(() => buildStoreRoute(this.store()?.slug ?? this.storeSlug()));
  protected readonly storeLogoUrl = computed(() => {
    const store = this.store();
    return store ? couponleoStoreLogoUrl(store) : '';
  });
  protected readonly labels = computed(() => ({
    backToStores: this.i18n.phrase('Back to Stores'),
    searchStoreDeals: this.i18n.phrase('Search store deals'),
    storeNotFound: this.i18n.phrase('Store not found'),
    storeNotFoundCopy: this.i18n.phrase('This store route does not match the current local CouponLeo store directory.'),
    saveStoreDeal: this.i18n.phrase('Save store deal'),
    liveDeals: this.i18n.phrase('Live Deals'),
    location: this.i18n.phrase('Location'),
    category: this.i18n.phrase('Category'),
    status: this.i18n.phrase('Status'),
    featured: this.i18n.phrase('Featured'),
    live: this.i18n.phrase('Live'),
    noDeals: this.i18n.phrase('No deals match this search'),
    noDealsCopy: this.i18n.phrase('Try a broader keyword to bring back more live coupons for this store.'),
    availableForStore: this.i18n.phrase('available for this store.'),
    availableForStoreIn: this.i18n.phrase('available for this store in'),
    dealsFrom: this.i18n.phrase('Deals from'),
    categoryUnavailable: this.i18n.phrase('Category unavailable'),
    directoryStore: this.i18n.phrase('Directory store'),
    featuredStore: this.i18n.phrase('Featured store'),
  }));

  protected readonly storeName = computed(() => this.store()?.name ?? this.i18n.phrase('Store Deals'));
  protected readonly storeLocation = computed(() => this.store()?.location ?? this.i18n.phrase('Store Deals'));
  protected readonly storeHeadline = computed(() => (
    this.store()?.headline ?? this.i18n.phrase('Browse the live CouponLeo deals for this store from the local API.')
  ));
  protected readonly storeCategory = computed(() => (
    this.store()?.category ? `${this.labels().category}: ${this.store()!.category}` : this.labels().categoryUnavailable
  ));
  protected readonly storeFeaturedLabel = computed(() => (
    this.store()?.featured ? this.labels().featuredStore : this.labels().directoryStore
  ));
  protected readonly storeActiveDealLabel = computed(() => (
    formatCount(this.store()?.activeCoupons ?? this.dealTotal(), 'live deal', 'live deals')
  ));
  protected readonly searchPlaceholder = computed(() => `${this.labels().searchStoreDeals}: ${this.storeName()}`);
  protected readonly dealsHeading = computed(() => `${this.labels().dealsFrom} ${this.storeName()}`);
  protected readonly dealsSummary = computed(() => (
    this.selectedCountry() === 'all'
      ? `${formatCount(this.dealTotal(), 'active deal', 'active deals')} ${this.labels().availableForStore}`
      : `${formatCount(this.dealTotal(), 'active deal', 'active deals')} ${this.labels().availableForStoreIn} ${this.selectedCountry()}.`
  ));

  protected readonly heroStats = computed(() => [
    { label: this.labels().liveDeals, value: this.storeActiveDealLabel(), icon: tagIconSvg },
    { label: this.labels().location, value: this.store()?.location ?? 'N/A', icon: buildingStoreIconSvg },
    { label: this.labels().category, value: this.store()?.category ?? 'N/A', icon: shieldIconSvg },
    { label: this.labels().status, value: this.store()?.featured ? this.labels().featured : this.labels().live, icon: shieldIconSvg },
  ]);

  protected readonly deals = computed<StorePageCouponCard[]>(() => (
    this.couponsResponse().items.map((coupon) => ({
      id: `coupon-${coupon.slug}`,
      title: coupon.title,
      subtitle: coupon.categoryName,
      description: coupon.description,
      code: coupon.code,
      route: this.storeRoute(),
      category: coupon.categoryName,
      expires: formatExpiryLabel(coupon.expiresAt),
      offer: coupon.discountText,
      logoUrl: couponleoCouponLogoUrl(coupon),
      fallbackLogoUrl: this.storeLogoUrl(),
    }))
  ));

  constructor() {
    this.storeSlug$
      .pipe(takeUntilDestroyed())
      .subscribe(() => {
        this.searchQuery.set('');
        this.dealPage.set(1);
      });

    effect(() => {
      if (!this.storeState().loading && !this.store() && this.response) {
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

  protected setDealPage(pageNumber: number): void {
    const nextPage = Math.min(Math.max(pageNumber, 1), this.dealPageCount());
    this.dealPage.set(nextPage);
  }

  protected toggleDealSaved(deal: StorePageCouponCard): void {
    this.savedService.toggle({
      id: deal.id,
      kind: 'deal',
      title: deal.title,
      subtitle: this.storeName(),
      description: deal.description,
      route: deal.route,
      code: deal.code,
    });
  }

  protected openCoupon(deal: StorePageCouponCard): void {
    this.activeCoupon.set({
      title: deal.title,
      subtitle: `${this.storeName()} | ${deal.category}`,
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
