import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CouponleoI18nService } from '../services/couponleo-i18n.service';
import { createStaticRouteMeta } from '../services/couponleo-route-meta';

export const routeMeta = createStaticRouteMeta({
  title: 'Contact CouponLeo',
  description: 'Reach CouponLeo for support, partnerships, and product feedback through the main contact hub.',
});

@Component({
  selector: 'app-contact-page',
  imports: [RouterLink],
  template: `
    <section class="couponleo-page-hero couponleo-page-hero--soft">
      <span class="couponleo-eyebrow">{{ i18n.t('contact.eyebrow') }}</span>
      <h1>{{ i18n.t('contact.title') }}</h1>
      <p>{{ i18n.t('contact.description') }}</p>
    </section>

    <section class="couponleo-page-section">
      <div class="couponleo-contact-grid">
        <article class="couponleo-card">
          <span class="couponleo-card__badge">{{ i18n.t('contact.supportBadge') }}</span>
          <h2>{{ i18n.t('contact.supportTitle') }}</h2>
          <p><a href="mailto:support@couponleo.com">support@couponleo.com</a></p>
          <small>{{ i18n.t('contact.supportCopy') }}</small>
        </article>

        <article class="couponleo-card">
          <span class="couponleo-card__badge">{{ i18n.t('contact.partnershipsBadge') }}</span>
          <h2>{{ i18n.t('contact.partnershipsTitle') }}</h2>
          <p><a href="mailto:partners@couponleo.com">partners@couponleo.com</a></p>
          <small>{{ i18n.t('contact.partnershipsCopy') }}</small>
        </article>

        <article class="couponleo-card">
          <span class="couponleo-card__badge">{{ i18n.t('contact.feedbackBadge') }}</span>
          <h2>{{ i18n.t('contact.feedbackTitle') }}</h2>
          <p><a href="mailto:hello@couponleo.com">hello@couponleo.com</a></p>
          <small>{{ i18n.t('contact.feedbackCopy') }}</small>
        </article>
      </div>
    </section>

    <section class="couponleo-page-section">
      <div class="couponleo-copy-card couponleo-contact-note">
        <div>
          <h2>{{ i18n.t('contact.helpfulTitle') }}</h2>
          <p>{{ i18n.t('contact.helpfulCopy') }}</p>
        </div>

        <div class="couponleo-contact-note__actions">
          <a class="couponleo-button couponleo-button--ghost" routerLink="/help-center" queryParamsHandling="preserve">{{ i18n.t('contact.openHelpCenter') }}</a>
          <a class="couponleo-button couponleo-button--ghost" routerLink="/privacy-policy" queryParamsHandling="preserve">{{ i18n.t('contact.readPrivacy') }}</a>
          <a class="couponleo-button couponleo-button--ghost" routerLink="/terms-of-use" queryParamsHandling="preserve">{{ i18n.t('contact.readTerms') }}</a>
        </div>
      </div>
    </section>
  `,
  styles: [`
    .couponleo-contact-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 18px;
    }

    .couponleo-contact-grid h2,
    .couponleo-contact-note h2 {
      margin: 0 0 10px;
      color: var(--couponleo-navy);
    }

    .couponleo-contact-grid p,
    .couponleo-contact-grid a,
    .couponleo-contact-grid small,
    .couponleo-contact-note p {
      margin: 0;
      color: var(--couponleo-muted);
    }

    .couponleo-contact-grid a {
      text-decoration: none;
      font-weight: 700;
    }

    .couponleo-contact-grid a:hover {
      color: var(--couponleo-primary);
    }

    .couponleo-contact-grid small,
    .couponleo-contact-note p {
      line-height: 1.7;
    }

    .couponleo-contact-note {
      display: grid;
      gap: 20px;
    }

    .couponleo-contact-note__actions {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
    }

    @media (max-width: 780px) {
      .couponleo-contact-grid {
        grid-template-columns: 1fr;
      }
    }
  `],
})
export default class ContactPage {
  protected readonly i18n = inject(CouponleoI18nService);
}
