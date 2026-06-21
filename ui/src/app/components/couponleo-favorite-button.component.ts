import { Component, input, output } from '@angular/core';
import { CouponleoEonIconComponent } from './couponleo-eon-icon.component';

import bookmarkIconSvg from '@eonui/icons/svg/office/eon-bookmark.svg?raw';

@Component({
  selector: 'app-couponleo-favorite-button',
  imports: [CouponleoEonIconComponent],
  template: `
    <button
      type="button"
      class="couponleo-favorite-button"
      [class.is-active]="active()"
      [attr.aria-label]="ariaLabel()"
      [attr.aria-pressed]="active()"
      (click)="toggled.emit()"
    >
      <app-couponleo-eon-icon [svg]="bookmarkIconSvg"></app-couponleo-eon-icon>
    </button>
  `,
  styles: [`
    :host {
      display: inline-flex;
    }

    .couponleo-favorite-button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 2.6rem;
      height: 2.6rem;
      border: 1px solid rgba(22, 36, 74, 0.1);
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.96);
      color: #9ca8bf;
      box-shadow: 0 10px 22px rgba(18, 35, 77, 0.08);
      transition:
        transform 0.2s ease,
        border-color 0.2s ease,
        background 0.2s ease,
        color 0.2s ease,
        box-shadow 0.2s ease;
    }

    .couponleo-favorite-button:hover {
      transform: translateY(-1px);
      border-color: rgba(255, 122, 61, 0.24);
      color: var(--couponleo-orange);
    }

    .couponleo-favorite-button.is-active {
      border-color: rgba(255, 122, 61, 0.26);
      background: linear-gradient(180deg, #fff4ec 0%, #ffe8d8 100%);
      color: var(--couponleo-orange);
      box-shadow: 0 14px 28px rgba(255, 122, 61, 0.18);
    }

    .couponleo-favorite-button app-couponleo-eon-icon {
      width: 1.1rem;
      height: 1.1rem;
    }
  `],
})
export class CouponleoFavoriteButtonComponent {
  protected readonly bookmarkIconSvg = bookmarkIconSvg;

  readonly active = input(false);
  readonly ariaLabel = input('Add to wishlist');
  readonly toggled = output<void>();
}
