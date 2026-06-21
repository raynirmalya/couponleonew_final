import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { CouponleoEonIconComponent } from '../components/couponleo-eon-icon.component';
import {
  CouponleoAuthService,
  type CouponleoPasswordResetRequestResult,
} from '../services/couponleo-auth.service';
import { createStaticRouteMeta } from '../services/couponleo-route-meta';

import envelopeIconSvg from '@eonui/icons/svg/communication/eon-envelope-simple.svg?raw';
import eyeIconSvg from '@eonui/icons/svg/system/eon-eye.svg?raw';
import eyeOffIconSvg from '@eonui/icons/svg/system/eon-eye-off.svg?raw';
import lockIconSvg from '@eonui/icons/svg/system/eon-lock.svg?raw';

export const routeMeta = createStaticRouteMeta({
  title: 'Forgot Password | CouponLeo',
  description: 'Request a CouponLeo password reset link and choose a new password from the secure recovery flow.',
  robots: 'noindex,follow',
});

@Component({
  selector: 'app-forgot-password-page',
  imports: [FormsModule, RouterLink, CouponleoEonIconComponent],
  template: `
    <section class="couponleo-recovery">
      <article class="couponleo-recovery__card">
        <p class="couponleo-recovery__eyebrow">Account recovery</p>
        <h1>{{ resetMode() ? 'Create a new password' : 'Forgot your password?' }}</h1>
        <p class="couponleo-recovery__lede">
          {{ resetMode()
            ? 'Use the password reset link from your email and set a fresh password for your CouponLeo account.'
            : 'Enter your email address and we will prepare a password reset link for your CouponLeo account.' }}
        </p>

        @if (statusMessage()) {
          <p class="couponleo-recovery__notice couponleo-recovery__notice--success">
            {{ statusMessage() }}
          </p>
        }

        @if (errorMessage()) {
          <p class="couponleo-recovery__notice couponleo-recovery__notice--error">
            {{ errorMessage() }}
          </p>
        }

        @if (!resetMode()) {
          <form class="couponleo-recovery__form" (ngSubmit)="handleRequestReset()">
            <label class="couponleo-recovery__field">
              <span>Email address</span>
              <span class="couponleo-recovery__input-shell">
                <span class="couponleo-recovery__input-icon" aria-hidden="true">
                  <app-couponleo-eon-icon [svg]="envelopeIconSvg"></app-couponleo-eon-icon>
                </span>
                <input
                  type="email"
                  name="email"
                  [(ngModel)]="requestForm.email"
                  autocomplete="email"
                  placeholder="name@example.com"
                  required
                >
              </span>
            </label>

            <button
              type="submit"
              class="couponleo-recovery__submit"
              [disabled]="requestBusy() || !requestForm.email.trim()"
            >
              {{ requestBusy() ? 'Preparing reset link...' : 'Send reset link' }}
            </button>
          </form>

          @if (requestState()?.resetReady && requestState()?.resetUrl) {
            <div class="couponleo-recovery__preview">
              <strong>Local reset link ready</strong>
              <p>{{ requestState()?.deliveryMessage }}</p>
              <a class="couponleo-recovery__action couponleo-recovery__action--solid" [href]="requestState()?.resetUrl || '/forgot-password'">
                Open reset link
              </a>
            </div>
          }
        } @else {
          <form class="couponleo-recovery__form" (ngSubmit)="handleResetPassword()">
            <label class="couponleo-recovery__field">
              <span>Email address</span>
              <span class="couponleo-recovery__input-shell">
                <span class="couponleo-recovery__input-icon" aria-hidden="true">
                  <app-couponleo-eon-icon [svg]="envelopeIconSvg"></app-couponleo-eon-icon>
                </span>
                <input
                  type="email"
                  name="resetEmail"
                  [(ngModel)]="resetForm.email"
                  autocomplete="email"
                  placeholder="name@example.com"
                  required
                >
              </span>
            </label>

            <label class="couponleo-recovery__field">
              <span>New password</span>
              <span class="couponleo-recovery__input-shell">
                <span class="couponleo-recovery__input-icon" aria-hidden="true">
                  <app-couponleo-eon-icon [svg]="lockIconSvg"></app-couponleo-eon-icon>
                </span>
                <input
                  [type]="showPassword() ? 'text' : 'password'"
                  name="password"
                  [(ngModel)]="resetForm.password"
                  autocomplete="new-password"
                  placeholder="Enter a new password"
                  required
                >
                <button
                  type="button"
                  class="couponleo-recovery__visibility"
                  aria-label="Toggle password visibility"
                  (click)="togglePassword()"
                >
                  <app-couponleo-eon-icon [svg]="showPassword() ? eyeOffIconSvg : eyeIconSvg"></app-couponleo-eon-icon>
                </button>
              </span>
            </label>

            <label class="couponleo-recovery__field">
              <span>Confirm password</span>
              <span class="couponleo-recovery__input-shell">
                <span class="couponleo-recovery__input-icon" aria-hidden="true">
                  <app-couponleo-eon-icon [svg]="lockIconSvg"></app-couponleo-eon-icon>
                </span>
                <input
                  [type]="showPassword() ? 'text' : 'password'"
                  name="confirmPassword"
                  [(ngModel)]="resetForm.confirmPassword"
                  autocomplete="new-password"
                  placeholder="Re-enter your new password"
                  required
                >
              </span>
            </label>

            @if (resetForm.confirmPassword.trim() && resetForm.password !== resetForm.confirmPassword) {
              <p class="couponleo-recovery__notice couponleo-recovery__notice--error">
                Password and confirm password must match.
              </p>
            }

            <button
              type="submit"
              class="couponleo-recovery__submit"
              [disabled]="resetBusy() || !resetForm.email.trim() || !resetForm.password.trim() || !resetForm.confirmPassword.trim() || resetForm.password !== resetForm.confirmPassword"
            >
              {{ resetBusy() ? 'Saving new password...' : 'Reset password' }}
            </button>
          </form>
        }

        <div class="couponleo-recovery__footer">
          <a
            class="couponleo-recovery__action couponleo-recovery__action--ghost"
            routerLink="/sign-in"
            [queryParams]="signInQueryParams()"
          >
            Back to sign in
          </a>
          <a
            class="couponleo-recovery__action couponleo-recovery__action--ghost"
            routerLink="/sign-up"
            [queryParams]="signUpQueryParams()"
          >
            Create account
          </a>
        </div>
      </article>
    </section>
  `,
  styles: [`
    :host {
      display: block;
    }

    .couponleo-recovery {
      width: min(760px, calc(100% - 24px));
      margin: 0 auto;
      padding: 34px 0 28px;
    }

    .couponleo-recovery__card {
      display: grid;
      gap: 18px;
      padding: clamp(26px, 4vw, 36px);
      border-radius: 34px;
      background:
        radial-gradient(circle at top right, rgba(255, 190, 122, 0.18), transparent 28%),
        linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(255, 250, 244, 0.98));
      border: 1px solid rgba(255, 255, 255, 0.96);
      box-shadow: 0 24px 58px rgba(18, 35, 77, 0.1);
    }

    .couponleo-recovery__eyebrow {
      margin: 0;
      color: var(--couponleo-orange);
      font-size: 0.86rem;
      font-weight: 800;
      letter-spacing: 0.16em;
      text-transform: uppercase;
    }

    .couponleo-recovery__card h1 {
      margin: 0;
      color: var(--couponleo-navy);
      font-size: clamp(2.6rem, 6vw, 4rem);
      letter-spacing: -0.06em;
      line-height: 0.98;
    }

    .couponleo-recovery__lede,
    .couponleo-recovery__preview p {
      margin: 0;
      color: var(--couponleo-muted);
      font-size: 1.04rem;
      line-height: 1.65;
    }

    .couponleo-recovery__form {
      display: grid;
      gap: 18px;
    }

    .couponleo-recovery__field {
      display: grid;
      gap: 10px;
      color: var(--couponleo-navy);
      font-size: 1rem;
      font-weight: 700;
    }

    .couponleo-recovery__input-shell {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto;
      align-items: center;
      gap: 14px;
      min-height: 64px;
      padding: 0 18px;
      border: 1px solid rgba(22, 36, 74, 0.12);
      border-radius: 16px;
      background: #fff;
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.8);
    }

    .couponleo-recovery__input-icon,
    .couponleo-recovery__visibility {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      color: #6f7d9d;
    }

    .couponleo-recovery__input-icon app-couponleo-eon-icon,
    .couponleo-recovery__visibility app-couponleo-eon-icon {
      width: 1.35rem;
      height: 1.35rem;
    }

    .couponleo-recovery__input-shell input {
      width: 100%;
      min-width: 0;
      border: 0;
      background: transparent;
      color: var(--couponleo-text);
      font-size: 1rem;
    }

    .couponleo-recovery__input-shell input:focus {
      outline: none;
    }

    .couponleo-recovery__visibility {
      border: 0;
      background: transparent;
      padding: 0;
    }

    .couponleo-recovery__submit,
    .couponleo-recovery__action {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 58px;
      padding: 0 20px;
      border-radius: 999px;
      border: 0;
      font-size: 1rem;
      font-weight: 800;
      text-decoration: none;
    }

    .couponleo-recovery__submit,
    .couponleo-recovery__action--solid {
      background: linear-gradient(135deg, #3480ff 0%, #2355f6 100%);
      color: #fff;
      box-shadow: 0 18px 34px rgba(52, 120, 255, 0.24);
    }

    .couponleo-recovery__submit:disabled {
      opacity: 0.6;
      cursor: not-allowed;
      box-shadow: none;
    }

    .couponleo-recovery__notice {
      margin: 0;
      padding: 12px 14px;
      border-radius: 16px;
      line-height: 1.5;
    }

    .couponleo-recovery__notice--success {
      background: rgba(44, 166, 96, 0.12);
      color: #157947;
    }

    .couponleo-recovery__notice--error {
      background: rgba(206, 47, 74, 0.1);
      color: #9e1730;
    }

    .couponleo-recovery__preview {
      display: grid;
      gap: 10px;
      padding: 18px;
      border-radius: 22px;
      background: rgba(52, 128, 255, 0.07);
    }

    .couponleo-recovery__preview strong {
      color: var(--couponleo-navy);
      font-size: 1.02rem;
    }

    .couponleo-recovery__footer {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
    }

    .couponleo-recovery__action--ghost {
      background: rgba(52, 128, 255, 0.06);
      color: var(--couponleo-blue);
      border: 1px solid rgba(34, 72, 159, 0.16);
    }

    @media (max-width: 720px) {
      .couponleo-recovery {
        width: min(100%, calc(100% - 16px));
        padding-top: 18px;
      }

      .couponleo-recovery__footer {
        flex-direction: column;
      }
    }
  `],
})
export default class ForgotPasswordPage {
  private readonly authService = inject(CouponleoAuthService);
  private readonly route = inject(ActivatedRoute);

