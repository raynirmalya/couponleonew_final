import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CouponleoI18nService } from '../services/couponleo-i18n.service';
import { localizeCouponleoRoute } from '../services/couponleo-ui.helpers';

@Component({
  selector: 'app-couponleo-affiliate-disclosure',
  imports: [RouterLink],
  template: `
    <aside class="affiliate-disclosure" [attr.aria-label]="i18n.phrase('Affiliate disclosure')">
      <strong>{{ i18n.phrase('Affiliate disclosure') }}:</strong>
      {{ i18n.phrase('We may earn a commission when you buy through some links on CouponLeo.') }}
      {{ i18n.phrase('Offers come from merchant and partner feeds and are not all checkout-tested.') }}
      <a [routerLink]="helpRoute()" fragment="offers-and-affiliate-links">{{ i18n.phrase('How our offers work') }}</a>
    </aside>
  `,
  styles: [`
    .affiliate-disclosure { margin-block: 0 20px; padding: 12px 16px; border: 1px solid #d9e2ef;
      border-radius: 12px; background: #f5f8ff; color: #33435f; font-size: .85rem; line-height: 1.6; }
    a { color: #1646ad; text-decoration: underline; margin-inline-start: 4px; }
    a:focus-visible { outline: 3px solid #dc7300; outline-offset: 3px; }
  `],
})
export class CouponleoAffiliateDisclosureComponent {
  protected readonly i18n = inject(CouponleoI18nService);
  protected helpRoute(): string { return localizeCouponleoRoute('/help-center', this.i18n.locale()); }
}
