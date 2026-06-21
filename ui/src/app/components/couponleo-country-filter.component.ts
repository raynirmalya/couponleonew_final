import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { CouponleoI18nService } from '../services/couponleo-i18n.service';

export interface CouponleoCountryFilterOption {
  value: string;
  label: string;
}

@Component({
  selector: 'app-couponleo-country-filter',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="couponleo-filter-bar">
      <div class="couponleo-filter-bar__copy">
        <span class="couponleo-eyebrow">{{ resolvedEyebrow() }}</span>
        <strong>{{ resolvedTitle() }}</strong>
        @if (summary()) {
          <span>{{ summary() }}</span>
        }
      </div>

      <label class="couponleo-filter-field">
        <span>{{ countryLabel() }}</span>
        <select [value]="selected()" (change)="handleChange($event)">
          @for (option of options(); track option.value) {
            <option [value]="option.value">{{ option.label }}</option>
          }
        </select>
      </label>
    </div>
  `,
})
export class CouponleoCountryFilterComponent {
  private readonly i18n = inject(CouponleoI18nService);

  readonly eyebrow = input('');
  readonly title = input('');
  readonly summary = input('');
  readonly selected = input('all');
  readonly options = input<CouponleoCountryFilterOption[]>([]);
  readonly changed = output<string>();
  protected readonly countryLabel = computed(() => this.i18n.t('filter.country'));
  protected readonly resolvedEyebrow = computed(() => this.eyebrow() || this.i18n.t('filter.eyebrow'));
  protected readonly resolvedTitle = computed(() => this.title() || this.i18n.t('filter.title'));

  protected handleChange(event: Event): void {
    const target = event.target as HTMLSelectElement | null;
    this.changed.emit(target?.value ?? 'all');
  }
}
