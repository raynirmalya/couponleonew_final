import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { CouponleoEonIconComponent } from '../components/couponleo-eon-icon.component';
import { CouponleoNewsletterFormComponent } from '../components/couponleo-newsletter-form.component';
import {
  CouponleoApiService,
  type CouponleoBlogArticle,
  type CouponleoListResponse,
} from '../services/couponleo-api.service';
import { CouponleoI18nService } from '../services/couponleo-i18n.service';
import { CouponleoPageContentService } from '../services/couponleo-page-content.service';
import { createLoadingState, withRequestState } from '../services/couponleo-request-state.helpers';
import { createStaticRouteMeta } from '../services/couponleo-route-meta';
import { buildCategoryRoute, buildStoreRoute, formatExpiryLabel, getCategoryPresentation } from '../services/couponleo-ui.helpers';

import tagIconSvg from '@eonui/icons/svg/commerce/eon-tag.svg?raw';
import newspaperIconSvg from '@eonui/icons/svg/media/eon-newspaper.svg?raw';
import searchIconSvg from '@eonui/icons/svg/system/eon-search.svg?raw';
import calendarIconSvg from '@eonui/icons/svg/system/eon-calendar.svg?raw';
import sparklesIconSvg from '@eonui/icons/svg/system/eon-sparkles.svg?raw';

export const routeMeta = createStaticRouteMeta({
  title: 'CouponLeo Blog',
  description: 'Read CouponLeo stories on verified deals, saving habits, store coverage, and category trends.',
});

interface TopicChip {
  label: string;
  filterValue: string;
  active?: boolean;
}

interface FeaturedStory {
  label: string;
  title: string;
  copy: string;
  detail: string;
  imageSrc: string;
  tone: 'navy' | 'sand' | 'sky' | 'cream';
  href: string;
  cta: string;
  external: boolean;
}

interface CalendarDay {
  day: string;
  date: string;
  active?: boolean;
}

interface SaleEvent {
  title: string;
  dates: string;
  offer: string;
  icon: string;
  tone: 'orange' | 'blue' | 'pink';
}

interface PopularStory {
  rank: string;
  title: string;
  views: string;
  href: string;
  external: boolean;
}

interface StoreInsight {
  name: string;
  rating: string;
  coupons: string;
  accent: 'amber' | 'blue' | 'pink' | 'navy';
  initials: string;
  route: string;
}

interface GuideCard {
  title: string;
  copy: string;
  cta: string;
  imageSrc: string;
  href: string;
  tone: 'sky' | 'sand' | 'blue';
}

function storyToneFromPresentation(tone: 'orange' | 'blue' | 'rose'): 'navy' | 'sand' | 'sky' | 'cream' {
  if (tone === 'orange') {
    return 'sand';
  }

  if (tone === 'rose') {
    return 'cream';
  }

  return 'sky';
}

function guideToneFromPresentation(tone: 'orange' | 'blue' | 'rose'): 'sky' | 'sand' | 'blue' {
  if (tone === 'orange') {
    return 'sand';
  }

  return 'blue';
}

function emptyArticleResponse(): CouponleoListResponse<CouponleoBlogArticle> {
  return {
    items: [],
    total: 0,
    page: 1,
    pageSize: 0,
    pageCount: 1,
    hasNextPage: false,
    hasPreviousPage: false,
  };
}

