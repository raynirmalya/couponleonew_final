import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CouponleoConsentService } from '../services/couponleo-consent.service';
import { CouponleoI18nService } from '../services/couponleo-i18n.service';
import { localizeCouponleoRoute } from '../services/couponleo-ui.helpers';

@Component({
  selector: 'app-couponleo-privacy-choices',
  imports: [RouterLink],
  template: `
    @if (consent.showChoices()) {
      <section class="privacy-choices" role="region" aria-labelledby="privacy-choices-title">
        <div>
          <h2 id="privacy-choices-title">{{ i18n.phrase('Your privacy choices') }}</h2>
          <p>{{ i18n.phrase('Allow optional analytics to help us understand page visits and coupon use, including approximate location.') }}
            {{ i18n.phrase('Essential storage keeps sign-in, saved items and your preferences working either way.') }}
            <a [routerLink]="privacyRoute()">{{ i18n.t('footer.privacy') }}</a>
          </p>
        </div>
        <div class="privacy-choices__actions">
          <button type="button" (click)="consent.choose('declined')">{{ i18n.phrase('Reject analytics') }}</button>
          <button type="button" (click)="consent.choose('allowed')">{{ i18n.phrase('Allow analytics') }}</button>
        </div>
      </section>
    }
  `,
  styles: [`
    .privacy-choices { position: fixed; inset: auto 16px 16px; z-index: 70; margin-inline: auto; max-width: 960px;
      display: flex; gap: 20px; align-items: center; padding: 20px 24px; border: 1px solid #cbd5e1;
      border-radius: 16px; background: #fff; color: #182647; box-shadow: 0 8px 36px #18264730; }
    h2 { margin: 0 0 6px; font-size: 1.05rem; } p { margin: 0; font-size: .88rem; line-height: 1.55; }
    a { color: #1646ad; text-decoration: underline; } .privacy-choices__actions { display: flex; gap: 10px; flex-shrink: 0; }
    button { padding: 12px 16px; min-height: 44px; border: 1px solid #1646ad; border-radius: 8px;
      background: #fff; color: #1646ad; font: inherit; font-weight: 600; cursor: pointer; }
    button:hover { background: #eff4ff; } button:focus-visible, a:focus-visible { outline: 3px solid #dc7300; outline-offset: 3px; }
    @media (max-width: 720px) { .privacy-choices { flex-direction: column; align-items: stretch; gap: 14px; padding: 16px; }
      .privacy-choices__actions button { flex: 1; padding-inline: 8px; } }
  `],
})
export class CouponleoPrivacyChoicesComponent {
  protected readonly consent = inject(CouponleoConsentService);
  protected readonly i18n = inject(CouponleoI18nService);
  protected privacyRoute(): string { return localizeCouponleoRoute('/privacy-policy', this.i18n.locale()); }
}
