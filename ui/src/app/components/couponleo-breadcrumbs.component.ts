import { Component, computed, input, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { CouponleoI18nService } from '../services/couponleo-i18n.service';
import { localizeCouponleoRoute } from '../services/couponleo-ui.helpers';

export interface CouponleoBreadcrumbItem {
  label: string;
  href?: string;
  queryParams?: Record<string, string | null>;
}

@Component({
  selector: 'app-couponleo-breadcrumbs',
  imports: [RouterLink],
  template: `
    @if (items().length > 0) {
      <nav class="couponleo-breadcrumbs" [attr.aria-label]="ariaLabel()">
        <ol class="couponleo-breadcrumbs__list">
          @for (item of items(); track item.label + item.href; let last = $last) {
            <li class="couponleo-breadcrumbs__item">
              @if (item.href && !last) {
                <a
                  [routerLink]="localizedHref(item.href)"
                  [queryParams]="item.queryParams ?? null"
                  data-telemetry-event="breadcrumb_navigation"
                  [attr.data-telemetry-label]="item.label"
                >
                  {{ item.label }}
                </a>
              } @else {
                <span [attr.aria-current]="last ? 'page' : null">{{ item.label }}</span>
              }
            </li>
          }
        </ol>
      </nav>
    }
  `,
  styles: [`
    :host {
      display: block;
    }

    .couponleo-breadcrumbs {
      margin-bottom: 0.9rem;
    }

    .couponleo-breadcrumbs__list {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.4rem 0.7rem;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .couponleo-breadcrumbs__item {
      display: inline-flex;
      align-items: center;
      gap: 0.7rem;
      color: var(--couponleo-muted);
      font-size: 0.9rem;
      line-height: 1.5;
    }

    .couponleo-breadcrumbs__item:not(:last-child)::after {
      content: "/";
      color: rgba(104, 117, 143, 0.68);
    }

    .couponleo-breadcrumbs__item a {
      color: var(--couponleo-blue);
      font-weight: 700;
    }

    .couponleo-breadcrumbs__item span[aria-current="page"] {
      color: var(--couponleo-navy);
      font-weight: 700;
    }
  `],
})
export class CouponleoBreadcrumbsComponent {
  private readonly i18n = inject(CouponleoI18nService);

  readonly items = input<CouponleoBreadcrumbItem[]>([]);

  protected readonly ariaLabel = computed(() => this.i18n.phrase('Breadcrumb'));

  protected localizedHref(path: string): string {
    return localizeCouponleoRoute(path, this.i18n.locale());
  }
}
