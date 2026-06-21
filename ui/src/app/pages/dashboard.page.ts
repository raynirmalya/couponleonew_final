import { Component, computed, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { CouponleoEonIconComponent } from '../components/couponleo-eon-icon.component';
import { CouponleoAuthService } from '../services/couponleo-auth.service';
import { CouponleoI18nService } from '../services/couponleo-i18n.service';
import { CouponleoPageContentService } from '../services/couponleo-page-content.service';
import { createStaticRouteMeta } from '../services/couponleo-route-meta';
import { buildStoreRoute, formatExpiryLabel, getCategoryPresentation, slugifyLabel } from '../services/couponleo-ui.helpers';
import type { CouponleoSavedItem } from '../services/couponleo-saved.service';

import shoppingCartIconSvg from '@eonui/icons/svg/commerce/eon-shopping-cart.svg?raw';
import storefrontIconSvg from '@eonui/icons/svg/commerce/eon-storefront.svg?raw';
import tagIconSvg from '@eonui/icons/svg/commerce/eon-tag.svg?raw';
import gridIconSvg from '@eonui/icons/svg/design/eon-grid-3x3.svg?raw';
import heartIconSvg from '@eonui/icons/svg/design/eon-heart.svg?raw';
import homeIconSvg from '@eonui/icons/svg/maps/eon-home.svg?raw';
import bookmarkIconSvg from '@eonui/icons/svg/office/eon-bookmark.svg?raw';
import ticketIconSvg from '@eonui/icons/svg/office/eon-ticket.svg?raw';
import bellIconSvg from '@eonui/icons/svg/system/eon-bell.svg?raw';
import settingsIconSvg from '@eonui/icons/svg/system/eon-settings.svg?raw';

interface DashboardNavItem {
  label: string;
  href: string;
  icon: string;
  active?: boolean;
}

interface DashboardMetric {
  label: string;
  value: string;
  icon: string;
}

interface SavedDeal {
  id: string;
  title: string;
  category: string;
  expiry: string;
  imageSrc: string;
  route: string;
}

interface DashboardNotification {
  title: string;
  copy: string;
  time: string;
  tone: 'orange' | 'blue' | 'pink';
  icon: string;
}

interface WorkspaceCard {
  badge: string;
  title: string;
  copy: string;
  href: string;
  cta: string;
  tone: 'sand' | 'blue' | 'orange' | 'navy';
  icon: string;
}

interface ActivityItem {
  title: string;
  detail: string;
  saved: string;
  time: string;
  tone: 'orange' | 'blue' | 'pink';
  icon: string;
}

const categoryAssetBase = '/assets/images/categories';

const dashboardNavItems: DashboardNavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: homeIconSvg, active: true },
  { label: 'Wishlist', href: '/wishlist', icon: heartIconSvg },
  { label: 'My Coupons', href: '/my-coupons', icon: ticketIconSvg },
  { label: 'Alerts', href: '/alerts', icon: bellIconSvg },
  { label: 'Settings', href: '/settings', icon: settingsIconSvg },
];

export const routeMeta = createStaticRouteMeta({
  title: 'Dashboard | CouponLeo',
  description: 'Open the CouponLeo member dashboard for wishlist items, alerts, active coupons, and savings activity.',
  robots: 'noindex,follow',
});

function daysUntil(expiresAt: string): number | null {
  if (!expiresAt) {
    return null;
  }

  const expiry = new Date(`${expiresAt}T00:00:00`);
  if (Number.isNaN(expiry.getTime())) {
    return null;
  }

  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.ceil((expiry.getTime() - startOfToday.getTime()) / 86_400_000);
}

function activityToneFromSavedItem(item: CouponleoSavedItem): 'orange' | 'blue' | 'pink' {
  if (item.kind === 'deal' || item.kind === 'coupon') {
    return 'orange';
  }

  if (item.kind === 'category') {
    return 'pink';
  }

  return 'blue';
}

