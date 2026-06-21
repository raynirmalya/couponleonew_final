import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { distinctUntilChanged, map, startWith } from 'rxjs';
import bookmarkIconSvg from '@eonui/icons/svg/office/eon-bookmark.svg?raw';
import { CouponleoEonIconComponent } from './couponleo-eon-icon.component';
import {
  type CouponleoLocation,
  CouponleoApiService,
} from '../services/couponleo-api.service';
import { CouponleoAuthService } from '../services/couponleo-auth.service';
import { createLoadingState, withRequestState } from '../services/couponleo-request-state.helpers';
import { CouponleoSavedService } from '../services/couponleo-saved.service';
import {
  buildCountryOptions,
  normalizeCountryRouteValue,
} from '../services/couponleo-ui.helpers';
import { CouponleoI18nService } from '../services/couponleo-i18n.service';
import { CouponleoLocaleService } from '../services/couponleo-locale.service';

interface HeaderLink {
  href: string;
  label: string;
}

function emptyListResponse<T>() {
  return { items: [] as T[], total: 0 };
}

@Component({
  selector: 'app-couponleo-header',
  imports: [RouterLink, RouterLinkActive, CouponleoEonIconComponent],
  template: `
    <header class="couponleo-header">
      <div class="couponleo-nav-shell" [class.is-open]="menuOpen()">
        <div class="couponleo-nav-shell__bar">
          <a class="couponleo-brand" routerLink="/" queryParamsHandling="preserve" [attr.aria-label]="copy().couponleoHome" (click)="closeMenu()">
            <span class="couponleo-brand__image-shell">
              <img class="couponleo-brand__image" src="/images/couponleo-logo.png" alt="CouponLeo">
            </span>
          </a>

          <button
            class="couponleo-nav__toggle"
            type="button"
            (click)="toggleMenu()"
            [attr.aria-label]="copy().menu"
            aria-controls="couponleo-mobile-nav"
            [attr.aria-expanded]="menuOpen()"
          >
            <span></span>
            <span></span>
            <span></span>
          </button>
        </div>

        <div class="couponleo-nav__panel" [class.is-open]="menuOpen()" id="couponleo-mobile-nav">
          <div class="couponleo-nav__panel-inner">
            <nav class="couponleo-nav" aria-label="Primary navigation">
              @for (link of navLinks(); track link.href) {
                <a
                  class="couponleo-nav__link"
                  [routerLink]="link.href"
                  queryParamsHandling="preserve"
                  routerLinkActive="is-active"
                  [routerLinkActiveOptions]="{ exact: link.href === '/' }"
                  (click)="closeMenu()"
                >
                  {{ link.label }}
                </a>
              }
            </nav>

            <div class="couponleo-nav__actions">
              <label class="couponleo-nav__market">
                <span class="couponleo-nav__sr-only">{{ copy().market }}</span>
                <select
                  [attr.aria-label]="copy().market"
                  [value]="selectedCountry()"
                  [disabled]="locationsState().loading"
                  (change)="handleCountryChange($event)"
                >
                  @for (option of countryOptions(); track option.value) {
                    <option [value]="option.value">{{ option.label }}</option>
                  }
                </select>
              </label>

              <label class="couponleo-nav__locale">
                <span class="couponleo-nav__sr-only">{{ copy().language }}</span>
                <select
                  [attr.aria-label]="copy().language"
                  [value]="selectedLocale()"
                  (change)="handleLocaleChange($event)"
                >
                  @for (option of localeOptions(); track option.value) {
                    <option [value]="option.value">{{ option.label }}</option>
                  }
                </select>
              </label>

              <a
                class="couponleo-nav__saved"
                routerLink="/wishlist"
                queryParamsHandling="preserve"
                [attr.aria-label]="copy().wishlist"
                [attr.title]="copy().wishlist"
                (click)="closeMenu()"
              >
                <span class="couponleo-nav__saved-label">{{ copy().wishlist }}</span>
                <app-couponleo-eon-icon [svg]="bookmarkIconSvg"></app-couponleo-eon-icon>
                @if (savedCount()) {
                  <span class="couponleo-nav__saved-count">{{ savedCount() }}</span>
                }
              </a>

              @if (isAuthenticated()) {
                <a class="couponleo-nav__account" routerLink="/dashboard" queryParamsHandling="preserve" (click)="closeMenu()">
                  {{ accountLabel() }}
                </a>
                <button type="button" class="couponleo-button couponleo-button--ghost" (click)="handleSignOut()">
                  {{ copy().signOut }}
                </button>
              } @else {
                <a class="couponleo-button couponleo-button--ghost" routerLink="/sign-in" queryParamsHandling="preserve" (click)="closeMenu()">{{ copy().signIn }}</a>
                <a class="couponleo-button couponleo-button--solid" routerLink="/sign-up" queryParamsHandling="preserve" (click)="closeMenu()">{{ copy().signUp }}</a>
              }
            </div>
          </div>
        </div>
      </div>
    </header>
  `,
  styles: [`
    .couponleo-nav__actions {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: nowrap;
    }

    .couponleo-nav__market {
      display: inline-flex;
      align-items: center;
      min-width: 14rem;
    }

    .couponleo-nav__locale {
      display: inline-flex;
      align-items: center;
      min-width: 9.5rem;
    }

    .couponleo-nav__locale select,
    .couponleo-nav__market select {
      width: 100%;
      min-height: 2.85rem;
      padding: 0 0.9rem;
      border: 1px solid rgba(22, 36, 74, 0.12);
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.96);
      color: var(--couponleo-text);
      font-size: 0.94rem;
      font-weight: 700;
      box-shadow: 0 10px 22px rgba(18, 35, 77, 0.06);
    }

    .couponleo-nav__locale select:focus,
    .couponleo-nav__market select:focus {
      outline: none;
      border-color: rgba(52, 120, 255, 0.34);
      box-shadow: 0 0 0 3px rgba(52, 120, 255, 0.1);
    }

    .couponleo-nav__sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }

    .couponleo-nav__saved {
      position: relative;
      display: inline-grid;
      place-items: center;
      width: 2.85rem;
      min-width: 2.85rem;
      height: 2.85rem;
      padding: 0;
      gap: 0;
      border: 1px solid rgba(22, 36, 74, 0.12);
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.96);
      box-shadow: 0 10px 22px rgba(18, 35, 77, 0.08);
    }

    .couponleo-nav__saved app-couponleo-eon-icon {
      width: 1.08rem;
      height: 1.08rem;
      color: var(--couponleo-orange);
    }

    .couponleo-nav__saved-label {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }

    .couponleo-nav__saved-count {
      position: absolute;
      top: -0.18rem;
      right: -0.12rem;
      min-width: 1.3rem;
      height: 1.3rem;
      padding: 0 0.32rem;
      font-size: 0.72rem;
      line-height: 1;
      box-shadow: 0 8px 18px rgba(35, 85, 246, 0.24);
    }

    @media (max-width: 960px) {
      .couponleo-nav__actions {
        align-items: stretch;
        flex-wrap: wrap;
      }

      .couponleo-nav__locale,
      .couponleo-nav__market {
        width: 100%;
        min-width: 0;
      }

      .couponleo-nav__saved {
        width: 2.85rem;
      }
    }
  `],
})
export class CouponleoHeaderComponent {
  private readonly api = inject(CouponleoApiService);
  private readonly authService = inject(CouponleoAuthService);
  private readonly i18n = inject(CouponleoI18nService);
  private readonly localeService = inject(CouponleoLocaleService);
  private readonly savedService = inject(CouponleoSavedService);
  private readonly router = inject(Router);

