import { Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CouponleoI18nService } from '../services/couponleo-i18n.service';

type CouponleoPageLayout = 'default' | 'help' | 'legal';
type CouponleoSectionVariant = 'cards' | 'list' | 'legal';

export interface CouponleoThemedPageAction {
  href: string;
  label: string;
  variant?: 'ghost' | 'solid';
}

export interface CouponleoThemedPageCard {
  badge?: string;
  copy: string;
  cta?: string;
  href?: string;
  meta?: string;
  title: string;
  tone?: 'blue' | 'navy' | 'orange' | 'sand';
}

export interface CouponleoThemedPageMetric {
  detail?: string;
  label: string;
  value: string;
}

export interface CouponleoThemedPageNavLink {
  active?: boolean;
  href: string;
  label: string;
}

export interface CouponleoThemedPageSection {
  cards: CouponleoThemedPageCard[];
  columns?: 1 | 2 | 3;
  copy?: string;
  eyebrow?: string;
  title: string;
  variant?: CouponleoSectionVariant;
}

export interface CouponleoThemedPageConfig {
  actions?: CouponleoThemedPageAction[];
  description: string;
  footnote?: string;
  highlights?: string[];
  heroTone?: 'soft' | 'warm';
  lastUpdated?: string;
  layout?: CouponleoPageLayout;
  metrics?: CouponleoThemedPageMetric[];
  navLinks?: CouponleoThemedPageNavLink[];
  navTitle?: string;
  sections: CouponleoThemedPageSection[];
  title: string;
  eyebrow: string;
}

