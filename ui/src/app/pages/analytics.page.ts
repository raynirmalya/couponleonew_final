import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { createStaticRouteMeta } from '../services/couponleo-route-meta';

const localTelemetryDashboardUrl = 'http://127.0.0.1:4381';

export const routeMeta = createStaticRouteMeta({
  title: 'Local Telemetry Console | CouponLeo',
  description: 'Telemetry reads are locked behind a localhost-only dashboard so visitor analytics data stays out of the public CouponLeo UI.',
  robots: 'noindex,nofollow',
});

@Component({
  selector: 'app-analytics-page',
  imports: [RouterLink],
  template: `
    <section class="couponleo-page-hero couponleo-page-hero--soft couponleo-telemetry-gateway">
      <span class="couponleo-eyebrow">Local telemetry</span>
      <h1>Visitor analytics moved into a separate localhost dashboard.</h1>
      <p>
        Raw telemetry, IP-backed traffic details, and event history are no longer exposed through the main CouponLeo UI.
        Open the dedicated local dashboard instead.
      </p>

      <div class="couponleo-telemetry-gateway__actions">
        <a class="couponleo-button couponleo-button--solid" [href]="dashboardUrl" target="_blank" rel="noreferrer">
          Open local telemetry dashboard
        </a>
        <a class="couponleo-button couponleo-button--ghost" routerLink="/dashboard">
          Back to dashboard
        </a>
      </div>

      <div class="couponleo-telemetry-gateway__note">
        <strong>Local URL</strong>
        <span>{{ dashboardUrl }}</span>
      </div>
    </section>
  `,
  styles: [`
    .couponleo-telemetry-gateway {
      display: grid;
      gap: 20px;
      width: min(860px, calc(100% - 32px));
      margin: 24px auto 48px;
    }

    .couponleo-telemetry-gateway__actions {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
    }

    .couponleo-telemetry-gateway__note {
      display: grid;
      gap: 6px;
      padding: 18px 20px;
      border-radius: 24px;
      border: 1px solid rgba(21, 36, 74, 0.08);
      background: rgba(255, 255, 255, 0.92);
      box-shadow: var(--couponleo-shadow);
      color: var(--couponleo-muted);
    }

    .couponleo-telemetry-gateway__note strong {
      color: var(--couponleo-navy);
      font-size: 0.92rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }

    .couponleo-telemetry-gateway__note span {
      font-family: 'IBM Plex Mono', 'SFMono-Regular', Consolas, monospace;
      font-size: 0.95rem;
      color: var(--couponleo-blue);
      word-break: break-all;
    }
  `],
})
export default class AnalyticsPage {
  protected readonly dashboardUrl = localTelemetryDashboardUrl;
}