  protected readonly envelopeIconSvg = envelopeIconSvg;
  protected readonly lockIconSvg = lockIconSvg;
  protected readonly eyeIconSvg = eyeIconSvg;
  protected readonly eyeOffIconSvg = eyeOffIconSvg;

  protected readonly resetMode = signal(false);
  protected readonly requestBusy = signal(false);
  protected readonly resetBusy = signal(false);
  protected readonly showPassword = signal(false);
  protected readonly requestState = signal<CouponleoPasswordResetRequestResult | null>(null);
  protected readonly statusMessage = signal('');
  protected readonly errorMessage = signal('');

  protected readonly requestForm = {
    email: '',
  };

  protected readonly resetForm = {
    email: '',
    password: '',
    confirmPassword: '',
  };

  private resetToken = '';

  constructor() {
    const email = (this.route.snapshot.queryParamMap.get('email') ?? '').trim();
    const resetToken = (this.route.snapshot.queryParamMap.get('resetToken') ?? '').trim();

    if (email) {
      this.requestForm.email = email;
      this.resetForm.email = email;
    }

    if (resetToken) {
      this.resetMode.set(true);
      this.resetToken = resetToken;
      if (!email) {
        this.errorMessage.set('Reset link is missing the account email. Please request a fresh password reset.');
      }
    }
  }

