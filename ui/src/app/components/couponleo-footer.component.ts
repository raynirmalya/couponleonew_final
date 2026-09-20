import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CouponleoNewsletterFormComponent } from './couponleo-newsletter-form.component';
import { CouponleoI18nService } from '../services/couponleo-i18n.service';
import { localizeCouponleoRoute } from '../services/couponleo-ui.helpers';
import { CouponleoConsentService } from '../services/couponleo-consent.service';

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
            src="/assets/images/illustrations/newsletter-envelope-v2.webp"
            alt=""
            loading="lazy"
            decoding="async"
            fetchpriority="low"
            width="1402"
            height="1122"
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
          <a
            class="couponleo-brand couponleo-brand--footer"
            [routerLink]="localizeRoute('/')"
            queryParamsHandling="preserve"
            [attr.aria-label]="copy().couponleoHome"
            data-telemetry-event="footer_brand_home"
            [attr.data-telemetry-label]="copy().couponleoHome"
          >
            <span class="couponleo-brand__footer-mark" aria-hidden="true">
              <img class="couponleo-brand__footer-mark-image" src="/images/couponleo-logo.webp" alt="" width="1078" height="231" decoding="async">
            </span>
            <span class="couponleo-brand__footer-wordmark">
              <span class="couponleo-brand__footer-word couponleo-brand__footer-word--coupon">Coupon</span>
              <span class="couponleo-brand__footer-word couponleo-brand__footer-word--leo">Leo</span>
            </span>
          </a>
          <p>{{ copy().brandDescription }}</p>
          <p class="couponleo-footer__contact-note">
            {{ copy().contactPrefix }}
            <a
              [routerLink]="localizeRoute('/contact')"
              queryParamsHandling="preserve"
              data-telemetry-event="footer_contact_link"
              [attr.data-telemetry-label]="copy().contactTeam"
            >{{ copy().contactTeam }}</a>
            /
            <a
              [routerLink]="localizeRoute('/help-center')"
              queryParamsHandling="preserve"
              data-telemetry-event="footer_help_link"
              [attr.data-telemetry-label]="copy().helpCenter"
            >{{ copy().helpCenter }}</a>.
          </p>
        </div>

        @for (group of groups(); track group.title) {
          <div class="couponleo-footer__group">
            <h4>{{ group.title }}</h4>
            @for (link of group.links; track link.href) {
              <a
                [routerLink]="link.href"
                queryParamsHandling="preserve"
                data-telemetry-event="footer_link"
                [attr.data-telemetry-label]="link.label"
              >{{ link.label }}</a>
            }
          </div>
        }

      </div>

      <div class="couponleo-footer__bottom">
        <p>&copy; 2026 CouponLeo. {{ copy().rightsReserved }}</p>
        <button type="button" class="couponleo-button couponleo-button--ghost" (click)="consent.openSettings()">Privacy choices</button>
      </div>
    </footer>
  `,
})
export class CouponleoFooterComponent {
  protected readonly consent = inject(CouponleoConsentService);
  protected readonly i18n = inject(CouponleoI18nService);
  protected readonly localizeRoute = (path: string) => localizeCouponleoRoute(path, this.i18n.locale());
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
        { href: this.localizeRoute('/stores'), label: this.copy().allStores },
        { href: this.localizeRoute('/categories'), label: this.i18n.t('nav.categories') },
        { href: this.localizeRoute('/country-deals'), label: this.i18n.t('nav.countryDeals') },
        { href: this.localizeRoute('/top-deals'), label: this.i18n.t('nav.topDeals') },
        { href: this.localizeRoute('/blog'), label: this.i18n.t('nav.blog') },
      ],
    },
    {
      title: this.copy().company,
      links: [
        { href: this.localizeRoute('/about'), label: this.copy().aboutUs },
        { href: this.localizeRoute('/contact'), label: this.copy().contactUs },
      ],
    },
    {
      title: this.copy().support,
      links: [
        { href: this.localizeRoute('/wishlist'), label: this.copy().wishlist },
        { href: this.localizeRoute('/help-center'), label: this.copy().helpCenter },
        { href: this.localizeRoute('/terms-of-use'), label: this.copy().terms },
        { href: this.localizeRoute('/privacy-policy'), label: this.copy().privacy },
      ],
    },
  ]);
}
