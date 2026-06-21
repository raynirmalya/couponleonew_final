import { Component, inject } from '@angular/core';
import { CouponleoPageLoaderComponent } from '../components/couponleo-page-loader.component';
import { CouponleoThemedPageComponent } from '../components/couponleo-themed-page.component';
import { CouponleoPageContentService } from '../services/couponleo-page-content.service';
import { createStaticRouteMeta } from '../services/couponleo-route-meta';

export const routeMeta = createStaticRouteMeta({
  title: 'Settings | CouponLeo',
  description: 'Manage the real CouponLeo member context for session state, locale, and saved-workspace totals.',
  robots: 'noindex,follow',
});

@Component({
  selector: 'app-settings-page',
  imports: [CouponleoPageLoaderComponent, CouponleoThemedPageComponent],
  template: `
    @if (content.loading()) {
      <app-couponleo-page-loader [cards]="4" [columns]="2"></app-couponleo-page-loader>
    } @else {
      <app-couponleo-themed-page [config]="config()" />
    }
  `,
})
export default class SettingsPage {
  protected readonly content = inject(CouponleoPageContentService);
  protected readonly config = this.content.settingsPageConfig;
}
