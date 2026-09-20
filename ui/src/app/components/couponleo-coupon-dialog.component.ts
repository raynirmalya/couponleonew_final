import { isPlatformBrowser } from '@angular/common';
import { Component, HostListener, PLATFORM_ID, effect, inject, input, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CouponleoEonIconComponent } from './couponleo-eon-icon.component';
import { CouponleoTelemetryService } from '../services/couponleo-telemetry.service';
import { CouponleoApiService, CouponleoOfferVerification } from '../services/couponleo-api.service';
import { CouponleoOfferVerificationComponent } from './couponleo-offer-verification.component';
import { firstValueFrom } from 'rxjs';

import copyIconSvg from '@eonui/icons/svg/office/eon-copy.svg?raw';
import ticketIconSvg from '@eonui/icons/svg/office/eon-ticket.svg?raw';
import xIconSvg from '@eonui/icons/svg/system/eon-x-mark.svg?raw';

export interface CouponleoCouponReveal {
  title: string;
  subtitle: string;
  description: string;
  code: string;
  route: string;
  ctaUrl?: string;
  couponId?: number | string;
  verification?: CouponleoOfferVerification;
}

@Component({
  selector: 'app-couponleo-coupon-dialog',
  imports: [RouterLink, CouponleoEonIconComponent, CouponleoOfferVerificationComponent],
  template: `
    @if (coupon(); as item) {
      <div class="couponleo-coupon-dialog" (click)="handleBackdropClick($event)">
        <section
          class="couponleo-coupon-dialog__panel"
          role="dialog"
          aria-modal="true"
          aria-labelledby="couponleo-coupon-dialog-title"
        >
          <button
            type="button"
            class="couponleo-coupon-dialog__close"
            aria-label="Close coupon popup"
            (click)="closeRequested.emit()"
          >
            <app-couponleo-eon-icon [svg]="xIconSvg"></app-couponleo-eon-icon>
          </button>

          <div class="couponleo-coupon-dialog__eyebrow">
            <span class="couponleo-coupon-dialog__eyebrow-icon" aria-hidden="true">
              <app-couponleo-eon-icon [svg]="ticketIconSvg"></app-couponleo-eon-icon>
            </span>
            {{ item.code ? 'Coupon ready to copy' : 'Offer details' }}
          </div>

          <h3 id="couponleo-coupon-dialog-title">{{ item.title }}</h3>
          <p class="couponleo-coupon-dialog__subtitle">{{ item.subtitle }}</p>
          <p class="couponleo-coupon-dialog__description">{{ item.description }}</p>

          @if (reviewLoading()) {
            <p role="status">Checking the latest verification result…</p>
          } @else {
            <app-couponleo-offer-verification [verification]="currentReview()" [expanded]="true" />
          }
          @if (reviewError()) { <p role="status">Verification could not be refreshed. Check the offer with the merchant.</p> }

          @if (item.couponId) {
            <section class="couponleo-coupon-dialog__feedback" aria-label="Report offer outcome">
              <strong>Did this offer work for you?</strong>
              <p>Share your checkout result. Shopper reports are reviewed and do not verify an offer.</p>
              <div>
                <button type="button" [disabled]="feedbackState() === 'sending' || feedbackState() === 'done'" (click)="reportOutcome('worked')">Yes, it worked</button>
                <button type="button" [disabled]="feedbackState() === 'sending' || feedbackState() === 'done'" (click)="reportOutcome('did_not_work')">No, it did not</button>
              </div>
              @if (feedbackState() === 'done') { <p role="status">{{ feedbackMessage() }}</p> }
              @if (feedbackState() === 'error') { <p role="alert">The report could not be sent. Please try again later.</p> }
            </section>
          }

          @if (item.code) {
          <div class="couponleo-coupon-dialog__ticket">
            <span>Use this code at checkout</span>
            <strong>{{ item.code }}</strong>
          </div>

          } @else {
            <p>No coupon code is supplied. Check the offer and final price on the merchant website.</p>
          }
          @if (merchantUrl(item.ctaUrl)) {
            <p class="couponleo-coupon-dialog__description">We may earn a commission if you buy through this link. Check eligibility and the final price at checkout.</p>
          }
          <div class="couponleo-coupon-dialog__actions">
            @if (item.code) {
            <button
              type="button"
              class="couponleo-button couponleo-button--solid couponleo-coupon-dialog__copy"
              (click)="copyCode(item.code)"
            >
              <span aria-hidden="true">
                <app-couponleo-eon-icon [svg]="copyIconSvg"></app-couponleo-eon-icon>
              </span>
              {{ copied() ? 'Copied' : 'Copy Code' }}
            </button>

            }
            @if (merchantUrl(item.ctaUrl); as url) {
              <a class="couponleo-button couponleo-button--ghost" [href]="url" target="_blank" rel="noopener noreferrer sponsored">Visit merchant</a>
            } @else {
            <a
              class="couponleo-button couponleo-button--ghost"
              [routerLink]="item.route"
              (click)="closeRequested.emit()"
            >
              Open deal page
            </a>
            }
          </div>
        </section>
      </div>
    }
  `,
  styles: [`
    :host {
      display: contents;
    }

    .couponleo-coupon-dialog {
      position: fixed;
      inset: 0;
      z-index: 80;
      display: grid;
      place-items: center;
      padding: 20px;
      background: rgba(9, 18, 40, 0.48);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
    }

    .couponleo-coupon-dialog__panel {
      position: relative;
      width: min(100%, 32rem);
      display: grid;
      gap: 16px;
      padding: 30px;
      border: 1px solid rgba(255, 255, 255, 0.96);
      border-radius: 30px;
      background:
        radial-gradient(circle at top right, rgba(255, 177, 74, 0.14), transparent 34%),
        radial-gradient(circle at top left, rgba(52, 120, 255, 0.1), transparent 28%),
        rgba(255, 255, 255, 0.98);
      box-shadow: 0 36px 80px rgba(9, 18, 40, 0.26);
    }

    .couponleo-coupon-dialog__close {
      position: absolute;
      top: 16px;
      right: 16px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 2.5rem;
      height: 2.5rem;
      border: 0;
      border-radius: 999px;
      background: rgba(22, 36, 74, 0.06);
      color: var(--couponleo-navy);
    }

    .couponleo-coupon-dialog__close app-couponleo-eon-icon {
      width: 1rem;
      height: 1rem;
    }

    .couponleo-coupon-dialog__eyebrow {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      width: fit-content;
      padding: 10px 14px;
      border-radius: 999px;
      background: rgba(255, 122, 61, 0.1);
      color: var(--couponleo-orange);
      font-size: 0.84rem;
      font-weight: 800;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }

    .couponleo-coupon-dialog__eyebrow-icon {
      display: inline-flex;
      width: 1rem;
      height: 1rem;
    }

    .couponleo-coupon-dialog h3,
    .couponleo-coupon-dialog__ticket strong {
      margin: 0;
      color: var(--couponleo-navy);
    }

    .couponleo-coupon-dialog h3 {
      font-size: clamp(2rem, 4vw, 2.8rem);
      line-height: 0.94;
      letter-spacing: -0.05em;
    }

    .couponleo-coupon-dialog__subtitle,
    .couponleo-coupon-dialog__description,
    .couponleo-coupon-dialog__ticket span {
      margin: 0;
      color: var(--couponleo-muted);
    }

    .couponleo-coupon-dialog__subtitle {
      font-size: 1rem;
      font-weight: 800;
    }

    .couponleo-coupon-dialog__description {
      line-height: 1.65;
    }

    .couponleo-coupon-dialog__ticket {
      display: grid;
      gap: 8px;
      padding: 22px;
      border: 1px dashed rgba(52, 120, 255, 0.26);
      border-radius: 22px;
      background: linear-gradient(180deg, #f7fbff 0%, #eef4ff 100%);
    }

    .couponleo-coupon-dialog__ticket strong {
      font-size: clamp(2rem, 5vw, 2.8rem);
      line-height: 1;
      letter-spacing: 0.08em;
    }

    .couponleo-coupon-dialog__actions {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
    }

    .couponleo-coupon-dialog__copy {
      gap: 10px;
    }

    .couponleo-coupon-dialog__copy span {
      display: inline-flex;
      width: 1rem;
      height: 1rem;
    }

    .couponleo-coupon-dialog__feedback {
      display: grid;
      gap: 8px;
      padding: 14px;
      border: 1px solid rgba(22, 36, 74, 0.12);
      border-radius: 16px;
      background: #f7f9ff;
    }

    .couponleo-coupon-dialog__feedback p { margin: 0; color: var(--couponleo-muted); font-size: .88rem; }
    .couponleo-coupon-dialog__feedback div { display: flex; flex-wrap: wrap; gap: 8px; }
    .couponleo-coupon-dialog__feedback button {
      min-height: 40px; padding: 8px 12px; border: 1px solid #2355f6; border-radius: 8px;
      background: #fff; color: #183a91; font: inherit; font-weight: 700; cursor: pointer;
    }
    .couponleo-coupon-dialog__feedback button:disabled { opacity: .55; cursor: default; }
    .couponleo-coupon-dialog__feedback button:focus-visible { outline: 3px solid #dc7300; outline-offset: 2px; }

    @media (max-width: 640px) {
      .couponleo-coupon-dialog {
        align-items: end;
        padding: 12px;
      }

      .couponleo-coupon-dialog__panel {
        width: 100%;
        padding: 26px 18px 20px;
        border-radius: 28px 28px 18px 18px;
      }

      .couponleo-coupon-dialog__actions {
        grid-template-columns: 1fr;
      }
    }
  `],
})
export class CouponleoCouponDialogComponent {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly browser = isPlatformBrowser(this.platformId);
  private readonly telemetry = inject(CouponleoTelemetryService);
  private readonly api = inject(CouponleoApiService);
  private copyResetTimer: ReturnType<typeof setTimeout> | null = null;