@Component({
  selector: 'app-dashboard-page',
  imports: [RouterLink, CouponleoEonIconComponent],
  template: `
    @if (session(); as user) {
      <section class="couponleo-dashboard-shell">
        <aside class="couponleo-dashboard-shell__sidebar">
          <div class="couponleo-dashboard-shell__sidebar-head">
            <span class="couponleo-eyebrow">{{ labels().memberWorkspace }}</span>
            <strong>{{ labels().memberWorkspaceCopy }}</strong>
            <p>{{ labels().memberWorkspaceDescription }}</p>
          </div>

          <nav class="couponleo-dashboard-shell__nav" [attr.aria-label]="labels().dashboardNavigation">
            @for (item of dashboardNavItems(); track item.label) {
              <a
                class="couponleo-dashboard-shell__nav-item"
                [class.is-active]="item.active"
                [routerLink]="item.href"
              >
                <span class="couponleo-dashboard-shell__nav-icon" aria-hidden="true">
                  <app-couponleo-eon-icon [svg]="item.icon"></app-couponleo-eon-icon>
                </span>
                <span>{{ item.label }}</span>
              </a>
            }
          </nav>

        </aside>

        <div class="couponleo-dashboard-shell__main">
          <header class="couponleo-dashboard-shell__topbar">
            <div class="couponleo-dashboard-shell__topbar-copy">
              <span class="couponleo-eyebrow">{{ labels().dashboardDesk }}</span>
              <strong>{{ labels().dashboardDeskTitle }}</strong>
              <p>{{ labels().dashboardDeskCopy }}</p>
            </div>

            <div class="couponleo-dashboard-shell__topbar-actions">
              <a class="couponleo-button couponleo-button--solid" routerLink="/alerts">
                {{ labels().manageAlerts }}
              </a>

              <button type="button" class="couponleo-button couponleo-button--ghost" (click)="signOut()">
                {{ labels().signOut }}
              </button>

              <div class="couponleo-dashboard-shell__profile-pill">
                <span class="couponleo-dashboard-shell__avatar">{{ userInitials() }}</span>
                <div>
                  <strong>{{ user.fullName }}</strong>
                  <span>{{ authLabel() }}</span>
                </div>
              </div>
            </div>
          </header>

          <div class="couponleo-dashboard-shell__hero-grid">
            <div class="couponleo-dashboard-shell__lead-stack">
              <article class="couponleo-dashboard-card couponleo-dashboard-card--summary">
                <div class="couponleo-dashboard-card__summary-copy">
                  <span class="couponleo-dashboard-card__kicker">{{ labels().memberSnapshot }}</span>
                  <h1>{{ primaryCoverageValue() }}</h1>
                  <p>{{ primaryCoverageCopy() }}</p>
                  <span class="couponleo-dashboard-card__growth">{{ primaryCoverageAccent() }}</span>
                </div>

                <img
                  class="couponleo-dashboard-card__summary-visual"
                  src="/assets/images/heroes/category-hero.png"
                  alt="Shopping bags and deals visual"
                  loading="lazy"
                >

                <div class="couponleo-dashboard-card__metric-grid">
                  @for (item of summaryMetrics(); track item.label) {
                    <div class="couponleo-dashboard-card__metric-pill">
                      <span class="couponleo-dashboard-card__metric-icon" aria-hidden="true">
                        <app-couponleo-eon-icon [svg]="item.icon"></app-couponleo-eon-icon>
                      </span>
                      <div>
                        <span>{{ item.label }}</span>
                        <strong>{{ item.value }}</strong>
                      </div>
                    </div>
                  }
                </div>
              </article>

              <article class="couponleo-dashboard-card couponleo-dashboard-card--overview">
                <div class="couponleo-dashboard-card__header">
                  <div>
                    <h2>{{ labels().catalogCoverage }}</h2>
                    <p>{{ labels().currentLiveFootprint }}</p>
                  </div>
                  <span class="couponleo-dashboard-card__filter">{{ labels().live }}</span>
                </div>

                <strong class="couponleo-dashboard-card__overview-value">{{ marketCoverageValue() }}</strong>

                <div class="couponleo-dashboard-card__overview-stack">
                  @for (fact of overviewFacts(); track fact.label) {
                    <article class="couponleo-dashboard-card__overview-row">
                      <div class="couponleo-dashboard-card__overview-copy">
                        <strong>{{ fact.value }}</strong>
                        <span>{{ fact.label }}</span>
                      </div>
                      <div class="couponleo-dashboard-card__overview-bar" aria-hidden="true">
                        <span [style.width.%]="fact.share"></span>
                      </div>
                    </article>
                  }
                </div>
              </article>
            </div>

            <div class="couponleo-dashboard-shell__side-stack">
              <article class="couponleo-dashboard-card couponleo-dashboard-card--saved">
                <div class="couponleo-dashboard-card__header">
                  <div>
                    <h2>{{ labels().wishlist }}</h2>
                    <p>{{ labels().wishlistCopy }}</p>
                  </div>
                  <a routerLink="/wishlist">{{ labels().viewAll }}</a>
                </div>

                <div class="couponleo-dashboard-card__saved-list">
                  @for (deal of savedDeals(); track deal.id) {
                    <a class="couponleo-dashboard-card__saved-item" [routerLink]="deal.route">
                      <div class="couponleo-dashboard-card__saved-thumb">
                        <img [src]="deal.imageSrc" [alt]="deal.category + ' deal image'" loading="lazy">
                      </div>
                      <div class="couponleo-dashboard-card__saved-copy">
                        <strong>{{ deal.title }}</strong>
                        <span>{{ deal.category }}</span>
                        <small>{{ deal.expiry }}</small>
                      </div>
                    </a>
                  }
                </div>
              </article>

              <article class="couponleo-dashboard-card couponleo-dashboard-card--notifications">
                <div class="couponleo-dashboard-card__header">
                  <div>
                    <h2>{{ labels().alertCenter }}</h2>
                    <p>{{ labels().alertCenterCopy }}</p>
                  </div>
                  <a routerLink="/alerts">{{ labels().openQueue }}</a>
                </div>

                <div class="couponleo-dashboard-card__alert-summary">
                  <div>
                    <strong>{{ notificationCount() }}</strong>
                    <span>{{ labels().alertsNeedAttention }}</span>
                  </div>
                  <a routerLink="/alerts">{{ labels().manageAlerts }}</a>
                </div>

                <div class="couponleo-dashboard-card__notification-actions">
                  <a routerLink="/alerts">{{ labels().openQueue }}</a>
                  <a routerLink="/wishlist">{{ labels().reviewWishlist }}</a>
                </div>

                <div class="couponleo-dashboard-card__notification-list">
                  @for (item of dashboardNotifications(); track item.title + item.time) {
                    <article class="couponleo-dashboard-card__notification-item">
                      <span
                        class="couponleo-dashboard-card__notification-icon"
                        [class]="'couponleo-dashboard-card__notification-icon couponleo-dashboard-card__notification-icon--' + item.tone"
                        aria-hidden="true"
                      >
                        <app-couponleo-eon-icon [svg]="item.icon"></app-couponleo-eon-icon>
                      </span>
                      <div class="couponleo-dashboard-card__notification-copy">
                        <strong>{{ item.title }}</strong>
                        <p>{{ item.copy }}</p>
                        <small>{{ item.time }}</small>
                      </div>
                    </article>
                  }
                </div>
              </article>
            </div>
          </div>

          <div class="couponleo-dashboard-shell__grid">
            <article class="couponleo-dashboard-card couponleo-dashboard-card--workspace">
              <div class="couponleo-dashboard-card__header">
                <div>
                  <h2>{{ labels().nextActions }}</h2>
                  <p>{{ labels().nextActionsCopy }}</p>
                </div>
                <a routerLink="/alerts">{{ labels().manageAlerts }}</a>
              </div>

              <div class="couponleo-dashboard-card__workspace-grid">
                @for (card of workspaceCards(); track card.title) {
                  <article [class]="'couponleo-dashboard-workspace-card couponleo-dashboard-workspace-card--' + card.tone">
                    <span class="couponleo-dashboard-workspace-card__icon" aria-hidden="true">
                      <app-couponleo-eon-icon [svg]="card.icon"></app-couponleo-eon-icon>
                    </span>
                    <span class="couponleo-card__badge">{{ card.badge }}</span>
                    <strong>{{ card.title }}</strong>
                    <p>{{ card.copy }}</p>
                    <a [routerLink]="card.href">{{ card.cta }}</a>
                  </article>
                }
              </div>
            </article>

            <article class="couponleo-dashboard-card couponleo-dashboard-card--activity">
              <div class="couponleo-dashboard-card__header">
                <div>
                  <h2>{{ labels().recentActivity }}</h2>
                  <p>{{ labels().recentActivityCopy }}</p>
                </div>
                <a routerLink="/my-coupons">View all</a>
              </div>

              <div class="couponleo-dashboard-card__activity-list">
                @for (item of recentActivity(); track item.title + item.time) {
                  <article class="couponleo-dashboard-card__activity-item">
                    <span
                      class="couponleo-dashboard-card__activity-icon"
                      [class]="'couponleo-dashboard-card__activity-icon couponleo-dashboard-card__activity-icon--' + item.tone"
                      aria-hidden="true"
                    >
                      <app-couponleo-eon-icon [svg]="item.icon"></app-couponleo-eon-icon>
                    </span>
                    <div>
                      <strong>{{ item.title }}</strong>
                      <p>{{ item.detail }}</p>
                      @if (item.saved) {
                        <small>{{ item.saved }}</small>
                      }
                    </div>
                    <time>{{ item.time }}</time>
                  </article>
                }
              </div>
            </article>
          </div>
        </div>
      </section>
    } @else {
      <section class="couponleo-page-hero couponleo-page-hero--soft">
        <span class="couponleo-eyebrow">Dashboard</span>
        <h1>Sign in to open your dashboard.</h1>
        <p>This area becomes active after email login, signup, or Google login through AuthBridge.</p>
        <div class="couponleo-dashboard-shell__empty-actions">
          <a class="couponleo-button couponleo-button--solid" routerLink="/sign-in">Go to Sign In</a>
          <a class="couponleo-button couponleo-button--ghost" routerLink="/sign-up">Create Account</a>
        </div>
      </section>
    }
  `,
  styles: [`
    :host {
      display: block;
    }

    .couponleo-dashboard-shell {
      display: grid;
      grid-template-columns: minmax(210px, 232px) minmax(0, 1fr);
      gap: 22px;
      width: min(1280px, calc(100% - 32px));
      margin: 0 auto;
      padding: 26px 0 30px;
    }

    .couponleo-dashboard-shell__sidebar,
    .couponleo-dashboard-card,
    .couponleo-dashboard-shell__topbar {
      border: 1px solid rgba(255, 255, 255, 0.94);
      background: rgba(255, 255, 255, 0.94);
      box-shadow: var(--couponleo-shadow);
    }

    .couponleo-dashboard-shell__main,
    .couponleo-dashboard-card,
    .couponleo-dashboard-card__header > div {
      min-width: 0;
    }

    .couponleo-dashboard-shell__sidebar {
      display: grid;
      gap: 18px;
      align-content: start;
      padding: 22px 18px;
      border-radius: 30px;
      background:
        radial-gradient(circle at left top, rgba(255, 174, 71, 0.12), transparent 34%),
        linear-gradient(180deg, rgba(255, 255, 255, 0.98) 0%, rgba(248, 250, 255, 0.95) 100%);
    }

    .couponleo-dashboard-shell__sidebar-head {
      display: grid;
      gap: 8px;
    }

    .couponleo-dashboard-shell__sidebar-head strong,
    .couponleo-dashboard-shell__topbar strong,
    .couponleo-dashboard-card h1,
    .couponleo-dashboard-card h2,
    .couponleo-dashboard-card strong {
      color: var(--couponleo-navy);
    }

    .couponleo-dashboard-shell__sidebar-head strong {
      font-size: 1.5rem;
      letter-spacing: -0.04em;
    }

    .couponleo-dashboard-shell__sidebar-head p,
    .couponleo-dashboard-card p,
    .couponleo-dashboard-shell__profile-pill span {
      margin: 0;
      color: var(--couponleo-muted);
    }

    .couponleo-dashboard-shell__nav {
      display: grid;
      gap: 6px;
    }

    .couponleo-dashboard-shell__nav-item {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 12px;
      align-items: center;
      padding: 12px 14px;
      border-radius: 18px;
      color: var(--couponleo-navy);
      font-weight: 700;
      transition: background 0.2s ease, color 0.2s ease, transform 0.2s ease;
    }

    .couponleo-dashboard-shell__nav-item:hover,
    .couponleo-dashboard-shell__nav-item.is-active {
      background: linear-gradient(135deg, #2f6df6 0%, #4d8bff 100%);
      color: #fff;
      transform: translateX(2px);
    }

    .couponleo-dashboard-shell__nav-icon,
    .couponleo-dashboard-card__metric-icon,
    .couponleo-dashboard-card__notification-icon,
    .couponleo-dashboard-card__activity-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }

    .couponleo-dashboard-shell__nav-icon {
      width: 2rem;
      height: 2rem;
      border-radius: 12px;
      background: rgba(47, 109, 246, 0.08);
      color: var(--couponleo-blue);
    }

    .couponleo-dashboard-shell__nav-item.is-active .couponleo-dashboard-shell__nav-icon,
    .couponleo-dashboard-shell__nav-item:hover .couponleo-dashboard-shell__nav-icon {
      background: rgba(255, 255, 255, 0.14);
      color: #fff;
    }

    .couponleo-dashboard-shell__main {
      display: grid;
      gap: 18px;
      align-content: start;
    }

    .couponleo-dashboard-shell__hero-grid {
      display: grid;
      grid-template-columns: minmax(0, 1.65fr) minmax(320px, 0.95fr);
      gap: 18px;
      align-items: start;
    }

    .couponleo-dashboard-shell__lead-stack {
      display: grid;
      gap: 18px;
      align-content: start;
    }

    .couponleo-dashboard-shell__side-stack {
      display: grid;
      gap: 18px;
    }

    .couponleo-dashboard-shell__topbar {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      gap: 16px;
      padding: 16px 18px;
      border-radius: 24px;
    }

    .couponleo-dashboard-shell__topbar-copy {
      display: grid;
      gap: 6px;
      max-width: 38rem;
    }

    .couponleo-dashboard-shell__topbar-copy strong {
      font-size: 1.45rem;
      letter-spacing: -0.04em;
    }

    .couponleo-dashboard-shell__topbar-copy p {
      margin: 0;
      color: var(--couponleo-muted);
    }

    .couponleo-dashboard-shell__topbar-actions {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
      justify-content: flex-end;
    }

    .couponleo-dashboard-shell__topbar-actions .couponleo-button--solid {
      min-height: 44px;
      padding-inline: 20px;
    }

    .couponleo-dashboard-shell__topbar-actions .couponleo-button--ghost {
      min-height: 44px;
      padding-inline: 18px;
    }

    .couponleo-dashboard-shell__profile-pill {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 12px;
      align-items: center;
      padding: 8px 10px;
      border-radius: 18px;
      background: rgba(248, 250, 255, 0.96);
      border: 1px solid rgba(21, 36, 74, 0.1);
    }

    .couponleo-dashboard-shell__profile-pill strong,
    .couponleo-dashboard-shell__profile-pill span {
      display: block;
    }

    .couponleo-dashboard-shell__avatar {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 2.75rem;
      height: 2.75rem;
      border-radius: 999px;
      background: linear-gradient(135deg, #dae7ff 0%, #edf3ff 100%);
      color: var(--couponleo-blue);
      font-weight: 800;
      text-transform: uppercase;
    }

    .couponleo-dashboard-shell__grid {
      display: grid;
      grid-template-columns: minmax(0, 1.25fr) minmax(300px, 0.95fr);
      gap: 18px;
      align-items: start;
    }

    .couponleo-dashboard-card {
      display: grid;
      gap: 16px;
      padding: 20px;
      border-radius: 28px;
      overflow: hidden;
    }

    .couponleo-dashboard-card h1,
    .couponleo-dashboard-card h2,
    .couponleo-dashboard-card strong {
      margin: 0;
    }

    .couponleo-dashboard-card h2 {
      font-size: 1.22rem;
      letter-spacing: -0.04em;
    }

    .couponleo-dashboard-card__header {
      display: flex;
      align-items: start;
      justify-content: space-between;
      gap: 12px;
    }

    .couponleo-dashboard-card__header > div {
      display: grid;
      gap: 4px;
    }

    .couponleo-dashboard-card__header a {
      color: var(--couponleo-blue);
      font-weight: 800;
      white-space: nowrap;
    }

    .couponleo-dashboard-card--summary {
      position: relative;
      min-height: 17.25rem;
      align-content: space-between;
      padding: 24px;
      background: linear-gradient(135deg, #1051dd 0%, #2f6df6 58%, #3b82ff 100%);
      color: #fff;
    }

    .couponleo-dashboard-card__summary-copy {
      display: grid;
      gap: 6px;
      position: relative;
      z-index: 1;
      max-width: 12rem;
    }

    .couponleo-dashboard-card__summary-copy h1,
    .couponleo-dashboard-card__summary-copy p,
    .couponleo-dashboard-card__summary-copy span {
      color: #fff;
    }

    .couponleo-dashboard-card__summary-copy h1 {
      font-size: clamp(3rem, 6vw, 4rem);
      line-height: 0.95;
      letter-spacing: -0.07em;
    }

    .couponleo-dashboard-card__summary-copy p {
      font-size: 1rem;
      opacity: 0.9;
    }

    .couponleo-dashboard-card__kicker {
      font-size: 0.95rem;
      font-weight: 700;
      opacity: 0.9;
    }

    .couponleo-dashboard-card__growth {
      color: #7eff90;
      font-weight: 800;
    }

    .couponleo-dashboard-card__summary-visual {
      position: absolute;
      right: -0.75rem;
      top: 2.75rem;
      width: min(53%, 15rem);
      height: auto;
      opacity: 0.96;
      filter: drop-shadow(0 26px 32px rgba(11, 31, 87, 0.32));
    }

    .couponleo-dashboard-card__metric-grid {
      position: relative;
      z-index: 1;
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
      margin-top: auto;
    }

    .couponleo-dashboard-card__metric-pill {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 10px;
      align-items: start;
      padding: 14px;
      border-radius: 18px;
      background: rgba(255, 255, 255, 0.94);
      color: var(--couponleo-navy);
    }

    .couponleo-dashboard-card__metric-pill span,
    .couponleo-dashboard-card__metric-pill strong {
      display: block;
      color: var(--couponleo-navy);
    }

    .couponleo-dashboard-card__metric-pill span {
      font-size: 0.82rem;
      color: var(--couponleo-muted);
    }

    .couponleo-dashboard-card__metric-pill strong {
      margin-top: 2px;
      font-size: 1.6rem;
      line-height: 1;
    }

    .couponleo-dashboard-card__metric-icon {
      width: 2.4rem;
      height: 2.4rem;
      border-radius: 14px;
      background: rgba(47, 109, 246, 0.08);
      color: var(--couponleo-blue);
    }

    .couponleo-dashboard-card--saved,
    .couponleo-dashboard-card--notifications,
    .couponleo-dashboard-card--overview,
    .couponleo-dashboard-card--activity {
      align-content: start;
    }

    .couponleo-dashboard-card--saved {
      gap: 14px;
    }

    .couponleo-dashboard-card--notifications {
      gap: 14px;
    }

    .couponleo-dashboard-card--workspace,
    .couponleo-dashboard-card--activity {
      height: 100%;
      align-content: start;
    }

    .couponleo-dashboard-card__saved-list,
    .couponleo-dashboard-card__notification-list,
    .couponleo-dashboard-card__activity-list {
      display: grid;
      gap: 10px;
    }

    .couponleo-dashboard-card__saved-item,
    .couponleo-dashboard-card__notification-item,
    .couponleo-dashboard-card__activity-item {
      display: grid;
      gap: 12px;
      align-items: start;
    }

    .couponleo-dashboard-card__saved-item {
      grid-template-columns: 4.5rem 1fr;
      padding: 12px;
      border-radius: 20px;
      background: rgba(248, 250, 255, 0.94);
      box-shadow: inset 0 0 0 1px rgba(21, 36, 74, 0.06);
      color: inherit;
      text-decoration: none;
      transition: transform 0.2s ease, box-shadow 0.2s ease;
    }

    .couponleo-dashboard-card__saved-item:hover {
      transform: translateY(-1px);
      box-shadow:
        inset 0 0 0 1px rgba(21, 36, 74, 0.06),
        0 16px 28px rgba(19, 38, 82, 0.08);
    }

    .couponleo-dashboard-card__saved-thumb {
      display: grid;
      place-items: center;
      min-height: 4.7rem;
      padding: 8px;
      border-radius: 18px;
      background: rgba(248, 250, 255, 0.96);
      box-shadow: inset 0 0 0 1px rgba(21, 36, 74, 0.06);
    }

    .couponleo-dashboard-card__saved-copy {
      display: grid;
      gap: 4px;
      align-content: start;
    }

    .couponleo-dashboard-card__saved-thumb img {
      width: 100%;
      height: auto;
      object-fit: contain;
    }

    .couponleo-dashboard-card__saved-item strong,
    .couponleo-dashboard-card__saved-item span,
    .couponleo-dashboard-card__saved-item small {
      display: block;
      margin: 0;
    }

    .couponleo-dashboard-card__saved-item span {
      color: var(--couponleo-muted);
      font-size: 0.9rem;
    }

    .couponleo-dashboard-card__saved-item span {
      margin-top: 2px;
    }

    .couponleo-dashboard-card__saved-item small {
      color: var(--couponleo-orange);
      font-weight: 700;
      margin-top: 2px;
    }

    .couponleo-dashboard-card__notification-item,
    .couponleo-dashboard-card__activity-item {
      grid-template-columns: auto 1fr auto;
      padding: 12px 0;
      border-top: 1px solid rgba(21, 36, 74, 0.08);
    }

    .couponleo-dashboard-card__activity-item:first-child {
      padding-top: 0;
      border-top: 0;
    }

    .couponleo-dashboard-card__notification-item {
      grid-template-columns: auto 1fr;
      padding: 14px;
      border-top: 0;
      border-radius: 20px;
      background: rgba(248, 250, 255, 0.94);
      box-shadow: inset 0 0 0 1px rgba(21, 36, 74, 0.06);
    }

    .couponleo-dashboard-card__notification-copy {
      display: grid;
      gap: 4px;
      align-content: start;
    }

    .couponleo-dashboard-card__notification-copy p {
      line-height: 1.45;
    }

    .couponleo-dashboard-card__notification-copy small {
      font-size: 0.82rem;
      font-weight: 800;
      color: var(--couponleo-blue);
    }

    .couponleo-dashboard-card__alert-summary {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 16px 18px;
      border-radius: 20px;
      background: linear-gradient(180deg, #fff7ef 0%, #fff0df 100%);
      box-shadow: inset 0 0 0 1px rgba(255, 122, 61, 0.12);
    }

    .couponleo-dashboard-card__alert-summary > div {
      display: grid;
      gap: 4px;
    }

    .couponleo-dashboard-card__alert-summary strong {
      font-size: 2rem;
      line-height: 1;
      letter-spacing: -0.04em;
    }

    .couponleo-dashboard-card__alert-summary span {
      color: var(--couponleo-muted);
      font-weight: 700;
    }

    .couponleo-dashboard-card__alert-summary a,
    .couponleo-dashboard-card__notification-actions a {
      display: inline-flex;
      width: fit-content;
      color: var(--couponleo-blue);
      font-weight: 800;
    }

    .couponleo-dashboard-card__notification-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 10px 16px;
      padding-top: 2px;
    }

    .couponleo-dashboard-card__notification-icon,
    .couponleo-dashboard-card__activity-icon {
      width: 2.8rem;
      height: 2.8rem;
      border-radius: 16px;
    }

    .couponleo-dashboard-card__notification-icon--orange,
    .couponleo-dashboard-card__activity-icon--orange {
      background: rgba(255, 122, 61, 0.12);
      color: var(--couponleo-orange);
    }

    .couponleo-dashboard-card__notification-icon--blue,
    .couponleo-dashboard-card__activity-icon--blue {
      background: rgba(47, 109, 246, 0.1);
      color: var(--couponleo-blue);
    }

    .couponleo-dashboard-card__notification-icon--pink,
    .couponleo-dashboard-card__activity-icon--pink {
      background: rgba(255, 101, 145, 0.12);
      color: #ff4c8b;
    }

    .couponleo-dashboard-card__notification-item p,
    .couponleo-dashboard-card__activity-item p,
    .couponleo-dashboard-card__notification-item small,
    .couponleo-dashboard-card__activity-item time,
    .couponleo-dashboard-card__activity-item small {
      margin: 0;
      color: var(--couponleo-muted);
    }

    .couponleo-dashboard-card__activity-item small {
      color: #17a34a;
      font-weight: 800;
    }

    .couponleo-dashboard-card__store-grid,
    .couponleo-dashboard-card__offer-grid {
      display: grid;
      gap: 14px;
    }

    .couponleo-dashboard-card__filter {
      display: inline-flex;
      padding: 8px 12px;
      border-radius: 999px;
      background: rgba(47, 109, 246, 0.08);
      color: var(--couponleo-blue);
      font-size: 0.8rem;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .couponleo-dashboard-card__overview-value {
      font-size: 2.4rem;
      line-height: 1;
      letter-spacing: -0.05em;
    }

    .couponleo-dashboard-card__overview-stack {
      display: grid;
      gap: 12px;
      padding: 16px;
      border-radius: 20px;
      background: linear-gradient(180deg, rgba(247, 250, 255, 0.98) 0%, rgba(240, 246, 255, 0.88) 100%);
      box-shadow: inset 0 0 0 1px rgba(21, 36, 74, 0.06);
    }

    .couponleo-dashboard-card__overview-row {
      display: grid;
      gap: 10px;
    }

    .couponleo-dashboard-card__overview-copy {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 12px;
    }

    .couponleo-dashboard-card__overview-copy span {
      color: var(--couponleo-muted);
      font-size: 0.9rem;
    }

    .couponleo-dashboard-card__overview-bar {
      height: 0.6rem;
      border-radius: 999px;
      background: rgba(47, 109, 246, 0.1);
      overflow: hidden;
    }

    .couponleo-dashboard-card__overview-bar span {
      display: block;
      height: 100%;
      border-radius: inherit;
      background: linear-gradient(90deg, #2f6df6 0%, #6aa1ff 100%);
    }

    .couponleo-dashboard-card__workspace-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 14px;
    }

    .couponleo-dashboard-workspace-card {
      display: grid;
      gap: 12px;
      padding: 18px;
      border-radius: 22px;
      box-shadow: inset 0 0 0 1px rgba(21, 36, 74, 0.06);
    }

    .couponleo-dashboard-workspace-card__icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 2.8rem;
      height: 2.8rem;
      border-radius: 16px;
      background: rgba(255, 255, 255, 0.7);
      color: var(--couponleo-blue);
      box-shadow: inset 0 0 0 1px rgba(21, 36, 74, 0.06);
    }

    .couponleo-dashboard-workspace-card strong {
      margin: 0;
    }

    .couponleo-dashboard-workspace-card p {
      margin: 0;
      color: var(--couponleo-muted);
      line-height: 1.65;
    }

    .couponleo-dashboard-workspace-card a {
      display: inline-flex;
      width: fit-content;
      margin-top: auto;
      color: var(--couponleo-blue);
      font-weight: 800;
    }

    .couponleo-dashboard-workspace-card--sand {
      background: linear-gradient(180deg, #fff7ee 0%, #fff0de 100%);
    }

    .couponleo-dashboard-workspace-card--blue {
      background: linear-gradient(180deg, #eff5ff 0%, #e3eeff 100%);
    }

    .couponleo-dashboard-workspace-card--orange {
      background: linear-gradient(180deg, #fff2e8 0%, #ffe3d1 100%);
    }

    .couponleo-dashboard-workspace-card--navy {
      background: linear-gradient(180deg, #edf2fb 0%, #e1e9f7 100%);
    }

    .couponleo-dashboard-shell__empty-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      margin-top: 24px;
    }

    @media (max-width: 1180px) {
      .couponleo-dashboard-shell {
        grid-template-columns: 1fr;
      }

      .couponleo-dashboard-shell__hero-grid {
        grid-template-columns: 1fr;
      }

      .couponleo-dashboard-card--summary,
      .couponleo-dashboard-card--workspace,
      .couponleo-dashboard-card--overview,
      .couponleo-dashboard-card--activity {
        grid-column: auto;
      }

      .couponleo-dashboard-shell__grid,
      .couponleo-dashboard-card__workspace-grid {
        grid-template-columns: 1fr;
      }
    }

    @media (max-width: 860px) {
      .couponleo-dashboard-shell__topbar {
        grid-template-columns: 1fr;
        align-items: stretch;
      }

      .couponleo-dashboard-shell__topbar-actions {
        justify-content: flex-start;
      }

      .couponleo-dashboard-card__metric-grid,
      .couponleo-dashboard-card__workspace-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }

    @media (max-width: 640px) {
      .couponleo-dashboard-shell {
        padding-top: 20px;
      }

      .couponleo-dashboard-shell__nav-item {
        padding-inline: 12px;
      }

      .couponleo-dashboard-card--summary {
        min-height: auto;
      }

      .couponleo-dashboard-card__summary-visual {
        position: relative;
        right: auto;
        top: auto;
        width: min(100%, 15rem);
        justify-self: end;
      }

      .couponleo-dashboard-card__metric-grid,
      .couponleo-dashboard-card__workspace-grid {
        grid-template-columns: 1fr;
      }

      .couponleo-dashboard-card__saved-item,
      .couponleo-dashboard-card__notification-item,
      .couponleo-dashboard-card__activity-item {
        grid-template-columns: 1fr;
      }

      .couponleo-dashboard-card__alert-summary {
        flex-direction: column;
        align-items: flex-start;
      }

      .couponleo-dashboard-shell__topbar-actions {
        flex-direction: column;
        align-items: stretch;
      }
    }
  `],
})
export default class DashboardPage {
  private readonly authService = inject(CouponleoAuthService);
  private readonly content = inject(CouponleoPageContentService);
  protected readonly i18n = inject(CouponleoI18nService);
  private readonly router = inject(Router);

