import { ChangeDetectionStrategy, Component, OnInit, ViewEncapsulation, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { CouponleoEonIconComponent } from './couponleo-eon-icon.component';
import { CouponleoAuthService } from '../services/couponleo-auth.service';
import { CouponleoI18nService } from '../services/couponleo-i18n.service';
import { CouponleoNewsletterService } from '../services/couponleo-newsletter.service';

type CouponleoNewsletterSurface = 'light' | 'dark';
type CouponleoNewsletterStatusTone = 'neutral' | 'success' | 'error';

@Component({
  selector: 'app-couponleo-newsletter-form',
  imports: [FormsModule, CouponleoEonIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  template: `
    <form [class]="formClass()" (ngSubmit)="handleSubmit()">
      <input
        type="email"
        name="newsletterEmail"
        [class]="inputClass()"
        [ngModel]="email()"
        [placeholder]="resolvedPlaceholder()"
        [readonly]="signedInReadonly() && isAuthenticated()"
        [attr.aria-label]="emailAriaLabel()"
        autocomplete="email"
        (ngModelChange)="handleEmailChange($event)"
      >
      <button
        type="submit"
        [class]="buttonClass()"
        [attr.aria-label]="resolvedButtonAriaLabel()"
        [disabled]="submitting()"
      >
        @if (iconOnly() && hasButtonIcon()) {
          <span class="couponleo-newsletter-form__sr-only">{{ currentButtonLabel() }}</span>
          <app-couponleo-eon-icon [svg]="buttonIconSvg()"></app-couponleo-eon-icon>
        } @else {
          {{ currentButtonLabel() }}
        }
      </button>
    </form>

    <div [class]="metaClass()">
      @if (showLoginHint()) {
        <p class="couponleo-newsletter-form__hint">
          @if (isAuthenticated()) {
            {{ i18n.t('newsletter.signedInHint') }}
          } @else {
            {{ i18n.t('newsletter.signInHint') }}
          }
        </p>
      }

      @if (statusMessage()) {
        <p [class]="statusClass()" aria-live="polite">{{ statusMessage() }}</p>
      }
    </div>
  `,
  styles: [`
    .couponleo-newsletter-form__meta {
      display: grid;
      gap: 8px;
      margin-top: 10px;
    }

    .couponleo-newsletter-form__meta--dark {
      color: rgba(255, 255, 255, 0.92);
    }

    .couponleo-newsletter-form__hint,
    .couponleo-newsletter-form__status {
      margin: 0;
      font-size: 0.9rem;
      line-height: 1.5;
    }

    .couponleo-newsletter-form__meta--light .couponleo-newsletter-form__hint {
      color: var(--couponleo-muted);
    }

    .couponleo-newsletter-form__meta--dark .couponleo-newsletter-form__hint {
      color: rgba(255, 255, 255, 0.78);
    }

    .couponleo-newsletter-form__status {
      font-weight: 700;
    }

    .couponleo-newsletter-form__status--light.couponleo-newsletter-form__status--success {
      color: #18794e;
    }

    .couponleo-newsletter-form__status--light.couponleo-newsletter-form__status--error {
      color: #c93030;
    }

    .couponleo-newsletter-form__status--dark.couponleo-newsletter-form__status--success {
      color: #d5ffe9;
    }

    .couponleo-newsletter-form__status--dark.couponleo-newsletter-form__status--error {
      color: #ffe2e2;
    }

    .couponleo-newsletter-form__sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }

    .couponleo-newsletter__form,
    .couponleo-inline-newsletter__form,
    .couponleo-footer__signup-form,
    .couponleo-side-card__newsletter-form {
      display: grid;
      min-width: 0;
    }

    .couponleo-newsletter__form,
    .couponleo-inline-newsletter__form,
    .couponleo-footer__signup-form {
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 12px;
    }

    .couponleo-side-card__newsletter-form {
      grid-template-columns: 1fr;
      gap: 10px;
    }

    .couponleo-newsletter__form input,
    .couponleo-inline-newsletter__form input,
    .couponleo-footer__signup-form input,
    .couponleo-side-card__newsletter-form input,
    .couponleo-newsletter__form button,
    .couponleo-inline-newsletter__form button,
    .couponleo-footer__signup-form button,
    .couponleo-side-card__newsletter-form button {
      font: inherit;
    }

    .couponleo-newsletter__form input,
    .couponleo-footer__signup-form input {
      min-height: 56px;
      padding: 0 18px;
      border: 1px solid rgba(22, 36, 74, 0.12);
      border-radius: 16px;
      background: #fff;
      color: var(--couponleo-text);
    }

    .couponleo-inline-newsletter__form input {
      min-height: 52px;
      padding: 0 16px;
      border: 1px solid rgba(22, 36, 74, 0.1);
      border-radius: 14px;
      background: #fff;
      color: var(--couponleo-text);
    }

    .couponleo-side-card__newsletter-form input {
      padding: 12px 14px;
      border: 0;
      border-radius: 14px;
      background: rgba(255, 255, 255, 0.94);
      color: var(--couponleo-navy);
    }

    .couponleo-newsletter__form input:focus,
    .couponleo-inline-newsletter__form input:focus,
    .couponleo-footer__signup-form input:focus,
    .couponleo-side-card__newsletter-form input:focus {
      outline: none;
    }

    .couponleo-newsletter__form input:focus,
    .couponleo-inline-newsletter__form input:focus,
    .couponleo-footer__signup-form input:focus {
      border-color: rgba(52, 120, 255, 0.34);
      box-shadow: 0 0 0 3px rgba(52, 120, 255, 0.1);
    }

    .couponleo-side-card__newsletter-form input:focus {
      box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.18);
    }

    .couponleo-newsletter__form button,
    .couponleo-inline-newsletter__form button,
    .couponleo-footer__signup-form button,
    .couponleo-side-card__newsletter-form button {
      border: 0;
      cursor: pointer;
    }

    .couponleo-newsletter__form button:disabled,
    .couponleo-inline-newsletter__form button:disabled,
    .couponleo-footer__signup-form button:disabled,
    .couponleo-side-card__newsletter-form button:disabled {
      opacity: 0.7;
      cursor: progress;
    }

    .couponleo-footer__signup-button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 3.2rem;
      min-height: 3.2rem;
      padding: 0;
      border-radius: 16px;
      background: linear-gradient(135deg, #3480ff 0%, #2355f6 100%);
      color: #fff;
      box-shadow: 0 18px 34px rgba(52, 120, 255, 0.24);
    }

    .couponleo-footer__signup-button app-couponleo-eon-icon {
      width: 1.15rem;
      height: 1.15rem;
    }

    .couponleo-side-card__newsletter-form button {
      min-width: 110px;
      width: 100%;
      padding: 12px 16px;
      border-radius: 14px;
      background: #0f3db5;
      color: #fff;
      font-weight: 800;
    }

    @media (max-width: 640px) {
      .couponleo-newsletter__form,
      .couponleo-inline-newsletter__form,
      .couponleo-footer__signup-form,
      .couponleo-side-card__newsletter-form {
        grid-template-columns: 1fr;
      }

      .couponleo-footer__signup-button {
        width: 100%;
      }
    }
  `],
})
export class CouponleoNewsletterFormComponent implements OnInit {
  private readonly auth = inject(CouponleoAuthService);
  protected readonly i18n = inject(CouponleoI18nService);
  private readonly newsletter = inject(CouponleoNewsletterService);
  private readonly router = inject(Router);

  readonly formClass = input('couponleo-newsletter__form');
  readonly inputClass = input('');
  readonly buttonClass = input('couponleo-button couponleo-button--solid');
  readonly buttonLabel = input('');
  readonly buttonBusyLabel = input('');
  readonly buttonAriaLabel = input('');
  readonly placeholder = input('');
  readonly buttonIconSvg = input('');
  readonly iconOnly = input(false);
  readonly showLoginHint = input(true);
  readonly signedInReadonly = input(true);
  readonly surface = input<CouponleoNewsletterSurface>('light');

  protected readonly isAuthenticated = this.auth.isAuthenticated;
  protected readonly email = signal('');
  protected readonly submitting = signal(false);
  protected readonly statusMessage = signal('');
  protected readonly statusTone = signal<CouponleoNewsletterStatusTone>('neutral');
  protected readonly hasButtonIcon = computed(() => this.buttonIconSvg().trim().length > 0);
  protected readonly metaClass = computed(() => `couponleo-newsletter-form__meta couponleo-newsletter-form__meta--${this.surface()}`);
  protected readonly statusClass = computed(() => (
    `couponleo-newsletter-form__status couponleo-newsletter-form__status--${this.surface()} couponleo-newsletter-form__status--${this.statusTone()}`
  ));
  protected readonly emailAriaLabel = computed(() => (
    this.isAuthenticated() ? this.i18n.t('newsletter.signedInEmailAria') : this.i18n.t('newsletter.emailAria')
  ));
  protected readonly currentButtonLabel = computed(() => (
    this.submitting()
      ? (this.buttonBusyLabel() || this.i18n.t('footer.saving'))
      : (this.buttonLabel() || this.i18n.t('newsletter.subscribe'))
  ));
  protected readonly resolvedPlaceholder = computed(() => this.placeholder() || this.i18n.t('newsletter.placeholder'));
  protected readonly resolvedButtonAriaLabel = computed(() => this.buttonAriaLabel() || this.i18n.t('newsletter.subscribeAria'));

  ngOnInit(): void {
    const session = this.auth.session();
    if (session) {
      this.email.set(session.email);
    }

    void this.resumePendingSubscription();
  }

  protected handleEmailChange(value: string): void {
    this.email.set(value);
  }

  protected handleSubmit(): void {
    if (this.submitting()) {
      return;
    }

    const session = this.auth.session();
    if (session) {
      this.email.set(session.email);
      void this.submitAuthenticatedSubscription(false);
      return;
    }

    this.newsletter.queuePendingIntent(this.email(), this.router.url);
    void this.router.navigate(['/sign-in'], {
      queryParams: this.newsletter.buildSignInQueryParams(this.email(), this.router.url),
    });
  }

  private async resumePendingSubscription(): Promise<void> {
    const session = this.auth.session();
    if (!session) {
      return;
    }

    const pendingIntent = this.newsletter.consumePendingIntent(this.router.url);
    if (!pendingIntent) {
      return;
    }

    if (pendingIntent.email) {
      this.email.set(pendingIntent.email);
    }

    await this.submitAuthenticatedSubscription(true);
  }

  private async submitAuthenticatedSubscription(resumed: boolean): Promise<void> {
    const session = this.auth.session();
    if (!session) {
      return;
    }

    this.submitting.set(true);
    this.statusMessage.set('');
    this.statusTone.set('neutral');
    this.email.set(session.email);

    try {
      const response = await firstValueFrom(this.newsletter.subscribeCurrentUser());
      const summary = response.data.preview.summary;
      this.statusTone.set('success');
      this.statusMessage.set(
        resumed
          ? this.i18n.t('newsletter.signInStatus', { summary })
          : this.i18n.t('newsletter.savedStatus', { summary }),
      );
    } catch (error) {
      this.statusTone.set('error');
      this.statusMessage.set(this.newsletter.errorMessage(error));
    } finally {
      this.submitting.set(false);
    }
  }
}
