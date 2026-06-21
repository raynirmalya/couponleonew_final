import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map, startWith, switchMap } from 'rxjs';

import { CouponleoEonIconComponent } from '../../components/couponleo-eon-icon.component';
import { CouponleoFavoriteButtonComponent } from '../../components/couponleo-favorite-button.component';
import { CouponleoPageLoaderComponent } from '../../components/couponleo-page-loader.component';
import { CouponleoPaginationComponent } from '../../components/couponleo-pagination.component';
import {
  CouponleoApiService,
  type CouponleoCategory,
  type CouponleoCoupon,
  type CouponleoStore,
} from '../../services/couponleo-api.service';
import { createLoadingState, withRequestState } from '../../services/couponleo-request-state.helpers';
import { createStaticRouteMeta } from '../../services/couponleo-route-meta';
import { CouponleoSavedService } from '../../services/couponleo-saved.service';
import {
  buildCategoryRoute,
  buildCategorySummaries,
  buildCountryRouteQuery,
  formatCount,
  getCategoryPresentation,
  isCouponLive,
  locationFilterForCountry,
  normalizeCountryRouteValue,
  pageCountFor,
  paginateItems,
} from '../../services/couponleo-ui.helpers';
import { CouponleoI18nService } from '../../services/couponleo-i18n.service';

import buildingStoreIconSvg from '@eonui/icons/svg/maps/eon-building-store.svg?raw';
import searchIconSvg from '@eonui/icons/svg/system/eon-search.svg?raw';
import shieldCheckIconSvg from '@eonui/icons/svg/system/eon-shield-check.svg?raw';
import sparklesIconSvg from '@eonui/icons/svg/system/eon-sparkles.svg?raw';
import tagIconSvg from '@eonui/icons/svg/commerce/eon-tag.svg?raw';

interface CategoryDirectoryCard {
  id: string;
  name: string;
  headline: string;
  imageSrc: string;
  imageAlt: string;
  route: string;
  deals: string;
  stores: string;
  couponCount: number;
  storeCount: number;
}

interface CategoryHeroStat {
  value: string;
  label: string;
  icon: string;
}

const categoryDirectoryPageSize = 12;

function emptyListResponse<T>() {
  return { items: [] as T[], total: 0 };
}

function matchesCategoryQuery(category: CategoryDirectoryCard, query: string): boolean {
  if (!query) {
    return true;
  }

  const normalizedQuery = query.toLowerCase();
  return [category.name, category.headline].some((value) => value.toLowerCase().includes(normalizedQuery));
}

export const routeMeta = createStaticRouteMeta({
  title: 'Categories | CouponLeo',
  description: 'Browse the CouponLeo category directory with live category coverage, market filters, and direct drilldown pages.',
});

