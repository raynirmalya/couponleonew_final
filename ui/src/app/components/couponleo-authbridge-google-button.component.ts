import { Component, computed, inject, input, output } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { createAuthBridge, getProviderIconHtml } from '@eonui/authbridge';

@Component({
  selector: 'app-couponleo-authbridge-google-button',
  template: `
    <button
      type="button"
      class="couponleo-authbridge-google"
      [disabled]="busy()"
      (click)="handleClick()"
    >
      <span
        class="couponleo-authbridge-google__icon"
        aria-hidden="true"
        [innerHTML]="icon()"
      ></span>
      <span>{{ busy() ? provider().loadingLabel : provider().buttonLabel }}</span>
    </button>
  `,
  styles: [`
    :host {
      display: block;
    }

    .couponleo-authbridge-google {
      display: grid;
      grid-template-columns: auto 1fr;
      align-items: center;
      gap: 16px;
      width: 100%;
      min-height: 58px;
      padding: 0 22px;
      border: 1px solid rgba(22, 36, 74, 0.12);
      border-radius: 16px;
      background: #fff;
      color: var(--couponleo-navy);
      font-size: 1rem;
      font-weight: 700;
      box-shadow: 0 12px 28px rgba(18, 35, 77, 0.04);
      transition:
        transform 0.2s ease,
        box-shadow 0.2s ease,
        border-color 0.2s ease;
    }

    .couponleo-authbridge-google:hover:not(:disabled) {
      transform: translateY(-1px);
      border-color: rgba(52, 120, 255, 0.28);
      box-shadow: 0 14px 30px rgba(18, 35, 77, 0.08);
    }

    .couponleo-authbridge-google:disabled {
      opacity: 0.75;
      cursor: wait;
    }

    .couponleo-authbridge-google__icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 1.55rem;
      height: 1.55rem;
    }

    .couponleo-authbridge-google__icon :is(svg, span) {
      display: block;
      width: 100%;
      height: 100%;
    }
  `],
})
export class CouponleoAuthbridgeGoogleButtonComponent {
  private readonly sanitizer = inject(DomSanitizer);

  readonly buttonLabel = input('Continue with Google');
  readonly loadingLabel = input('Opening Google...');
  readonly busy = input(false);
  readonly googleSelected = output<void>();

  protected readonly authBridge = computed(() =>
    createAuthBridge({
      orientation: 'stack',
      providers: ['google'],
      autoHref: false,
      iconMode: 'icon',
      texts: {
        buttonLabel: this.buttonLabel(),
        loadingLabel: this.loadingLabel(),
        ariaLabel: this.buttonLabel(),
      },
      iconResolver: (provider) => getProviderIconHtml(provider.id),
    }),
  );

  protected readonly provider = computed(() => this.authBridge().providers[0]);
  protected readonly icon = computed<SafeHtml | null>(() => {
    const iconHtml = this.provider().iconHtml;
    return iconHtml
      ? this.sanitizer.bypassSecurityTrustHtml(iconHtml)
      : null;
  });

  protected handleClick(): void {
    this.googleSelected.emit();
  }
}