  protected readonly menuOpen = signal(false);
  protected readonly navLinks = computed<HeaderLink[]>(() => [
    { href: '/stores', label: this.i18n.t('nav.stores') },
    { href: '/categories', label: this.i18n.t('nav.categories') },
    { href: '/country-deals', label: this.i18n.t('nav.countryDeals') },
    { href: '/top-deals', label: this.i18n.t('nav.topDeals') },
    { href: '/blog', label: this.i18n.t('nav.blog') },
  ]);
  protected readonly isAuthenticated = this.authService.isAuthenticated;
  protected readonly localeOptions = this.localeService.localeOptions;
  protected readonly savedCount = this.savedService.count;
  protected readonly selectedLocale = this.localeService.locale;
  protected readonly selectedCountry = signal('all');
  protected readonly bookmarkIconSvg = bookmarkIconSvg;
  protected readonly copy = computed(() => ({
    couponleoHome: this.i18n.t('common.couponleoHome'),
    language: this.i18n.t('common.language'),
    market: this.i18n.t('common.market'),
    menu: this.i18n.t('common.toggleMenu'),
    shopper: this.i18n.t('nav.shopper'),
    signIn: this.i18n.t('nav.signIn'),
    signOut: this.i18n.t('nav.signOut'),
    signUp: this.i18n.t('nav.signUp'),
    wishlist: this.i18n.t('nav.wishlist'),
  }));
  protected readonly accountLabel = computed(() => {
    const shopperLabel = this.copy().shopper;
    const fullName = this.authService.session()?.fullName?.trim() ?? shopperLabel;
    const firstName = fullName.split(/\s+/)[0] ?? shopperLabel;
    return this.i18n.t('nav.helloName', { name: firstName });
  });
  protected readonly locationsState = toSignal(
    withRequestState(this.api.listLocations({ pageSize: 250 }), emptyListResponse<CouponleoLocation>()),
    { initialValue: createLoadingState(emptyListResponse<CouponleoLocation>()) },
  );
  private readonly locationsResponse = computed(() => this.locationsState().data);
  protected readonly countryOptions = computed(() => buildCountryOptions(
    this.locationsResponse().items,
    this.i18n.t('common.allMarkets'),
    false,
  ));