@Component({
  selector: 'app-categories-page',
  imports: [
    RouterLink,
    CouponleoEonIconComponent,
    CouponleoFavoriteButtonComponent,
    CouponleoPageLoaderComponent,
    CouponleoPaginationComponent,
  ],
  template: `
    <section class="couponleo-page-hero couponleo-page-hero--warm couponleo-categories-hero">
      <div class="couponleo-categories-hero__layout">
        <div class="couponleo-categories-hero__copy">
          <span class="couponleo-eyebrow">{{ i18n.t('categories.eyebrow') }}</span>
          <h1>{{ i18n.t('categories.title') }}</h1>
          <p>{{ i18n.t('categories.description') }}</p>

          <form class="couponleo-searchbar" (submit)="$event.preventDefault()">
            <span class="couponleo-searchbar__icon" aria-hidden="true">
              <app-couponleo-eon-icon [svg]="searchIconSvg"></app-couponleo-eon-icon>
            </span>
            <input
              type="search"
              [placeholder]="i18n.t('categories.searchPlaceholder')"
              [attr.aria-label]="i18n.t('categories.searchPlaceholder')"
              [value]="searchQuery()"
              (input)="updateSearch($event)"
            >
            <button type="submit" class="couponleo-searchbar__button" [attr.aria-label]="i18n.t('common.search')">
              <app-couponleo-eon-icon [svg]="searchIconSvg"></app-couponleo-eon-icon>
            </button>
          </form>
        </div>

        <div class="couponleo-categories-hero__visual">
          <div class="couponleo-categories-hero__art">
            <img
              class="couponleo-categories-hero__image"
              src="/assets/images/heroes/category-hero.png"
              alt="Category hero featuring shopping and savings illustrations"
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
          <h2>{{ i18n.t('categories.directoryTitle') }}</h2>
          <span class="couponleo-categories-directory__summary">{{ directorySummary() }}</span>
        </div>

        @if (pagedDirectoryCards().length > 0) {
          <div class="couponleo-card-grid couponleo-categories-directory">
            @for (category of pagedDirectoryCards(); track category.id) {
              <article class="couponleo-card couponleo-categories-browse-card">
                <div class="couponleo-categories-browse-card__media">
                  <img [src]="category.imageSrc" [alt]="category.imageAlt" loading="lazy">
                </div>

                <div class="couponleo-categories-browse-card__top">
                  <div>
                    <h3>{{ category.name }}</h3>
                    <p>{{ category.headline }}</p>
                  </div>
                  <app-couponleo-favorite-button
                    [active]="isSaved(category.id)"
                    [ariaLabel]="i18n.t('categories.saveCategory')"
                    (toggled)="toggleCategorySaved(category)"
                  ></app-couponleo-favorite-button>
                </div>

                <div class="couponleo-categories-browse-card__meta">
                  <span>{{ category.deals }}</span>
                  <span>{{ category.stores }}</span>
                </div>

                <a class="couponleo-button couponleo-button--ghost" [routerLink]="category.route" [queryParams]="countryRouteQuery()">{{ i18n.t('categories.exploreCategory') }}</a>
              </article>
            }
          </div>

          @if (directoryPageCount() > 1) {
            <app-couponleo-pagination
              [page]="directoryPage()"
              [pageCount]="directoryPageCount()"
              [totalItems]="directoryCards().length"
              itemLabel="categories"
              (pageChange)="setDirectoryPage($event)"
            ></app-couponleo-pagination>
          }
        } @else {
          <div class="couponleo-empty-card">
            <h3>{{ i18n.t('categories.emptyTitle') }}</h3>
            <p>{{ i18n.t('categories.emptyCopy') }}</p>
          </div>
        }
      </section>

      <section class="couponleo-page-section">
        <div class="couponleo-inline-stats couponleo-inline-stats--four">
          @for (stat of heroStats(); track stat.label) {
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
    }
  `,
  styles: [`
    :host {
      display: block;
    }

    .couponleo-categories-hero {
      gap: 24px;
      padding-top: 32px;
    }

    .couponleo-categories-hero__layout {
      display: grid;
      grid-template-columns: minmax(0, 0.94fr) minmax(320px, 1.06fr);
      gap: 24px;
      align-items: center;
    }

    .couponleo-categories-hero__copy,
    .couponleo-categories-hero__visual,
    .couponleo-categories-browse-card,
    .couponleo-categories-browse-card__top {
      display: grid;
    }

    .couponleo-categories-hero__copy {
      gap: 18px;
      max-width: 36rem;
    }

    .couponleo-categories-hero__visual {
      gap: 18px;
    }

    .couponleo-categories-hero__art {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 19rem;
      padding: 24px;
      border-radius: 26px;
      background: linear-gradient(180deg, rgba(255, 255, 255, 0.98) 0%, rgba(247, 239, 231, 0.96) 100%);
      box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.82);
    }

    .couponleo-categories-hero__image {
      width: min(100%, 28rem);
      height: auto;
      object-fit: contain;
    }

    .couponleo-categories-browse-card h3,
    .couponleo-categories-browse-card p {
      margin: 0;
    }

    .couponleo-categories-directory__summary {
      color: var(--couponleo-muted);
      font-weight: 700;
    }

    .couponleo-categories-directory {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    .couponleo-categories-browse-card {
      gap: 16px;
    }

    .couponleo-categories-browse-card__media {
      overflow: hidden;
      border-radius: 20px;
      aspect-ratio: 1 / 0.72;
      background: linear-gradient(180deg, #fffefd 0%, #f4eee7 100%);
      box-shadow: inset 0 0 0 1px rgba(238, 224, 208, 0.72);
    }

    .couponleo-categories-browse-card__media img {
      display: block;
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .couponleo-categories-browse-card__top {
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 14px;
      align-items: start;
    }

    .couponleo-categories-browse-card__top h3 {
      color: var(--couponleo-navy);
      font-size: 1.45rem;
      line-height: 1;
      letter-spacing: -0.04em;
    }

    .couponleo-categories-browse-card__top p {
      margin-top: 10px;
      color: var(--couponleo-muted);
      line-height: 1.65;
    }

    .couponleo-categories-browse-card__meta {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }

    .couponleo-categories-browse-card__meta span {
      display: inline-flex;
      width: fit-content;
      padding: 8px 12px;
      border-radius: 999px;
      background: rgba(22, 36, 74, 0.05);
      color: var(--couponleo-muted);
      font-size: 0.86rem;
      font-weight: 700;
    }

    .couponleo-categories-browse-card .couponleo-button {
      width: 100%;
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

    .couponleo-inline-stats--four {
      grid-template-columns: repeat(4, minmax(0, 1fr));
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
      flex-shrink: 0;
      width: 3rem;
      height: 3rem;
      padding: 12px;
      border-radius: 999px;
      background: rgba(52, 120, 255, 0.08);
      color: var(--couponleo-blue);
      line-height: 0;
    }

    .couponleo-inline-stats__icon app-couponleo-eon-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 1.3rem;
      height: 1.3rem;
      line-height: 0;
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

    @media (max-width: 1080px) {
      .couponleo-categories-hero__layout,
      .couponleo-categories-directory,
      .couponleo-inline-stats--four {
        grid-template-columns: 1fr 1fr;
      }

      .couponleo-categories-hero__layout {
        grid-template-columns: 1fr;
      }
    }

    @media (max-width: 780px) {
      .couponleo-categories-directory,
      .couponleo-inline-stats--four,
      .couponleo-categories-browse-card__top {
        grid-template-columns: 1fr;
      }
    }
  `],
})
export default class CategoriesPage {
  private readonly api = inject(CouponleoApiService);
  protected readonly i18n = inject(CouponleoI18nService);
  private readonly savedService = inject(CouponleoSavedService);
  private readonly route = inject(ActivatedRoute);
  private readonly initialCountry = normalizeCountryRouteValue(this.route.snapshot.queryParamMap.get('country'));
  private readonly countryQueryParamMap = this.route.queryParamMap.pipe(
    map((params) => normalizeCountryRouteValue(params.get('country'))),
  );