  protected readonly session = this.authService.session;
  protected readonly dashboardNavItems = computed(() => this.i18n.localize(dashboardNavItems));
  protected readonly labels = computed(() => ({
    dashboardNavigation: this.i18n.phrase('Dashboard navigation'),
    memberWorkspace: this.i18n.phrase('Member Workspace'),
    memberWorkspaceCopy: this.i18n.phrase('Use one loop for saved offers, alert follow-up, active coupons, and settings.'),
    memberWorkspaceDescription: this.i18n.phrase('This workspace keeps the next member action clear instead of scattering tools across multiple screens.'),
    dashboardDesk: this.i18n.phrase('Dashboard'),
    dashboardDeskTitle: this.i18n.phrase('Keep the next savings move obvious'),
    dashboardDeskCopy: this.i18n.phrase('Alerts, saved offers, and coupon follow-up should feel like one clean member workflow.'),
    manageAlerts: this.i18n.phrase('Manage alerts'),
    openQueue: this.i18n.phrase('Open queue'),
    reviewWishlist: this.i18n.phrase('Review wishlist'),
    signOut: this.i18n.phrase('Sign out'),
    memberSnapshot: this.i18n.phrase('Member snapshot'),
    catalogCoverage: this.i18n.phrase('Catalog Coverage'),
    currentLiveFootprint: this.i18n.phrase('Current live footprint'),
    live: this.i18n.phrase('Live'),
    wishlist: this.i18n.phrase('Wishlist'),
    wishlistCopy: this.i18n.phrase('Tracked offers before they move into active use'),
    myCoupons: this.i18n.phrase('My Coupons'),
    viewAll: this.i18n.phrase('View all'),
    alertCenter: this.i18n.phrase('Alert Center'),
    alertCenterCopy: this.i18n.phrase('The timed follow-up queue for expiring and changing offers'),
    alertsNeedAttention: this.i18n.phrase('offers to review now'),
    nextActions: this.i18n.phrase('Next actions'),
    nextActionsCopy: this.i18n.phrase('The three member moves that matter most from the dashboard.'),
    recentActivity: this.i18n.phrase('Recent Activity'),
    recentActivityCopy: this.i18n.phrase('Your latest savings moves'),
    availableAcross: this.i18n.phrase('available across'),
    featuredOffers: this.i18n.phrase('featured offers'),
    highlightedRightNow: this.i18n.phrase('highlighted right now'),
    expiryAlert: this.i18n.phrase('Expiry Alert'),
    featuredOffer: this.i18n.phrase('Featured Offer'),
    catalogSyncComplete: this.i18n.phrase('Catalog sync complete'),
    liveNow: this.i18n.phrase('Live now'),
    savedLabel: this.i18n.phrase('Saved'),
    ready: this.i18n.phrase('ready'),
    catalogLive: this.i18n.phrase('Catalog live'),
    googleAccount: this.i18n.phrase('Google account'),
    emailAccount: this.i18n.phrase('Email account'),
    globalCoverage: this.i18n.phrase('Global coverage'),
    openWishlist: this.i18n.phrase('Open wishlist'),
    reviewMyCoupons: this.i18n.phrase('Review my coupons'),
    offersWaiting: this.i18n.phrase('Offers waiting for review'),
    queueNeedsAttention: this.i18n.phrase('Alerts that need action first'),
    shortlistClosest: this.i18n.phrase('Shortlist the codes that are closest to checkout'),
    keepComparing: this.i18n.phrase('Use this first while you are still comparing stores and deals.'),
    actOnTiming: this.i18n.phrase('This is the fastest place to handle expiring or changing offers.'),
    resumeSeriousPicks: this.i18n.phrase('Keep the deals you are most likely to use in the next checkout session.'),
  }));
  protected readonly primaryCoverageValue = computed(() => this.i18n.formatNumber(this.content.siteSummary().totalCoupons));
  protected readonly primaryCoverageCopy = computed(() =>
    `${this.formatCount(this.content.siteSummary().totalCoupons, 'live offer', 'live offers')} ${this.labels().availableAcross} ${this.formatCount(this.content.siteSummary().totalStores, 'store', 'stores')}.`,
  );
  protected readonly primaryCoverageAccent = computed(() =>
    `${this.i18n.formatNumber(this.content.siteSummary().featuredCoupons)} ${this.labels().featuredOffers} ${this.labels().highlightedRightNow}.`,
  );
  protected readonly marketCoverageValue = computed(() => this.formatCount(this.content.siteSummary().liveMarkets, 'market', 'markets'));
  protected readonly summaryMetrics = computed<DashboardMetric[]>(() => [
    { label: this.i18n.phrase('Coupons Ready'), value: this.i18n.formatNumber(Math.max(this.content.dealCount(), this.content.featuredCoupons().slice(0, 4).length)), icon: ticketIconSvg },
    { label: this.i18n.phrase('Urgent Alerts'), value: this.i18n.formatNumber(this.content.expiringCoupons().slice(0, 4).length), icon: bellIconSvg },
    { label: this.i18n.phrase('Saved Stores'), value: this.i18n.formatNumber(this.content.storeCount()), icon: bookmarkIconSvg },
    { label: this.i18n.phrase('Active Categories'), value: this.i18n.formatNumber(this.content.topCategories().length), icon: gridIconSvg },
  ]);
  protected readonly overviewFacts = computed(() => {
    const items = [
      { label: this.i18n.phrase('Featured Offers'), value: this.content.siteSummary().featuredCoupons },
      { label: this.i18n.phrase('Saved items'), value: this.content.savedCount() },
      { label: this.i18n.phrase('Stores Represented'), value: this.content.siteSummary().totalStores },
      { label: this.i18n.phrase('Markets live'), value: this.content.siteSummary().liveMarkets },
    ];
    const maxValue = Math.max(...items.map((item) => item.value), 1);

    return items.map((item) => ({
      label: item.label,
      value: this.i18n.formatNumber(item.value),
      share: Math.max(8, Math.round((item.value / maxValue) * 100)),
    }));
  });
  protected readonly workspaceCards = computed<WorkspaceCard[]>(() => [
    {
      badge: this.labels().wishlist,
      title: `${this.formatCount(this.content.savedCount(), 'saved offer', 'saved offers')} ${this.labels().offersWaiting.toLowerCase()}`,
      copy: this.labels().keepComparing,
      href: '/wishlist',
      cta: this.labels().openWishlist,
      tone: 'sand',
      icon: heartIconSvg,
    },
    {
      badge: this.labels().alertCenter,
      title: `${this.i18n.formatNumber(this.notificationCount())} ${this.labels().queueNeedsAttention.toLowerCase()}`,
      copy: this.labels().actOnTiming,
      href: '/alerts',
      cta: this.labels().manageAlerts,
      tone: 'orange',
      icon: bellIconSvg,
    },
    {
      badge: this.labels().myCoupons,
      title: this.labels().shortlistClosest,
      copy: this.labels().resumeSeriousPicks,
      href: '/my-coupons',
      cta: this.labels().reviewMyCoupons,
      tone: 'blue',
      icon: ticketIconSvg,
    },
  ]);
  protected readonly savedDeals = computed<SavedDeal[]>(() => {
    const savedCoupons = this.content.savedCoupons().slice(0, 3);

    if (savedCoupons.length > 0) {
      return savedCoupons.map((item) => {
        const categoryHint = item.subtitle.split('|').at(1)?.trim() || item.subtitle.split('|').at(0)?.trim() || item.title;

        return {
          id: item.id,
          title: item.title,
          category: categoryHint,
          expiry: item.savedAt ? this.i18n.formatRelativeTime(item.savedAt) : this.labels().savedLabel,
          imageSrc: getCategoryPresentation(slugifyLabel(categoryHint)).imageSrc,
          route: item.route,
        };
      });
    }

    return this.content.featuredCoupons().slice(0, 3).map((coupon) => ({
      id: `coupon-${coupon.id}-${coupon.storeSlug || coupon.storeId}`,
      title: coupon.discountText || coupon.title,
      category: coupon.categoryName,
      expiry: formatExpiryLabel(coupon.expiresAt),
      imageSrc: getCategoryPresentation(coupon.categorySlug || slugifyLabel(coupon.categoryName)).imageSrc,
      route: buildStoreRoute(coupon.storeSlug || String(coupon.storeId)),
    }));
  });
  protected readonly dashboardNotifications = computed<DashboardNotification[]>(() => {
    const coupons = this.content.expiringCoupons().slice(0, 4);

    if (coupons.length > 0) {
      return coupons.map((coupon, index) => {
        const remainingDays = Math.max(daysUntil(coupon.expiresAt) ?? 0, 0);

        return {
          title: remainingDays <= 3 ? this.labels().expiryAlert : this.labels().featuredOffer,
          copy: `${coupon.storeName} | ${coupon.discountText || coupon.savingsNote || coupon.title}`,
          time: formatExpiryLabel(coupon.expiresAt),
          tone: remainingDays <= 3 ? 'orange' : index % 2 === 0 ? 'blue' : 'pink',
          icon: remainingDays <= 3 ? bellIconSvg : tagIconSvg,
        };
      });
    }

    return [
      {
        title: this.labels().catalogSyncComplete,
        copy: `${this.i18n.formatNumber(this.content.siteSummary().featuredCoupons)} ${this.labels().featuredOffers} ${this.labels().liveNow}.`,
        time: this.labels().liveNow,
        tone: 'blue',
        icon: storefrontIconSvg,
      },
    ];
  });
  protected readonly notificationCount = computed(() => this.dashboardNotifications().length);
  protected readonly recentActivity = computed<ActivityItem[]>(() => {
    const savedItems = this.content.savedItems().slice(0, 4);

    if (savedItems.length > 0) {
      return savedItems.map((item) => ({
        title: item.title,
        detail: item.subtitle,
        saved: item.code ? `${item.code.slice(0, 3)}*** ${this.labels().ready}` : this.labels().savedLabel,
        time: item.savedAt ? this.i18n.formatRelativeTime(item.savedAt) : this.labels().savedLabel,
        tone: activityToneFromSavedItem(item),
        icon: item.kind === 'store' ? storefrontIconSvg : item.kind === 'category' ? gridIconSvg : shoppingCartIconSvg,
      }));
    }

    return this.content.featuredStores().slice(0, 4).map((store, index) => ({
      title: store.name,
      detail: `${this.formatCount(store.activeCoupons, 'live offer', 'live offers')} | ${store.location || this.labels().globalCoverage}`,
      saved: '',
      time: this.labels().catalogLive,
      tone: index % 2 === 0 ? 'blue' : 'orange',
      icon: storefrontIconSvg,
    }));
  });
  protected readonly userInitials = computed(() =>
    (this.session()?.fullName ?? 'Coupon Leo')
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0))
      .join('')
      .toUpperCase(),
  );
  protected readonly authLabel = computed(() =>
    this.session()?.provider === 'google' ? this.labels().googleAccount : this.labels().emailAccount,
  );

  protected signOut(): void {
    this.authService.signOut();
    void this.router.navigateByUrl('/');
  }

  private formatCount(value: number, singular: string, plural: string): string {
    const unit = value === 1 ? singular : plural;
    return `${this.i18n.formatNumber(value)} ${this.i18n.phrase(unit)}`;
  }
}