  protected togglePassword(): void {
    this.showPassword.update((value) => !value);
  }

  protected async handleRequestReset(): Promise<void> {
    this.statusMessage.set('');
    this.errorMessage.set('');
    this.requestState.set(null);

    if (!this.requestForm.email.trim()) {
      return;
    }

    this.requestBusy.set(true);

    try {
      const result = await this.authService.requestPasswordReset({
        email: this.requestForm.email,
        resetContext: this.authFlowQueryParams(),
      });
      this.requestState.set(result);
      this.statusMessage.set(result.message);
    } catch (error) {
      this.errorMessage.set(this.authService.errorMessage(error, 'We could not prepare a reset link right now.'));
    } finally {
      this.requestBusy.set(false);
    }
  }

  protected async handleResetPassword(): Promise<void> {
    this.statusMessage.set('');
    this.errorMessage.set('');

    if (!this.resetForm.email.trim() || !this.resetForm.password.trim() || !this.resetForm.confirmPassword.trim()) {
      return;
    }

    if (!this.resetToken) {
      this.errorMessage.set('Reset link is missing. Please request a fresh password reset.');
      return;
    }

    if (this.resetForm.password !== this.resetForm.confirmPassword) {
      this.errorMessage.set('Password and confirm password must match.');
      return;
    }

    this.resetBusy.set(true);

    try {
      const result = await this.authService.resetPassword({
        email: this.resetForm.email,
        token: this.resetToken,
        password: this.resetForm.password,
      });
      this.statusMessage.set(result.message);
    } catch (error) {
      this.errorMessage.set(this.authService.errorMessage(error, 'We could not reset your password right now.'));
    } finally {
      this.resetBusy.set(false);
    }
  }

  protected signInQueryParams(): Record<string, string> {
    const params = this.authFlowQueryParams();
    const email = (this.resetMode() ? this.resetForm.email : this.requestForm.email).trim();
    if (email) {
      params['email'] = email;
    }
    return params;
  }

  protected signUpQueryParams(): Record<string, string> {
    const params = this.authFlowQueryParams();
    const email = (this.resetMode() ? this.resetForm.email : this.requestForm.email).trim();
    if (email) {
      params['email'] = email;
    }
    return params;
  }

  private authFlowQueryParams(): Record<string, string> {
    const params: Record<string, string> = {};
    for (const key of ['intent', 'returnUrl', 'mode', 'next', 'close'] as const) {
      const value = (this.route.snapshot.queryParamMap.get(key) ?? '').trim();
      if (!value) {
        continue;
      }
      if ((key === 'next' || key === 'returnUrl') && !value.startsWith('/')) {
        continue;
      }
      params[key] = value;
    }
    return params;
  }
}