  private readonly categoriesState = toSignal(
    withRequestState(this.api.listCategories({ pageSize: 1000 }), emptyListResponse<CouponleoCategory>()),
    { initialValue: createLoadingState(emptyListResponse<CouponleoCategory>()) },
  );
  private readonly couponsState = toSignal(
    this.countryQueryParamMap.pipe(
      startWith(this.initialCountry),
      switchMap((country) => withRequestState(
        this.api.listCoupons({
          active: true,
          location: locationFilterForCountry(country),
          pageSize: 250,
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
          location: locationFilterForCountry(country),
          pageSize: 120,
        }),
        emptyListResponse<CouponleoStore>(),
      )),
    ),
    { initialValue: createLoadingState(emptyListResponse<CouponleoStore>()) },
  );

  protected readonly searchIconSvg = searchIconSvg;
  protected readonly searchQuery = signal('');
  protected readonly directoryPage = signal(1);
  protected readonly selectedCountry = toSignal(this.countryQueryParamMap, { initialValue: this.initialCountry });
  protected readonly countryRouteQuery = computed(() => buildCountryRouteQuery(this.selectedCountry()));
  protected readonly isLoading = computed(() => (
    this.categoriesState().loading
    || this.couponsState().loading
    || this.storesState().loading
  ));

  private readonly categoriesResponse = computed(() => this.categoriesState().data);
  private readonly couponsResponse = computed(() => this.couponsState().data);
  private readonly storesResponse = computed(() => this.storesState().data);

  private readonly liveCoupons = computed(() => {
    const coupons = this.couponsResponse().items;
    const liveCoupons = coupons.filter((coupon) => isCouponLive(coupon.expiresAt));
    return liveCoupons.length > 0 ? liveCoupons : coupons;
  });