@Component({
  selector: 'app-couponleo-themed-page',
  imports: [RouterLink],
  template: `
    <section
      class="couponleo-page-hero couponleo-themed-page__hero"
      [class.couponleo-page-hero--soft]="localizedConfig().heroTone !== 'warm'"
      [class.couponleo-page-hero--warm]="localizedConfig().heroTone === 'warm'"
      [class.couponleo-themed-page__hero--help]="isHelpLayout()"
      [class.couponleo-themed-page__hero--legal]="isLegalLayout()"
    >
      <div class="couponleo-themed-page__hero-head">
        <div class="couponleo-themed-page__hero-main">
          <span class="couponleo-eyebrow couponleo-themed-page__eyebrow">{{ localizedConfig().eyebrow }}</span>
          @if (isLegalLayout() && localizedConfig().lastUpdated) {
            <div class="couponleo-themed-page__hero-meta">
              <span>{{ labels.lastUpdated }}</span>
              <strong>{{ localizedConfig().lastUpdated }}</strong>
            </div>
          }
          <h1>{{ localizedConfig().title }}</h1>
          <p>{{ localizedConfig().description }}</p>

          @if (localizedConfig().highlights?.length) {
            <div class="couponleo-themed-page__highlights">
              <span class="couponleo-themed-page__highlights-label">{{ highlightTitle() }}</span>
              <div class="couponleo-themed-page__highlight-list">
                @for (highlight of localizedConfig().highlights; track highlight) {
                  <span class="couponleo-themed-page__highlight">{{ highlight }}</span>
                }
              </div>
            </div>
          }
        </div>

        @if (hasHeroRail()) {
          <aside class="couponleo-themed-page__hero-rail">
            @if (isLegalLayout()) {
              <section class="couponleo-themed-page__rail-card">
                <p class="couponleo-themed-page__rail-label">{{ labels.onThisPage }}</p>
                <nav class="couponleo-themed-page__nav couponleo-themed-page__nav--document" aria-label="Page contents">
                  @for (section of localizedConfig().sections; track section.title) {
                    <a class="couponleo-themed-page__nav-link" [attr.href]="'#' + sectionId(section)">
                      {{ section.title }}
                    </a>
                  }
                </nav>
              </section>
            }

            @if (isDocumentLayout()) {
              @if (localizedConfig().navLinks?.length) {
                <section class="couponleo-themed-page__rail-card">
                  <p class="couponleo-themed-page__rail-label">{{ railTitle() }}</p>
                  <nav
                    class="couponleo-themed-page__nav"
                    [class.couponleo-themed-page__nav--document]="isDocumentLayout()"
                    [attr.aria-label]="labels.sectionNavigation"
                  >
                    @for (link of localizedConfig().navLinks; track link.href) {
                      <a
                        class="couponleo-themed-page__nav-link"
                        [class.is-active]="link.active"
                        [routerLink]="link.href"
                        queryParamsHandling="preserve"
                      >
                        {{ link.label }}
                      </a>
                    }
                  </nav>
                </section>
              }

              @if (localizedConfig().actions?.length) {
                <section class="couponleo-themed-page__rail-card">
                  <p class="couponleo-themed-page__rail-label">{{ actionTitle() }}</p>
                  <div
                    class="couponleo-themed-page__actions"
                    [class.couponleo-themed-page__actions--document]="isDocumentLayout()"
                  >
                    @for (action of localizedConfig().actions; track action.href) {
                      <a
                        [class]="actionClass(action)"
                        [routerLink]="action.href"
                        queryParamsHandling="preserve"
                      >
                        {{ action.label }}
                      </a>
                    }
                  </div>
                </section>
              }
            } @else {
              @if (localizedConfig().navLinks?.length) {
                <nav class="couponleo-themed-page__nav" [attr.aria-label]="labels.sectionNavigation">
                  @for (link of localizedConfig().navLinks; track link.href) {
                    <a
                      class="couponleo-themed-page__nav-link"
                      [class.is-active]="link.active"
                      [routerLink]="link.href"
                      queryParamsHandling="preserve"
                    >
                      {{ link.label }}
                    </a>
                  }
                </nav>
              }

              @if (localizedConfig().actions?.length) {
                <div class="couponleo-themed-page__actions">
                  @for (action of localizedConfig().actions; track action.href) {
                    <a
                      [class]="actionClass(action)"
                      [routerLink]="action.href"
                      queryParamsHandling="preserve"
                    >
                      {{ action.label }}
                    </a>
                  }
                </div>
              }
            }
          </aside>
        }
      </div>

      @if (localizedConfig().metrics?.length) {
        <div class="couponleo-themed-page__stats">
          @for (metric of localizedConfig().metrics; track metric.label) {
            <article class="couponleo-themed-page__stat">
              <strong>{{ metric.value }}</strong>
              <span>{{ metric.label }}</span>
              @if (metric.detail) {
                <small>{{ metric.detail }}</small>
              }
            </article>
          }
        </div>
      }
    </section>

    @for (section of localizedConfig().sections; track section.title) {
      <section
        class="couponleo-page-section couponleo-themed-page__section"
        [class.couponleo-themed-page__section--document]="isDocumentLayout()"
        [class.couponleo-themed-page__section--help]="isHelpLayout()"
        [class.couponleo-themed-page__section--legal]="isLegalLayout()"
        [attr.id]="sectionId(section)"
      >
        <div class="couponleo-themed-page__section-shell">
          <div class="couponleo-themed-page__section-head">
            @if (section.eyebrow) {
              <span class="couponleo-eyebrow couponleo-themed-page__eyebrow">{{ section.eyebrow }}</span>
            }
            <h2>{{ section.title }}</h2>
            @if (section.copy) {
              <p>{{ section.copy }}</p>
            }
          </div>

          @if (sectionVariant(section) === 'legal') {
            <ol class="couponleo-themed-page__legal-list">
              @for (card of section.cards; track card.title; let cardIndex = $index) {
                <li class="couponleo-themed-page__legal-item">
                  <span class="couponleo-themed-page__legal-number">{{ legalIndex(cardIndex) }}</span>
                  <article [class]="cardClass(section, card)">
                    @if (card.badge) {
                      <span class="couponleo-card__badge">{{ card.badge }}</span>
                    }
                    <h3>{{ card.title }}</h3>
                    <p>{{ card.copy }}</p>
                    @if (card.meta || card.href) {
                      <div class="couponleo-themed-page__card-footer">
                        @if (card.meta) {
                          <small class="couponleo-themed-page__meta">{{ card.meta }}</small>
                        }
                        @if (card.href) {
                          <a class="couponleo-themed-page__cta" [routerLink]="card.href" queryParamsHandling="preserve">
                            {{ card.cta ?? labels.openPage }}
                          </a>
                        }
                      </div>
                    }
                  </article>
                </li>
              }
            </ol>
          } @else {
            <div
              class="couponleo-themed-page__grid"
              [class.couponleo-themed-page__grid--list]="sectionVariant(section) === 'list'"
              [style.--couponleo-themed-page-columns]="section.columns ?? (sectionVariant(section) === 'list' ? 2 : 3)"
            >
              @for (card of section.cards; track card.title) {
                <article [class]="cardClass(section, card)">
                  @if (card.badge) {
                    <span class="couponleo-card__badge">{{ card.badge }}</span>
                  }
                  <h3>{{ card.title }}</h3>
                  <p>{{ card.copy }}</p>
                  @if (card.meta || card.href) {
                    <div class="couponleo-themed-page__card-footer">
                      @if (card.meta) {
                        <small class="couponleo-themed-page__meta">{{ card.meta }}</small>
                      }
                      @if (card.href) {
                        <a class="couponleo-themed-page__cta" [routerLink]="card.href" queryParamsHandling="preserve">
                          {{ card.cta ?? labels.openPage }}
                        </a>
                      }
                    </div>
                  }
                </article>
              }
            </div>
          }
        </div>
      </section>
    }

    @if (localizedConfig().footnote) {
      <section class="couponleo-page-section">
        <div class="couponleo-copy-card couponleo-themed-page__footnote">
          <p>{{ localizedConfig().footnote }}</p>
        </div>
      </section>
    }
  `,
  styles: [`
    :host {
      display: block;
    }

    .couponleo-themed-page__hero,
    .couponleo-themed-page__section {
      gap: 24px;
      scroll-margin-top: 96px;
    }

    .couponleo-themed-page__hero-head {
      display: grid;
      grid-template-columns: minmax(0, 1.18fr) minmax(260px, 0.82fr);
      gap: 30px;
      align-items: start;
    }

    .couponleo-themed-page__hero-main {
      display: grid;
      gap: 14px;
      min-width: 0;
    }

    .couponleo-themed-page__hero-rail {
      display: grid;
      gap: 14px;
      align-content: start;
      justify-items: end;
    }

    .couponleo-themed-page__hero--help .couponleo-themed-page__hero-rail,
    .couponleo-themed-page__hero--legal .couponleo-themed-page__hero-rail {
      justify-items: stretch;
    }

    .couponleo-themed-page__rail-card {
      display: grid;
      gap: 10px;
      padding: 18px;
      border: 1px solid rgba(22, 36, 74, 0.08);
      border-radius: 20px;
      background: rgba(255, 255, 255, 0.88);
      box-shadow: 0 16px 34px rgba(18, 35, 77, 0.05);
    }

    .couponleo-themed-page__rail-label,
    .couponleo-themed-page__highlights-label,
    .couponleo-themed-page__hero-meta span,
    .couponleo-themed-page__legal-number {
      font-size: 0.76rem;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--couponleo-muted);
    }

    .couponleo-themed-page__eyebrow {
      padding: 6px 12px;
      font-size: 0.78rem;
      letter-spacing: 0.08em;
    }

    .couponleo-themed-page__hero-meta {
      display: inline-flex;
      align-items: center;
      gap: 10px;
    }

    .couponleo-themed-page__hero-meta strong {
      color: var(--couponleo-navy);
      font-size: 0.9rem;
      font-weight: 800;
      letter-spacing: -0.01em;
    }

    .couponleo-themed-page__hero h1 {
      max-width: 12ch;
      font-size: clamp(2.45rem, 4.2vw, 3.95rem);
      line-height: 0.98;
      letter-spacing: -0.055em;
    }

    .couponleo-themed-page__hero p {
      max-width: 47rem;
      font-size: 1rem;
      line-height: 1.78;
    }

    .couponleo-themed-page__hero--help h1 {
      max-width: 11ch;
      font-size: clamp(2.1rem, 3.6vw, 3.05rem);
      line-height: 1.04;
    }

    .couponleo-themed-page__hero--help .couponleo-themed-page__hero-head {
      grid-template-columns: 1fr;
      max-width: 58rem;
    }

    .couponleo-themed-page__hero--help .couponleo-themed-page__hero-main {
      max-width: 54rem;
    }

    .couponleo-themed-page__hero--help p {
      max-width: 50rem;
      line-height: 1.7;
    }

    .couponleo-themed-page__hero--legal h1 {
      max-width: 12ch;
      font-size: clamp(1.95rem, 3vw, 2.85rem);
      line-height: 1.1;
      letter-spacing: -0.04em;
    }

    .couponleo-themed-page__hero--legal .couponleo-themed-page__hero-head {
      grid-template-columns: 1fr;
      max-width: 56rem;
    }

    .couponleo-themed-page__hero--legal .couponleo-themed-page__hero-main {
      max-width: 52rem;
    }

    .couponleo-themed-page__hero--legal p {
      max-width: 52rem;
      line-height: 1.72;
    }

    .couponleo-themed-page__highlights {
      display: grid;
      gap: 10px;
      padding-top: 4px;
    }

    .couponleo-themed-page__highlight-list {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }

    .couponleo-themed-page__highlight {
      display: inline-flex;
      align-items: center;
      min-height: 2.35rem;
      padding: 0 12px;
      border: 1px solid rgba(22, 36, 74, 0.08);
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.78);
      color: var(--couponleo-navy);
      font-size: 0.9rem;
      font-weight: 700;
    }

    .couponleo-themed-page__nav,
    .couponleo-themed-page__actions {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
    }

    .couponleo-themed-page__nav--document,
    .couponleo-themed-page__actions--document {
      display: grid;
      gap: 0;
    }

    .couponleo-themed-page__nav-link {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 2.55rem;
      padding: 0 14px;
      border: 1px solid rgba(22, 36, 74, 0.08);
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.92);
      color: var(--couponleo-muted);
      font-size: 0.92rem;
      font-weight: 800;
      transition: transform 0.2s ease, box-shadow 0.2s ease, color 0.2s ease;
    }

    .couponleo-themed-page__nav--document .couponleo-themed-page__nav-link {
      justify-content: flex-start;
      min-height: auto;
      padding: 11px 14px;
      border-radius: 14px;
      box-shadow: none;
      background: rgba(247, 250, 255, 0.95);
    }

    .couponleo-themed-page__nav-link:hover,
    .couponleo-themed-page__nav-link.is-active {
      transform: translateY(-1px);
      color: var(--couponleo-blue);
      box-shadow: 0 12px 26px rgba(18, 35, 77, 0.08);
    }

    .couponleo-themed-page__nav-link.is-active {
      background: rgba(52, 120, 255, 0.08);
      border-color: rgba(52, 120, 255, 0.16);
    }

    .couponleo-themed-page__resource-link {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 14px;
      padding: 12px 0;
      border-top: 1px solid rgba(22, 36, 74, 0.08);
      color: var(--couponleo-navy);
      font-weight: 700;
      line-height: 1.45;
    }

    .couponleo-themed-page__resource-link:first-child {
      border-top: 0;
      padding-top: 0;
    }

    .couponleo-themed-page__resource-link::after {
      content: 'Open';
      flex-shrink: 0;
      font-size: 0.76rem;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--couponleo-muted);
    }

    .couponleo-themed-page__resource-link--subtle {
      color: var(--couponleo-muted);
    }

    .couponleo-themed-page__stats {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 0;
      overflow: hidden;
      border: 1px solid rgba(22, 36, 74, 0.08);
      border-radius: 22px;
      background: rgba(255, 255, 255, 0.8);
      box-shadow: 0 16px 36px rgba(18, 35, 77, 0.06);
    }

    .couponleo-themed-page__stat {
      display: grid;
      gap: 5px;
      padding: 18px 20px;
      background: transparent;
      border-right: 1px solid rgba(22, 36, 74, 0.08);
    }

    .couponleo-themed-page__stat:last-child {
      border-right: 0;
    }

    .couponleo-themed-page__stat strong,
    .couponleo-themed-page__section-head h2,
    .couponleo-themed-page__card h3 {
      margin: 0;
      color: var(--couponleo-navy);
    }

    .couponleo-themed-page__stat strong {
      font-size: 1.55rem;
      line-height: 1.05;
    }

    .couponleo-themed-page__stat span,
    .couponleo-themed-page__stat small,
    .couponleo-themed-page__section-head p,
    .couponleo-themed-page__card p,
    .couponleo-themed-page__meta {
      color: var(--couponleo-muted);
    }

    .couponleo-themed-page__stat small,
    .couponleo-themed-page__meta {
      font-size: 0.9rem;
      line-height: 1.6;
    }

    .couponleo-themed-page__section-shell {
      display: grid;
      gap: 20px;
    }

    .couponleo-themed-page__section-head {
      display: grid;
      gap: 10px;
      align-content: start;
      max-width: 40rem;
    }

    .couponleo-themed-page__section-head h2 {
      font-size: clamp(1.55rem, 2.05vw, 1.96rem);
      line-height: 1.12;
      letter-spacing: -0.04em;
    }

    .couponleo-themed-page__section-head p,
    .couponleo-themed-page__card p {
      margin: 0;
      line-height: 1.75;
    }

    .couponleo-themed-page__grid {
      display: grid;
      grid-template-columns: repeat(var(--couponleo-themed-page-columns), minmax(0, 1fr));
      gap: 16px;
    }

    .couponleo-themed-page__grid--list {
      gap: 12px;
    }

    .couponleo-themed-page__card {
      display: grid;
      gap: 12px;
      align-content: start;
      min-height: 100%;
    }

    .couponleo-themed-page__card .couponleo-card__badge {
      width: fit-content;
      height: auto;
      min-height: 2rem;
      margin-bottom: 2px;
      padding: 0 10px;
      border-radius: 999px;
      background: rgba(22, 36, 74, 0.06);
      color: var(--couponleo-navy);
      font-size: 0.75rem;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }

    .couponleo-themed-page__card h3 {
      font-size: 1.42rem;
      line-height: 1.14;
      letter-spacing: -0.03em;
    }

    .couponleo-themed-page__card--blue {
      background: linear-gradient(180deg, rgba(237, 245, 255, 0.98) 0%, rgba(255, 255, 255, 0.96) 100%);
    }

    .couponleo-themed-page__card--orange {
      background: linear-gradient(180deg, rgba(255, 241, 232, 0.98) 0%, rgba(255, 255, 255, 0.96) 100%);
    }

    .couponleo-themed-page__card--sand {
      background: linear-gradient(180deg, rgba(255, 248, 239, 0.98) 0%, rgba(255, 255, 255, 0.96) 100%);
    }

    .couponleo-themed-page__card--navy {
      background: linear-gradient(180deg, rgba(233, 240, 252, 0.98) 0%, rgba(255, 255, 255, 0.96) 100%);
    }

    .couponleo-themed-page__card--list {
      position: relative;
      gap: 10px;
      padding: 18px 20px 18px 22px;
      border: 1px solid rgba(22, 36, 74, 0.08);
      border-radius: 18px;
      background: rgba(255, 255, 255, 0.96);
      box-shadow: 0 8px 22px rgba(18, 35, 77, 0.04);
      overflow: hidden;
    }

    .couponleo-themed-page__card--list::before {
      content: '';
      position: absolute;
      left: 0;
      top: 16px;
      bottom: 16px;
      width: 3px;
      border-radius: 999px;
      background: var(--couponleo-blue);
    }

    .couponleo-themed-page__card--list.couponleo-themed-page__card--orange::before {
      background: var(--couponleo-orange);
    }

    .couponleo-themed-page__card--list.couponleo-themed-page__card--navy::before {
      background: var(--couponleo-navy);
    }

    .couponleo-themed-page__card--list.couponleo-themed-page__card--sand::before {
      background: #d6a15a;
    }

    .couponleo-themed-page__card--list.couponleo-themed-page__card--blue,
    .couponleo-themed-page__card--list.couponleo-themed-page__card--orange,
    .couponleo-themed-page__card--list.couponleo-themed-page__card--sand,
    .couponleo-themed-page__card--list.couponleo-themed-page__card--navy {
      background: rgba(255, 255, 255, 0.96);
    }

    .couponleo-themed-page__card--list h3,
    .couponleo-themed-page__card--legal h3 {
      font-size: 1.08rem;
      line-height: 1.26;
    }

    .couponleo-themed-page__card--list p,
    .couponleo-themed-page__card--legal p {
      font-size: 0.96rem;
      line-height: 1.68;
    }

    .couponleo-themed-page__card--legal {
      gap: 10px;
      padding: 0;
      border: 0;
      border-radius: 0;
      background: transparent;
      box-shadow: none;
    }

    .couponleo-themed-page__card--legal .couponleo-card__badge {
      padding: 0;
      min-height: auto;
      background: transparent;
      color: var(--couponleo-muted);
      border-radius: 0;
      font-size: 0.72rem;
      letter-spacing: 0.08em;
    }

    .couponleo-themed-page__card-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      margin-top: auto;
    }

    .couponleo-themed-page__legal-list {
      display: grid;
      gap: 0;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .couponleo-themed-page__legal-item {
      display: grid;
      grid-template-columns: 44px minmax(0, 1fr);
      gap: 18px;
      padding: 18px 0;
      border-bottom: 1px solid rgba(22, 36, 74, 0.08);
    }

    .couponleo-themed-page__legal-number {
      padding-top: 5px;
    }

    .couponleo-themed-page__card--legal .couponleo-themed-page__card-footer {
      justify-content: flex-start;
      gap: 18px;
      padding-top: 6px;
    }

    .couponleo-themed-page__meta {
      display: block;
    }

    .couponleo-themed-page__cta {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      width: fit-content;
      color: var(--couponleo-blue);
      font-weight: 800;
      white-space: nowrap;
    }

    .couponleo-themed-page__cta::after {
      content: '->';
      font-size: 0.8rem;
    }

    .couponleo-themed-page__section--document .couponleo-themed-page__section-shell {
      grid-template-columns: minmax(240px, 0.34fr) minmax(0, 0.66fr);
      gap: 30px;
      align-items: start;
    }

    .couponleo-themed-page__section--help .couponleo-themed-page__section-shell {
      grid-template-columns: 1fr;
      max-width: 68rem;
    }

    .couponleo-themed-page__section--help .couponleo-themed-page__section-head {
      max-width: 40rem;
    }

    .couponleo-themed-page__section--help .couponleo-themed-page__grid--list {
      gap: 10px;
    }

    .couponleo-themed-page__section--help .couponleo-themed-page__card--list {
      padding: 16px 18px 16px 20px;
      border-radius: 16px;
      box-shadow: none;
      background: rgba(255, 255, 255, 0.96);
    }

    .couponleo-themed-page__section--help .couponleo-themed-page__card--list::before {
      top: 14px;
      bottom: 14px;
      width: 2px;
    }

    .couponleo-themed-page__section--help .couponleo-themed-page__card--list h3 {
      font-size: 1.02rem;
      line-height: 1.28;
    }

    .couponleo-themed-page__section--help .couponleo-themed-page__card--list p {
      font-size: 0.95rem;
      line-height: 1.64;
    }

    .couponleo-themed-page__section--legal .couponleo-themed-page__section-shell {
      grid-template-columns: 1fr;
      max-width: 56rem;
    }

    .couponleo-themed-page__section--legal .couponleo-themed-page__section-head {
      max-width: 44rem;
    }

    .couponleo-themed-page__section--legal .couponleo-themed-page__section-head h2 {
      font-size: clamp(1.38rem, 1.95vw, 1.72rem);
      line-height: 1.18;
      letter-spacing: -0.03em;
    }

    .couponleo-themed-page__section--legal .couponleo-themed-page__section-head p {
      line-height: 1.68;
    }

    .couponleo-themed-page__footnote {
      max-width: none;
    }

    @media (max-width: 980px) {
      .couponleo-themed-page__hero-head,
      .couponleo-themed-page__section--document .couponleo-themed-page__section-shell {
        grid-template-columns: 1fr;
      }

      .couponleo-themed-page__hero-rail,
      .couponleo-themed-page__nav,
      .couponleo-themed-page__actions {
        justify-content: flex-start;
      }

      .couponleo-themed-page__stats,
      .couponleo-themed-page__grid {
        grid-template-columns: 1fr 1fr;
      }
    }

    @media (max-width: 720px) {
      .couponleo-themed-page__stats,
      .couponleo-themed-page__grid {
        grid-template-columns: 1fr;
      }

      .couponleo-themed-page__legal-item {
        grid-template-columns: 1fr;
        gap: 10px;
      }

      .couponleo-themed-page__stat {
        border-right: 0;
        border-bottom: 1px solid rgba(22, 36, 74, 0.08);
      }

      .couponleo-themed-page__stat:last-child {
        border-bottom: 0;
      }

      .couponleo-themed-page__card-footer {
        align-items: start;
        flex-direction: column;
      }
    }
  `],
})
export class CouponleoThemedPageComponent {
  private readonly i18n = inject(CouponleoI18nService);