  readonly coupon = input<CouponleoCouponReveal | null>(null);
  readonly closeRequested = output<void>();

  protected readonly xIconSvg = xIconSvg;
  protected readonly copyIconSvg = copyIconSvg;
  protected readonly ticketIconSvg = ticketIconSvg;
  protected readonly copied = signal(false);
  protected readonly currentReview = signal<CouponleoOfferVerification | undefined>(undefined);
  protected readonly reviewLoading = signal(false);
  protected readonly reviewError = signal(false);
  protected readonly feedbackState = signal<'idle' | 'sending' | 'done' | 'error'>('idle');
  protected readonly feedbackMessage = signal('');

  constructor() {
    effect((onCleanup) => {
      const item = this.coupon();
      this.currentReview.set(undefined);
      this.reviewError.set(false);
      this.reviewLoading.set(false);
      this.feedbackState.set('idle');
      this.feedbackMessage.set('');
      if (!this.browser || !item?.couponId) return;
      this.reviewLoading.set(true);
      const subscription = this.api.getCouponVerification(item.couponId).subscribe({
        next: ({ data }) => {
          this.currentReview.set(item.verification?.offerFingerprint === data.offerFingerprint ? data : {
            ...data, status: 'offer_changed', validUntil: null,
            summary: 'The offer has changed. Reload the store page to get its current details.',
          });
          this.reviewLoading.set(false);
        },
        error: () => { this.reviewLoading.set(false); this.reviewError.set(true); },
      });
      onCleanup(() => subscription.unsubscribe());
    });
  }