  private readonly directory = computed<CategoryDirectoryCard[]>(() => {
    if (this.selectedCountry() === 'all') {
      return [...this.categoriesResponse().items]
        .map((category) => {
          const presentation = getCategoryPresentation(category.slug);

          return {
            id: `category-${category.slug}`,
            name: category.name,
            headline: category.headline ?? this.i18n.t('categories.defaultHeadline'),
            imageSrc: presentation.imageSrc,
            imageAlt: presentation.imageAlt,
            route: buildCategoryRoute(category.slug),
            deals: formatCount(category.couponCount ?? 0, 'live offer', 'live offers'),
            stores: formatCount(category.storeCount ?? 0, 'store', 'stores'),
            couponCount: category.couponCount ?? 0,
            storeCount: category.storeCount ?? 0,
          };
        })
        .sort((left, right) => (
          right.couponCount - left.couponCount
          || right.storeCount - left.storeCount
          || left.name.localeCompare(right.name)
        ));
    }

    const summaries = buildCategorySummaries(this.liveCoupons(), this.categoriesResponse().items);
    return summaries
      .map((summary) => {
        const presentation = getCategoryPresentation(summary.slug);

        return {
          id: `category-${summary.slug}`,
          name: summary.name,
          headline: summary.headline,
          imageSrc: presentation.imageSrc,
          imageAlt: presentation.imageAlt,
          route: buildCategoryRoute(summary.slug),
          deals: formatCount(summary.couponCount, 'live offer', 'live offers'),
          stores: formatCount(summary.storeCount, 'store', 'stores'),
          couponCount: summary.couponCount,
          storeCount: summary.storeCount,
        };
      })
      .sort((left, right) => (
      right.couponCount - left.couponCount
      || right.storeCount - left.storeCount
      || left.name.localeCompare(right.name)
    ));
  });

  protected readonly directoryCards = computed(() => {
    const query = this.searchQuery().trim();
    return this.directory().filter((category) => matchesCategoryQuery(category, query));
  });
  protected readonly directoryPageCount = computed(() => pageCountFor(this.directoryCards().length, categoryDirectoryPageSize));
  protected readonly pagedDirectoryCards = computed(() => (
    paginateItems(this.directoryCards(), this.directoryPage(), categoryDirectoryPageSize)
  ));

  protected readonly directorySummary = computed(() => {
    const visibleCount = this.directoryCards().length;
    const totalCount = this.directory().length;
    const countLabel = formatCount(totalCount, 'category', 'categories');
    const visibleLabel = formatCount(visibleCount, 'category', 'categories');

    if (visibleCount === totalCount) {
      return this.selectedCountry() === 'all'
        ? this.i18n.t('categories.directorySummaryAll', { count: countLabel })
        : this.i18n.t('categories.directorySummaryCountry', { count: countLabel, country: this.selectedCountry() });
    }

    return this.i18n.t('categories.directorySummaryShown', {
      visible: visibleLabel,
      total: countLabel,
    });
  });

  protected readonly heroStats = computed<CategoryHeroStat[]>(() => {
    const representedStores = this.storesResponse().total;
    const activeCategories = this.directory().filter((category) => category.couponCount > 0).length;

    return [
      { value: this.directory().length.toLocaleString(), label: this.i18n.t('categories.statCategories'), icon: sparklesIconSvg },
      { value: this.couponsResponse().total.toLocaleString(), label: this.i18n.t('categories.statLiveOffers'), icon: tagIconSvg },
      { value: representedStores.toLocaleString(), label: this.i18n.t('categories.statStoresRepresented'), icon: buildingStoreIconSvg },
      { value: activeCategories.toLocaleString(), label: this.i18n.t('categories.statActiveCategories'), icon: shieldCheckIconSvg },
    ];
  });

  protected isSaved(id: string): boolean {
    return this.savedService.has(id);
  }

  protected updateSearch(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    this.searchQuery.set(target?.value ?? '');
    this.directoryPage.set(1);
  }

  protected toggleCategorySaved(category: CategoryDirectoryCard): void {
    this.savedService.toggle({
      id: category.id,
      kind: 'category',
      title: category.name,
      subtitle: category.deals,
      description: category.headline,
      route: category.route,
    });
  }

  protected setDirectoryPage(pageNumber: number): void {
    const nextPage = Math.min(Math.max(pageNumber, 1), this.directoryPageCount());
    this.directoryPage.set(nextPage);
  }

  constructor() {
    effect(() => {
      this.selectedCountry();
      untracked(() => {
        this.directoryPage.set(1);
      });
    });
  }
}

function queryLabel(visibleCount: number, totalCount: number, selectedCountry: string): string {
  const marketLabel = selectedCountry === 'all' ? 'in the local catalog' : `for ${selectedCountry}`;

  if (visibleCount === totalCount) {
    return `${formatCount(totalCount, 'category', 'categories')} ${marketLabel}`;
  }

  return `${formatCount(visibleCount, 'category', 'categories')} shown of ${formatCount(totalCount, 'category', 'categories')}`;
}
