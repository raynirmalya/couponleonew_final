import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CouponleoPageContentService } from '../services/couponleo-page-content.service';
import { CouponleoI18nService } from '../services/couponleo-i18n.service';
import { createStaticRouteMeta } from '../services/couponleo-route-meta';

export const routeMeta = createStaticRouteMeta({
  title: 'About CouponLeo',
  description: 'Learn how CouponLeo turns a messy coupon catalog into a clearer journey across stores, categories, and verified deals.',
});

@Component({
  selector: 'app-about-page',
  imports: [RouterLink],
  template: `
    <section class="couponleo-page-hero couponleo-page-hero--soft">
      <span class="couponleo-eyebrow">{{ i18n.t('about.eyebrow') }}</span>
      <h1>{{ i18n.t('about.title') }}</h1>
      <p>{{ i18n.t('about.description') }}</p>

      <div class="couponleo-about-stats">
        <article class="couponleo-about-stat">
          <strong>{{ content.siteSummary().totalCoupons.toLocaleString() }}</strong>
          <span>{{ i18n.t('about.liveOffers') }}</span>
        </article>
        <article class="couponleo-about-stat">
          <strong>{{ content.siteSummary().totalStores.toLocaleString() }}</strong>
          <span>{{ i18n.t('about.storesCovered') }}</span>
        </article>
        <article class="couponleo-about-stat">
          <strong>{{ content.siteSummary().liveMarkets.toLocaleString() }}</strong>
          <span>{{ i18n.t('about.marketsLive') }}</span>
        </article>
        <article class="couponleo-about-stat">
          <strong>{{ content.siteSummary().featuredCoupons.toLocaleString() }}</strong>
          <span>{{ i18n.t('about.featuredDeals') }}</span>
        </article>
      </div>
    </section>

    <section class="couponleo-page-section">
      <div class="couponleo-about-grid">
        <article class="couponleo-card">
          <span class="couponleo-card__badge">{{ i18n.t('about.missionBadge') }}</span>
          <h2>{{ i18n.t('about.missionTitle') }}</h2>
          <p>{{ i18n.t('about.missionCopy') }}</p>
        </article>

        <article class="couponleo-card">
          <span class="couponleo-card__badge">{{ i18n.t('about.catalogBadge') }}</span>
          <h2>{{ i18n.t('about.catalogTitle') }}</h2>
          <p>{{ i18n.t('about.catalogCopy') }}</p>
        </article>

        <article class="couponleo-card">
          <span class="couponleo-card__badge">{{ i18n.t('about.flowBadge') }}</span>
          <h2>{{ i18n.t('about.flowTitle') }}</h2>
          <p>{{ i18n.t('about.flowCopy') }}</p>
        </article>
      </div>
    </section>

    <section class="couponleo-page-section">
      <div class="couponleo-copy-card couponleo-about-story">
        <div>
          <h2>{{ i18n.t('about.storyTitle') }}</h2>
          <p>{{ i18n.t('about.storyCopy') }}</p>
        </div>

        <div class="couponleo-about-story__actions">
          <a class="couponleo-button couponleo-button--solid" routerLink="/top-deals" queryParamsHandling="preserve">{{ i18n.t('about.browseTopDeals') }}</a>
          <a class="couponleo-button couponleo-button--ghost" routerLink="/contact" queryParamsHandling="preserve">{{ i18n.t('common.contactTeam') }}</a>
        </div>
      </div>
    </section>
  `,
  styles: [`
    .couponleo-about-stats {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 14px;
    }

    .couponleo-about-stat {
      display: grid;
      gap: 6px;
      padding: 18px 20px;
      border: 1px solid rgba(255, 255, 255, 0.92);
      border-radius: 22px;
      background: rgba(255, 255, 255, 0.84);
      box-shadow: 0 14px 30px rgba(18, 35, 77, 0.06);
    }

    .couponleo-about-stat strong {
      margin: 0;
      color: var(--couponleo-navy);
      font-size: 2rem;
      line-height: 1;
    }

    .couponleo-about-stat span {
      color: var(--couponleo-muted);
    }

    .couponleo-about-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 18px;
    }

    .couponleo-about-story {
      display: grid;
      gap: 20px;
    }

    .couponleo-about-story h2 {
      margin: 0 0 10px;
      color: var(--couponleo-navy);
    }

    .couponleo-about-story p {
      margin: 0;
      color: var(--couponleo-muted);
      line-height: 1.75;
    }

    .couponleo-about-story__actions {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
    }

    @media (max-width: 900px) {
      .couponleo-about-stats,
      .couponleo-about-grid {
        grid-template-columns: 1fr;
      }
    }
  `],
})
export default class AboutPage {
  protected readonly content = inject(CouponleoPageContentService);
  protected readonly i18n = inject(CouponleoI18nService);
}