  protected async reportOutcome(outcome: 'worked' | 'did_not_work'): Promise<void> {
    const item = this.coupon();
    if (!this.browser || !item?.couponId || ['sending', 'done'].includes(this.feedbackState())) return;
    this.feedbackState.set('sending');
    try {
      const response = await firstValueFrom(this.api.reportCouponFeedback(item.couponId, outcome));
      this.feedbackMessage.set(response.data.message);
      this.feedbackState.set('done');
    } catch {
      this.feedbackState.set('error');
    }
  }

  protected merchantUrl(value?: string): string | null {
    try { const url = new URL(value || ''); return ['http:', 'https:'].includes(url.protocol) ? url.href : null; }
    catch { return null; }
  }

  @HostListener('document:keydown.escape')
  protected handleEscape(): void {
    if (this.coupon()) {
      this.closeRequested.emit();
    }
  }

  protected handleBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.closeRequested.emit();
    }
  }

  protected async copyCode(code: string): Promise<void> {
    if (!this.browser) {
      return;
    }

    try {
      await navigator.clipboard.writeText(code);
      this.copied.set(true);
      const coupon = this.coupon();
      this.telemetry.trackStructured({
        eventType: 'coupon',
        eventName: 'copy_code',
        actionLabel: coupon?.title || 'copy code',
        targetUrl: coupon?.route || '',
        metadata: {
          title: coupon?.title || '',
          route: coupon?.route || '',
          codeLength: code.length,
        },
      });

      if (this.copyResetTimer) {
        clearTimeout(this.copyResetTimer);
      }

      this.copyResetTimer = setTimeout(() => {
        this.copied.set(false);
        this.copyResetTimer = null;
      }, 1600);
    } catch {
      this.copied.set(false);
    }
  }
}
