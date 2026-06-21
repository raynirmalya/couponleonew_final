import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { injectResponse } from '@analogjs/router/tokens';
import { CouponleoI18nService } from '../services/couponleo-i18n.service';
import { createStaticRouteMeta } from '../services/couponleo-route-meta';

export const routeMeta = createStaticRouteMeta({
  title: 'Page Not Found | CouponLeo',
  description: 'The page you requested could not be found on CouponLeo. Explore live stores, categories, and top deals instead.',
  robots: 'noindex,nofollow',
});

@Component({
  selector: 'app-couponleo-not-found-page',
  imports: [RouterLink],
  template: `
    <section class="couponleo-page-hero couponleo-page-hero--soft">
      <span class="couponleo-eyebrow">{{ copy().eyebrow }}</span>
      <h1>{{ copy().title }}</h1>
      <p>{{ copy().description }}</p>
    </section>

    <section class="couponleo-page-section">
      <div class="couponleo-card-grid">
        <article class="couponleo-card">
          <span class="couponleo-card__badge">{{ copy().homeBadge }}</span>
          <h2>{{ copy().homeTitle }}</h2>
          <p>{{ copy().homeCopy }}</p>
          <a class="couponleo-button couponleo-button--solid" routerLink="/" queryParamsHandling="preserve">{{ copy().homeCta }}</a>
        </article>

        <article class="couponleo-card">
          <span class="couponleo-card__badge">{{ copy().storesBadge }}</span>
          <h2>{{ copy().storesTitle }}</h2>
          <p>{{ copy().storesCopy }}</p>
          <a class="couponleo-button couponleo-button--ghost" routerLink="/stores" queryParamsHandling="preserve">{{ copy().storesCta }}</a>
        </article>

        <article class="couponleo-card">
          <span class="couponleo-card__badge">{{ copy().dealsBadge }}</span>
          <h2>{{ copy().dealsTitle }}</h2>
          <p>{{ copy().dealsCopy }}</p>
          <a class="couponleo-button couponleo-button--ghost" routerLink="/top-deals" queryParamsHandling="preserve">{{ copy().dealsCta }}</a>
        </article>
      </div>
    </section>
  `,
})
export default class CouponleoNotFoundPage {
  private readonly response = injectResponse();
  private readonly i18n = inject(CouponleoI18nService);

  protected readonly copy = computed(() => ({
    eyebrow: this.i18n.phrase('Not Found'),
    title: this.i18n.phrase('This page does not exist in CouponLeo.'),
    description: this.i18n.phrase('Try one of the live directories below to get back to stores, categories, and active deals.'),
    homeBadge: this.i18n.phrase('Home'),
    homeTitle: this.i18n.phrase('Return to the homepage'),
    homeCopy: this.i18n.phrase('Jump back to featured deals, trending categories, and top stores.'),
    homeCta: this.i18n.phrase('Open Home'),
    storesBadge: this.i18n.phrase('Stores'),
    storesTitle: this.i18n.phrase('Browse the store directory'),
    storesCopy: this.i18n.phrase('Open the live store catalog with search, filters, and member save controls.'),
    storesCta: this.i18n.phrase('Open Stores'),
    dealsBadge: this.i18n.phrase('Deals'),
    dealsTitle: this.i18n.phrase('Explore top live deals'),
    dealsCopy: this.i18n.phrase('See the freshest deal feed and jump straight into verified offers.'),
    dealsCta: this.i18n.phrase('Open Top Deals'),
  }));

  constructor() {
    if (this.response) {
      this.response.statusCode = 404;
    }
  }
}
