import { Component, inject } from '@angular/core';
import { CouponleoPageLoaderComponent } from '../components/couponleo-page-loader.component';
import { CouponleoThemedPageComponent } from '../components/couponleo-themed-page.component';
import { CouponleoPageContentService } from '../services/couponleo-page-content.service';
import { createStaticRouteMeta } from '../services/couponleo-route-meta';

export const routeMeta = createStaticRouteMeta({
  title: 'My Coupons | CouponLeo',
  description: 'Open a real CouponLeo coupon shortlist built from saved offers and live featured deals.',
  robots: 'noindex,follow',
});

@Component({
  selector: 'app-my-coupons-page',
  imports: [CouponleoPageLoaderComponent, CouponleoThemedPageComponent],
  template: `
    @if (content.loading()) {
      <app-couponleo-page-loader [cards]="4" [columns]="2"></app-couponleo-page-loader>
    } @else {
      <app-couponleo-themed-page [config]="config()" />
    }
  `,
})
export default class MyCouponsPage {
  protected readonly content = inject(CouponleoPageContentService);
  protected readonly config = this.content.myCouponsPageConfig;
}
