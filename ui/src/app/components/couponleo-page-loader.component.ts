import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

@Component({
  selector: 'app-couponleo-page-loader',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="couponleo-page-loader" aria-live="polite" aria-busy="true">
      <div class="couponleo-page-loader__copy">
        <span class="couponleo-page-loader__eyebrow couponleo-skeleton"></span>
        <span class="couponleo-page-loader__line couponleo-page-loader__line--title couponleo-skeleton"></span>
        <span class="couponleo-page-loader__line couponleo-page-loader__line--copy couponleo-skeleton"></span>
      </div>

      <div class="couponleo-page-loader__frame" [class.couponleo-page-loader__frame--sidebar]="showSidebar()">
        @if (showSidebar()) {
          <aside class="couponleo-page-loader__sidebar">
            <span class="couponleo-page-loader__line couponleo-page-loader__line--sidebar-title couponleo-skeleton"></span>

            @for (placeholder of sidebarItems(); track placeholder) {
              <span class="couponleo-page-loader__sidebar-chip couponleo-skeleton"></span>
            }
          </aside>
        }

        <div class="couponleo-page-loader__content">
          @if (showFilterBar()) {
            <div class="couponleo-page-loader__filter">
              <span class="couponleo-page-loader__line couponleo-page-loader__line--filter-copy couponleo-skeleton"></span>
              <span class="couponleo-page-loader__field couponleo-skeleton"></span>
            </div>
          }

          <div class="couponleo-page-loader__grid" [style.gridTemplateColumns]="gridTemplateColumns()">
            @for (placeholder of cardItems(); track placeholder) {
              <article class="couponleo-page-loader__card">
                <div class="couponleo-page-loader__card-top">
                  <span class="couponleo-page-loader__avatar couponleo-skeleton"></span>
                  <span class="couponleo-page-loader__line couponleo-page-loader__line--card-top couponleo-skeleton"></span>
                </div>
                <span class="couponleo-page-loader__line couponleo-page-loader__line--card-title couponleo-skeleton"></span>
                <span class="couponleo-page-loader__line couponleo-page-loader__line--card-copy couponleo-skeleton"></span>
                <span class="couponleo-page-loader__line couponleo-page-loader__line--card-copy-short couponleo-skeleton"></span>
                <div class="couponleo-page-loader__card-actions">
                  <span class="couponleo-page-loader__pill couponleo-skeleton"></span>
                  <span class="couponleo-page-loader__button couponleo-skeleton"></span>
                </div>
              </article>
            }
          </div>

          @if (showStats()) {
            <div class="couponleo-page-loader__stats" [style.gridTemplateColumns]="statsTemplateColumns()">
              @for (placeholder of statItems(); track placeholder) {
                <div class="couponleo-page-loader__stat">
                  <span class="couponleo-page-loader__stat-icon couponleo-skeleton"></span>
                  <div class="couponleo-page-loader__stat-copy">
                    <span class="couponleo-page-loader__line couponleo-page-loader__line--stat-title couponleo-skeleton"></span>
                    <span class="couponleo-page-loader__line couponleo-page-loader__line--stat-copy couponleo-skeleton"></span>
                  </div>
                </div>
              }
            </div>
          }
        </div>
      </div>
    </section>
  `,
})
export class CouponleoPageLoaderComponent {
  readonly cards = input(4);
  readonly columns = input(4);
  readonly showSidebar = input(false);
  readonly sidebarCount = input(6);
  readonly showFilterBar = input(true);
  readonly showStats = input(true);
  readonly statsCount = input(4);

  protected readonly cardItems = computed(() => Array.from({ length: Math.max(this.cards(), 1) }, (_, index) => index));
  protected readonly sidebarItems = computed(() => Array.from({ length: Math.max(this.sidebarCount(), 1) }, (_, index) => index));
  protected readonly statItems = computed(() => Array.from({ length: Math.max(this.statsCount(), 1) }, (_, index) => index));
  protected readonly gridTemplateColumns = computed(() => `repeat(${Math.max(this.columns(), 1)}, minmax(0, 1fr))`);
  protected readonly statsTemplateColumns = computed(() => `repeat(${Math.max(this.statsCount(), 1)}, minmax(0, 1fr))`);
}
