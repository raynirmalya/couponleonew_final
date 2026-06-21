import { Component, inject } from '@angular/core';
import { CouponleoPageLoaderComponent } from '../components/couponleo-page-loader.component';
import { CouponleoThemedPageComponent } from '../components/couponleo-themed-page.component';
import { CouponleoPageContentService } from '../services/couponleo-page-content.service';
import { createStaticRouteMeta } from '../services/couponleo-route-meta';

export const routeMeta = createStaticRouteMeta({
  title: 'Help Center | CouponLeo',
  description: 'Get support for CouponLeo member workflows, public browsing routes, merchant redirects, and trust pages.',
});

@Component({
  selector: 'app-help-center-page',
  imports: [CouponleoPageLoaderComponent, CouponleoThemedPageComponent],
  template: `
    @if (content.loading()) {
      <app-couponleo-page-loader [cards]="4" [columns]="2"></app-couponleo-page-loader>
    } @else {
      <app-couponleo-themed-page [config]="config()" />
    }
  `,
})
export default class HelpCenterPage {
  protected readonly content = inject(CouponleoPageContentService);
  protected readonly config = this.content.helpCenterPageConfig;
}
