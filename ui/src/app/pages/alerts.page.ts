import { isPlatformBrowser } from '@angular/common';
import { Component, PLATFORM_ID, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CouponleoI18nService } from '../services/couponleo-i18n.service';
import { CouponleoNewsletterService, type CouponleoNewsletterPreview } from '../services/couponleo-newsletter.service';
import { CouponleoSavedService } from '../services/couponleo-saved.service';
import { createStaticRouteMeta } from '../services/couponleo-route-meta';
import { localizeCouponleoRoute } from '../services/couponleo-ui.helpers';

export const routeMeta = createStaticRouteMeta({
  title: 'Saved deal alerts | CouponLeo',
  description: 'See current offers related to the stores and categories you saved on CouponLeo.',
  robots: 'noindex,follow',
});

@Component({
  selector: 'app-alerts-page',
  imports: [RouterLink],
  template: `
    <section class="couponleo-page-hero couponleo-page-hero--soft alerts-hero">
      <span class="couponleo-eyebrow">{{ phrase('Alerts') }}</span>
      <h1>{{ phrase('Offers from your saved stores and categories') }}</h1>
      <p>{{ phrase('Review current matches from the live catalog. Save a store or category to add it to this watchlist.') }}</p>
      <div class="alerts-hero__actions">
        <a class="couponleo-button couponleo-button--solid" [routerLink]="localizeRoute('/wishlist')">{{ phrase('Manage saved items') }}</a>
        <a class="couponleo-button couponleo-button--ghost" routerLink="/top-coupons">{{ phrase('Browse top coupons') }}</a>
      </div>
      <p class="alerts-hero__note">{{ phrase('Alerts appear here when you visit. Email delivery is not active.') }}</p>
    </section>

    <section class="couponleo-page-section alerts-content" aria-live="polite">
      <div class="couponleo-section-heading">
        <div>
          <span class="couponleo-eyebrow">{{ savedCount() }} {{ phrase('saved items') }}</span>
          <h2>{{ phrase('Current matches') }}</h2>
        </div>
      </div>

      @if (!savedCount()) {
        <div class="alerts-empty">
          <h3>{{ phrase('Your watchlist is empty') }}</h3>
          <p>{{ phrase('Save a store or category, then return here to see matching current offers.') }}</p>
          <a [routerLink]="localizeRoute('/stores')">{{ phrase('Explore stores') }}</a>
        </div>
      } @else if (state() === 'loading') {
        <p role="status">{{ phrase('Finding offers for your saved items…') }}</p>
      } @else if (state() === 'error') {
        <p role="alert">{{ phrase('Current matches are temporarily unavailable. Your saved items are still safe.') }}</p>
      } @else if (!preview()?.items?.length) {
        <div class="alerts-empty">
          <h3>{{ phrase('No current matches yet') }}</h3>
          <p>{{ phrase('Try another saved store or category, and check again when new offers arrive.') }}</p>
        </div>
      } @else {
        <p class="alerts-content__summary">{{ preview()?.summary }}</p>
        <div class="alerts-grid">
          @for (offer of preview()!.items; track offer.route + offer.title) {
            <article class="couponleo-card alerts-card">
              <div class="alerts-card__top">
                <span>{{ offer.storeName }}</span>
                <strong>{{ offer.discountText || phrase('Current offer') }}</strong>
              </div>
              <h3>{{ offer.title }}</h3>
              <p>{{ offer.reasons[0] }}</p>
              <small>{{ offer.location }}</small>
              <a class="couponleo-button couponleo-button--ghost" [routerLink]="localizeRoute(offer.route)">{{ phrase('View store offers') }}</a>
            </article>
          }
        </div>
      }
    </section>
  `,
  styles: [`
    .alerts-hero { display: grid; gap: 12px; }
    .alerts-hero h1 { max-width: 18ch; }
    .alerts-hero p { max-width: 68ch; }
    .alerts-hero__actions { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 8px; }
    .alerts-hero__note { font-size: .88rem; color: var(--couponleo-muted); }
    .alerts-content { display: grid; gap: 20px; }
    .alerts-content__summary { margin: 0; color: var(--couponleo-muted); }
    .alerts-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 18px; }
    .alerts-card { display: grid; align-content: start; gap: 12px; padding: 22px; }
    .alerts-card__top { display: flex; justify-content: space-between; gap: 10px; color: var(--couponleo-muted); }
    .alerts-card__top strong { color: var(--couponleo-blue); }
    .alerts-card h3, .alerts-empty h3 { margin: 0; color: var(--couponleo-navy); }
    .alerts-card p, .alerts-empty p { margin: 0; color: var(--couponleo-muted); line-height: 1.55; }
    .alerts-card small { color: var(--couponleo-muted); }
    .alerts-card .couponleo-button { justify-self: start; margin-top: 6px; }
    .alerts-empty { display: grid; gap: 12px; padding: 28px; border: 1px solid rgba(22,36,74,.12); border-radius: 20px; background: #fff; }
    .alerts-empty a { color: var(--couponleo-blue); font-weight: 700; }
    @media (max-width: 900px) { .alerts-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @media (max-width: 640px) { .alerts-grid { grid-template-columns: 1fr; } }
  `],
})
export default class AlertsPage {
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly saved = inject(CouponleoSavedService);
  private readonly newsletter = inject(CouponleoNewsletterService);
  private readonly i18n = inject(CouponleoI18nService);
  protected readonly savedCount = this.saved.count;
  protected readonly preview = signal<CouponleoNewsletterPreview | null>(null);
  protected readonly state = signal<'idle' | 'loading' | 'ready' | 'error'>('idle');
  protected readonly localizeRoute = (path: string) => localizeCouponleoRoute(path, this.i18n.locale());
  protected readonly phrase = (value: string) => this.i18n.phrase(value);

  constructor() {
    effect((onCleanup) => {
      const items = this.saved.items();
      if (!this.browser || !items.length) {
        this.preview.set(null);
        this.state.set('idle');
        return;
      }
      this.state.set('loading');
      const subscription = this.newsletter.previewSavedItems(items).subscribe({
        next: ({ data }) => { this.preview.set(data); this.state.set('ready'); },
        error: () => { this.preview.set(null); this.state.set('error'); },
      });
      onCleanup(() => subscription.unsubscribe());
    });
  }
}