  constructor() {
    this.router.events
      .pipe(
        startWith(null),
        map(() => this.currentCountryFromUrl()),
        distinctUntilChanged(),
        takeUntilDestroyed(),
      )
      .subscribe((country) => {
        this.selectedCountry.set(country);
      });
  }

  protected toggleMenu(): void {
    this.menuOpen.update((value) => !value);
  }

  protected closeMenu(): void {
    this.menuOpen.set(false);
  }

  protected handleSignOut(): void {
    this.authService.signOut();
    this.closeMenu();
    void this.router.navigateByUrl('/');
  }

  protected handleCountryChange(event: Event): void {
    const target = event.target as HTMLSelectElement | null;
    void this.updateCountry(target?.value ?? 'all');
  }

  protected handleLocaleChange(event: Event): void {
    const target = event.target as HTMLSelectElement | null;
    this.localeService.setLocale(target?.value ?? 'en-US');
  }

  private currentCountryFromUrl(): string {
    const currentTree = this.router.parseUrl(this.router.url || '/');
    const rawCountry = currentTree.queryParams['country'];
    return normalizeCountryRouteValue(typeof rawCountry === 'string' ? rawCountry : null);
  }

  private async updateCountry(country: string, shouldCloseMenu = true): Promise<void> {
    const normalizedCountry = normalizeCountryRouteValue(country);
    const currentCountry = this.currentCountryFromUrl();

    if (shouldCloseMenu) {
      this.closeMenu();
    }

    if (currentCountry === normalizedCountry) {
      return;
    }

    const currentTree = this.router.parseUrl(this.router.url || '/');
    const nextQueryParams = { ...currentTree.queryParams };

    if (normalizedCountry === 'all') {
      delete nextQueryParams['country'];
    } else {
      nextQueryParams['country'] = normalizedCountry;
    }

    currentTree.queryParams = nextQueryParams;
    await this.router.navigateByUrl(currentTree, { replaceUrl: true });
  }
}