@Component({
  selector: 'app-blog-page',
  imports: [RouterLink, CouponleoEonIconComponent, CouponleoNewsletterFormComponent],
  template: `
    <section class="couponleo-blog-shell">
      <section class="couponleo-blog-shell__hero">
        <div class="couponleo-blog-shell__hero-copy">
          <span class="couponleo-eyebrow">{{ labels().eyebrow }}</span>
          <h1>{{ labels().title }}</h1>
          <p>{{ labels().description }}</p>

          <form class="couponleo-searchbar" (submit)="$event.preventDefault()">
            <span class="couponleo-searchbar__icon" aria-hidden="true">
              <app-couponleo-eon-icon [svg]="searchIconSvg"></app-couponleo-eon-icon>
            </span>
            <input
              type="search"
              [placeholder]="labels().searchPlaceholder"
              [attr.aria-label]="labels().search"
              [value]="searchTerm()"
              (input)="updateSearch($any($event.target).value)"
            >
            <button type="submit" class="couponleo-searchbar__button couponleo-searchbar__button--text" [attr.aria-label]="labels().search">
              {{ labels().search }}
            </button>
          </form>

        </div>

        <div class="couponleo-blog-shell__hero-visual">
          <span class="couponleo-blog-shell__hero-spark couponleo-blog-shell__hero-spark--blue"></span>
          <span class="couponleo-blog-shell__hero-spark couponleo-blog-shell__hero-spark--orange"></span>
          <img
            class="couponleo-blog-shell__hero-image"
            src="/assets/images/blog/blog-hero-visual.png"
            alt="CouponLeo blog hero showing story search, sale calendar, and coupon tips"
            loading="eager"
          >
        </div>
      </section>

      <section class="couponleo-blog-shell__chip-row" [attr.aria-label]="labels().blogTopics">
        @for (chip of topicChips(); track chip.label) {
          <button type="button" class="couponleo-blog-shell__chip" [class.is-active]="chip.active" (click)="selectTopic(chip.filterValue)">
            {{ chip.label }}
          </button>
        }
      </section>

      <section class="couponleo-blog-shell__content">
        <div class="couponleo-blog-shell__main">
          <section class="couponleo-blog-section couponleo-blog-section--editorial">
            <div class="couponleo-section-heading">
              <div>
                <h2>{{ labels().featuredStories }}</h2>
                <p>{{ labels().featuredStoriesCaption }}</p>
              </div>
            </div>

            <div class="couponleo-blog-shell__editorial-layout">
              @if (leadStory(); as story) {
                <article [class]="'couponleo-story-card couponleo-story-card--lead couponleo-story-card--' + story.tone">
                  <span class="couponleo-story-card__label">{{ story.label }}</span>
                  <div class="couponleo-story-card__body">
                    <div>
                      <h3>{{ story.title }}</h3>
                      <p>{{ story.copy }}</p>
                      <small>{{ story.detail }}</small>
                    </div>
                    <img [src]="story.imageSrc" [alt]="story.title + ' illustration'" loading="lazy">
                  </div>
                  <a
                    class="couponleo-story-card__cta"
                    [href]="story.href"
                    [attr.target]="story.external ? '_blank' : null"
                    [attr.rel]="story.external ? 'noreferrer' : null"
                  >
                    {{ story.cta }}
                  </a>
                </article>
              }

              <div class="couponleo-blog-shell__secondary-grid">
                @for (story of secondaryStories(); track story.title) {
                  <article [class]="'couponleo-story-card couponleo-story-card--' + story.tone">
                    <span class="couponleo-story-card__label">{{ story.label }}</span>
                    <div class="couponleo-story-card__body">
                      <div>
                        <h3>{{ story.title }}</h3>
                        <p>{{ story.copy }}</p>
                        <small>{{ story.detail }}</small>
                      </div>
                      <img [src]="story.imageSrc" [alt]="story.title + ' illustration'" loading="lazy">
                    </div>
                    <a
                      class="couponleo-story-card__cta"
                      [href]="story.href"
                      [attr.target]="story.external ? '_blank' : null"
                      [attr.rel]="story.external ? 'noreferrer' : null"
                    >
                      {{ story.cta }}
                    </a>
                  </article>
                }
              </div>
            </div>
          </section>

          <section class="couponleo-blog-section">
            <div class="couponleo-section-heading">
              <div>
                <h2>{{ labels().latestStories }}</h2>
                <p>{{ labels().latestStoriesCaption }}</p>
              </div>
            </div>

            <div class="couponleo-blog-shell__latest-grid">
              @for (story of latestStories(); track story.title) {
                <article class="couponleo-article-card">
                  <div class="couponleo-article-card__copy">
                    <span class="couponleo-article-card__eyebrow">{{ story.label }}</span>
                    <h3>{{ story.title }}</h3>
                    <p>{{ story.copy }}</p>
                    <small>{{ story.detail }}</small>
                  </div>
                  <img [src]="story.imageSrc" [alt]="story.title + ' illustration'" loading="lazy">
                  <a
                    [href]="story.href"
                    [attr.target]="story.external ? '_blank' : null"
                    [attr.rel]="story.external ? 'noreferrer' : null"
                  >
                    {{ story.cta }}
                  </a>
                </article>
              }
            </div>
          </section>

          @if (storeInsights().length > 0) {
            <section class="couponleo-blog-section">
              <div class="couponleo-section-heading">
                <div>
                  <h2>{{ labels().fromDealsCatalog }}</h2>
                  <p>{{ labels().fromDealsCatalogCaption }}</p>
                </div>
              </div>

              <div class="couponleo-blog-shell__store-grid">
                @for (store of storeInsights(); track store.name) {
                  <article class="couponleo-blog-store-card">
                    <span [class]="'couponleo-blog-store-card__badge couponleo-blog-store-card__badge--' + store.accent">
                      {{ store.initials }}
                    </span>
                    <div>
                      <strong>{{ store.name }}</strong>
                      <span>{{ store.rating }}</span>
                      <p>{{ store.coupons }}</p>
                      <a [routerLink]="store.route">{{ labels().viewDeals }}</a>
                    </div>
                  </article>
                }
              </div>
            </section>
          }
        </div>

        <aside class="couponleo-blog-shell__aside">
          @if (saleEvents().length > 0) {
            <article class="couponleo-side-card">
              <div class="couponleo-side-card__header">
                <h2>{{ labels().saleCalendar }}</h2>
                <a routerLink="/blog">{{ labels().viewAll }}</a>
              </div>

              <div class="couponleo-side-card__day-row">
                @for (day of calendarDays(); track day.day + day.date) {
                  <div class="couponleo-day-pill" [class.is-active]="day.active">
                    <span>{{ day.day }}</span>
                    <strong>{{ day.date }}</strong>
                  </div>
                }
              </div>

              <div class="couponleo-side-card__event-list">
                @for (event of saleEvents(); track event.title + event.offer) {
                  <article class="couponleo-side-card__event">
                    <span
                      [class]="'couponleo-side-card__event-icon couponleo-side-card__event-icon--' + event.tone"
                      aria-hidden="true"
                    >
                      <app-couponleo-eon-icon [svg]="event.icon"></app-couponleo-eon-icon>
                    </span>
                    <div>
                      <strong>{{ event.title }}</strong>
                      <p>{{ event.dates }}</p>
                    </div>
                    <small>{{ event.offer }}</small>
                  </article>
                }
              </div>

              <a class="couponleo-side-card__footer-link" routerLink="/blog">{{ labels().viewFullCalendar }}</a>
            </article>
          }

          <article class="couponleo-side-card">
            <div class="couponleo-side-card__header">
              <h2>{{ labels().popularThisWeek }}</h2>
            </div>

            <div class="couponleo-side-card__popular-list">
              @for (story of popularStories(); track story.rank) {
                <article class="couponleo-side-card__popular-item">
                  <span>{{ story.rank }}</span>
                  <div>
                    <strong>
                      <a [href]="story.href" [attr.target]="story.external ? '_blank' : null" [attr.rel]="story.external ? 'noreferrer' : null">
                        {{ story.title }}
                      </a>
                    </strong>
                    <p>{{ story.views }}</p>
                  </div>
                </article>
              }
            </div>
          </article>

          <article class="couponleo-side-card couponleo-side-card--newsletter">
            <div class="couponleo-side-card__newsletter-copy">
              <h2>{{ labels().saveMoreEveryDay }}</h2>
              <p>{{ newsletterDescription() }}</p>
            </div>

            <div class="couponleo-side-card__newsletter-visual">
              <img
                class="couponleo-side-card__newsletter-image"
                src="/assets/images/illustrations/newsletter-mail.png"
                alt="CouponLeo newsletter illustration"
                loading="lazy"
              >
            </div>

            <app-couponleo-newsletter-form
              formClass="couponleo-side-card__newsletter-form"
              [buttonLabel]="labels().saveCuratedAlerts"
              [buttonBusyLabel]="labels().saving"
              surface="dark"
            ></app-couponleo-newsletter-form>
          </article>
        </aside>
      </section>

    </section>
  `,
  styles: [`
    :host {
      display: block;
    }

    .couponleo-blog-shell {
      display: grid;
      gap: 18px;
      width: min(1280px, calc(100% - 32px));
      margin: 0 auto;
      padding: 28px 0 30px;
    }

    .couponleo-blog-shell__main,
    .couponleo-blog-shell__aside,
    .couponleo-blog-section,
    .couponleo-side-card,
    .couponleo-story-card,
    .couponleo-blog-store-card,
    .couponleo-guide-card {
      min-width: 0;
    }

    .couponleo-blog-shell__hero,
    .couponleo-blog-section,
    .couponleo-side-card {
      border: 1px solid rgba(255, 255, 255, 0.94);
      background: rgba(255, 255, 255, 0.94);
      box-shadow: var(--couponleo-shadow);
    }

    .couponleo-blog-shell__hero {
      display: grid;
      grid-template-columns: minmax(0, 0.9fr) minmax(320px, 1.1fr);
      gap: 20px;
      align-items: center;
      padding: 24px;
      border-radius: 30px;
      background:
        radial-gradient(circle at left top, rgba(255, 174, 71, 0.14), transparent 30%),
        linear-gradient(180deg, rgba(255, 255, 255, 0.98) 0%, rgba(248, 250, 255, 0.95) 100%);
    }

    .couponleo-blog-shell__hero-copy {
      display: grid;
      gap: 16px;
      max-width: 32rem;
    }

    .couponleo-blog-shell__hero-copy h1,
    .couponleo-blog-section h2,
    .couponleo-story-card h3,
    .couponleo-blog-store-card strong,
    .couponleo-guide-card h3,
    .couponleo-side-card h2,
    .couponleo-side-card strong,
    .couponleo-blog-shell__value-item strong {
      margin: 0;
      color: var(--couponleo-navy);
    }

    .couponleo-blog-shell__hero-copy h1 {
      font-size: clamp(3rem, 6vw, 4.2rem);
      line-height: 0.94;
      letter-spacing: -0.07em;
    }

    .couponleo-blog-shell__hero-copy p,
    .couponleo-story-card p,
    .couponleo-story-card small,
    .couponleo-blog-store-card span,
    .couponleo-blog-store-card p,
    .couponleo-guide-card p,
    .couponleo-side-card p,
    .couponleo-side-card small,
    .couponleo-blog-shell__value-item p {
      margin: 0;
      color: var(--couponleo-muted);
    }

    .couponleo-blog-shell__hero-visual {
      position: relative;
      min-height: 18rem;
      overflow: hidden;
      border-radius: 26px;
      background:
        radial-gradient(circle at center, rgba(255, 249, 242, 0.98) 0%, rgba(255, 244, 232, 0.84) 56%, rgba(251, 238, 228, 0.24) 100%);
    }

    .couponleo-blog-shell__hero-image {
      position: relative;
      z-index: 1;
      width: 100%;
      height: auto;
      object-fit: contain;
      filter: drop-shadow(0 24px 40px rgba(18, 35, 77, 0.14));
    }

    .couponleo-blog-shell__hero-spark {
      position: absolute;
      width: 0.8rem;
      height: 0.8rem;
      border-radius: 0.2rem;
      z-index: 0;
      transform: rotate(22deg);
    }

    .couponleo-blog-shell__hero-spark--blue {
      left: 12%;
      top: 18%;
      background: rgba(47, 109, 246, 0.6);
    }

    .couponleo-blog-shell__hero-spark--orange {
      right: 10%;
      top: 22%;
      background: rgba(255, 122, 61, 0.58);
    }

    .couponleo-blog-shell__chip-row {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }

    .couponleo-blog-shell__chip {
      padding: 10px 16px;
      border: 1px solid rgba(21, 36, 74, 0.08);
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.92);
      color: var(--couponleo-navy);
      font: inherit;
      font-weight: 700;
      cursor: pointer;
    }

    .couponleo-blog-shell__chip.is-active {
      background: linear-gradient(135deg, #2f6df6 0%, #4d8bff 100%);
      border-color: transparent;
      color: #fff;
    }

    .couponleo-blog-shell__content {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(300px, 340px);
      gap: 20px;
      align-items: start;
    }

    .couponleo-blog-shell__main,
    .couponleo-blog-shell__aside {
      display: grid;
      gap: 18px;
    }

    .couponleo-blog-section,
    .couponleo-side-card {
      display: grid;
      gap: 16px;
      padding: 20px;
      border-radius: 28px;
      overflow: hidden;
    }

    .couponleo-searchbar__button--text {
      width: auto;
      min-width: 96px;
      padding: 0 22px;
      font-size: 0.95rem;
    }

    .couponleo-section-heading {
      display: flex;
      align-items: start;
      justify-content: space-between;
      gap: 12px;
    }

    .couponleo-section-heading p {
      margin: 6px 0 0;
      color: var(--couponleo-muted);
      max-width: 36rem;
    }

    .couponleo-story-card__label,
    .couponleo-side-card__footer-link,
    .couponleo-blog-store-card a,
    .couponleo-guide-card a,
    .couponleo-article-card a {
      color: var(--couponleo-blue);
      font-weight: 800;
    }

    .couponleo-blog-shell__editorial-layout {
      display: grid;
      gap: 16px;
    }

    .couponleo-blog-shell__secondary-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 14px;
    }

    .couponleo-story-card {
      display: grid;
      gap: 12px;
      min-height: 13.75rem;
      padding: 16px;
      border-radius: 24px;
      box-shadow: inset 0 0 0 1px rgba(21, 36, 74, 0.06);
    }

    .couponleo-story-card--lead {
      min-height: 16rem;
      padding: 20px;
    }

    .couponleo-story-card__label {
      display: inline-flex;
      width: fit-content;
      padding: 6px 10px;
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.9);
      font-size: 0.76rem;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .couponleo-story-card__body {
      display: grid;
      gap: 12px;
      align-content: space-between;
      height: 100%;
    }

    .couponleo-story-card--lead .couponleo-story-card__body {
      grid-template-columns: minmax(0, 1fr) 9.5rem;
      gap: 18px;
      align-items: end;
    }

    .couponleo-story-card h3 {
      font-size: 1.18rem;
      line-height: 1.2;
      letter-spacing: -0.04em;
    }

    .couponleo-story-card small {
      display: block;
      margin-top: 10px;
      font-weight: 700;
    }

    .couponleo-story-card--lead h3 {
      max-width: 24rem;
      font-size: 2rem;
      line-height: 1.02;
      letter-spacing: -0.06em;
    }

    .couponleo-story-card img {
      justify-self: end;
      width: min(100%, 7.5rem);
      height: auto;
      object-fit: contain;
      filter: drop-shadow(0 16px 22px rgba(18, 35, 77, 0.12));
    }

    .couponleo-story-card--lead img {
      width: min(100%, 9rem);
    }

    .couponleo-story-card__cta {
      color: var(--couponleo-blue);
      font-weight: 800;
    }

    .couponleo-story-card--navy {
      background: linear-gradient(180deg, #123984 0%, #0d2f70 100%);
    }

    .couponleo-story-card--navy h3,
    .couponleo-story-card--navy p,
    .couponleo-story-card--navy .couponleo-story-card__label {
      color: #fff;
    }

    .couponleo-story-card--navy .couponleo-story-card__label {
      background: rgba(255, 137, 51, 0.92);
    }

    .couponleo-story-card--sand {
      background: linear-gradient(180deg, #fff5e8 0%, #ffe8d2 100%);
    }

    .couponleo-story-card--sky {
      background: linear-gradient(180deg, #eef5ff 0%, #dfe9ff 100%);
    }

    .couponleo-story-card--cream {
      background: linear-gradient(180deg, #fff8ee 0%, #fff1df 100%);
    }

    .couponleo-blog-shell__latest-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 14px;
    }

    .couponleo-article-card {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 5.5rem;
      gap: 14px;
      align-items: start;
      padding: 18px;
      border-radius: 22px;
      background: rgba(248, 250, 255, 0.96);
      box-shadow: inset 0 0 0 1px rgba(21, 36, 74, 0.06);
    }

    .couponleo-article-card__copy {
      display: grid;
      gap: 10px;
      min-width: 0;
    }

    .couponleo-article-card__eyebrow {
      display: inline-flex;
      width: fit-content;
      padding: 6px 10px;
      border-radius: 999px;
      background: rgba(255, 137, 51, 0.12);
      color: var(--couponleo-orange);
      font-size: 0.76rem;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .couponleo-article-card h3 {
      margin: 0;
      color: var(--couponleo-navy);
      font-size: 1.16rem;
      line-height: 1.18;
      letter-spacing: -0.04em;
    }

    .couponleo-article-card p,
    .couponleo-article-card small {
      margin: 0;
      color: var(--couponleo-muted);
    }

    .couponleo-article-card small {
      font-weight: 700;
    }

    .couponleo-article-card img {
      width: 100%;
      max-width: 5.5rem;
      height: auto;
      object-fit: contain;
      justify-self: end;
      filter: drop-shadow(0 14px 20px rgba(18, 35, 77, 0.12));
    }

    .couponleo-article-card a {
      grid-column: 1 / -1;
    }

    .couponleo-blog-shell__store-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 14px;
    }

    .couponleo-blog-store-card {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 12px;
      align-items: start;
      padding: 16px;
      border-radius: 20px;
      background: rgba(248, 250, 255, 0.96);
      box-shadow: inset 0 0 0 1px rgba(21, 36, 74, 0.06);
    }

    .couponleo-blog-store-card strong,
    .couponleo-blog-store-card span,
    .couponleo-blog-store-card p {
      display: block;
    }

    .couponleo-blog-store-card a {
      display: inline-flex;
      margin-top: 10px;
    }

    .couponleo-blog-store-card__badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 3rem;
      height: 3rem;
      padding: 0 0.75rem;
      border-radius: 18px;
      font-size: 1.2rem;
      font-weight: 800;
      text-transform: lowercase;
    }

    .couponleo-blog-store-card__badge--amber {
      background: #fff0c8;
      color: #f09a00;
    }

    .couponleo-blog-store-card__badge--blue {
      background: #dfeaff;
      color: #2f6df6;
    }

    .couponleo-blog-store-card__badge--pink {
      background: #ffe3f1;
      color: #ff4791;
    }

    .couponleo-blog-store-card__badge--navy {
      background: #dde7f8;
      color: #233c71;
    }

    .couponleo-blog-shell__guide-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 14px;
    }

    .couponleo-guide-card {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 6.5rem;
      gap: 14px;
      align-items: end;
      padding: 18px;
      border-radius: 24px;
      box-shadow: inset 0 0 0 1px rgba(21, 36, 74, 0.06);
      min-height: 12.5rem;
    }

    .couponleo-guide-card:nth-child(3) {
      grid-column: span 2;
    }

    .couponleo-guide-card__copy {
      display: grid;
      gap: 10px;
    }

    .couponleo-guide-card h3 {
      font-size: 1.18rem;
      line-height: 1.18;
      letter-spacing: -0.04em;
    }

    .couponleo-guide-card img {
      width: min(100%, 6rem);
      height: auto;
      object-fit: contain;
      filter: drop-shadow(0 14px 20px rgba(18, 35, 77, 0.12));
    }

    .couponleo-guide-card--sky {
      background: linear-gradient(180deg, #edf5ff 0%, #dfe9ff 100%);
    }

    .couponleo-guide-card--sand {
      background: linear-gradient(180deg, #fff4e8 0%, #ffe5cf 100%);
    }

    .couponleo-guide-card--blue {
      background: linear-gradient(180deg, #eef5ff 0%, #d8e6ff 100%);
    }

    .couponleo-side-card__header {
      display: flex;
      align-items: start;
      justify-content: space-between;
      gap: 12px;
    }

    .couponleo-side-card__header a {
      color: var(--couponleo-blue);
      font-weight: 800;
    }

    .couponleo-side-card__day-row {
      display: grid;
      grid-template-columns: repeat(5, minmax(0, 1fr));
      gap: 10px;
    }

    .couponleo-day-pill {
      display: grid;
      justify-items: center;
      gap: 4px;
      padding: 10px 6px;
      border-radius: 18px;
      background: rgba(248, 250, 255, 0.96);
      color: var(--couponleo-muted);
      box-shadow: inset 0 0 0 1px rgba(21, 36, 74, 0.06);
    }

    .couponleo-day-pill strong {
      font-size: 1.35rem;
    }

    .couponleo-day-pill.is-active {
      background: linear-gradient(135deg, #2f6df6 0%, #4d8bff 100%);
      color: #fff;
    }

    .couponleo-day-pill.is-active strong,
    .couponleo-day-pill.is-active span {
      color: #fff;
    }

    .couponleo-side-card__event-list,
    .couponleo-side-card__popular-list {
      display: grid;
      gap: 12px;
    }

    .couponleo-side-card__event {
      display: grid;
      grid-template-columns: auto 1fr auto;
      gap: 12px;
      align-items: center;
      padding: 10px 0;
      border-top: 1px solid rgba(21, 36, 74, 0.08);
    }

    .couponleo-side-card__event:first-child,
    .couponleo-side-card__popular-item:first-child {
      padding-top: 0;
      border-top: 0;
    }

    .couponleo-side-card__event-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }

    .couponleo-side-card__event-icon {
      width: 2.7rem;
      height: 2.7rem;
      border-radius: 16px;
    }

    .couponleo-side-card__event-icon--orange {
      background: rgba(255, 122, 61, 0.12);
      color: var(--couponleo-orange);
    }

    .couponleo-side-card__event-icon--blue {
      background: rgba(47, 109, 246, 0.1);
      color: var(--couponleo-blue);
    }

    .couponleo-side-card__event-icon--pink {
      background: rgba(255, 101, 145, 0.12);
      color: #ff4c8b;
    }

    .couponleo-side-card__event small {
      color: var(--couponleo-orange);
      font-weight: 800;
      text-align: right;
    }

    .couponleo-side-card__footer-link {
      justify-self: center;
    }

    .couponleo-side-card__popular-item {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 12px;
      align-items: start;
      padding: 10px 0;
      border-top: 1px solid rgba(21, 36, 74, 0.08);
    }

    .couponleo-side-card__popular-item span {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 2rem;
      height: 2rem;
      border-radius: 999px;
      background: linear-gradient(135deg, #2f6df6 0%, #4d8bff 100%);
      color: #fff;
      font-weight: 800;
    }

    .couponleo-side-card__popular-item strong a {
      color: var(--couponleo-navy);
    }

    .couponleo-side-card--newsletter {
      gap: 14px;
      padding: 22px;
      background: linear-gradient(180deg, #1958e3 0%, #2f6df6 100%);
      color: #fff;
    }

    .couponleo-side-card--newsletter h2,
    .couponleo-side-card--newsletter p {
      color: #fff;
    }

    .couponleo-side-card__newsletter-copy {
      display: grid;
      gap: 8px;
      max-width: 16rem;
    }

    .couponleo-side-card__newsletter-visual {
      display: grid;
      place-items: center;
      min-height: 10rem;
      padding: 10px 14px;
      border-radius: 22px;
      background:
        radial-gradient(circle at center, rgba(255, 255, 255, 0.18) 0%, rgba(255, 255, 255, 0.08) 58%, transparent 100%),
        rgba(255, 255, 255, 0.08);
      box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.12);
    }

    .couponleo-side-card__newsletter-image {
      justify-self: center;
      width: min(100%, 8.75rem);
      max-width: 8.75rem;
      height: auto;
      object-fit: contain;
      filter: drop-shadow(0 18px 26px rgba(14, 33, 92, 0.26));
    }

    .couponleo-side-card__newsletter-form {
      display: grid;
      grid-template-columns: 1fr;
      gap: 10px;
    }

    .couponleo-side-card__newsletter-form input,
    .couponleo-side-card__newsletter-form button {
      border: 0;
      border-radius: 14px;
      font: inherit;
    }

    .couponleo-side-card__newsletter-form input {
      padding: 12px 14px;
      background: rgba(255, 255, 255, 0.94);
      color: var(--couponleo-navy);
    }

    .couponleo-side-card__newsletter-form button {
      padding: 12px 16px;
      background: #0f3db5;
      color: #fff;
      font-weight: 800;
      cursor: pointer;
      min-width: 110px;
      width: 100%;
    }

    @media (max-width: 1180px) {
      .couponleo-blog-shell__hero,
      .couponleo-blog-shell__content {
        grid-template-columns: 1fr;
      }

      .couponleo-blog-shell__secondary-grid,
      .couponleo-blog-shell__latest-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .couponleo-story-card--lead .couponleo-story-card__body {
        grid-template-columns: minmax(0, 1fr) 8.5rem;
      }

      .couponleo-blog-shell__store-grid,
      .couponleo-blog-shell__guide-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .couponleo-guide-card:nth-child(3) {
        grid-column: span 2;
      }
    }

    @media (max-width: 820px) {
      .couponleo-blog-shell__secondary-grid,
      .couponleo-blog-shell__latest-grid,
      .couponleo-blog-shell__store-grid,
      .couponleo-blog-shell__guide-grid {
        grid-template-columns: 1fr;
      }

      .couponleo-blog-shell__hero {
        padding: 20px;
      }

      .couponleo-story-card--lead .couponleo-story-card__body,
      .couponleo-article-card {
        grid-template-columns: 1fr;
      }

      .couponleo-guide-card:nth-child(3) {
        grid-column: auto;
      }
    }

    @media (max-width: 640px) {
      .couponleo-blog-shell {
        padding-top: 22px;
      }

      .couponleo-blog-shell__hero-copy h1 {
        font-size: clamp(2.6rem, 11vw, 3.5rem);
      }

      .couponleo-side-card__day-row,
      .couponleo-side-card__newsletter-form {
        grid-template-columns: 1fr;
      }

      .couponleo-side-card__event,
      .couponleo-guide-card,
      .couponleo-article-card {
        grid-template-columns: 1fr;
      }

      .couponleo-story-card img,
      .couponleo-article-card img,
      .couponleo-guide-card img,
      .couponleo-side-card__newsletter-image {
        justify-self: start;
      }
    }
  `],
})
export default class BlogPage {
  private readonly api = inject(CouponleoApiService);
  private readonly content = inject(CouponleoPageContentService);
  protected readonly i18n = inject(CouponleoI18nService);
  protected readonly searchTerm = signal('');
  protected readonly selectedTopic = signal('');
  private readonly articleState = toSignal(
    withRequestState(this.api.listBlogArticles({ pageSize: 18 }), emptyArticleResponse()),
    { initialValue: createLoadingState(emptyArticleResponse()) },
  );
  protected readonly labels = computed(() => ({
    eyebrow: this.i18n.phrase('Blog'),
    title: this.i18n.phrase('CouponLeo Blog'),
    description: this.i18n.phrase('Live source stories, store coverage, and market snapshots pulled into the current CouponLeo catalog.'),
    search: this.i18n.phrase('Search'),
    searchPlaceholder: this.i18n.phrase('Search source stories, guides & more'),
    blogTopics: this.i18n.phrase('Blog topics'),
    featuredStories: this.i18n.phrase('Featured Stories'),
    featuredStoriesCaption: this.i18n.phrase('Start with the strongest stories from the live feed, then explore the rest of the editorial mix.'),
    viewAllStories: this.i18n.phrase('View all stories'),
    latestStories: this.i18n.phrase('Latest Stories'),
    latestStoriesCaption: this.i18n.phrase('Fresh reporting and saving ideas from the sources flowing through the local article API.'),
    storeInsights: this.i18n.phrase('Store Insights'),
    fromDealsCatalog: this.i18n.phrase('From the deals catalog'),
    fromDealsCatalogCaption: this.i18n.phrase('A lighter bridge back to the store directory, without taking over the page.'),
    viewDeals: this.i18n.phrase('View Deals'),
    savingsGuides: this.i18n.phrase('Savings Guides'),
    saleCalendar: this.i18n.phrase('Sale Calendar'),
    viewAll: this.i18n.phrase('View all'),
    viewFullCalendar: this.i18n.phrase('View full calendar'),
    popularThisWeek: this.i18n.phrase('Popular This Week'),
    saveMoreEveryDay: this.i18n.phrase('Save more every day!'),
    saveCuratedAlerts: this.i18n.phrase('Save Curated Alerts'),
    saving: this.i18n.phrase('Saving...'),
    all: this.i18n.phrase('All'),
    categorySnapshot: this.i18n.phrase('Category Snapshot'),
    globalCoverage: this.i18n.phrase('Global coverage'),
    openCategory: this.i18n.phrase('Open Category'),
    featured: this.i18n.phrase('Featured'),
    stores: this.i18n.phrase('Stores'),
    markets: this.i18n.phrase('Markets'),
    liveUpdates: this.i18n.phrase('Live Updates'),
    featuredNow: this.i18n.phrase('Verified offers highlighted right now'),
    merchantCoverage: this.i18n.phrase('Merchant coverage visible across the public catalog'),
    regionalCoverage: this.i18n.phrase('Country routes shaping regional browsing'),
    storiesTrackCatalog: this.i18n.phrase('Stories now track live source rows stored in the CouponLeo article table.'),
    readStory: this.i18n.phrase('Read story'),
    openSourceArticle: this.i18n.phrase('Open source article'),
    sourceStory: this.i18n.phrase('Source Story'),
    sourceFeedLive: this.i18n.phrase('Live source feed flowing through the new article API'),
  }));
  protected readonly newsletterDescription = computed(() => this.i18n.t('footer.newsletterDescription'));
  protected readonly articleFeed = computed(() => this.articleState().data.items);
  protected readonly visibleArticles = computed(() => {
    const query = this.searchTerm().trim().toLowerCase();
    const selectedTopic = this.selectedTopic().trim().toLowerCase();

    return this.articleFeed().filter((article) => {
      const topicLabel = (article.sourceName || article.topic || '').toLowerCase();
      const matchesTopic = !selectedTopic || topicLabel === selectedTopic;
      if (!matchesTopic) {
        return false;
      }

      if (!query) {
        return true;
      }

      const haystack = [
        article.title,
        article.excerpt,
        article.sourceName,
        article.topic,
        article.marketScope,
      ].join(' ').toLowerCase();

      return haystack.includes(query);
    });
  });
  protected readonly topicChips = computed<TopicChip[]>(() => [
    {
      label: this.labels().all,
      filterValue: '',
      active: !this.selectedTopic(),
    },
    ...(this.articleFeed().length > 0
      ? Array.from(new Set(this.articleFeed().map((article) => article.sourceName || article.topic).filter(Boolean)))
          .slice(0, 5)
          .map((label) => ({
            label,
            filterValue: label,
            active: this.selectedTopic().toLowerCase() === label.toLowerCase(),
          }))
      : this.content.topCategories().slice(0, 5).map((category) => ({
          label: category.name,
          filterValue: category.name,
          active: this.selectedTopic().toLowerCase() === category.name.toLowerCase(),
        }))),
  ]);
  protected readonly featuredStories = computed<FeaturedStory[]>(() =>
    this.visibleArticles().length > 0
      ? this.visibleArticles().slice(0, 4).map((article, index) => ({
          label: article.topic || article.sourceName || this.labels().sourceStory,
          title: article.title,
          copy: article.excerpt || `${article.sourceName} | ${article.marketScope || this.labels().globalCoverage}`,
          detail: `${article.sourceName}${this.formatArticleDate(article.publishedAt) ? ` | ${this.formatArticleDate(article.publishedAt)}` : ''}`,
          imageSrc: this.articleImage(article, index),
          tone: (['navy', 'sand', 'sky', 'cream'][index % 4] ?? 'sky') as FeaturedStory['tone'],
          href: article.articleUrl,
          cta: this.labels().readStory,
          external: true,
        }))
      : this.content.topCategories().slice(0, 4).map((category) => {
          const presentation = getCategoryPresentation(category.slug);

          return {
            label: this.labels().categorySnapshot,
            title: category.name,
            copy: category.headline,
            detail: `${this.formatCount(category.couponCount, 'live offer', 'live offers')} | ${this.formatCount(category.storeCount ?? 0, 'store', 'stores')}`,
            imageSrc: presentation.imageSrc,
            tone: storyToneFromPresentation(presentation.tone),
            href: buildCategoryRoute(category.slug),
            cta: this.labels().openCategory,
            external: false,
          };
        }),
  );
  protected readonly leadStory = computed<FeaturedStory | null>(() => this.featuredStories()[0] ?? null);
  protected readonly secondaryStories = computed<FeaturedStory[]>(() => this.featuredStories().slice(1, 4));
  protected readonly calendarDays = computed<CalendarDay[]>(() => {
    const today = new Date();

    return Array.from({ length: 5 }, (_, index) => {
      const nextDay = new Date(today);
      nextDay.setDate(today.getDate() + index);

      return {
        day: this.i18n.formatDate(nextDay, { weekday: 'short' }),
        date: this.i18n.formatDate(nextDay, { day: '2-digit' }),
        active: index === 2,
      };
    });
  });
  protected readonly saleEvents = computed<SaleEvent[]>(() =>
    this.content.expiringCoupons().slice(0, 4).map((coupon, index) => ({
      title: coupon.storeName,
      dates: formatExpiryLabel(coupon.expiresAt),
      offer: coupon.discountText || coupon.title,
      icon: [tagIconSvg, newspaperIconSvg, sparklesIconSvg, calendarIconSvg][index % 4] ?? tagIconSvg,
      tone: index % 3 === 0 ? 'orange' : index % 3 === 1 ? 'blue' : 'pink',
    })),
  );
  protected readonly popularStories = computed<PopularStory[]>(() =>
    this.visibleArticles().length > 0
      ? (this.visibleArticles().length > 1 ? this.visibleArticles().slice(1, 5) : this.visibleArticles().slice(0, 4)).map((article, index) => ({
          rank: String(index + 1),
          title: article.title,
          views: `${article.sourceName}${this.formatArticleDate(article.publishedAt) ? ` | ${this.formatArticleDate(article.publishedAt)}` : ''}`,
          href: article.articleUrl,
          external: true,
        }))
      : this.content.topCategories().slice(0, 4).map((category, index) => ({
          rank: String(index + 1),
          title: category.name,
          views: this.formatCount(category.couponCount, 'live offer', 'live offers'),
          href: buildCategoryRoute(category.slug),
          external: false,
        })),
  );
  protected readonly latestStories = computed<FeaturedStory[]>(() => {
    const source = this.visibleArticles();
    const startIndex = source.length > 4 ? 4 : 1;
    const stories = source.slice(startIndex, startIndex + 6);

    if (stories.length > 0) {
      return stories.map((article, index) => ({
        label: article.sourceName || article.topic || this.labels().sourceStory,
        title: article.title,
        copy: article.excerpt || `${article.sourceName} | ${article.marketScope || this.labels().globalCoverage}`,
        detail: `${article.sourceName}${this.formatArticleDate(article.publishedAt) ? ` | ${this.formatArticleDate(article.publishedAt)}` : ''}`,
        imageSrc: this.articleImage(article, index + 4),
        tone: (['sky', 'sand', 'cream'][index % 3] ?? 'sky') as FeaturedStory['tone'],
        href: article.articleUrl,
        cta: this.labels().readStory,
        external: true,
      }));
    }

    return this.content.topCategories().slice(0, 4).map((category) => {
      const presentation = getCategoryPresentation(category.slug);

      return {
        label: this.labels().categorySnapshot,
        title: category.name,
        copy: category.headline,
        detail: `${this.formatCount(category.couponCount, 'live offer', 'live offers')} | ${this.formatCount(category.storeCount ?? 0, 'store', 'stores')}`,
        imageSrc: presentation.imageSrc,
        tone: storyToneFromPresentation(presentation.tone),
        href: buildCategoryRoute(category.slug),
        cta: this.labels().openCategory,
        external: false,
      };
    });
  });
  protected readonly storeInsights = computed<StoreInsight[]>(() =>
    this.content.featuredStores().slice(0, 3).map((store, index) => ({
      name: store.name,
      rating: store.location || this.labels().globalCoverage,
      coupons: this.formatCount(store.activeCoupons, 'active coupon', 'active coupons'),
      accent: [ 'amber', 'blue', 'pink', 'navy' ][index % 4] as StoreInsight['accent'],
      initials: store.name.charAt(0).toUpperCase(),
      route: buildStoreRoute(store.slug),
    })),
  );
  protected readonly searchIconSvg = searchIconSvg;

  protected updateSearch(value: string): void {
    this.searchTerm.set(value);
  }

  protected selectTopic(value: string): void {
    this.selectedTopic.set(value === this.selectedTopic() ? '' : value);
  }

  private formatCount(value: number, singular: string, plural: string): string {
    const unit = value === 1 ? singular : plural;
    return `${this.i18n.formatNumber(value)} ${this.i18n.phrase(unit)}`;
  }

  private formatArticleDate(value: string): string {
    if (!value) {
      return '';
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return '';
    }

    return this.i18n.formatDate(parsed, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  private articleImage(article: CouponleoBlogArticle, index: number): string {
    if (article.imageUrl) {
      return article.imageUrl;
    }

    const category = this.content.topCategories()[index % Math.max(1, this.content.topCategories().length)];
    if (category) {
      return getCategoryPresentation(category.slug).imageSrc;
    }

    return '/assets/images/blog/blog-hero-visual.png';
  }
}
