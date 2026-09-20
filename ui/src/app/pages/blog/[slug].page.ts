import { Component, computed, effect, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { injectResponse } from '@analogjs/router/tokens';
import { distinctUntilChanged, map } from 'rxjs';

import { findCouponleoGuide } from '../../content/couponleo-guides';
import { createDynamicRouteMeta } from '../../services/couponleo-route-meta';

export const routeMeta = createDynamicRouteMeta((route) => {
  const guide = findCouponleoGuide(route.paramMap.get('slug') ?? '');
  return guide
    ? { title: `${guide.title} | CouponLeo`, description: guide.description, type: 'article' }
    : { title: 'Guide Not Found | CouponLeo', description: 'This CouponLeo guide could not be found.', robots: 'noindex,nofollow' };
});

@Component({
  selector: 'app-couponleo-guide-page',
  imports: [RouterLink],
  template: `
    @if (guide(); as article) {
      <article class="couponleo-guide">
        <nav class="couponleo-guide__breadcrumbs" aria-label="Breadcrumb">
          <a routerLink="/">Home</a><span aria-hidden="true">/</span>
          <a routerLink="/blog">Blog</a><span aria-hidden="true">/</span>
          <span aria-current="page">{{ article.title }}</span>
        </nav>

        <header class="couponleo-guide__header">
          <span class="couponleo-eyebrow">CouponLeo savings guide</span>
          <h1>{{ article.title }}</h1>
          <p>{{ article.description }}</p>
        </header>

        @for (section of article.sections; track section.heading) {
          <section class="couponleo-guide__section">
            <h2>{{ section.heading }}</h2>
            @for (paragraph of section.paragraphs; track paragraph) {
              <p>{{ paragraph }}</p>
            }
            @if (section.steps) {
              <ul>
                @for (step of section.steps; track step) {
                  <li>{{ step }}</li>
                }
              </ul>
            }
          </section>
        }

        <aside class="couponleo-guide__next">
          <h2>Find an offer that fits your basket</h2>
          <p>Browse current store and category offers, then confirm the terms at the merchant checkout.</p>
          <div>
            <a routerLink="/stores">Browse stores</a>
            <a routerLink="/categories">Browse categories</a>
          </div>
        </aside>
      </article>
    } @else {
      <section class="couponleo-page-section">
        <h1>Guide not found</h1>
        <p>This guide is unavailable. Browse the current CouponLeo guides instead.</p>
        <a routerLink="/blog">Back to blog</a>
      </section>
    }
  `,
  styles: [`
    .couponleo-guide { max-width: 780px; margin: 0 auto; padding: 36px 20px 80px; color: var(--couponleo-text); }
    .couponleo-guide__breadcrumbs { display: flex; flex-wrap: wrap; gap: 10px; font-size: .88rem; margin-bottom: 42px; }
    .couponleo-guide a { color: var(--couponleo-orange); text-decoration: underline; text-underline-offset: 3px; }
    .couponleo-guide a:focus-visible { outline: 3px solid var(--couponleo-orange); outline-offset: 4px; }
    .couponleo-guide__header { margin-bottom: 44px; }
    .couponleo-guide__header h1 { font-size: clamp(2rem, 5vw, 3.5rem); line-height: 1.12; margin: 12px 0 20px; }
    .couponleo-guide__header p { font-size: 1.17rem; line-height: 1.7; }
    .couponleo-guide__section { margin-top: 38px; }
    .couponleo-guide__section h2, .couponleo-guide__next h2 { font-size: 1.55rem; line-height: 1.3; }
    .couponleo-guide__section p, .couponleo-guide__section li, .couponleo-guide__next p { line-height: 1.75; }
    .couponleo-guide__section li + li { margin-top: 10px; }
    .couponleo-guide__next { margin-top: 56px; padding: 28px; border-radius: 20px; background: var(--couponleo-surface-soft, #f7f7f7); }
    .couponleo-guide__next div { display: flex; flex-wrap: wrap; gap: 20px; margin-top: 20px; }
  `],
})
export default class CouponleoGuidePage {
  private readonly route = inject(ActivatedRoute);
  private readonly response = injectResponse();
  private readonly slug = toSignal(this.route.paramMap.pipe(
    map((params) => params.get('slug') ?? ''),
    distinctUntilChanged(),
  ), { initialValue: this.route.snapshot.paramMap.get('slug') ?? '' });

  protected readonly guide = computed(() => findCouponleoGuide(this.slug()));

  constructor() {
    effect(() => {
      if (!this.guide() && this.response) {
        this.response.statusCode = 404;
      }
    });
  }
}
