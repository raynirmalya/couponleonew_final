import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CouponleoNewsletterFormComponent } from './couponleo-newsletter-form.component';
import { CouponleoI18nService } from '../services/couponleo-i18n.service';

interface FooterGroup {
  title: string;
  links: Array<{ href: string; label: string }>;
}

@Component({
  selector: 'app-couponleo-footer',
  imports: [RouterLink, CouponleoNewsletterFormComponent],
  template: `
    <section class="couponleo-newsletter-shell">
      <div class="couponleo-newsletter">
        <div class="couponleo-newsletter__art" aria-hidden="true">
          <img
            class="couponleo-newsletter__art-image"
            src="/assets/images/illustrations/newsletter-envelope-v2.png"
            alt=""
            loading="lazy"
          >
        </div>
        <div class="couponleo-newsletter__copy">
          <h3>{{ copy().newsletterTitle }} <span>{{ copy().newsletterAccent }}</span></h3>
          <p>{{ copy().newsletterDescription }}</p>
        </div>
        <app-couponleo-newsletter-form
          formClass="couponleo-newsletter__form"
          buttonClass="couponleo-button couponleo-button--solid"
          [buttonLabel]="copy().saveAlerts"
          [buttonBusyLabel]="copy().saving"
        ></app-couponleo-newsletter-form>
      </div>
    </section>

    <footer class="couponleo-footer">
      <div class="couponleo-footer__grid">
        <div class="couponleo-footer__brand">
          <a class="couponleo-brand couponleo-brand--footer" routerLink="/" queryParamsHandling="preserve" [attr.aria-label]="copy().couponleoHome">
            <span class="couponleo-brand__footer-mark" aria-hidden="true">
              <img class="couponleo-brand__footer-mark-image" src="/images/couponleo-logo.png" alt="">
            </span>
            <span class="couponleo-brand__footer-wordmark">
              <span class="couponleo-brand__footer-word couponleo-brand__footer-word--coupon">Coupon</span>
              <span class="couponleo-brand__footer-word couponleo-brand__footer-word--leo">Leo</span>
            </span>
          </a>
          <p>{{ copy().brandDescription }}</p>
          <p class="couponleo-footer__contact-note">
            {{ copy().contactPrefix }}
            <a routerLink="/contact" queryParamsHandling="preserve">{{ copy().contactTeam }}</a>
            /
            <a routerLink="/help-center" queryParamsHandling="preserve">{{ copy().helpCenter }}</a>.
          </p>
        </div>

        @for (group of groups(); track group.title) {
          <div class="couponleo-footer__group">
            <h4>{{ group.title }}</h4>
            @for (link of group.links; track link.href) {
              <a [routerLink]="link.href" queryParamsHandling="preserve">{{ link.label }}</a>
            }
          </div>
        }

      </div>

      <div class="couponleo-footer__bottom">
        <p>&copy; 2026 CouponLeo. {{ copy().rightsReserved }}</p>
      </div>
    </footer>
  `,
})
export class CouponleoFooterComponent {
  protected readonly i18n = inject(CouponleoI18nService);
  protected readonly copy = computed(() => ({
    aboutUs: this.i18n.t('footer.aboutUs'),
    allStores: this.i18n.t('footer.allStores'),
    brandDescription: this.i18n.t('footer.brandDescription'),
    company: this.i18n.t('footer.company'),
    contactPrefix: this.i18n.t('footer.contactPrefix'),
    contactTeam: this.i18n.t('common.contactTeam'),
    contactUs: this.i18n.t('footer.contactUs'),
    couponleoHome: this.i18n.t('common.couponleoHome'),
    explore: this.i18n.t('footer.explore'),
    helpCenter: this.i18n.t('common.helpCenter'),
    newsletterAccent: this.i18n.t('footer.newsletterAccent'),
    newsletterDescription: this.i18n.t('footer.newsletterDescription'),
    newsletterTitle: this.i18n.t('footer.newsletterTitle'),
    privacy: this.i18n.t('footer.privacy'),
    rightsReserved: this.i18n.t('footer.rightsReserved'),
    saveAlerts: this.i18n.t('footer.saveAlerts'),
    saving: this.i18n.t('footer.saving'),
    support: this.i18n.t('footer.support'),
    terms: this.i18n.t('footer.terms'),
    wishlist: this.i18n.t('nav.wishlist'),
  }));
  protected readonly groups = computed<FooterGroup[]>(() => [
    {
      title: this.copy().explore,
      links: [
        { href: '/stores', label: this.copy().allStores },
        { href: '/categories', label: this.i18n.t('nav.categories') },
        { href: '/country-deals', label: this.i18n.t('nav.countryDeals') },
        { href: '/top-deals', label: this.i18n.t('nav.topDeals') },
        { href: '/blog', label: this.i18n.t('nav.blog') },
      ],
    },
    {
      title: this.copy().company,
      links: [
        { href: '/about', label: this.copy().aboutUs },
        { href: '/contact', label: this.copy().contactUs },
      ],
    },
    {
      title: this.copy().support,
      links: [
        { href: '/wishlist', label: this.copy().wishlist },
        { href: '/help-center', label: this.copy().helpCenter },
        { href: '/terms-of-use', label: this.copy().terms },
        { href: '/privacy-policy', label: this.copy().privacy },
      ],
    },
  ]);
}
