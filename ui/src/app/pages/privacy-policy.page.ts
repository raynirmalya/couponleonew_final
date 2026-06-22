import { Component, inject } from '@angular/core';
import { CouponleoPageLoaderComponent } from '../components/couponleo-page-loader.component';
import { CouponleoThemedPageComponent } from '../components/couponleo-themed-page.component';
import { CouponleoPageContentService } from '../services/couponleo-page-content.service';
import { createStaticRouteMeta } from '../services/couponleo-route-meta';

export const routeMeta = createStaticRouteMeta({
  title: 'Privacy Policy | CouponLeo',
  description: 'Review how CouponLeo and the CouponLeo Companion extension handle sessions, saved items, current-store matching, browser storage, telemetry, and support workflows.',
});

@Component({
  selector: 'app-privacy-policy-page',
  imports: [CouponleoPageLoaderComponent, CouponleoThemedPageComponent],
  template: `
    @if (content.loading()) {
      <app-couponleo-page-loader [cards]="4" [columns]="2"></app-couponleo-page-loader>
    } @else {
      <app-couponleo-themed-page [config]="config()" />
    }
  `,
})
export default class PrivacyPolicyPage {
  protected readonly content = inject(CouponleoPageContentService);
  protected readonly config = this.content.privacyPolicyPageConfig;
}
