import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CouponleoEonIconComponent } from '../components/couponleo-eon-icon.component';
import { CouponleoAuthService } from '../services/couponleo-auth.service';
import { CouponleoI18nService } from '../services/couponleo-i18n.service';
import {
  CouponleoSavedService,
  type CouponleoSavedItem,
} from '../services/couponleo-saved.service';
import {
  CouponleoCouponDialogComponent,
  type CouponleoCouponReveal,
} from '../components/couponleo-coupon-dialog.component';
import { CouponleoFavoriteButtonComponent } from '../components/couponleo-favorite-button.component';

import buildingStoreIconSvg from '@eonui/icons/svg/maps/eon-building-store.svg?raw';
import cardboardsIconSvg from '@eonui/icons/svg/system/eon-cardboards.svg?raw';
import tagIconSvg from '@eonui/icons/svg/commerce/eon-tag.svg?raw';
import { createStaticRouteMeta } from '../services/couponleo-route-meta';

export const routeMeta = createStaticRouteMeta({
  title: 'Wishlist | CouponLeo',
  description: 'Review saved stores, categories, and verified offers inside the CouponLeo wishlist workspace.',
  robots: 'noindex,follow',
});

@Component({
  selector: 'app-wishlist-page',
  imports: [
    RouterLink,
    CouponleoCouponDialogComponent,
    CouponleoEonIconComponent,
    CouponleoFavoriteButtonComponent,
  ],
  template: `
    <section class="couponleo-page-hero couponleo-page-hero--soft couponleo-saved-hero">
      <span class="couponleo-eyebrow">{{ labels().eyebrow }}</span>
      <h1>{{ labels().title }}</h1>
      <p>{{ labels().description }}</p>

      <nav class="couponleo-saved-hero__nav" [attr.aria-label]="labels().supportNavigation">
        <a class="couponleo-saved-hero__nav-link is-active" routerLink="/wishlist">{{ labels().eyebrow }}</a>
        <a class="couponleo-saved-hero__nav-link" routerLink="/help-center">{{ labels().helpCenter }}</a>
        <a class="couponleo-saved-hero__nav-link" routerLink="/terms-of-use">{{ labels().termsOfUse }}</a>
        <a class="couponleo-saved-hero__nav-link" routerLink="/privacy-policy">{{ labels().privacyPolicy }}</a>
      </nav>

      <div class="couponleo-saved-hero__stats">
        <article class="couponleo-saved-hero__stat">
          <strong>{{ totalSaved() }}</strong>
          <span>{{ labels().wishlistItems }}</span>
        </article>
        <article class="couponleo-saved-hero__stat">
          <strong>{{ storeCount() }}</strong>
          <span>{{ labels().favoriteStores }}</span>
        </article>
        <article class="couponleo-saved-hero__stat">
          <strong>{{ categoryCount() }}</strong>
          <span>{{ labels().favoriteCategories }}</span>
        </article>
        <article class="couponleo-saved-hero__stat">
          <strong>{{ dealCount() }}</strong>
          <span>{{ labels().favoriteDeals }}</span>
        </article>
      </div>
    </section>

    @if (!isAuthenticated()) {
      <section class="couponleo-page-section">
        <div class="couponleo-copy-card couponleo-saved-sync-card">
          <div>
            <strong>{{ labels().signInSync }}</strong>
            <p>{{ labels().localSync }}</p>
          </div>
          <a class="couponleo-button couponleo-button--ghost" routerLink="/sign-in">{{ labels().signIn }}</a>
        </div>
      </section>
    }

    @if (savedItems().length) {
      <section class="couponleo-page-section couponleo-saved-sections">
        <article class="couponleo-saved-section">
          <div class="couponleo-section-heading couponleo-saved-section__heading">
            <div class="couponleo-saved-section__title">
              <span class="couponleo-saved-section__icon couponleo-saved-section__icon--blue" aria-hidden="true">
                <app-couponleo-eon-icon [svg]="buildingStoreIconSvg"></app-couponleo-eon-icon>
              </span>
              <div>
                <h2>{{ labels().favoriteStores }}</h2>
                <p>{{ labels().favoriteStoresCopy }}</p>
              </div>
            </div>
            <span class="couponleo-saved-section__count">{{ storeCount() }} {{ labels().saved }}</span>
          </div>

          @if (favoriteStores().length > 0) {
            <div class="couponleo-saved-grid">
              @for (item of favoriteStores(); track item.id) {
                <article class="couponleo-card couponleo-saved-card">
                  <div class="couponleo-saved-card__top">
                    <span class="couponleo-saved-card__badge">{{ kindLabel(item) }}</span>
                    <app-couponleo-favorite-button
                      [active]="true"
                      [ariaLabel]="labels().removeFavoriteStore"
                      (toggled)="removeSavedItem(item.id)"
                    ></app-couponleo-favorite-button>
                  </div>

                  <div class="couponleo-saved-card__copy">
                    <h3>{{ item.title }}</h3>
                    <p class="couponleo-saved-card__subtitle">{{ item.subtitle }}</p>
                    <p>{{ item.description }}</p>
                  </div>

                  <a class="couponleo-button couponleo-button--ghost couponleo-saved-card__link" [routerLink]="item.route">
                    {{ labels().openStore }}
                  </a>
                </article>
              }
            </div>
          } @else {
            <div class="couponleo-saved-section__empty">
              {{ labels().noFavoriteStores }}
            </div>
          }
        </article>

        <article class="couponleo-saved-section">
          <div class="couponleo-section-heading couponleo-saved-section__heading">
            <div class="couponleo-saved-section__title">
              <span class="couponleo-saved-section__icon couponleo-saved-section__icon--orange" aria-hidden="true">
                <app-couponleo-eon-icon [svg]="cardboardsIconSvg"></app-couponleo-eon-icon>
              </span>
              <div>
                <h2>{{ labels().favoriteCategories }}</h2>
                <p>{{ labels().favoriteCategoriesCopy }}</p>
              </div>
            </div>
            <span class="couponleo-saved-section__count">{{ categoryCount() }} {{ labels().saved }}</span>
          </div>

          @if (favoriteCategories().length > 0) {
            <div class="couponleo-saved-grid">
              @for (item of favoriteCategories(); track item.id) {
                <article class="couponleo-card couponleo-saved-card">
                  <div class="couponleo-saved-card__top">
                    <span class="couponleo-saved-card__badge">{{ kindLabel(item) }}</span>
                    <app-couponleo-favorite-button
                      [active]="true"
                      [ariaLabel]="labels().removeFavoriteCategory"
                      (toggled)="removeSavedItem(item.id)"
                    ></app-couponleo-favorite-button>
                  </div>

                  <div class="couponleo-saved-card__copy">
                    <h3>{{ item.title }}</h3>
                    <p class="couponleo-saved-card__subtitle">{{ item.subtitle }}</p>
                    <p>{{ item.description }}</p>
                  </div>

                  <a class="couponleo-button couponleo-button--ghost couponleo-saved-card__link" [routerLink]="item.route">
                    {{ labels().openCategory }}
                  </a>
                </article>
              }
            </div>
          } @else {
            <div class="couponleo-saved-section__empty">
              {{ labels().noFavoriteCategories }}
            </div>
          }
        </article>

        <article class="couponleo-saved-section">
          <div class="couponleo-section-heading couponleo-saved-section__heading">
            <div class="couponleo-saved-section__title">
              <span class="couponleo-saved-section__icon couponleo-saved-section__icon--rose" aria-hidden="true">
                <app-couponleo-eon-icon [svg]="tagIconSvg"></app-couponleo-eon-icon>
              </span>
              <div>
                <h2>{{ labels().favoriteDeals }}</h2>
                <p>{{ labels().favoriteDealsCopy }}</p>
              </div>
            </div>
            <span class="couponleo-saved-section__count">{{ dealCount() }} {{ labels().saved }}</span>
          </div>

          @if (favoriteDeals().length > 0) {
            <div class="couponleo-saved-grid">
              @for (item of favoriteDeals(); track item.id) {
                <article class="couponleo-card couponleo-saved-card">
                  <div class="couponleo-saved-card__top">
                    <span class="couponleo-saved-card__badge">{{ kindLabel(item) }}</span>
                    <app-couponleo-favorite-button
                      [active]="true"
                      [ariaLabel]="labels().removeFavoriteDeal"
                      (toggled)="removeSavedItem(item.id)"
                    ></app-couponleo-favorite-button>
                  </div>

                  <div class="couponleo-saved-card__copy">
                    <h3>{{ item.title }}</h3>
                    <p class="couponleo-saved-card__subtitle">{{ item.subtitle }}</p>
                    <p>{{ item.description }}</p>
                  </div>

                  @if (item.code) {
                    <div class="couponleo-saved-card__actions">
                      <button type="button" class="couponleo-code couponleo-code--masked" (click)="openCoupon(item)">
                        {{ maskCode(item.code) }}
                      </button>
                      <button type="button" class="couponleo-button couponleo-button--solid" (click)="openCoupon(item)">
                        {{ labels().revealCode }}
                      </button>
                    </div>
                  } @else {
                    <a class="couponleo-button couponleo-button--ghost couponleo-saved-card__link" [routerLink]="item.route">
                      {{ labels().openDeal }}
                    </a>
                  }
                </article>
              }
            </div>
          } @else {
            <div class="couponleo-saved-section__empty">
              {{ labels().noFavoriteDeals }}
            </div>
          }
        </article>
      </section>
    } @else {
      <section class="couponleo-page-section">
        <div class="couponleo-empty-card couponleo-saved-empty">
          <h3>{{ labels().noWishlist }}</h3>
          <p>{{ labels().noWishlistCopy }}</p>
          <div class="couponleo-saved-empty__actions">
            <a class="couponleo-button couponleo-button--solid" routerLink="/top-deals">{{ labels().browseTopDeals }}</a>
            <a class="couponleo-button couponleo-button--ghost" routerLink="/categories">{{ labels().browseCategories }}</a>
          </div>
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

    .couponleo-saved-hero {
      gap: 20px;
    }

    .couponleo-saved-hero__stats {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 14px;
    }

    .couponleo-saved-hero__nav {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
    }

    .couponleo-saved-hero__nav-link {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 2.8rem;
      padding: 0 16px;
      border: 1px solid rgba(22, 36, 74, 0.08);
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.9);
      color: var(--couponleo-muted);
      font-weight: 800;
      transition: transform 0.2s ease, box-shadow 0.2s ease, color 0.2s ease;
    }

    .couponleo-saved-hero__nav-link:hover,
    .couponleo-saved-hero__nav-link.is-active {
      transform: translateY(-1px);
      color: var(--couponleo-blue);
      box-shadow: 0 12px 26px rgba(18, 35, 77, 0.08);
    }

    .couponleo-saved-hero__nav-link.is-active {
      background: rgba(52, 120, 255, 0.08);
      border-color: rgba(52, 120, 255, 0.16);
    }

    .couponleo-saved-hero__stat,
    .couponleo-saved-sync-card {
      border: 1px solid rgba(255, 255, 255, 0.92);
      background: rgba(255, 255, 255, 0.82);
      box-shadow: 0 14px 30px rgba(18, 35, 77, 0.06);
    }

    .couponleo-saved-hero__stat {
      display: grid;
      gap: 6px;
      padding: 18px 20px;
      border-radius: 22px;
    }

    .couponleo-saved-hero__stat strong,
    .couponleo-saved-sync-card strong,
    .couponleo-saved-card__copy h3 {
      color: var(--couponleo-navy);
    }

    .couponleo-saved-hero__stat strong {
      font-size: 2rem;
      line-height: 1;
    }

    .couponleo-saved-hero__stat span,
    .couponleo-saved-sync-card p,
    .couponleo-saved-card__subtitle {
      color: var(--couponleo-muted);
    }

    .couponleo-saved-sync-card {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
    }

    .couponleo-saved-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 18px;
    }

    .couponleo-saved-sections {
      display: grid;
      gap: 24px;
    }

    .couponleo-saved-section {
      display: grid;
      gap: 16px;
    }

    .couponleo-saved-section__heading {
      align-items: center;
      gap: 16px;
    }

    .couponleo-saved-section__title {
      display: inline-flex;
      align-items: center;
      gap: 14px;
    }

    .couponleo-saved-section__title h2,
    .couponleo-saved-section__title p {
      margin: 0;
    }

    .couponleo-saved-section__title h2 {
      color: var(--couponleo-navy);
    }

    .couponleo-saved-section__title p,
    .couponleo-saved-section__empty,
    .couponleo-saved-section__count {
      color: var(--couponleo-muted);
    }

    .couponleo-saved-section__icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 3rem;
      height: 3rem;
      border-radius: 18px;
    }

    .couponleo-saved-section__icon app-couponleo-eon-icon {
      width: 1.35rem;
      height: 1.35rem;
    }

    .couponleo-saved-section__icon--blue {
      background: rgba(52, 120, 255, 0.1);
      color: var(--couponleo-blue);
    }

    .couponleo-saved-section__icon--orange {
      background: rgba(255, 122, 61, 0.12);
      color: var(--couponleo-orange);
    }

    .couponleo-saved-section__icon--rose {
      background: rgba(255, 124, 148, 0.12);
      color: #ff6d91;
    }

    .couponleo-saved-section__count {
      font-weight: 700;
    }

    .couponleo-saved-section__empty {
      padding: 18px 20px;
      border: 1px dashed rgba(22, 36, 74, 0.14);
      border-radius: 18px;
      background: rgba(255, 255, 255, 0.78);
    }

    .couponleo-saved-card {
      display: grid;
      gap: 16px;
      align-content: start;
    }

    .couponleo-saved-card__top,
    .couponleo-saved-card__actions {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }

    .couponleo-saved-card__badge {
      display: inline-flex;
      align-items: center;
      min-height: 2.2rem;
      padding: 0 12px;
      border-radius: 999px;
      background: rgba(255, 122, 61, 0.12);
      color: var(--couponleo-orange);
      font-size: 0.82rem;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .couponleo-saved-card__copy {
      display: grid;
      gap: 8px;
    }

    .couponleo-saved-card__copy h3 {
      margin: 0;
    }

    .couponleo-saved-card__subtitle {
      margin: 0;
      font-weight: 700;
    }

    .couponleo-saved-card__copy p:last-child {
      margin: 0;
      color: var(--couponleo-muted);
      line-height: 1.65;
    }

    .couponleo-saved-card__link {
      width: 100%;
    }

    .couponleo-saved-empty {
      text-align: center;
    }

    .couponleo-saved-empty__actions {
      display: flex;
      justify-content: center;
      gap: 12px;
      flex-wrap: wrap;
    }

    @media (max-width: 1080px) {
      .couponleo-saved-hero__stats,
      .couponleo-saved-grid {
        grid-template-columns: 1fr 1fr;
      }
    }

    @media (max-width: 780px) {
      .couponleo-saved-hero__stats,
      .couponleo-saved-grid {
        grid-template-columns: 1fr;
      }

      .couponleo-saved-section__title,
      .couponleo-saved-sync-card,
      .couponleo-saved-card__actions {
        flex-direction: column;
        align-items: stretch;
      }

      .couponleo-saved-section__heading {
        align-items: start;
      }
    }
  `],
})
export default class WishlistPage {
  private readonly authService = inject(CouponleoAuthService);
  protected readonly i18n = inject(CouponleoI18nService);
  private readonly savedService = inject(CouponleoSavedService);

