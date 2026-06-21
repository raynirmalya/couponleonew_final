import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { createStaticRouteMeta } from '../services/couponleo-route-meta';

export const routeMeta = createStaticRouteMeta({
  title: 'Extension Bridge | CouponLeo',
  description: 'Finish connecting the CouponLeo browser extension to your current session.',
  robots: 'noindex,nofollow',
});

@Component({
  selector: 'app-extension-bridge-page',
  imports: [RouterLink],
  template: `
    <section class="couponleo-extension-bridge">
      <article class="couponleo-extension-bridge__card">
        <p class="couponleo-extension-bridge__eyebrow">CouponLeo extension</p>
        <h1>Extension sign-in is ready.</h1>
        <p class="couponleo-extension-bridge__copy">
          The extension can now reopen with your current CouponLeo session and local saved-state preferences.
        </p>

        @if (email) {
          <div class="couponleo-extension-bridge__meta">
            <span>Email</span>
            <strong>{{ email }}</strong>
          </div>
        }

        @if (provider) {
          <div class="couponleo-extension-bridge__meta">
            <span>Provider</span>
            <strong>{{ provider }}</strong>
          </div>
        }

        <p class="couponleo-extension-bridge__note">
          If this tab stays open, you can close it and return to the extension popup.
        </p>

        <div class="couponleo-extension-bridge__actions">
          <a routerLink="/dashboard">Open dashboard</a>
          <a routerLink="/top-deals">Browse deals</a>
        </div>
      </article>
    </section>
  `,
  styles: [`
    :host {
      display: block;
    }

    .couponleo-extension-bridge {
      width: min(760px, calc(100% - 24px));
      margin: 0 auto;
      padding: 48px 0;
    }

    .couponleo-extension-bridge__card {
      display: grid;
      gap: 18px;
      padding: clamp(28px, 4vw, 44px);
      border-radius: 32px;
      background:
        radial-gradient(circle at top center, rgba(255, 196, 131, 0.2), transparent 38%),
        linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(255, 249, 242, 0.98));
      box-shadow: 0 22px 60px rgba(18, 35, 77, 0.1);
      text-align: center;
    }

    .couponleo-extension-bridge__eyebrow {
      margin: 0;
      color: var(--couponleo-orange);
      font-size: 0.88rem;
      font-weight: 800;
      letter-spacing: 0.18em;
      text-transform: uppercase;
    }

    h1 {
      margin: 0;
      color: var(--couponleo-navy);
      font-size: clamp(2.2rem, 6vw, 3.6rem);
      line-height: 0.98;
      letter-spacing: -0.06em;
    }

    .couponleo-extension-bridge__copy,
    .couponleo-extension-bridge__note {
      margin: 0;
      color: var(--couponleo-muted);
      line-height: 1.6;
    }

    .couponleo-extension-bridge__meta {
      display: grid;
      gap: 4px;
      padding: 16px;
      border-radius: 18px;
      background: rgba(255, 255, 255, 0.82);
      color: var(--couponleo-navy);
    }

    .couponleo-extension-bridge__meta span {
      font-size: 0.82rem;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--couponleo-muted);
    }

    .couponleo-extension-bridge__meta strong {
      font-size: 1.05rem;
    }

    .couponleo-extension-bridge__actions {
      display: flex;
      justify-content: center;
      gap: 12px;
      flex-wrap: wrap;
    }

    .couponleo-extension-bridge__actions a {
      min-width: 168px;
      padding: 14px 20px;
      border-radius: 999px;
      background: linear-gradient(135deg, #3480ff 0%, #2355f6 100%);
      color: #fff;
      font-weight: 800;
      text-decoration: none;
      box-shadow: 0 18px 34px rgba(52, 120, 255, 0.22);
    }

    .couponleo-extension-bridge__actions a:last-child {
      background: #fff;
      color: var(--couponleo-navy);
      box-shadow: inset 0 0 0 1px rgba(18, 35, 77, 0.12);
    }
  `],
})
export default class ExtensionBridgePage {
  private readonly route = inject(ActivatedRoute);

  protected readonly email = (this.route.snapshot.queryParamMap.get('email') ?? '').trim();
  protected readonly provider = (this.route.snapshot.queryParamMap.get('provider') ?? '').trim();
}
