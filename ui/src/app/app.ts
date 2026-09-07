import { Component, afterNextRender, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { CouponleoFooterComponent } from './components/couponleo-footer.component';
import { CouponleoHeaderComponent } from './components/couponleo-header.component';
import { CouponleoSeoSyncService } from './services/couponleo-seo-sync.service';
import { CouponleoTelemetryService } from './services/couponleo-telemetry.service';
import { CouponleoConsentService } from './services/couponleo-consent.service';
import { CouponleoPrivacyChoicesComponent } from './components/couponleo-privacy-choices.component';
import { CouponleoAffiliateDisclosureComponent } from './components/couponleo-affiliate-disclosure.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, CouponleoHeaderComponent, CouponleoFooterComponent, CouponleoPrivacyChoicesComponent, CouponleoAffiliateDisclosureComponent],
  template: `
    <div class="couponleo-site">
      <app-couponleo-header />
      <main class="couponleo-main">
        <div class="couponleo-main__inner">
          <app-couponleo-affiliate-disclosure />
          <router-outlet />
        </div>
      </main>
      <app-couponleo-footer />
      <app-couponleo-privacy-choices />
    </div>
  `,
})
export class App {
  protected readonly seoSync = inject(CouponleoSeoSyncService);
  private readonly telemetry = inject(CouponleoTelemetryService);
  private readonly consent = inject(CouponleoConsentService);

  constructor() {
    this.telemetry.start();
    afterNextRender(() => this.consent.initialize());
  }
}
