import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CouponleoAuthbridgeGoogleButtonComponent } from '../components/couponleo-authbridge-google-button.component';
import { CouponleoEonIconComponent } from '../components/couponleo-eon-icon.component';
import { CouponleoAuthService, type CouponleoSession } from '../services/couponleo-auth.service';
import { CouponleoI18nService } from '../services/couponleo-i18n.service';
import { CouponleoNewsletterService } from '../services/couponleo-newsletter.service';
import { CouponleoPageContentService } from '../services/couponleo-page-content.service';
import { createStaticRouteMeta } from '../services/couponleo-route-meta';

import tagIconSvg from '@eonui/icons/svg/commerce/eon-tag.svg?raw';
import giftIconSvg from '@eonui/icons/svg/commerce/eon-gift.svg?raw';
import envelopeIconSvg from '@eonui/icons/svg/communication/eon-envelope-simple.svg?raw';
import usersIconSvg from '@eonui/icons/svg/system/eon-users.svg?raw';
import cartIconSvg from '@eonui/icons/svg/commerce/eon-shopping-cart.svg?raw';
import eyeIconSvg from '@eonui/icons/svg/system/eon-eye.svg?raw';
import eyeOffIconSvg from '@eonui/icons/svg/system/eon-eye-off.svg?raw';
import lockIconSvg from '@eonui/icons/svg/system/eon-lock.svg?raw';
import shieldCheckIconSvg from '@eonui/icons/svg/system/eon-shield-check.svg?raw';
import shieldLockIconSvg from '@eonui/icons/svg/system/eon-shield-lock.svg?raw';

const trustItems = [
  {
    title: 'Verified Coupons',
    copy: 'Hand-picked & trusted',
    icon: shieldCheckIconSvg,
    tone: 'blue',
  },
  {
    title: 'Best Savings',
    copy: 'Top offers, always',
    icon: tagIconSvg,
    tone: 'orange',
  },
  {
    title: 'Secure & Private',
    copy: 'Your data is protected',
    icon: shieldLockIconSvg,
    tone: 'blue',
  },
];

const stats = [
  { value: '10,000+', label: 'Top Stores', icon: tagIconSvg, tone: 'blue' },
  { value: '100,000+', label: 'Coupons & Deals', icon: giftIconSvg, tone: 'orange' },
  { value: '2M+', label: 'Happy Shoppers', icon: usersIconSvg, tone: 'blue' },
  { value: '100%', label: 'Secure & Safe', icon: shieldCheckIconSvg, tone: 'orange' },
];

export const routeMeta = createStaticRouteMeta({
  title: 'Sign In | CouponLeo',
  description: 'Sign in to CouponLeo to continue with saved deals, wishlist items, and member-only offer flows.',
  robots: 'noindex,follow',
});