  protected readonly savedItems = this.savedService.items;
  protected readonly totalSaved = this.savedService.count;
  protected readonly storeCount = this.savedService.storeCount;
  protected readonly categoryCount = this.savedService.categoryCount;
  protected readonly dealCount = this.savedService.dealCount;
  protected readonly isAuthenticated = this.authService.isAuthenticated;
  protected readonly activeCoupon = signal<CouponleoCouponReveal | null>(null);
  protected readonly buildingStoreIconSvg = buildingStoreIconSvg;
  protected readonly cardboardsIconSvg = cardboardsIconSvg;
  protected readonly tagIconSvg = tagIconSvg;
  protected readonly labels = computed(() => ({
    eyebrow: this.i18n.phrase('Wishlist'),
    title: this.i18n.phrase('Keep high-intent stores, categories, and deals organized before checkout starts.'),
    description: this.i18n.phrase('Wishlist acts as the member holding area for brands, category research, and verified offers worth revisiting. It keeps saved signals tidy, separates discovery from redemption, and gives the rest of the CouponLeo support experience a stable reference point.'),
    wishlistItems: this.i18n.phrase('Wishlist items'),
    favoriteStores: this.i18n.phrase('Favorite Stores'),
    favoriteCategories: this.i18n.phrase('Favorite Categories'),
    favoriteDeals: this.i18n.phrase('Favorite Deals'),
    supportNavigation: this.i18n.phrase('Support navigation'),
    helpCenter: this.i18n.phrase('Help Center'),
    termsOfUse: this.i18n.phrase('Terms of Use'),
    privacyPolicy: this.i18n.phrase('Privacy Policy'),
    signInSync: this.i18n.phrase('Sign in to attach these wishlist items to your account session.'),
    localSync: this.i18n.phrase('Until then, the current wishlist remains available only in this browser on this device.'),
    signIn: this.i18n.phrase('Sign In'),
    favoriteStoresCopy: this.i18n.phrase('Keep preferred merchants visible so repeat shopping journeys start from the right storefront.'),
    favoriteCategoriesCopy: this.i18n.phrase('Cluster saved buying intents before shoppers drill back into the live catalog.'),
    favoriteDealsCopy: this.i18n.phrase('Hold verified discounts and coupon codes in one place until the next checkout decision.'),
    saved: this.i18n.phrase('saved'),
    openStore: this.i18n.phrase('Open Store'),
    openCategory: this.i18n.phrase('Open Category'),
    revealCode: this.i18n.phrase('Reveal Code'),
    openDeal: this.i18n.phrase('Open Deal'),
    removeFavoriteStore: this.i18n.phrase('Remove favorite store'),
    removeFavoriteCategory: this.i18n.phrase('Remove favorite category'),
    removeFavoriteDeal: this.i18n.phrase('Remove favorite deal'),
    noFavoriteStores: this.i18n.phrase('No favorite stores yet. Save a store card to keep it here.'),
    noFavoriteCategories: this.i18n.phrase('No favorite categories yet. Save a category to build a faster browsing path.'),
    noFavoriteDeals: this.i18n.phrase('No favorite deals yet. Save any live offer or coupon to keep it ready here.'),
    noWishlist: this.i18n.phrase('No wishlist items yet'),
    noWishlistCopy: this.i18n.phrase('Tap the favorite icon on any store, category, deal, or coupon card to keep it here.'),
    browseTopDeals: this.i18n.phrase('Browse Top Deals'),
    browseCategories: this.i18n.phrase('Browse Categories'),
  }));
  protected readonly favoriteStores = computed(() => this.savedItems().filter((item) => item.kind === 'store'));
  protected readonly favoriteCategories = computed(() => this.savedItems().filter((item) => item.kind === 'category'));
  protected readonly favoriteDeals = computed(() => (
    this.savedItems().filter((item) => item.kind === 'deal' || item.kind === 'coupon')
  ));

  protected kindLabel(item: CouponleoSavedItem): string {
    if (item.kind === 'store') {
      return this.i18n.phrase('Favorite Store');
    }

    if (item.kind === 'category') {
      return this.i18n.phrase('Favorite Category');
    }

    return this.i18n.phrase('Favorite Deal');
  }

  protected removeSavedItem(id: string): void {
    this.savedService.remove(id);
  }

  protected openCoupon(item: CouponleoSavedItem): void {
    if (!item.code) {
      return;
    }

    this.activeCoupon.set({
      title: item.title,
      subtitle: item.subtitle,
      description: item.description,
      code: item.code,
      route: item.route,
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
