import { Component, computed, input, signal } from '@angular/core';

import {
  couponleoBrandmarkInitials,
  proxiedCouponleoLogoUrl,
} from '../services/couponleo-logo.helpers';

@Component({
  selector: 'app-couponleo-brandmark',
  template: `
    @if (resolvedSrc()) {
      <img
        class="couponleo-brandmark__image"
        [src]="resolvedSrc()"
        [alt]="resolvedAlt()"
        loading="lazy"
        decoding="async"
        (error)="markFailed()"
      >
    } @else {
      <span class="couponleo-brandmark__fallback">{{ initials() }}</span>
    }
  `,
  styles: [`
    :host {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      height: 100%;
      min-width: 0;
      overflow: hidden;
      border: 1px solid rgba(22, 36, 74, 0.08);
      border-radius: inherit;
      background: linear-gradient(180deg, rgba(255, 255, 255, 0.98) 0%, rgba(240, 244, 252, 0.98) 100%);
      box-shadow: 0 12px 24px rgba(18, 35, 77, 0.08);
    }

    .couponleo-brandmark__image,
    .couponleo-brandmark__fallback {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      height: 100%;
    }

    .couponleo-brandmark__image {
      box-sizing: border-box;
      object-fit: contain;
      background: #fff;
      padding: 0.08rem;
      transform: scale(1.08);
      transform-origin: center;
    }

    .couponleo-brandmark__fallback {
      color: var(--couponleo-blue);
      font-size: 1rem;
      font-weight: 900;
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }
  `],
})
export class CouponleoBrandmarkComponent {
  readonly name = input.required<string>();
  readonly src = input('');
  readonly fallbackSrc = input('');
  readonly alt = input('');

  private readonly failedUrls = signal<string[]>([]);

  protected readonly initials = computed(() => couponleoBrandmarkInitials(this.name()));
  protected readonly resolvedSrc = computed(() => {
    const failed = new Set(this.failedUrls());

    for (const candidate of [this.src(), this.fallbackSrc()]) {
      const proxiedUrl = proxiedCouponleoLogoUrl(candidate);
      if (proxiedUrl && !failed.has(proxiedUrl)) {
        return proxiedUrl;
      }
    }

    return '';
  });
  protected readonly resolvedAlt = computed(() => this.alt() || `${this.name()} logo`);

  protected markFailed(): void {
    const currentUrl = this.resolvedSrc();
    if (!currentUrl) {
      return;
    }

    this.failedUrls.update((current) => (
      current.includes(currentUrl) ? current : [...current, currentUrl]
    ));
  }
}