@Component({
  selector: 'app-sign-in-page',
  imports: [
    FormsModule,
    RouterLink,
    CouponleoEonIconComponent,
    CouponleoAuthbridgeGoogleButtonComponent,
  ],
  template: `
    <section class="couponleo-signin">
      <div class="couponleo-signin__grid">
        <div class="couponleo-signin__hero">
          <div class="couponleo-signin__copy">
            <h1>{{ i18n.t('signIn.heroTitle') }}</h1>
            <p class="couponleo-signin__accent">{{ i18n.t('signIn.heroAccent') }}</p>
            <span class="couponleo-signin__underline" aria-hidden="true"></span>
            <p class="couponleo-signin__lede">{{ i18n.t('signIn.heroCopy') }}</p>
          </div>

          <div class="couponleo-signin__visual couponleo-hero__visual">
            <span class="couponleo-signin__spark couponleo-signin__spark--left" aria-hidden="true"></span>
            <span class="couponleo-signin__spark couponleo-signin__spark--top" aria-hidden="true"></span>
            <span class="couponleo-signin__spark couponleo-signin__spark--right" aria-hidden="true"></span>
            <span class="couponleo-signin__spark couponleo-signin__spark--bottom" aria-hidden="true"></span>
            <span class="couponleo-signin__dots" aria-hidden="true"></span>

            <div class="couponleo-signin__image-stage" aria-hidden="true"></div>
            <img
              class="couponleo-signin__hero-image"
              src="/images/couponleo-hero-product-cutout-v2.png"
              alt="Shopping bag, discount tag, gift box, and cart"
            >
            <span class="couponleo-signin__cart-badge" aria-hidden="true">
              <app-couponleo-eon-icon [svg]="cartIconSvg"></app-couponleo-eon-icon>
            </span>
          </div>

          <div class="couponleo-signin__trust-row">
            @for (item of trustItems(); track item.title) {
              <article class="couponleo-signin__trust-card">
                <span [class]="'couponleo-signin__trust-icon couponleo-signin__trust-icon--' + item.tone" aria-hidden="true">
                  <app-couponleo-eon-icon [svg]="item.icon"></app-couponleo-eon-icon>
                </span>
                <div>
                  <strong>{{ item.title }}</strong>
                  <span>{{ item.copy }}</span>
                </div>
              </article>
            }
          </div>
        </div>

        <div class="couponleo-signin__card-shell">
          <div class="couponleo-signin__card">
            <h2>{{ i18n.t('signIn.cardTitle') }} <span>CouponLeo</span></h2>

            @if (newsletterIntent()) {
              <p class="couponleo-signin__notice">
                {{ i18n.t('signIn.notice') }}
              </p>
            }

            @if (activationNotice()) {
              <p class="couponleo-signin__notice couponleo-signin__notice--success">
                {{ activationNotice() }}
              </p>
            }

            @if (formError()) {
              <p class="couponleo-signin__notice couponleo-signin__notice--error">
                {{ formError() }}
              </p>
            }

            <form class="couponleo-signin__form" (ngSubmit)="handleSubmit()">
              <label class="couponleo-signin__field">
                <span>{{ i18n.t('signIn.emailLabel') }}</span>
                <span class="couponleo-signin__input-shell">
                  <span class="couponleo-signin__input-icon" aria-hidden="true">
                    <app-couponleo-eon-icon [svg]="envelopeIconSvg"></app-couponleo-eon-icon>
                  </span>
                  <input
                    type="email"
                    name="email"
                    [(ngModel)]="form.email"
                    [placeholder]="i18n.t('signIn.emailPlaceholder')"
                    autocomplete="email"
                    required
                  >
                </span>
              </label>

              <label class="couponleo-signin__field">
                <span class="couponleo-signin__field-row">
                  <span>{{ i18n.t('signIn.passwordLabel') }}</span>
                  <a routerLink="/forgot-password" [queryParams]="forgotPasswordQueryParams()">{{ i18n.t('signIn.forgotPassword') }}</a>
                </span>
                <span class="couponleo-signin__input-shell">
                  <span class="couponleo-signin__input-icon" aria-hidden="true">
                    <app-couponleo-eon-icon [svg]="lockIconSvg"></app-couponleo-eon-icon>
                  </span>
                  <input
                    [type]="showPassword() ? 'text' : 'password'"
                    name="password"
                    [(ngModel)]="form.password"
                    [placeholder]="i18n.t('signIn.passwordPlaceholder')"
                    autocomplete="current-password"
                    required
                  >
                  <button
                    type="button"
                    class="couponleo-signin__visibility"
                    [attr.aria-label]="i18n.t('signIn.togglePassword')"
                    (click)="togglePassword()"
                  >
                    <app-couponleo-eon-icon [svg]="showPassword() ? eyeOffIconSvg : eyeIconSvg"></app-couponleo-eon-icon>
                  </button>
                </span>
              </label>

              <button
                type="submit"
                class="couponleo-signin__submit"
                [disabled]="submitBusy() || activationBusy() || !form.email.trim() || !form.password.trim()"
              >
                {{ submitBusy() ? 'Signing in...' : i18n.t('signIn.continue') }}
              </button>
            </form>

            <div class="couponleo-signin__divider" aria-hidden="true">
              <span></span>
              <strong>{{ i18n.t('signIn.or') }}</strong>
              <span></span>
            </div>

            <app-couponleo-authbridge-google-button
              [buttonLabel]="i18n.t('signIn.googleButton')"
              [loadingLabel]="i18n.t('signIn.googleBusy')"
              [busy]="googleBusy()"
              (googleSelected)="handleGoogleSignIn()"
            />

            <p class="couponleo-signin__switch">
              {{ i18n.t('signIn.switchText') }}
              <a routerLink="/sign-up" [queryParams]="signUpQueryParams()">{{ i18n.t('signIn.switchLink') }}</a>
            </p>
          </div>
        </div>
      </div>

      <div class="couponleo-signin__stats">
        @for (item of stats(); track item.label) {
          <div class="couponleo-signin__stat">
            <span [class]="'couponleo-signin__stat-icon couponleo-signin__stat-icon--' + item.tone" aria-hidden="true">
              <app-couponleo-eon-icon [svg]="item.icon"></app-couponleo-eon-icon>
            </span>
            <div>
              <strong>{{ item.value }}</strong>
              <span>{{ item.label }}</span>
            </div>
          </div>
        }
      </div>
    </section>
  `,
  styles: [`
    :host {
      display: block;
    }

    .couponleo-signin {
      width: min(1440px, calc(100% - 24px));
      margin: 0 auto;
      padding: 26px 0 18px;
    }

    .couponleo-signin__grid {
      display: grid;
      grid-template-columns: minmax(0, 1.06fr) minmax(440px, 0.94fr);
      gap: clamp(28px, 4vw, 54px);
      align-items: center;
      padding: 18px 8px 28px;
      border-radius: 34px 34px 0 0;
      background:
        radial-gradient(circle at top center, rgba(255, 195, 128, 0.18), transparent 34%),
        radial-gradient(circle at 92% 12%, rgba(75, 130, 255, 0.08), transparent 20%),
        linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(255, 250, 244, 0.98));
      box-shadow: 0 22px 60px rgba(18, 35, 77, 0.08);
    }

    .couponleo-signin__hero {
      display: grid;
      gap: 24px;
      min-width: 0;
      padding-left: clamp(14px, 2vw, 30px);
    }

    .couponleo-signin__copy {
      display: grid;
      gap: 0;
      padding-top: 10px;
      position: relative;
      z-index: 2;
    }

    .couponleo-signin__copy h1,
    .couponleo-signin__card h2 {
      margin: 0;
      color: var(--couponleo-navy);
      letter-spacing: -0.06em;
    }

    .couponleo-signin__copy h1 {
      font-size: clamp(3.15rem, 5.2vw, 5.35rem);
      line-height: 1.02;
    }

    .couponleo-signin__accent {
      margin: 8px 0 0;
      color: var(--couponleo-orange);
      font-size: clamp(2rem, 3vw, 3rem);
      line-height: 1.05;
      letter-spacing: -0.04em;
    }

    .couponleo-signin__underline {
      display: block;
      width: 118px;
      height: 4px;
      margin-top: 16px;
      border-radius: 999px;
      background: linear-gradient(90deg, #ff8f34 0%, #ff6f1d 100%);
    }

    .couponleo-signin__lede {
      max-width: 27rem;
      margin: 18px 0 0;
      color: var(--couponleo-muted);
      font-size: 1.18rem;
      line-height: 1.62;
    }

    .couponleo-signin__visual {
      min-height: clamp(28rem, 35vw, 33rem);
      margin-top: 14px;
      overflow: clip;
    }

    .couponleo-signin__visual::before {
      inset: 4% 10% 10% 12%;
      background:
        radial-gradient(circle at 48% 38%, rgba(255, 255, 255, 0.98) 0 24%, rgba(255, 249, 243, 0.96) 25%, rgba(255, 241, 226, 0.62) 52%, rgba(255, 241, 226, 0.18) 72%, transparent 82%);
    }

    .couponleo-signin__image-stage {
      position: absolute;
      left: 15%;
      right: 7%;
      bottom: 5%;
      height: 21%;
      border-radius: 999px;
      background: linear-gradient(180deg, #fff6ef 0%, #ffe7d4 100%);
      box-shadow:
        inset 0 0 0 3px rgba(255, 207, 171, 0.35),
        0 18px 28px rgba(237, 171, 102, 0.18);
      z-index: 1;
    }

    .couponleo-signin__hero-image {
      position: absolute;
      left: 11%;
      bottom: 5%;
      z-index: 2;
      width: min(88%, 42rem);
      max-width: 42rem;
      filter:
        saturate(1.08)
        contrast(1.03)
        brightness(1.02)
        drop-shadow(0 28px 50px rgba(18, 35, 77, 0.14));
    }

    .couponleo-signin__cart-badge {
      position: absolute;
      left: 7%;
      bottom: 12%;
      z-index: 3;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 4.75rem;
      height: 4.75rem;
      border-radius: 999px;
      background: linear-gradient(180deg, #4483ff 0%, #2c64f0 100%);
      color: #fff;
      box-shadow: 0 18px 34px rgba(44, 100, 240, 0.28);
    }

    .couponleo-signin__cart-badge app-couponleo-eon-icon {
      width: 2rem;
      height: 2rem;
    }

    .couponleo-signin__spark {
      position: absolute;
      z-index: 1;
    }

    .couponleo-signin__spark--left {
      left: -2%;
      top: 24%;
      width: 16px;
      height: 28px;
      background: #62a0ff;
      clip-path: polygon(100% 0%, 0% 50%, 100% 100%);
    }

    .couponleo-signin__spark--top {
      left: 24%;
      top: 6%;
      width: 8px;
      height: 8px;
      border-radius: 999px;
      background: #ff9d4b;
    }

    .couponleo-signin__spark--right {
      right: 12%;
      top: 43%;
      width: 15px;
      height: 15px;
      border-radius: 0 999px 999px 999px;
      background: #62a0ff;
      transform: rotate(24deg);
    }

    .couponleo-signin__spark--bottom {
      left: 4%;
      bottom: 5%;
      width: 6px;
      height: 6px;
      border-radius: 999px;
      background: rgba(255, 165, 75, 0.65);
    }

    .couponleo-signin__dots {
      position: absolute;
      right: 8%;
      top: 10%;
      width: 76px;
      height: 76px;
      background: radial-gradient(circle, rgba(247, 177, 84, 0.72) 1.2px, transparent 1.4px);
      background-size: 12px 12px;
      opacity: 0.56;
    }

    .couponleo-signin__trust-row {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 14px;
      position: relative;
      z-index: 2;
    }

    .couponleo-signin__trust-card {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 14px;
      align-items: center;
      padding: 12px 0;
    }

    .couponleo-signin__trust-icon,
    .couponleo-signin__stat-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 999px;
      flex: 0 0 auto;
    }

    .couponleo-signin__trust-icon {
      width: 4rem;
      height: 4rem;
      background: rgba(255, 255, 255, 0.92);
      box-shadow: 0 14px 30px rgba(18, 35, 77, 0.06);
    }

    .couponleo-signin__trust-icon--blue {
      color: var(--couponleo-blue);
    }

    .couponleo-signin__trust-icon--orange {
      color: var(--couponleo-orange);
    }

    .couponleo-signin__trust-icon app-couponleo-eon-icon {
      width: 1.5rem;
      height: 1.5rem;
    }

    .couponleo-signin__trust-card strong,
    .couponleo-signin__stat strong {
      display: block;
      color: var(--couponleo-navy);
    }

    .couponleo-signin__trust-card span,
    .couponleo-signin__stat span {
      color: var(--couponleo-muted);
    }

    .couponleo-signin__card-shell {
      min-width: 0;
    }

    .couponleo-signin__card {
      display: grid;
      gap: 24px;
      padding: clamp(28px, 3vw, 42px);
      border: 1px solid rgba(255, 255, 255, 0.96);
      border-radius: 34px;
      background: rgba(255, 255, 255, 0.96);
      box-shadow: 0 28px 60px rgba(18, 35, 77, 0.1);
    }

    .couponleo-signin__card h2 {
      font-size: clamp(2.5rem, 4vw, 4rem);
      line-height: 1;
      text-align: center;
    }

    .couponleo-signin__card h2 span {
      color: var(--couponleo-blue);
    }

    .couponleo-signin__form {
      display: grid;
      gap: 22px;
    }

    .couponleo-signin__notice {
      margin: -6px 0 0;
      padding: 12px 14px;
      border-radius: 16px;
      background: rgba(52, 120, 255, 0.08);
      color: var(--couponleo-navy);
      line-height: 1.5;
      text-align: center;
    }

    .couponleo-signin__notice--success {
      background: rgba(44, 166, 96, 0.12);
      color: #157947;
    }

    .couponleo-signin__notice--error {
      background: rgba(206, 47, 74, 0.1);
      color: #9e1730;
    }

    .couponleo-signin__field {
      display: grid;
      gap: 10px;
      color: var(--couponleo-navy);
      font-size: 1rem;
      font-weight: 700;
    }

    .couponleo-signin__field-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }

    .couponleo-signin__field-row a,
    .couponleo-signin__switch a {
      color: var(--couponleo-blue);
      font-weight: 700;
    }

    .couponleo-signin__input-shell {
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

    .couponleo-signin__input-icon,
    .couponleo-signin__visibility {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      color: #6f7d9d;
    }

    .couponleo-signin__input-icon app-couponleo-eon-icon,
    .couponleo-signin__visibility app-couponleo-eon-icon {
      width: 1.35rem;
      height: 1.35rem;
    }

    .couponleo-signin__input-shell input {
      width: 100%;
      min-width: 0;
      border: 0;
      background: transparent;
      color: var(--couponleo-text);
      font-size: 1rem;
    }

    .couponleo-signin__input-shell input:focus {
      outline: none;
    }

    .couponleo-signin__visibility {
      border: 0;
      background: transparent;
      padding: 0;
    }

    .couponleo-signin__submit {
      min-height: 64px;
      border: 0;
      border-radius: 16px;
      background: linear-gradient(135deg, #3480ff 0%, #2355f6 100%);
      color: #fff;
      font-size: 1.25rem;
      font-weight: 800;
      box-shadow: 0 18px 34px rgba(52, 120, 255, 0.24);
    }

    .couponleo-signin__submit:disabled {
      opacity: 0.6;
      cursor: not-allowed;
      box-shadow: none;
    }

    .couponleo-signin__divider {
      display: grid;
      grid-template-columns: 1fr auto 1fr;
      align-items: center;
      gap: 16px;
      color: var(--couponleo-muted);
    }

    .couponleo-signin__divider span {
      height: 1px;
      background: rgba(22, 36, 74, 0.12);
    }

    .couponleo-signin__divider strong,
    .couponleo-signin__switch {
      font-weight: 500;
      text-align: center;
      margin: 0;
      color: var(--couponleo-muted);
    }

    .couponleo-signin__stats {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 1px;
      padding: 18px 26px;
      border-radius: 0 0 28px 28px;
      background: linear-gradient(90deg, #0d214a 0%, #112d63 100%);
      box-shadow: 0 24px 48px rgba(18, 35, 77, 0.18);
    }

    .couponleo-signin__stat {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 16px;
      padding: 10px 16px;
      color: #e9f2ff;
    }

    .couponleo-signin__stat-icon {
      width: 4.25rem;
      height: 4.25rem;
      color: #fff;
    }

    .couponleo-signin__stat-icon--blue {
      background: linear-gradient(180deg, #4282ff 0%, #295fe9 100%);
    }

    .couponleo-signin__stat-icon--orange {
      background: linear-gradient(180deg, #ffac43 0%, #ff842c 100%);
    }

    .couponleo-signin__stat-icon app-couponleo-eon-icon {
      width: 1.85rem;
      height: 1.85rem;
    }

    .couponleo-signin__stat strong {
      color: #fff;
      font-size: 2rem;
      line-height: 1;
    }

    @media (max-width: 1180px) {
      .couponleo-signin__grid,
      .couponleo-signin__trust-row,
      .couponleo-signin__stats {
        grid-template-columns: 1fr;
      }

      .couponleo-signin__hero {
        padding-left: 0;
      }

      .couponleo-signin__visual {
        min-height: 30rem;
      }

      .couponleo-signin__hero-image {
        left: 10%;
        bottom: 4%;
        width: min(84%, 36rem);
      }
    }

    @media (max-width: 780px) {
      .couponleo-signin {
        width: min(100%, calc(100% - 16px));
        padding-top: 18px;
      }

      .couponleo-signin__grid {
        grid-template-columns: 1fr;
        padding: 18px 14px 24px;
      }

      .couponleo-signin__card h2 {
        font-size: clamp(2rem, 9vw, 2.8rem);
      }

      .couponleo-signin__copy {
        padding-top: 4px;
      }

      .couponleo-signin__visual {
        min-height: clamp(25rem, 78vw, 30rem);
        margin-top: 8px;
      }

      .couponleo-signin__image-stage {
        left: 14%;
        right: 6%;
        bottom: 5%;
        height: 20%;
      }

      .couponleo-signin__hero-image {
        width: min(92%, 31rem);
        left: 4%;
        bottom: 4%;
      }

      .couponleo-signin__cart-badge {
        left: 6%;
        bottom: 13%;
        width: 4.25rem;
        height: 4.25rem;
      }

      .couponleo-signin__stats {
        padding: 16px;
      }

      .couponleo-signin__stat {
        justify-content: flex-start;
      }
    }
  `],
})
export default class SignInPage {
  private readonly authService = inject(CouponleoAuthService);
  private readonly content = inject(CouponleoPageContentService);
  protected readonly i18n = inject(CouponleoI18nService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly newsletter = inject(CouponleoNewsletterService);

  protected readonly envelopeIconSvg = envelopeIconSvg;
  protected readonly lockIconSvg = lockIconSvg;
  protected readonly eyeIconSvg = eyeIconSvg;
  protected readonly eyeOffIconSvg = eyeOffIconSvg;
  protected readonly cartIconSvg = cartIconSvg;
  protected readonly trustItems = computed(() => [
    {
      title: this.i18n.t('signIn.trustVerifiedTitle'),
      copy: this.i18n.t('signIn.trustVerifiedCopy'),
      icon: shieldCheckIconSvg,
      tone: 'blue',
    },
    {
      title: this.i18n.t('signIn.trustSavingsTitle'),
      copy: this.i18n.t('signIn.trustSavingsCopy'),
      icon: tagIconSvg,
      tone: 'orange',
    },
    {
      title: this.i18n.t('signIn.trustSecureTitle'),
      copy: this.i18n.t('signIn.trustSecureCopy'),
      icon: shieldLockIconSvg,
      tone: 'blue',
    },
  ]);
  protected readonly stats = computed(() => [
    { value: `${this.content.siteSummary().totalStores.toLocaleString()}+`, label: this.i18n.t('signIn.liveStores'), icon: tagIconSvg, tone: 'blue' },
    { value: `${this.content.siteSummary().totalCoupons.toLocaleString()}+`, label: this.i18n.t('signIn.couponsDeals'), icon: giftIconSvg, tone: 'orange' },
    { value: `${this.content.siteSummary().liveMarkets.toLocaleString()}+`, label: this.i18n.t('signIn.marketsCovered'), icon: usersIconSvg, tone: 'blue' },
    { value: `${this.content.siteSummary().featuredCoupons.toLocaleString()}+`, label: this.i18n.t('signIn.featuredOffers'), icon: shieldCheckIconSvg, tone: 'orange' },
  ]);
  protected readonly showPassword = signal(false);
  protected readonly submitBusy = signal(false);
  protected readonly activationBusy = signal(false);
  protected readonly googleBusy = signal(false);
  protected readonly formError = signal('');
  protected readonly activationNotice = signal('');
  protected readonly newsletterIntent = computed(() => this.route.snapshot.queryParamMap.get('intent') === 'newsletter');

  protected readonly form = {
    email: '',
    password: '',
  };

  constructor() {
    const email = (this.route.snapshot.queryParamMap.get('email') ?? '').trim();
    if (email) {
      this.form.email = email;
    }

    const activationToken = (this.route.snapshot.queryParamMap.get('activationToken') ?? '').trim();
    if (email && activationToken) {
      void this.activateFromLink(email, activationToken);
    }
  }

  protected togglePassword(): void {
    this.showPassword.update((value) => !value);
  }

  protected async handleSubmit(): Promise<void> {
    this.formError.set('');

    if (!this.form.email.trim() || !this.form.password.trim()) {
      return;
    }

    this.submitBusy.set(true);

    try {
      const session = await this.authService.signIn(this.form);
      await this.router.navigateByUrl(this.redirectUrl(session));
    } catch (error) {
      this.formError.set(this.authService.errorMessage(error, 'We could not sign you in right now.'));
    } finally {
      this.submitBusy.set(false);
    }
  }

  protected handleGoogleSignIn(): void {
    this.googleBusy.set(true);

    setTimeout(() => {
      const session = this.authService.signInWithGoogle();
      this.googleBusy.set(false);
      void this.router.navigateByUrl(this.redirectUrl(session));
    }, 180);
  }

  private redirectUrl(session?: CouponleoSession): string {
    if (session && this.isExtensionFlow()) {
      return this.buildExtensionBridgeUrl(session);
    }

    if (!this.newsletterIntent()) {
      return '/dashboard';
    }

    return this.newsletter.sanitizeInternalUrl(this.route.snapshot.queryParamMap.get('returnUrl'));
  }

  private isExtensionFlow(): boolean {
    return (this.route.snapshot.queryParamMap.get('mode') ?? '').toLowerCase() === 'extension'
      || this.sanitizeNextPath(this.route.snapshot.queryParamMap.get('next')) === '/extension-bridge';
  }

  private shouldCloseAfterAuth(): boolean {
    return ['1', 'true', 'yes', 'on'].includes((this.route.snapshot.queryParamMap.get('close') ?? '').toLowerCase());
  }

  private sanitizeNextPath(value: string | null): string {
    if (!value) {
      return '';
    }

    return value.startsWith('/') ? value : '';
  }

  protected forgotPasswordQueryParams(): Record<string, string> {
    const params: Record<string, string> = this.authFlowQueryParams();
    const email = this.form.email.trim();
    if (email) {
      params['email'] = email;
    }
    return params;
  }

  protected signUpQueryParams(): Record<string, string> {
    const params: Record<string, string> = this.authFlowQueryParams();
    const email = this.form.email.trim();
    if (email) {
      params['email'] = email;
    }
    return params;
  }

  private async activateFromLink(email: string, token: string): Promise<void> {
    this.activationBusy.set(true);
    this.formError.set('');

    try {
      const result = await this.authService.activateAccount({ email, token });
      this.activationNotice.set(result.message);
      await this.router.navigate([], {
        relativeTo: this.route,
        queryParams: {
          activationToken: null,
        },
        queryParamsHandling: 'merge',
        replaceUrl: true,
      });
    } catch (error) {
      this.formError.set(this.authService.errorMessage(error, 'We could not activate this account right now.'));
    } finally {
      this.activationBusy.set(false);
    }
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

  private buildExtensionBridgeUrl(session: CouponleoSession): string {
    const params = new URLSearchParams();
    params.set('email', session.email);
    params.set('fullName', session.fullName);
    params.set('provider', session.provider);

    if (this.shouldCloseAfterAuth()) {
      params.set('close', '1');
    }

    return `/extension-bridge?${params.toString()}`;
  }
}