  readonly config = input.required<CouponleoThemedPageConfig>();
  protected readonly localizedConfig = computed(() => this.i18n.localize(this.config()) as CouponleoThemedPageConfig);
  protected readonly layout = computed<CouponleoPageLayout>(() => this.localizedConfig().layout ?? 'default');
  protected readonly isHelpLayout = computed(() => this.layout() === 'help');
  protected readonly isLegalLayout = computed(() => this.layout() === 'legal');
  protected readonly isDocumentLayout = computed(() => this.layout() !== 'default');
  protected readonly hasHeroRail = computed(() => (
    Boolean(this.localizedConfig().navLinks?.length)
    || Boolean(this.localizedConfig().actions?.length)
  ));
  protected readonly labels = {
    openPage: this.i18n.t('common.openPage'),
    sectionNavigation: this.i18n.t('common.sectionNavigation'),
    onThisPage: 'On this page',
    lastUpdated: 'Last updated',
    policyCoverage: 'Policy coverage',
    popularTopics: 'Popular topics',
    quickActions: 'Quick actions',
    relatedPages: 'Related pages',
    supportPages: 'Support pages',
  };

  protected actionClass(action: CouponleoThemedPageAction): string {
    if (!this.isDocumentLayout()) {
      return `couponleo-button ${action.variant === 'ghost' ? 'couponleo-button--ghost' : 'couponleo-button--solid'}`;
    }

    return `couponleo-themed-page__resource-link${action.variant === 'ghost' ? ' couponleo-themed-page__resource-link--subtle' : ''}`;
  }

  protected actionTitle(): string {
    return this.labels.quickActions;
  }

  protected cardClass(section: CouponleoThemedPageSection, card: CouponleoThemedPageCard): string {
    return [
      'couponleo-card',
      'couponleo-themed-page__card',
      `couponleo-themed-page__card--${card.tone ?? 'blue'}`,
      `couponleo-themed-page__card--${this.sectionVariant(section)}`,
    ].join(' ');
  }

  protected highlightTitle(): string {
    return this.isHelpLayout() ? this.labels.popularTopics : this.labels.policyCoverage;
  }

  protected legalIndex(index: number): string {
    return `${index + 1}`.padStart(2, '0');
  }

  protected railTitle(): string {
    return this.localizedConfig().navTitle
      ?? (this.isHelpLayout() ? this.labels.supportPages : this.labels.relatedPages);
  }

  protected sectionId(section: CouponleoThemedPageSection): string {
    return section.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  protected sectionVariant(section: CouponleoThemedPageSection): CouponleoSectionVariant {
    return section.variant ?? (this.isLegalLayout() ? 'legal' : this.isHelpLayout() ? 'list' : 'cards');
  }
}
