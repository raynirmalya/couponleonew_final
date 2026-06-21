import { isPlatformBrowser } from '@angular/common';
import { Component, DestroyRef, PLATFORM_ID, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { finalize, map, startWith, switchMap } from 'rxjs';
import { CouponleoEonIconComponent } from '../../components/couponleo-eon-icon.component';
import { CouponleoFavoriteButtonComponent } from '../../components/couponleo-favorite-button.component';
import { CouponleoPageLoaderComponent } from '../../components/couponleo-page-loader.component';
import { CouponleoPaginationComponent } from '../../components/couponleo-pagination.component';
import {
  CouponleoApiService,
  type CouponleoCategory,
  type CouponleoLocation,
  type CouponleoStore,
} from '../../services/couponleo-api.service';
import { createLoadingState, withRequestState } from '../../services/couponleo-request-state.helpers';
import { createStaticRouteMeta } from '../../services/couponleo-route-meta';
import { CouponleoI18nService } from '../../services/couponleo-i18n.service';
import { CouponleoSavedService } from '../../services/couponleo-saved.service';
import {
  buildCountryRouteQuery,
  buildStoreRoute,
  formatCount,
  getCategoryPresentation,
  locationFilterForCountry,
  matchesCountry,
  normalizeCountryRouteValue,
  pageCountFor,
  paginateItems,
  slugifyLabel,
} from '../../services/couponleo-ui.helpers';

import buildingStoreIconSvg from '@eonui/icons/svg/maps/eon-building-store.svg?raw';
import searchIconSvg from '@eonui/icons/svg/system/eon-search.svg?raw';
import shieldCheckIconSvg from '@eonui/icons/svg/system/eon-shield-check.svg?raw';
import shieldLockIconSvg from '@eonui/icons/svg/system/eon-shield-lock.svg?raw';
import tagIconSvg from '@eonui/icons/svg/commerce/eon-tag.svg?raw';

interface StoreSidebarCategory {
  name: string;
  slug: string;
  count: string;
  icon: string;
}

interface StoreCardViewModel {
  id: string;
  name: string;
  slug: string;
  deals: string;
  description: string;
  route: string;
  location: string;
  category: string;
  savings: string;
  featured: boolean;
  logoUrl: string;
  initials: string;
}

interface StoreStat {
  value: string;
  label: string;
  icon: string;
}

const heroBenefits = [
  { title: 'Verified Stores', copy: 'Live merchant records', icon: shieldCheckIconSvg },
  { title: 'Best Coupons', copy: 'Pulled from current counts', icon: tagIconSvg },
  { title: 'Safe & Secure', copy: 'Local API with browser CORS', icon: shieldLockIconSvg },
];

export const routeMeta = createStaticRouteMeta({
  title: 'Stores | CouponLeo',
  description: 'Browse CouponLeo stores with live merchant records, category filters, alphabetical search, and featured brands.',
});

const alphabet = ['All', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ', '#'];
const storesPageSize = 6;

function emptyListResponse<T>() {
  return { items: [] as T[], total: 0 };
}

function matchesStoreQuery(store: CouponleoStore, query: string): boolean {
  if (!query) {
    return true;
  }

  const normalizedQuery = query.toLowerCase();
  return [
    store.name,
    store.headline,
    store.category,
    store.location,
    store.savings,
  ].some((value) => value.toLowerCase().includes(normalizedQuery));
}

function matchesLetterFilter(name: string, letter: string): boolean {
  if (letter === 'All') {
    return true;
  }

  const firstCharacter = name.trim().charAt(0).toUpperCase();
  if (letter === '#') {
    return !/[A-Z]/.test(firstCharacter);
  }

  return firstCharacter === letter;
}

function storeInitials(name: string): string {
  const parts = name
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) {
    return '?';
  }

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function storeLogoUrl(store: CouponleoStore): string {
  return store.logo_square_url ?? store.logoUrl ?? store.logo_horizontal_url ?? store.image_url ?? '';
}

function isBlockedStoreLogoUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host.endsWith('.r2.dev');
  } catch {
    return false;
  }
}

function proxiedStoreLogoUrl(url: string): string {
  if (!url) {
    return '';
  }

  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return `/api/logo?url=${encodeURIComponent(parsed.toString())}`;
    }
  } catch {
    return url;
  }

  return url;
}

function toStoreCardViewModel(store: CouponleoStore): StoreCardViewModel {
  return {
    id: `store-${store.slug}`,
    name: store.name,
    slug: store.slug,
    deals: `${store.activeCoupons} active coupons`,
    description: store.headline,
    route: buildStoreRoute(store.slug),
    location: store.location,
    category: store.category,
    savings: store.savings,
    featured: store.featured,
    logoUrl: storeLogoUrl(store),
    initials: storeInitials(store.name),
  };
}

