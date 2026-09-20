import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { catchError, of } from 'rxjs';

import { couponleoCountryPages } from '../../content/couponleo-country-pages';
import { CouponleoApiService } from '../../services/couponleo-api.service';
import { createStaticRouteMeta } from '../../services/couponleo-route-meta';

export const routeMeta = createStaticRouteMeta({
  title: 'Top Coupons by Country | CouponLeo',
  description: 'Explore current coupon codes and deals by country, then compare stores and categories with real offers in each market.',
});

@Component({
  selector: 'app-couponleo-country-directory',
  imports: [RouterLink],
  template: `
    <main class="couponleo-country-directory">
      <nav aria-label="Breadcrumb"><a routerLink="/">Home</a><span aria-hidden="true"> / </span>Top coupons</nav>
      <header>
        <span class="couponleo-eyebrow">Browse by market</span>
        <h1>Top Coupons by Country</h1>
        <p>Choose a market to compare current offers from different stores. Check each merchant's terms and final checkout price before buying.</p>
      </header>
      @if (countries().length) {
        <section aria-labelledby="country-list-heading">
          <h2 id="country-list-heading">Countries with current offers</h2>
          <div class="couponleo-country-directory__grid">
            @for (country of countries(); track country.slug) {
              <a [routerLink]="['/top-coupons', country.slug]">
                <strong>{{ country.name }}</strong>
                <span>{{ country.couponCount.toLocaleString() }} offers from {{ country.storeCount.toLocaleString() }} stores</span>
              </a>
            }
          </div>
        </section>
      } @else {
        <section><h2>Explore current deals</h2><p>Country listings are refreshing. Browse the full catalog while they update.</p><a routerLink="/country-deals">Browse country deals</a></section>
      }
    </main>
  `,
  styles: [`
    .couponleo-country-directory { max-width: 1180px; margin: 0 auto; padding: 32px 20px 80px; color: var(--couponleo-text); }
    .couponleo-country-directory a { color: var(--couponleo-orange); text-underline-offset: 3px; }
    .couponleo-country-directory a:focus-visible { outline: 3px solid var(--couponleo-orange); outline-offset: 4px; }
    .couponleo-country-directory header { margin: 32px 0 48px; padding: clamp(28px, 5vw, 64px); border-radius: 24px; background: var(--couponleo-surface-soft, #f7f7f7); }
    .couponleo-country-directory h1 { font-size: clamp(2rem, 5vw, 3.7rem); line-height: 1.1; margin: 12px 0 18px; }
    .couponleo-country-directory header p { max-width: 750px; line-height: 1.7; }
    .couponleo-country-directory__grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; margin-top: 22px; }
    .couponleo-country-directory__grid a { display: flex; flex-direction: column; gap: 8px; padding: 20px; border: 1px solid var(--couponleo-border, #ddd); border-radius: 16px; }
    .couponleo-country-directory__grid span { color: var(--couponleo-text); font-size: .9rem; }
    @media (max-width: 760px) { .couponleo-country-directory__grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @media (max-width: 520px) { .couponleo-country-directory__grid { grid-template-columns: 1fr; } }
  `],
})
export default class CouponleoCountryDirectoryPage {
  private readonly api = inject(CouponleoApiService);
  private readonly groupings = toSignal(this.api.listSeoGroupings().pipe(
    catchError(() => of({ countries: [], groups: [] })),
  ), { initialValue: { countries: [], groups: [] } });
  protected readonly countries = computed(() => {
    const supported = new Set(couponleoCountryPages.map((page) => page.slug));
    return this.groupings().countries.filter((country) => supported.has(country.slug));
  });
}
