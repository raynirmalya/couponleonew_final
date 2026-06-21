import { Component, computed, inject, input, output } from '@angular/core';
import { CouponleoI18nService } from '../services/couponleo-i18n.service';

type PaginationItem =
  | { kind: 'page'; value: number; key: string }
  | { kind: 'ellipsis'; key: string };

function buildVisiblePageNumbers(currentPage: number, totalPages: number): number[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pages = new Set<number>([
    1,
    totalPages,
    currentPage - 1,
    currentPage,
    currentPage + 1,
  ]);

  if (currentPage <= 4) {
    [2, 3, 4, 5].forEach((pageNumber) => pages.add(pageNumber));
  }

  if (currentPage >= totalPages - 3) {
    [totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1]
      .forEach((pageNumber) => pages.add(pageNumber));
  }

  return [...pages]
    .filter((pageNumber) => pageNumber >= 1 && pageNumber <= totalPages)
    .sort((left, right) => left - right);
}

function buildPaginationItems(currentPage: number, totalPages: number): PaginationItem[] {
  const pageNumbers = buildVisiblePageNumbers(currentPage, totalPages);
  const items: PaginationItem[] = [];

  for (let index = 0; index < pageNumbers.length; index += 1) {
    const pageNumber = pageNumbers[index];
    const previousPage = pageNumbers[index - 1];

    if (previousPage && pageNumber - previousPage > 1) {
      items.push({ kind: 'ellipsis', key: `ellipsis-${previousPage}-${pageNumber}` });
    }

    items.push({ kind: 'page', value: pageNumber, key: `page-${pageNumber}` });
  }

  return items;
}

@Component({
  selector: 'app-couponleo-pagination',
  template: `
    @if (pageCount() > 1) {
      <nav class="couponleo-pagination" [attr.aria-label]="labels().nav">
        <div class="couponleo-pagination__summary">
          <strong>{{ totalItems().toLocaleString() }}</strong>
          <span>{{ itemLabel() }}</span>
        </div>

        <div class="couponleo-pagination__controls">
          <button
            type="button"
            class="couponleo-pagination__button"
            [disabled]="page() <= 1"
            (click)="selectPage(page() - 1)"
          >
            {{ labels().previous }}
          </button>

          <div class="couponleo-pagination__pages">
            @for (item of visibleItems(); track item.key) {
              @if (item.kind === 'page') {
                <button
                  type="button"
                  class="couponleo-pagination__page"
                  [class.is-active]="item.value === page()"
                  [attr.aria-current]="item.value === page() ? 'page' : null"
                  (click)="selectPage(item.value)"
                >
                  {{ item.value }}
                </button>
              } @else {
                <span class="couponleo-pagination__ellipsis" aria-hidden="true">...</span>
              }
            }
          </div>

          <button
            type="button"
            class="couponleo-pagination__button"
            [disabled]="page() >= pageCount()"
            (click)="selectPage(page() + 1)"
          >
            {{ labels().next }}
          </button>
        </div>
      </nav>
    }
  `,
  styles: [`
    :host {
      display: block;
      margin-top: 18px;
    }

    .couponleo-pagination {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 14px;
      padding: 14px 18px;
      border: 1px solid rgba(22, 36, 74, 0.08);
      border-radius: 20px;
      background: rgba(255, 255, 255, 0.9);
      box-shadow: 0 14px 30px rgba(18, 35, 77, 0.06);
    }

    .couponleo-pagination__summary {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      color: var(--couponleo-muted);
    }

    .couponleo-pagination__summary strong {
      color: var(--couponleo-navy);
      font-size: 1rem;
    }

    .couponleo-pagination__controls,
    .couponleo-pagination__pages {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .couponleo-pagination__controls {
      flex: 1 1 32rem;
      flex-wrap: wrap;
      justify-content: flex-end;
      min-width: 0;
    }

    .couponleo-pagination__pages {
      flex-wrap: wrap;
      justify-content: flex-end;
      min-width: 0;
    }

    .couponleo-pagination__button,
    .couponleo-pagination__page {
      min-height: 42px;
      padding: 0 14px;
      border: 1px solid rgba(22, 36, 74, 0.12);
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.96);
      color: var(--couponleo-text);
      font-weight: 700;
    }

    .couponleo-pagination__page {
      min-width: 42px;
      justify-content: center;
    }

    .couponleo-pagination__ellipsis {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 24px;
      min-height: 42px;
      color: var(--couponleo-muted);
      font-weight: 700;
      letter-spacing: 0.08em;
    }

    .couponleo-pagination__page.is-active {
      border-color: transparent;
      background: linear-gradient(135deg, #3480ff 0%, #2355f6 100%);
      color: #fff;
      box-shadow: 0 12px 22px rgba(52, 120, 255, 0.2);
    }

    .couponleo-pagination__button[disabled],
    .couponleo-pagination__page[disabled] {
      cursor: not-allowed;
      opacity: 0.45;
      box-shadow: none;
    }

    @media (max-width: 780px) {
      .couponleo-pagination {
        align-items: stretch;
      }

      .couponleo-pagination__controls {
        width: 100%;
        justify-content: center;
      }

      .couponleo-pagination__pages {
        justify-content: center;
      }
    }
  `],
})
export class CouponleoPaginationComponent {
  private readonly i18n = inject(CouponleoI18nService);

  readonly page = input.required<number>();
  readonly pageCount = input.required<number>();
  readonly totalItems = input(0);
  readonly itemLabel = input('results');
  readonly pageChange = output<number>();

  protected readonly visibleItems = computed(() => buildPaginationItems(this.page(), this.pageCount()));
  protected readonly labels = computed(() => ({
    nav: this.i18n.t('pagination.nav'),
    next: this.i18n.t('pagination.next'),
    previous: this.i18n.t('pagination.previous'),
  }));

  protected selectPage(pageNumber: number): void {
    if (pageNumber < 1 || pageNumber > this.pageCount() || pageNumber === this.page()) {
      return;
    }

    this.pageChange.emit(pageNumber);
  }
}