@Component({
  selector: 'app-stores-page',
  imports: [
    RouterLink,
    CouponleoEonIconComponent,
    CouponleoFavoriteButtonComponent,
    CouponleoPageLoaderComponent,
    CouponleoPaginationComponent,
  ],
  template: `
    <section class="couponleo-route-hero">
      <div class="couponleo-route-hero__copy">
        <span class="couponleo-eyebrow">{{ labels().eyebrow }}</span>
        <h1 class="couponleo-route-hero__title">{{ labels().title }}</h1>
        <p>{{ labels().description }}</p>

        <form class="couponleo-searchbar" (submit)="$event.preventDefault()">
          <span class="couponleo-searchbar__icon" aria-hidden="true">
            <app-couponleo-eon-icon [svg]="searchIconSvg"></app-couponleo-eon-icon>
          </span>
          <input
            type="search"
            [placeholder]="labels().searchStores"
            [attr.aria-label]="labels().searchStores"
            [value]="searchQuery()"
            (input)="updateSearch($event)"
          >
          <button type="submit" class="couponleo-searchbar__button couponleo-searchbar__button--text">
            {{ i18n.phrase('Search') }}
          </button>
        </form>

        <div class="couponleo-hero__benefits couponleo-hero__benefits--stores">
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
          class="couponleo-hero__image couponleo-route-hero__image couponleo-route-hero__image--stores"
          src="/assets/images/heroes/stores-hero.png"
          alt="Stores hero featuring a storefront, store cards, shopping bag, and verification shield"
          loading="eager"
        >
        <div class="couponleo-route-hero__spotlight">
          <span class="couponleo-route-hero__spotlight-icon" aria-hidden="true">
            <app-couponleo-eon-icon [svg]="shieldCheckIconSvg"></app-couponleo-eon-icon>
          </span>
          <div>
            <strong>{{ featuredStoreCount() }}</strong>
            <span>{{ labels().verifiedStores }}</span>
          </div>
        </div>
      </div>
    </section>

    @if (isLoading()) {
      <section class="couponleo-page-section">
        <app-couponleo-page-loader
          [cards]="6"
          [columns]="3"
          [showSidebar]="true"
          [sidebarCount]="8"
          [statsCount]="4"
        ></app-couponleo-page-loader>
      </section>
    } @else {
      <section class="couponleo-page-section">
        <div class="couponleo-store-layout">
          <aside class="couponleo-card couponleo-store-sidebar">
            <label class="couponleo-store-sidebar__search">
              <span class="couponleo-store-sidebar__search-icon" aria-hidden="true">
                <app-couponleo-eon-icon [svg]="searchIconSvg"></app-couponleo-eon-icon>
              </span>
              <input
                type="search"
                [placeholder]="labels().searchCategories"
                [attr.aria-label]="labels().searchCategories"
                [value]="categorySearchQuery()"
                (input)="updateCategorySearch($event)"
              >
            </label>

            <div class="couponleo-store-sidebar__body">
              <div class="couponleo-store-sidebar__group">
                <strong>{{ labels().categories }}</strong>
                <button
                  type="button"
                  class="couponleo-store-sidebar__item couponleo-store-sidebar__item--button"
                  [class.is-active]="selectedCategory() === 'all'"
                  (click)="selectCategory('all')"
                >
                  <span class="couponleo-store-sidebar__item-label">
                    <span class="couponleo-store-sidebar__item-icon" aria-hidden="true">
                      <app-couponleo-eon-icon [svg]="buildingStoreIconSvg"></app-couponleo-eon-icon>
                    </span>
                    {{ i18n.phrase('All Categories') }}
                  </span>
                  <span>{{ totalStoreCount() }}</span>
                </button>

                @if (visibleBrowseCategories().length > 0) {
                  @for (category of visibleBrowseCategories(); track category.slug) {
                    <button
                      type="button"
                      class="couponleo-store-sidebar__item couponleo-store-sidebar__item--button"
                      [class.is-active]="selectedCategory() === category.slug"
                      (click)="selectCategory(category.slug)"
                    >
                      <span class="couponleo-store-sidebar__item-label">
                        <span class="couponleo-store-sidebar__item-icon" aria-hidden="true">
                          <app-couponleo-eon-icon [svg]="category.icon"></app-couponleo-eon-icon>
                        </span>
                        {{ category.name }}
                      </span>
                      <span>{{ category.count }}</span>
                    </button>
                  }
                } @else {
                  <p class="couponleo-store-sidebar__empty">{{ labels().noMatchingCategories }}</p>
                }
              </div>

              <div class="couponleo-store-sidebar__group">
                <strong>{{ labels().browseAlphabetically }}</strong>
                <div class="couponleo-letter-grid">
                  @for (letter of alphabet; track letter) {
                    <button
                      type="button"
                      class="couponleo-letter-pill"
                      [class.is-active]="selectedLetter() === letter"
                      (click)="selectLetter(letter)"
                    >
                      {{ letter }}
                    </button>
                  }
                </div>
              </div>
            </div>
          </aside>

          <div class="couponleo-store-content">
            <div class="couponleo-section-heading">
              <h2>{{ labels().featuredStores }}</h2>
            </div>

            <div class="couponleo-feature-strip">
              @for (store of featuredStores(); track store.id) {
                <article class="couponleo-feature-chip">
                  <div class="couponleo-feature-chip__head">
                    <div class="couponleo-feature-chip__brand">
                      @if (shouldShowStoreLogo(store)) {
                        <img
                          class="couponleo-feature-chip__brand-image"
                          [src]="resolvedStoreLogoUrl(store)"
                          [alt]="store.name"
                          loading="lazy"
                          decoding="async"
                          (error)="markStoreLogoFailed(resolvedStoreLogoUrl(store))"
                        >
                      } @else {
                        <span class="couponleo-feature-chip__brand-fallback">{{ store.initials }}</span>
                      }
                      <strong class="couponleo-feature-chip__name" [attr.title]="store.name">{{ store.name }}</strong>
                    </div>
                    <app-couponleo-favorite-button
                      [active]="isSaved(store.id)"
                      [ariaLabel]="labels().saveFeaturedStore"
                      (toggled)="toggleStoreSaved(store, labels().featuredStore)"
                    ></app-couponleo-favorite-button>
                  </div>
                  <span>{{ store.deals }}</span>
                  <a class="couponleo-feature-chip__link" [routerLink]="store.route" [queryParams]="countryRouteQuery()">{{ labels().openDeals }}</a>
                </article>
              }
            </div>

            <div class="couponleo-section-heading couponleo-section-heading--sub">
              <h2>{{ labels().storeDirectory }}</h2>
              <span class="couponleo-store-content__summary">
                {{ storeDirectoryTotal() }} {{ labels().matchingStores }}
              </span>
            </div>

            @if (pagedStores().length > 0) {
              <div class="couponleo-store-card-grid">
                @for (store of pagedStores(); track store.id) {
                  <article class="couponleo-card couponleo-store-showcase-card">
                    <div class="couponleo-store-showcase-card__top">
                      <div class="couponleo-store-showcase-card__head">
                        <div class="couponleo-store-showcase-card__brand">
                          @if (shouldShowStoreLogo(store)) {
                            <img
                              class="couponleo-store-showcase-card__brand-image"
                              [src]="resolvedStoreLogoUrl(store)"
                              [alt]="store.name"
                              loading="lazy"
                              decoding="async"
                              (error)="markStoreLogoFailed(resolvedStoreLogoUrl(store))"
                            >
                          } @else {
                            <span class="couponleo-store-showcase-card__brand-fallback">{{ store.initials }}</span>
                          }
                          <div class="couponleo-store-showcase-card__copy">
                            <div class="couponleo-store-showcase-card__logo" [attr.title]="store.name">{{ store.name }}</div>
                            <div
                              class="couponleo-store-showcase-card__meta"
                              [attr.title]="store.location + ' | ' + store.category"
                            >{{ store.location }} | {{ store.category }}</div>
                          </div>
                        </div>
                        <app-couponleo-favorite-button
                          [active]="isSaved(store.id)"
                          [ariaLabel]="labels().saveStore"
                          (toggled)="toggleStoreSaved(store, labels().storeDirectory)"
                        ></app-couponleo-favorite-button>
                      </div>
                      <span class="couponleo-store-showcase-card__tag">{{ store.deals }}</span>
                    </div>
                    <p [attr.title]="store.description">{{ store.description }}</p>
                    <div class="couponleo-store-showcase-card__footer">
                      <span class="couponleo-store-showcase-card__savings">{{ store.savings }}</span>
                      <a class="couponleo-button couponleo-button--ghost" [routerLink]="store.route" [queryParams]="countryRouteQuery()">{{ labels().viewDeals }}</a>
                    </div>
                  </article>
                }
              </div>

              <app-couponleo-pagination
                [page]="storePage()"
                [pageCount]="storePageCount()"
                [totalItems]="storeDirectoryTotal()"
                [itemLabel]="i18n.phrase('stores')"
                (pageChange)="setStorePage($event)"
              ></app-couponleo-pagination>
            } @else {
              <div class="couponleo-empty-card">
                <h3>{{ labels().noStores }}</h3>
                <p>{{ labels().noStoresCopy }}</p>
              </div>
            }
          </div>
        </div>
      </section>

      <section class="couponleo-page-section">
        <div class="couponleo-inline-stats">
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
    }
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
      max-width: 35rem;
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

    .couponleo-searchbar__button--text {
      width: auto;
      min-width: 92px;
      padding: 0 22px;
    }

    .couponleo-hero__benefits--stores {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    .couponleo-hero__visual--page {
      min-height: 30rem;
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

    .couponleo-route-hero__image--stores {
      right: 1%;
      bottom: 1%;
      width: min(88%, 33rem);
    }

    .couponleo-route-hero__spotlight {
      position: absolute;
      right: 4%;
      bottom: 24%;
      z-index: 4;
      display: inline-flex;
      align-items: center;
      gap: 14px;
      padding: 16px 18px;
      border-radius: 22px;
      background: rgba(255, 255, 255, 0.96);
      box-shadow: 0 18px 40px rgba(18, 35, 77, 0.12);
    }

    .couponleo-route-hero__spotlight-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 3.15rem;
      height: 3.15rem;
      padding: 12px;
      border-radius: 18px;
      background: rgba(255, 122, 61, 0.12);
      color: var(--couponleo-orange);
    }

    .couponleo-route-hero__spotlight-icon app-couponleo-eon-icon {
      width: 1.45rem;
      height: 1.45rem;
    }

    .couponleo-route-hero__spotlight strong,
    .couponleo-route-hero__spotlight span {
      display: block;
    }

    .couponleo-route-hero__spotlight strong {
      color: var(--couponleo-navy);
      font-size: 1.8rem;
      line-height: 1;
    }

    .couponleo-route-hero__spotlight span {
      margin-top: 4px;
      color: var(--couponleo-muted);
      font-size: 0.92rem;
    }

    .couponleo-store-layout {
      display: grid;
      grid-template-columns: minmax(246px, 0.3fr) minmax(0, 1fr);
      gap: 28px;
      align-items: start;
    }

    .couponleo-store-sidebar {
      display: flex;
      flex-direction: column;
      gap: 18px;
      padding: 18px;
      border-radius: 24px;
      position: sticky;
      top: 24px;
      max-height: calc(100vh - 48px);
      overflow: hidden;
      min-height: 0;
    }

    .couponleo-store-sidebar__search {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px 14px;
      border: 1px solid rgba(22, 36, 74, 0.08);
      border-radius: 18px;
      background: rgba(255, 255, 255, 0.96);
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.7);
    }

    .couponleo-store-sidebar__search:focus-within {
      border-color: rgba(52, 120, 255, 0.3);
      box-shadow: 0 0 0 4px rgba(52, 120, 255, 0.08);
    }

    .couponleo-store-sidebar__search-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 1rem;
      height: 1rem;
      color: var(--couponleo-muted);
      flex: 0 0 auto;
    }

    .couponleo-store-sidebar__search-icon app-couponleo-eon-icon {
      width: 100%;
      height: 100%;
    }

    .couponleo-store-sidebar__search input {
      flex: 1 1 auto;
      min-width: 0;
      padding: 0;
      border: 0;
      outline: 0;
      background: transparent;
      color: var(--couponleo-text);
      font: inherit;
    }

    .couponleo-store-sidebar__search input::placeholder {
      color: rgba(95, 112, 143, 0.9);
    }

    .couponleo-store-sidebar__body {
      display: flex;
      flex: 1 1 auto;
      flex-direction: column;
      gap: 24px;
      min-height: 0;
      overflow-y: scroll;
      overflow-x: hidden;
      padding-right: 4px;
      scrollbar-gutter: stable;
      overscroll-behavior: contain;
    }

    .couponleo-store-sidebar__group {
      display: grid;
      gap: 12px;
      padding-top: 16px;
      border-top: 1px solid rgba(22, 36, 74, 0.08);
    }

    .couponleo-store-sidebar__group:first-of-type {
      padding-top: 0;
      border-top: 0;
    }

    .couponleo-store-sidebar__group strong {
      color: var(--couponleo-blue);
      font-size: 0.95rem;
    }

    .couponleo-store-sidebar__empty {
      margin: 0;
      color: var(--couponleo-muted);
      font-size: 0.9rem;
      line-height: 1.5;
    }

    .couponleo-store-sidebar__item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      color: var(--couponleo-muted);
      font-size: 0.94rem;
    }

    .couponleo-store-sidebar__item--button {
      width: 100%;
      padding: 10px 12px;
      border: 1px solid transparent;
      border-radius: 16px;
      background: rgba(22, 36, 74, 0.03);
      text-align: left;
    }

    .couponleo-store-sidebar__item--button.is-active {
      border-color: rgba(52, 120, 255, 0.16);
      background: rgba(52, 120, 255, 0.08);
      color: var(--couponleo-blue);
    }

    .couponleo-store-sidebar__item-label {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      color: var(--couponleo-text);
    }

    .couponleo-store-sidebar__item-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 1rem;
      height: 1rem;
      color: var(--couponleo-muted);
    }

    .couponleo-store-sidebar__item-icon app-couponleo-eon-icon {
      width: 100%;
      height: 100%;
    }

    .couponleo-letter-grid {
      display: grid;
      grid-template-columns: repeat(7, minmax(0, 1fr));
      gap: 8px;
    }

    .couponleo-letter-pill {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 34px;
      border: 1px solid transparent;
      border-radius: 999px;
      background: rgba(22, 36, 74, 0.04);
      color: var(--couponleo-navy);
      font-size: 0.84rem;
      font-weight: 700;
    }

    .couponleo-letter-pill.is-active {
      background: linear-gradient(135deg, #3480ff 0%, #2355f6 100%);
      color: #fff;
      box-shadow: 0 12px 24px rgba(52, 120, 255, 0.18);
    }

    .couponleo-store-content {
      display: grid;
      gap: 20px;
    }

    .couponleo-store-content__summary {
      color: var(--couponleo-muted);
      font-weight: 700;
    }

    .couponleo-section-heading--sub {
      margin-top: 6px;
    }

    .couponleo-feature-strip {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 12px;
    }

    .couponleo-feature-chip {
      display: grid;
      gap: 8px;
      min-height: 82px;
      padding: 18px 14px;
      border: 1px solid rgba(22, 36, 74, 0.08);
      border-radius: 20px;
      background: rgba(255, 255, 255, 0.9);
      box-shadow: 0 12px 28px rgba(18, 35, 77, 0.06);
      overflow: hidden;
    }

    .couponleo-feature-chip__link {
      color: var(--couponleo-blue);
      font-size: 0.88rem;
      font-weight: 800;
    }

    .couponleo-feature-chip__head {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: start;
      gap: 10px;
    }

    .couponleo-feature-chip__brand,
    .couponleo-store-showcase-card__brand {
      display: flex;
      align-items: center;
      gap: 12px;
      min-width: 0;
    }

    .couponleo-feature-chip__brand {
      flex: 1 1 auto;
    }

    .couponleo-store-showcase-card__copy {
      display: grid;
      gap: 6px;
      min-width: 0;
    }

    .couponleo-feature-chip__brand-image,
    .couponleo-feature-chip__brand-fallback,
    .couponleo-store-showcase-card__brand-image,
    .couponleo-store-showcase-card__brand-fallback {
      flex-shrink: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border: 1px solid rgba(22, 36, 74, 0.08);
      border-radius: 18px;
      background: linear-gradient(180deg, rgba(255, 255, 255, 0.98) 0%, rgba(240, 244, 252, 0.98) 100%);
      box-shadow: 0 12px 24px rgba(18, 35, 77, 0.08);
      overflow: hidden;
    }

    .couponleo-feature-chip__brand-image,
    .couponleo-feature-chip__brand-fallback {
      width: 3.6rem;
      height: 3.6rem;
    }

    .couponleo-store-showcase-card__brand-image,
    .couponleo-store-showcase-card__brand-fallback {
      width: 4.85rem;
      height: 4.85rem;
    }

    .couponleo-feature-chip__brand-image,
    .couponleo-store-showcase-card__brand-image {
      box-sizing: border-box;
      object-fit: contain;
      background: #fff;
      padding: 0.12rem;
      transform: scale(1.06);
      transform-origin: center;
    }

    .couponleo-feature-chip__brand-fallback,
    .couponleo-store-showcase-card__brand-fallback {
      color: var(--couponleo-blue);
      font-size: 1rem;
      font-weight: 900;
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }

    .couponleo-feature-chip strong {
      color: var(--couponleo-navy);
      font-size: 1.2rem;
      line-height: 1;
      letter-spacing: -0.04em;
    }

    .couponleo-feature-chip__name {
      display: block;
      min-width: 0;
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .couponleo-feature-chip app-couponleo-favorite-button {
      flex: 0 0 auto;
      justify-self: end;
    }

    .couponleo-feature-chip span {
      color: var(--couponleo-muted);
      font-size: 0.86rem;
    }

    .couponleo-store-card-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 18px;
    }

    .couponleo-store-showcase-card {
      display: grid;
      gap: 16px;
      padding: 20px 16px;
      border-radius: 24px;
    }

    .couponleo-store-showcase-card__top {
      display: grid;
      gap: 10px;
    }

    .couponleo-store-showcase-card__head {
      display: flex;
      align-items: start;
      justify-content: space-between;
      gap: 12px;
    }

    .couponleo-store-showcase-card__logo {
      color: var(--couponleo-navy);
      font-size: 1.8rem;
      font-weight: 900;
      line-height: 0.96;
      letter-spacing: -0.05em;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .couponleo-store-showcase-card__meta {
      color: var(--couponleo-muted);
      font-size: 0.88rem;
      line-height: 1.4;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .couponleo-store-showcase-card__tag {
      color: var(--couponleo-orange);
      font-weight: 800;
      font-size: 0.92rem;
    }

    .couponleo-store-showcase-card p {
      margin: 0;
      color: var(--couponleo-muted);
      line-height: 1.7;
      display: -webkit-box;
      min-height: calc(1.7em * 3);
      overflow: hidden;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 3;
    }

    .couponleo-store-showcase-card__footer {
      display: grid;
      gap: 12px;
    }

    .couponleo-store-showcase-card__savings {
      display: inline-flex;
      width: fit-content;
      padding: 7px 12px;
      border-radius: 999px;
      background: rgba(22, 36, 74, 0.05);
      color: var(--couponleo-muted);
      font-size: 0.8rem;
      font-weight: 700;
    }

    .couponleo-store-showcase-card .couponleo-button {
      width: 100%;
    }

    .couponleo-inline-stats {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 1px;
      overflow: hidden;
      border: 1px solid rgba(22, 36, 74, 0.08);
      border-radius: 24px;
      background: rgba(22, 36, 74, 0.08);
      box-shadow: 0 18px 40px rgba(18, 35, 77, 0.08);
    }

    .couponleo-inline-stats__item {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 18px 22px;
      background: rgba(255, 255, 255, 0.92);
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
      width: 100%;
      height: 100%;
    }

    .couponleo-inline-stats__item strong,
    .couponleo-inline-stats__item span {
      display: block;
    }

    .couponleo-inline-stats__item strong {
      color: var(--couponleo-navy);
      font-size: 1.75rem;
      line-height: 1;
    }

    .couponleo-inline-stats__item span {
      margin-top: 4px;
      color: var(--couponleo-muted);
    }

    @media (max-width: 1180px) {
      .couponleo-route-hero,
      .couponleo-store-layout {
        grid-template-columns: 1fr;
      }

      .couponleo-store-sidebar {
        position: static;
        max-height: none;
      }

      .couponleo-store-sidebar__body {
        overflow: visible;
        padding-right: 0;
      }

      .couponleo-store-card-grid,
      .couponleo-feature-strip,
      .couponleo-inline-stats {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }

    @media (max-width: 780px) {
      .couponleo-route-hero {
        padding-top: 22px;
      }

      .couponleo-route-hero__title {
        font-size: clamp(2.7rem, 12vw, 4rem);
      }

      .couponleo-route-hero__image--stores {
        right: 50%;
        bottom: 2%;
        width: min(100%, 28rem);
        max-height: 80%;
        transform: translateX(50%);
      }

      .couponleo-hero__benefits--stores,
      .couponleo-store-card-grid,
      .couponleo-feature-strip,
      .couponleo-inline-stats {
        grid-template-columns: 1fr;
      }

      .couponleo-store-showcase-card__logo,
      .couponleo-store-showcase-card__meta {
        white-space: normal;
      }

      .couponleo-route-hero__spotlight {
        right: 6%;
        bottom: 18%;
      }

      .couponleo-letter-grid {
        grid-template-columns: repeat(5, minmax(0, 1fr));
      }
    }
  `],
})
export default class StoresPage {
  private readonly api = inject(CouponleoApiService);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly i18n = inject(CouponleoI18nService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly route = inject(ActivatedRoute);
  private readonly savedService = inject(CouponleoSavedService);
  private readonly browser = isPlatformBrowser(this.platformId);
  private readonly initialCountry = normalizeCountryRouteValue(this.route.snapshot.queryParamMap.get('country'));
  private readonly countryQueryParamMap = this.route.queryParamMap.pipe(
    map((params) => normalizeCountryRouteValue(params.get('country'))),
  );

  private readonly categoriesState = toSignal(
    withRequestState(this.api.listCategories({ pageSize: 50 }), emptyListResponse<CouponleoCategory>()),
    { initialValue: createLoadingState(emptyListResponse<CouponleoCategory>()) },
  );
  private readonly storesState = toSignal(
    this.countryQueryParamMap.pipe(
      startWith(this.initialCountry),
      switchMap((country) => {
        const location = locationFilterForCountry(country);

        return withRequestState(
          this.browser
            ? this.api.listAllStores(location ? { location } : {})
            : this.api.listStores({
              location,
              pageSize: 120,
            }),
          emptyListResponse<CouponleoStore>(),
        );
      }),
    ),
    { initialValue: createLoadingState(emptyListResponse<CouponleoStore>()) },
  );
  private readonly locationsState = toSignal(
    withRequestState(this.api.listLocations({ pageSize: 120 }), emptyListResponse<CouponleoLocation>()),
    { initialValue: createLoadingState(emptyListResponse<CouponleoLocation>()) },
  );

  protected readonly searchIconSvg = searchIconSvg;
  protected readonly shieldCheckIconSvg = shieldCheckIconSvg;
  protected readonly buildingStoreIconSvg = buildingStoreIconSvg;
  protected readonly heroBenefits = computed(() => heroBenefits.map((benefit) => ({
    ...benefit,
    title: this.i18n.phrase(benefit.title),
    copy: this.i18n.phrase(benefit.copy),
  })));
  protected readonly alphabet = alphabet;
  protected readonly labels = computed(() => ({
    eyebrow: this.i18n.phrase('Stores'),
    title: this.i18n.phrase('Top Stores'),
    description: this.i18n.phrase('Browse the live store catalog from the local CouponLeo API with filters for category, name, and first letter.'),
    searchStores: this.i18n.phrase('Search stores'),
    searchCategories: this.i18n.phrase('Search categories'),
    verifiedStores: this.i18n.phrase('Featured stores'),
    categories: this.i18n.phrase('Categories'),
    browseAlphabetically: this.i18n.phrase('Browse Alphabetically'),
    featuredStores: this.i18n.phrase('Featured Stores'),
    openDeals: this.i18n.phrase('Open Deal'),
    storeDirectory: this.i18n.phrase('Store Directory'),
    matchingStores: this.i18n.phrase('matching stores'),
    viewDeals: this.i18n.phrase('View Deals'),
    noStores: this.i18n.phrase('No stores match these filters'),
    noStoresCopy: this.i18n.phrase('Try a different search term, category, or letter to widen the local store list.'),
    noMatchingCategories: this.i18n.phrase('No categories match this search'),
    stores: this.i18n.phrase('Stores'),
    coupons: this.i18n.phrase('Coupons'),
    featured: this.i18n.phrase('Featured'),
    markets: this.i18n.phrase('Markets'),
    saveFeaturedStore: this.i18n.phrase('Save featured store'),
    saveStore: this.i18n.phrase('Save store'),
    featuredStore: this.i18n.phrase('Featured store'),
  }));

  protected readonly searchQuery = signal('');
  protected readonly categorySearchQuery = signal('');
  protected readonly selectedCountry = toSignal(this.countryQueryParamMap, { initialValue: this.initialCountry });
  protected readonly countryRouteQuery = computed(() => buildCountryRouteQuery(this.selectedCountry()));
  protected readonly selectedCategory = signal('all');
  protected readonly selectedLetter = signal('All');
  protected readonly storePage = signal(1);
  private readonly storeLogoFallbacks = signal<Record<string, string>>({});
  private readonly blockedStoreLogoUrls = signal(new Set<string>());
  private readonly loadingStoreLogoIds = new Set<string>();
  protected readonly isLoading = computed(() => (
    this.categoriesState().loading
    || this.storesState().loading
    || this.locationsState().loading
  ));

  private readonly categoriesResponse = computed(() => this.categoriesState().data);
  private readonly storesResponse = computed(() => this.storesState().data);
  private readonly locationsResponse = computed(() => this.locationsState().data);

  private readonly countryStores = computed(() => (
    this.storesResponse().items.filter((store) => matchesCountry(this.selectedCountry(), store.location))
  ));

  private readonly categorySlugByName = computed(() => (
    new Map(this.categoriesResponse().items.map((category) => [category.name.toLowerCase(), category.slug]))
  ));

  private readonly featuredCountryStores = computed(() => (
    [...this.countryStores()]
      .filter((store) => store.featured)
      .sort((left, right) => right.activeCoupons - left.activeCoupons || left.name.localeCompare(right.name))
  ));

  private readonly filteredDirectoryStores = computed(() => {
    const query = this.searchQuery().trim();

    return [...this.countryStores()]
      .filter((store) => (
        this.selectedCategory() === 'all'
        || this.categorySlugByName().get(store.category.toLowerCase()) === this.selectedCategory()
        || slugifyLabel(store.category) === this.selectedCategory()
      ))
      .filter((store) => matchesLetterFilter(store.name, this.selectedLetter()))
      .filter((store) => matchesStoreQuery(store, query))
      .sort((left, right) => right.activeCoupons - left.activeCoupons || left.name.localeCompare(right.name));
  });

  protected readonly browseCategories = computed<StoreSidebarCategory[]>(() => {
    const counts = new Map<string, { name: string; slug: string; count: number }>();

    for (const store of this.countryStores()) {
      const slug = this.categorySlugByName().get(store.category.toLowerCase()) ?? slugifyLabel(store.category);
      const current = counts.get(slug);

      if (current) {
        current.count += 1;
        continue;
      }

      counts.set(slug, {
        name: store.category,
        slug,
        count: 1,
      });
    }

    return [...counts.values()]
      .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name))
      .map((category) => ({
        name: category.name,
        slug: category.slug,
        count: this.i18n.formatNumber(category.count),
        icon: getCategoryPresentation(category.slug).icon,
      }));
  });
  protected readonly visibleBrowseCategories = computed<StoreSidebarCategory[]>(() => {
    const query = this.categorySearchQuery().trim().toLowerCase();

    if (!query) {
      return this.browseCategories();
    }

    return this.browseCategories().filter((category) => category.name.toLowerCase().includes(query));
  });

  protected readonly featuredStoreCount = computed(() => this.i18n.formatNumber(this.featuredCountryStores().length));
  protected readonly featuredStores = computed<StoreCardViewModel[]>(() => {
    const storesToShow = this.featuredCountryStores().length > 0
      ? this.featuredCountryStores()
      : this.countryStores();

    return [...storesToShow]
      .slice(0, 12)
      .map((store) => this.localizeStoreCard(toStoreCardViewModel(store)));
  });

  protected readonly countryCouponTotal = computed(() => (
    this.countryStores().reduce((total, store) => total + store.activeCoupons, 0)
  ));
  protected readonly totalStoreCount = computed(() => this.storesResponse().total || this.countryStores().length);
  protected readonly storeDirectoryTotal = computed(() => this.filteredDirectoryStores().length);
  protected readonly storePageCount = computed(() => pageCountFor(this.filteredDirectoryStores().length, storesPageSize));
  protected readonly pagedStores = computed<StoreCardViewModel[]>(() => (
    paginateItems(this.filteredDirectoryStores(), this.storePage(), storesPageSize).map((store) => this.localizeStoreCard(toStoreCardViewModel(store)))
  ));

  protected readonly stats = computed<StoreStat[]>(() => {
    const marketCount = this.selectedCountry() === 'all'
      ? (this.locationsResponse().total || this.locationsResponse().items.length)
      : (this.countryStores().length > 0 ? 1 : 0);

    return [
      { value: this.i18n.formatNumber(this.totalStoreCount()), label: this.labels().stores, icon: buildingStoreIconSvg },
      { value: this.i18n.formatNumber(this.countryCouponTotal()), label: this.labels().coupons, icon: tagIconSvg },
      { value: this.i18n.formatNumber(this.featuredCountryStores().length), label: this.labels().featured, icon: shieldCheckIconSvg },
      { value: this.i18n.formatNumber(marketCount), label: this.labels().markets, icon: shieldLockIconSvg },
    ];
  });

  constructor() {
    effect(() => {
      this.selectedCountry();
      untracked(() => {
        this.selectedCategory.set('all');
        this.storePage.set(1);
      });
    });

    effect(() => {
      const visibleStores = [...this.featuredStores(), ...this.pagedStores()];

      for (const store of visibleStores) {
        this.ensureStoreLogoFallback(store);
      }
    });
  }

  protected isSaved(id: string): boolean {
    return this.savedService.has(id);
  }

  protected updateSearch(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    this.searchQuery.set(target?.value ?? '');
    this.storePage.set(1);
  }

  protected updateCategorySearch(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    this.categorySearchQuery.set(target?.value ?? '');
  }

  protected selectCategory(categorySlug: string): void {
    this.selectedCategory.set(categorySlug);
    this.storePage.set(1);
  }

  protected selectLetter(letter: string): void {
    this.selectedLetter.set(letter);
    this.storePage.set(1);
  }

  protected setStorePage(pageNumber: number): void {
    const nextPage = Math.min(Math.max(pageNumber, 1), this.storePageCount());
    this.storePage.set(nextPage);
  }

  protected resolvedStoreLogoUrl(store: StoreCardViewModel): string {
    const fallbackLogo = this.storeLogoFallbacks()[store.id];

    if (fallbackLogo) {
      return proxiedStoreLogoUrl(fallbackLogo);
    }

    return isBlockedStoreLogoUrl(store.logoUrl) ? '' : proxiedStoreLogoUrl(store.logoUrl);
  }

  protected shouldShowStoreLogo(store: StoreCardViewModel): boolean {
    const logoUrl = this.resolvedStoreLogoUrl(store);
    return Boolean(logoUrl) && !this.blockedStoreLogoUrls().has(logoUrl);
  }

  protected markStoreLogoFailed(logoUrl: string): void {
    if (!logoUrl) {
      return;
    }

    const current = this.blockedStoreLogoUrls();
    if (current.has(logoUrl)) {
      return;
    }

    const next = new Set(current);
    next.add(logoUrl);
    this.blockedStoreLogoUrls.set(next);
  }

  protected toggleStoreSaved(store: StoreCardViewModel, subtitle: string): void {
    this.savedService.toggle({
      id: store.id,
      kind: 'store',
      title: store.name,
      subtitle,
      description: `${store.description} ${store.savings}`.trim(),
      route: store.route,
    });
  }

  private localizeStoreCard(store: StoreCardViewModel): StoreCardViewModel {
    const activeCoupons = Number.parseInt(store.deals, 10) || 0;

    return {
      ...store,
      deals: this.formatCount(activeCoupons, 'active coupon', 'active coupons'),
    };
  }

  private formatCount(value: number, singular: string, plural: string): string {
    const unit = value === 1 ? singular : plural;
    return `${this.i18n.formatNumber(value)} ${this.i18n.phrase(unit)}`;
  }

  private ensureStoreLogoFallback(store: StoreCardViewModel): void {
    if (!isBlockedStoreLogoUrl(store.logoUrl)) {
      return;
    }

    if (this.storeLogoFallbacks()[store.id]) {
      return;
    }

    if (this.loadingStoreLogoIds.has(store.id)) {
      return;
    }

    this.loadingStoreLogoIds.add(store.id);
    this.api.listCouponsByStore(store.slug, { pageSize: 1 })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.loadingStoreLogoIds.delete(store.id);
        }),
      )
      .subscribe({
        next: (response) => {
          const fallbackLogo = response.items[0]?.brand_logo ?? '';
          if (!fallbackLogo) {
            return;
          }

          this.storeLogoFallbacks.update((current) => ({
            ...current,
            [store.id]: fallbackLogo,
          }));
        },
      });
  }
}
