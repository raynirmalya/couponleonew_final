import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { CouponleoFooterComponent } from './components/couponleo-footer.component';
import { CouponleoHeaderComponent } from './components/couponleo-header.component';
import { CouponleoSeoSyncService } from './services/couponleo-seo-sync.service';
import { CouponleoTelemetryService } from './services/couponleo-telemetry.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, CouponleoHeaderComponent, CouponleoFooterComponent],
  template: `
    <div class="couponleo-site">
      <app-couponleo-header />
      <main class="couponleo-main">
        <div class="couponleo-main__inner">
          <router-outlet />
        </div>
      </main>
      <app-couponleo-footer />
    </div>
  `,
})
export class App {
  protected readonly seoSync = inject(CouponleoSeoSyncService);
  private readonly telemetry = inject(CouponleoTelemetryService);

  constructor() {
    this.telemetry.start();
  }
}
