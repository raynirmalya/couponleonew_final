import { loadStore as load } from '../../services/couponleo-page-loaders';
import { isPlatformServer } from '@angular/common';
import { Component, computed, effect, inject, PLATFORM_ID, signal } from '@angular/core';
import { toObservable, toSignal, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { combineLatest, map, of, startWith, debounceTime, distinctUntilChanged, switchMap } from 'rxjs';
import { injectResponse } from '@analogjs/router/tokens';
import { Meta, Title } from '@angular/platform-browser';
import {
  CouponleoCouponDialogComponent,
  type CouponleoCouponReveal,
} from '../../components/couponleo-coupon-dialog.component';
import {
  CouponleoBreadcrumbsComponent,
  type CouponleoBreadcrumbItem,
} from '../../components/couponleo-breadcrumbs.component';
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
import { createLoadingState, withHydratedRequestState } from '../../services/couponleo-request-state.helpers';
import { createDynamicRouteMeta, humanizeSlug } from '../../services/couponleo-route-meta';
import { CouponleoSavedService } from '../../services/couponleo-saved.service';
import { CouponleoSeoSyncService } from '../../services/couponleo-seo-sync.service';
import {
  buildCouponleoStoreKeywordHighlightsForMarket,
  buildCouponleoStoreCardDescriptionForMarket,
  buildCouponleoStoreFaqItems,
  buildCouponleoStoreMetaDescription,
  buildCouponleoStoreSeoParagraphs,
  extractCouponleoWebsiteHost,
  resolveCouponleoStoreCategoryLabel,
  resolveCouponleoStoreDescription,
} from '../../services/couponleo-seo-copy.helpers';
import {
  buildCountryRouteQuery,
  buildStoreRoute,
  formatCount,
  formatExpiryLabel,
  localizeCouponleoRoute,
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

interface StoreSeoFact {
  copy: string;
  label: string;
  value: string;
}

const storeDealsPageSize = 12;

export const routeMeta = createDynamicRouteMeta((route) => {
  const storeName = humanizeSlug(route.paramMap.get('slug') ?? 'store');
  const country = normalizeCountryRouteValue(route.queryParamMap.get('country'));

  if (country !== 'all') {
    return {
      title: `${storeName} Coupon Codes, Promo Codes & Deals in ${country} | CouponLeo`,
      description: `Compare ${storeName} coupon codes, promo codes, and live store offers for shoppers in ${country} before you head to checkout.`,
    };
  }

  return {
    title: `${storeName} Coupon Codes, Promo Codes & Deals | CouponLeo`,
    description: `Compare ${storeName} coupon codes, promo codes, and live store deals before you decide whether the brand is worth opening today.`,
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

export { loadStore as load } from '../../services/couponleo-page-loaders';

@Component({
  selector: 'app-store-deals-page',
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
              <p>{{ storeName() }} coupon codes and offers. Check the market, expiry and merchant terms before checkout.</p>

              <div class="couponleo-store-deals-hero__meta">
                <span>{{ storeCategory() }}</span>
                <span>{{ storeFeaturedLabel() }}</span>
                <span>{{ storeActiveDealLabel() }}</span>
              </div>
            </div>
          </div>
        </div>

        <div class="couponleo-store-deals-hero__actions">
          <a
            class="couponleo-button couponleo-button--ghost"
            [routerLink]="localizeRoute('/stores')"
            [queryParams]="countryRouteQuery()"
            data-telemetry-event="store_back_to_directory"
            [attr.data-telemetry-label]="labels().backToStores"
          >{{ labels().backToStores }}</a>
        </div>
      </div>

      <form class="couponleo-searchbar" (submit)="$event.preventDefault()" data-telemetry-event="store_search_submit" [attr.data-telemetry-label]="storeName()">
        <span class="couponleo-searchbar__icon" aria-hidden="true">
          <app-couponleo-eon-icon [svg]="searchIconSvg"></app-couponleo-eon-icon>
        </span>
        <input
          type="search"
          [placeholder]="searchPlaceholder()"
          [attr.aria-label]="labels().searchStoreDeals"
          [value]="searchQuery()"
          data-telemetry-event="store_search_input"
          [attr.data-telemetry-label]="storeName()"
          (input)="updateSearch($event)"
        >
        <button
          type="submit"
          class="couponleo-searchbar__button"
          [attr.aria-label]="i18n.phrase('Search')"
          data-telemetry-event="store_search_button"
          [attr.data-telemetry-label]="storeName()"
        >
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
          <a
            class="couponleo-button couponleo-button--solid"
            [routerLink]="localizeRoute('/stores')"
            [queryParams]="countryRouteQuery()"
            data-telemetry-event="store_not_found_browse_stores"
            [attr.data-telemetry-label]="i18n.phrase('Browse Stores')"
          >{{ i18n.phrase('Browse Stores') }}</a>
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
                    <span class="couponleo-deal-card__flag">{{ i18n.phrase('Merchant offer') }}</span>
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
                  <button
                    type="button"
                    class="couponleo-code couponleo-code--masked"
                    (click)="openCoupon(deal)"
                    data-telemetry-event="store_deal_code_open"
                    [attr.data-telemetry-label]="storeName() + ' ' + deal.offer"
                  >
                    {{ deal.code ? maskCode(deal.code) : i18n.phrase('View offer') }}
                  </button>
                  <button
                    type="button"
                    class="couponleo-button couponleo-button--solid"
                    (click)="openCoupon(deal)"
                    data-telemetry-event="store_deal_show_code"
                    [attr.data-telemetry-label]="storeName() + ' ' + deal.offer"
                  >
                    {{ i18n.phrase(deal.code ? 'Show Code' : 'View offer') }}
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
        } @else if (!dealsLoading() && !deferCouponsOnServer) {
          <div class="couponleo-empty-card">
            <h3>{{ labels().noDeals }}</h3>
            <p>{{ labels().noDealsCopy }}</p>
          </div>
        }
      </section>
      <section class="couponleo-page-section">
        <div class="couponleo-copy-card couponleo-store-seo-card">
          <div class="couponleo-store-seo-card__copy">
            <span class="couponleo-store-seo-card__eyebrow">{{ labels().storeOverview }}</span>
            <h2>{{ storeOverviewHeading() }}</h2>

            @for (paragraph of storeSeoParagraphs(); track paragraph) {
              <p>{{ paragraph }}</p>
            }

            @if (storeKeywordHighlights().length > 0) {
              <div class="couponleo-store-seo-card__keywords">
                <span>{{ labels().searchThemes }}</span>
                <div class="couponleo-store-seo-card__keyword-list">
                  @for (keyword of storeKeywordHighlights(); track keyword) {
                    <span class="couponleo-store-seo-card__keyword">{{ keyword }}</span>
                  }
                </div>
              </div>
            }
          </div>

          <div class="couponleo-store-seo-card__facts">
            @for (fact of storeSeoFacts(); track fact.label) {
              <article class="couponleo-card couponleo-store-seo-card__fact">
                <span class="couponleo-store-seo-card__fact-label">{{ fact.label }}</span>
                <h3>{{ fact.value }}</h3>
                <p>{{ fact.copy }}</p>
              </article>
            }

            @if (storeWebsiteUrl()) {
              <a
                class="couponleo-button couponleo-button--ghost couponleo-store-seo-card__link"
                [href]="storeWebsiteUrl()"
                target="_blank"
                rel="noreferrer"
                data-telemetry-event="store_official_website_open"
                [attr.data-telemetry-label]="storeWebsiteHost()"
              >
                {{ labels().visitWebsite }}
              </a>
            }
          </div>
        </div>
      </section>

      @if (storeFaqs().length > 0) {
        <section class="couponleo-page-section">
          <div class="couponleo-copy-card couponleo-store-faq-card">
            <div class="couponleo-section-heading couponleo-section-heading--stacked">
              <h2>{{ storeFaqHeading() }}</h2>
              <p>{{ storeFaqIntro() }}</p>
            </div>

            <div class="couponleo-store-faq-grid">
              @for (faq of storeFaqs(); track faq.question) {
                <article
                  class="couponleo-store-faq-item"
                  [attr.data-couponleo-faq-question]="faq.question"
                  [attr.data-couponleo-faq-answer]="faq.answer"
                >
                  <h3>{{ faq.question }}</h3>
                  <p>{{ faq.answer }}</p>
                </article>
              }
            </div>
          </div>
        </section>
      }


    }

    <app-couponleo-coupon-dialog
      [coupon]="activeCoupon()"
      (closeRequested)="closeCoupon()"
    ></app-couponleo-coupon-dialog>
  `,
  styles: [`
    :host { display:block; min-width:0; overflow-wrap:anywhere; }
    .couponleo-deal-card, .couponleo-deal-card__brand-group, .couponleo-code { min-width:0; max-width:100%; overflow-wrap:anywhere; }
    @media(max-width:600px) { .couponleo-store-deals-hero__stats { display:none; } }

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

    .couponleo-store-seo-card {
      position: relative;
      overflow: hidden;
      display: grid;
      grid-template-columns: minmax(0, 1.2fr) minmax(260px, 0.8fr);
      gap: 22px;
      background:
        radial-gradient(circle at top right, rgba(255, 188, 120, 0.2), transparent 32%),
        linear-gradient(135deg, rgba(255, 255, 255, 0.98) 0%, rgba(255, 247, 238, 0.96) 52%, rgba(248, 251, 255, 0.96) 100%);
      box-shadow: 0 24px 48px rgba(18, 35, 77, 0.1);
    }

    .couponleo-store-seo-card__copy,
    .couponleo-store-seo-card__facts {
      display: grid;
      gap: 20px;
    }

    .couponleo-store-seo-card__copy h2,
    .couponleo-store-seo-card__fact h3 {
      margin: 0;
      color: var(--couponleo-navy);
    }

    .couponleo-store-seo-card__copy h2 {
      font-size: clamp(2.3rem, 3vw, 3.2rem);
      max-width: 15ch;
      line-height: 1.02;
      letter-spacing: -0.055em;
    }

    .couponleo-store-seo-card__eyebrow,
    .couponleo-store-seo-card__fact-label {
      display: inline-flex;
      align-items: center;
      gap: 0.7rem;
      width: auto;
      max-width: none;
      font-size: 0.95rem;
      font-weight: 800;
      letter-spacing: 0.02em;
      line-height: 1.2;
      text-align: left;
      text-wrap: balance;
      white-space: nowrap;
    }

    .couponleo-store-seo-card__eyebrow {
      color: var(--couponleo-navy);
    }

    .couponleo-store-seo-card__fact-label {
      color: #c46a23;
    }

    .couponleo-store-seo-card__eyebrow::before,
    .couponleo-store-seo-card__fact-label::before {
      content: '';
      display: inline-block;
      flex: 0 0 auto;
      width: 0.9rem;
      height: 0.9rem;
      border-radius: 999px;
      background: linear-gradient(135deg, #ffbe5c 0%, #ff7d3d 100%);
      box-shadow: 0 10px 20px rgba(255, 150, 71, 0.3);
    }

    .couponleo-store-seo-card__copy p,
    .couponleo-store-seo-card__keywords span,
    .couponleo-store-seo-card__fact p {
      margin: 0;
      color: var(--couponleo-muted);
    }

    .couponleo-store-seo-card__copy p {
      max-width: none;
      line-height: 1.72;
    }

    .couponleo-store-seo-card__keywords {
      display: grid;
      gap: 12px;
    }

    .couponleo-store-seo-card__keywords > span {
      font-size: 0.92rem;
      font-weight: 800;
      color: var(--couponleo-navy);
    }

    .couponleo-store-seo-card__keyword-list {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }

    .couponleo-store-seo-card__keyword {
      display: inline-flex;
      padding: 8px 14px;
      border-radius: 999px;
      background: rgba(22, 36, 74, 0.05);
      border: 1px solid rgba(22, 36, 74, 0.06);
      font-size: 0.9rem;
      font-weight: 700;
    }

    .couponleo-store-seo-card__facts {
      align-content: start;
    }

    .couponleo-store-seo-card__fact {
      position: relative;
      overflow: hidden;
      display: grid;
      align-content: start;
      justify-items: start;
      min-height: 0;
      gap: 12px;
      padding: 22px 24px 22px 28px;
      border-radius: 28px;
      background: linear-gradient(180deg, rgba(255, 255, 255, 0.94) 0%, rgba(255, 250, 244, 0.9) 100%);
      border: 1px solid rgba(22, 36, 74, 0.06);
      box-shadow: 0 18px 38px rgba(18, 35, 77, 0.07);
    }

    .couponleo-store-seo-card__fact::before {
      content: '';
      position: absolute;
      inset: 20px auto 20px 14px;
      width: 4px;
      border-radius: 999px;
      background: linear-gradient(180deg, #ffb14a 0%, #ff7a3d 100%);
    }

    .couponleo-store-seo-card__fact h3 {
      font-size: clamp(1.5rem, 2.05vw, 2.1rem);
      line-height: 1.08;
      overflow-wrap: anywhere;
    }

    .couponleo-store-seo-card__fact p {
      line-height: 1.64;
    }

    .couponleo-store-seo-card__link {
      width: 100%;
      min-height: 3.35rem;
    }

    .couponleo-store-faq-card,
    .couponleo-store-faq-grid {
      display: grid;
      gap: 18px;
    }

    .couponleo-store-faq-grid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    .couponleo-store-faq-item {
      display: grid;
      gap: 12px;
      padding: 22px 24px;
      border-radius: 24px;
      background: linear-gradient(180deg, rgba(255, 255, 255, 0.96) 0%, rgba(248, 251, 255, 0.94) 100%);
      border: 1px solid rgba(22, 36, 74, 0.08);
      box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.72);
    }

    .couponleo-store-faq-item h3,
    .couponleo-store-faq-item p {
      margin: 0;
    }

    .couponleo-store-faq-item h3 {
      color: var(--couponleo-navy);
      font-size: 1.15rem;
      line-height: 1.35;
    }

    .couponleo-store-faq-item p {
      color: var(--couponleo-muted);
      line-height: 1.72;
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

      .couponleo-store-seo-card {
        grid-template-columns: 1fr;
      }

      .couponleo-store-faq-grid {
        grid-template-columns: 1fr;
      }

      .couponleo-store-seo-card__eyebrow,
      .couponleo-store-seo-card__fact-label {
        white-space: normal;
      }
    }
  `],
})
export default class StoreDealsPage {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly api = inject(CouponleoApiService);
  protected readonly i18n = inject(CouponleoI18nService);
  private readonly route = inject(ActivatedRoute);
  private readonly response = injectResponse();
  private readonly savedService = inject(CouponleoSavedService);
  private readonly seoSync = inject(CouponleoSeoSyncService);
  private readonly meta = inject(Meta);
  private readonly title = inject(Title);
  private readonly initialLoad = this.route.snapshot.data['load'] as Awaited<ReturnType<typeof load>> | undefined;
  private readonly initialCountry = normalizeCountryRouteValue(this.route.snapshot.queryParamMap.get('country'));
  protected readonly deferCouponsOnServer = isPlatformServer(this.platformId) && this.initialLoad?.coupons === undefined;

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
  protected readonly localizeRoute = (path: string) => localizeCouponleoRoute(path, this.i18n.locale());

  private readonly storeState = toSignal(
    withHydratedRequestState(
      this.storeSlug$,
      (slug) => (
        slug
          ? this.api.getStore(slug).pipe(map((response) => response.data))
          : of(null)
      ),
      null as CouponleoStore | null,
      () => this.initialLoad?.store,
    ),
    { initialValue: createLoadingState<CouponleoStore | null>(null) },
  );

  private readonly couponsState = toSignal(
    withHydratedRequestState(
      combineLatest([
        this.storeSlug$,
        toObservable(this.searchQuery).pipe(
          debounceTime(150),
          distinctUntilChanged(),
          startWith(''),
        ),
        toObservable(this.dealPage).pipe(startWith(1)),
        this.countryQueryParamMap.pipe(startWith(this.initialCountry)),
      ]),
      ([slug, query, page, country]) => (
        slug
          ? (this.deferCouponsOnServer
            ? of(emptyCouponListResponse<CouponleoCoupon>())
            : this.api.listCouponsByStore(slug, {
              active: true,
              location: locationFilterForCountry(country),
              page,
              pageSize: storeDealsPageSize,
              q: query.trim() || undefined,
            }))
          : of(emptyCouponListResponse<CouponleoCoupon>())
      ),
      emptyCouponListResponse<CouponleoCoupon>(),
      () => {
        const initialCoupons = this.initialLoad?.coupons;
        const initialStore = this.initialLoad?.store;
        const hasKnownLiveOffers = Math.max(
          0,
          Number(initialStore?.activeCoupons ?? initialStore?.couponCount ?? 0),
        ) > 0;

        if (!initialCoupons) {
          return undefined;
        }

        if ((initialCoupons.total ?? 0) === 0 && hasKnownLiveOffers) {
          return undefined;
        }

        return initialCoupons;
      },
    ),
    { initialValue: createLoadingState(emptyCouponListResponse<CouponleoCoupon>()) },
  );

  protected readonly isLoading = computed(() => !this.store() && this.storeState().loading);
  protected readonly dealsLoading = computed(() => this.couponsState().loading);
  protected readonly store = computed(() => this.storeState().data);
  private readonly couponsResponse = computed(() => this.couponsState().data);
  protected readonly dealTotal = computed(() => (
    this.couponsResponse().total || this.store()?.activeCoupons || this.store()?.couponCount || 0
  ));
  protected readonly dealPageNumber = computed(() => this.couponsResponse().page ?? this.dealPage());
  protected readonly dealPageCount = computed(() => this.couponsResponse().pageCount ?? 1);
  protected readonly storeRoute = computed(() => this.localizeRoute(buildStoreRoute(this.store()?.slug ?? this.storeSlug())));
  protected readonly storeLogoUrl = computed(() => {
    const store = this.store();
    return store ? couponleoStoreLogoUrl(store) : '';
  });
  protected readonly breadcrumbs = computed<CouponleoBreadcrumbItem[]>(() => [
    { label: 'CouponLeo', href: this.localizeRoute('/') },
    { label: this.i18n.phrase('Stores'), href: this.localizeRoute('/stores'), queryParams: this.countryRouteQuery() },
    { label: this.storeName() },
  ]);
  protected readonly labels = computed(() => ({
    backToStores: this.i18n.phrase('Back to Stores'),
    searchStoreDeals: this.i18n.phrase('Search store deals'),
    storeNotFound: this.i18n.phrase('Store not found'),
    storeNotFoundCopy: this.i18n.phrase('This store could not be found in the current CouponLeo catalog.'),
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
    storeOverview: this.i18n.phrase('Before you shop'),
    officialWebsite: this.i18n.phrase('Official site'),
    primaryMarket: this.i18n.phrase('Main market'),
    merchantType: this.i18n.phrase('Shopping lane'),
    liveDealCoverage: this.i18n.phrase('Active offers'),
    searchThemes: this.i18n.phrase('Popular search themes'),
    visitWebsite: this.i18n.phrase('Visit official site'),
  }));

  protected readonly storeName = computed(() => this.store()?.name ?? this.i18n.phrase('Store Deals'));
  protected readonly storeLocation = computed(() => (
    this.selectedCountry() === 'all'
      ? (this.store()?.location ?? this.i18n.phrase('Store Deals'))
      : this.selectedCountry()
  ));
  protected readonly storeHeadline = computed(() => (
    this.store()?.headline ?? this.i18n.phrase('Browse the live CouponLeo deals for this store in one place.')
  ));
  protected readonly storeDescription = computed(() => (
    buildCouponleoStoreCardDescriptionForMarket(this.store(), this.selectedCountry())
    || resolveCouponleoStoreDescription(this.store(), this.storeHeadline())
  ));
  protected readonly storeCategoryLabel = computed(() => (
    resolveCouponleoStoreCategoryLabel(this.store()) || this.labels().categoryUnavailable
  ));
  protected readonly storeCategory = computed(() => (
    this.storeCategoryLabel() !== this.labels().categoryUnavailable
      ? `${this.labels().category}: ${this.storeCategoryLabel()}`
      : this.labels().categoryUnavailable
  ));
  protected readonly storeFeaturedLabel = computed(() => (
    this.store()?.featured ? this.labels().featuredStore : this.labels().directoryStore
  ));
  protected readonly storeActiveDealLabel = computed(() => (
    formatCount(this.store()?.activeCoupons ?? this.dealTotal(), 'live deal', 'live deals')
  ));
  protected readonly storeWebsiteHost = computed(() => (
    extractCouponleoWebsiteHost(
      this.store()?.url,
      this.store()?.websiteHost ?? this.store()?.name ?? this.storeName(),
    )
  ));
  protected readonly storeWebsiteUrl = computed(() => this.store()?.url ?? '');
  protected readonly storeOverviewHeading = computed(() => this.i18n.t('seo.storeOverviewHeading', { store: this.storeName() }));
  protected readonly storeMetaDescription = computed(() => (
    buildCouponleoStoreMetaDescription(this.store(), this.selectedCountry())
  ));
  protected readonly storeMetaKeywords = computed(() => (
    buildCouponleoStoreKeywordHighlightsForMarket(this.store(), this.selectedCountry()).join(', ')
  ));
  protected readonly storeSeoParagraphs = computed(() => (
    buildCouponleoStoreSeoParagraphs(this.store(), this.selectedCountry())
  ));
  protected readonly storeKeywordHighlights = computed(() => (
    buildCouponleoStoreKeywordHighlightsForMarket(this.store(), this.selectedCountry())
  ));
  protected readonly storeFaqHeading = computed(() => this.i18n.phrase('What shoppers usually want to know'));
  protected readonly storeFaqIntro = computed(() => (
    this.selectedCountry() === 'all'
      ? this.i18n.phrase('A quick read before you decide whether this store deserves the visit.')
      : `${this.i18n.phrase('A quick read for shoppers in')} ${this.selectedCountry()} ${this.i18n.phrase('before deciding whether this merchant deserves a closer look.')}`
  ));
  protected readonly storeSeoFacts = computed<StoreSeoFact[]>(() => [
    {
      label: this.labels().officialWebsite,
      value: this.storeWebsiteHost(),
      copy: this.i18n.phrase('Visit the merchant once the savings picture looks strong enough to justify the click.'),
    },
    {
      label: this.labels().primaryMarket,
      value: this.selectedCountry() === 'all' ? (this.store()?.location ?? 'Global') : this.selectedCountry(),
      copy: this.selectedCountry() === 'all'
        ? this.i18n.phrase('Worth watching when shipping rules or local promo exclusions can change the final value.')
        : this.i18n.phrase('Focused on the live mix currently visible in the selected market.'),
    },
    {
      label: this.labels().merchantType,
      value: this.storeCategoryLabel(),
      copy: this.i18n.phrase('A quick cue for the kind of basket this store usually suits best.'),
    },
    {
      label: this.labels().liveDealCoverage,
      value: this.storeActiveDealLabel(),
      copy: this.i18n.phrase('One glance tells you whether today feels deep enough to keep the store in play.'),
    },
  ]);
  protected readonly storeFaqs = computed(() => buildCouponleoStoreFaqItems(this.store(), this.selectedCountry()));
  protected readonly searchPlaceholder = computed(() => `${this.labels().searchStoreDeals}: ${this.storeName()}`);
  protected readonly dealsHeading = computed(() => `${this.labels().dealsFrom} ${this.storeName()}`);
  protected readonly dealsSummary = computed(() => (
    this.selectedCountry() === 'all'
      ? `${formatCount(this.dealTotal(), 'current offer', 'current offers')} in the catalog. Check each offerâ€™s terms and expiry before checkout.`
      : `${formatCount(this.dealTotal(), 'current offer', 'current offers')} gathered here for shoppers in ${this.selectedCountry()}.`
  ));

  protected readonly heroStats = computed(() => [
    { label: this.labels().liveDeals, value: this.storeActiveDealLabel(), icon: tagIconSvg },
    { label: this.labels().location, value: this.storeLocation(), icon: buildingStoreIconSvg },
    { label: this.labels().category, value: this.storeCategoryLabel(), icon: shieldIconSvg },
    { label: this.labels().status, value: this.store()?.featured ? this.labels().featured : this.labels().live, icon: shieldIconSvg },
  ]);

  protected readonly deals = computed<StorePageCouponCard[]>(() => (
    this.couponsResponse().items.map((coupon: CouponleoCoupon) => ({
      id: `coupon-${coupon.slug}`,
      title: coupon.title,
      subtitle: coupon.categoryName,
      description: coupon.description,
      code: coupon.code,
      ctaUrl: coupon.ctaUrl,
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

    effect(() => {
      const store = this.store();

      if (!store) {
        return;
      }

      const pageTitle = this.selectedCountry() === 'all'
        ? this.i18n.t('seo.storeTitle', { store: store.name })
        : this.i18n.t('seo.storeTitleInMarket', { store: store.name, country: this.selectedCountry() });
      const description = this.storeMetaDescription() || this.storeSeoParagraphs()[0] || this.storeDescription();

      this.title.setTitle(pageTitle);
      this.meta.updateTag({ name: 'description', content: description }, 'name="description"');
      this.meta.updateTag({ name: 'keywords', content: this.storeMetaKeywords() }, 'name="keywords"');
      this.meta.updateTag({ property: 'og:title', content: pageTitle }, 'property="og:title"');
      this.meta.updateTag({ property: 'og:description', content: description }, 'property="og:description"');
      this.meta.updateTag({ name: 'twitter:title', content: pageTitle }, 'name="twitter:title"');
      this.meta.updateTag({ name: 'twitter:description', content: description }, 'name="twitter:description"');
      this.seoSync.setPageFaqs(this.storeFaqs());
      this.seoSync.refreshDocumentMetadata();
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
      ctaUrl: deal.ctaUrl,
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
