import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CouponleoAuthbridgeGoogleButtonComponent } from '../components/couponleo-authbridge-google-button.component';
import { CouponleoEonIconComponent } from '../components/couponleo-eon-icon.component';
import {
  CouponleoAuthService,
  type CouponleoSession,
  type CouponleoSignupResult,
} from '../services/couponleo-auth.service';
import { CouponleoI18nService } from '../services/couponleo-i18n.service';
import { CouponleoNewsletterService } from '../services/couponleo-newsletter.service';
import { createStaticRouteMeta } from '../services/couponleo-route-meta';

import tagIconSvg from '@eonui/icons/svg/commerce/eon-tag.svg?raw';
import giftIconSvg from '@eonui/icons/svg/commerce/eon-gift.svg?raw';
import envelopeIconSvg from '@eonui/icons/svg/communication/eon-envelope-simple.svg?raw';
import eyeIconSvg from '@eonui/icons/svg/system/eon-eye.svg?raw';
import eyeOffIconSvg from '@eonui/icons/svg/system/eon-eye-off.svg?raw';
import bellIconSvg from '@eonui/icons/svg/system/eon-bell.svg?raw';
import lockIconSvg from '@eonui/icons/svg/system/eon-lock.svg?raw';
import shieldCheckIconSvg from '@eonui/icons/svg/system/eon-shield-check.svg?raw';
import userIconSvg from '@eonui/icons/svg/system/eon-user.svg?raw';

const highlights = [
  {
    title: 'Exclusive coupons & deals',
    copy: 'Access hand-picked offers and member-only promotions.',
    icon: tagIconSvg,
    tone: 'blue',
  },
  {
    title: 'Verified & trusted',
    copy: 'All coupons are tested and verified to help you save with confidence.',
    icon: shieldCheckIconSvg,
    tone: 'orange',
  },
  {
    title: 'Never miss a deal',
    copy: 'Get alerts on the latest deals, price drops, and exclusive offers.',
    icon: bellIconSvg,
    tone: 'blue',
  },
  {
    title: 'More savings, every day',
    copy: 'Save on your favorite stores across all categories.',
    icon: giftIconSvg,
    tone: 'orange',
  },
];

export const routeMeta = createStaticRouteMeta({
  title: 'Sign Up | CouponLeo',
  description: 'Create a CouponLeo account to save deals, organize wishlists, and track offers across the live catalog.',
  robots: 'noindex,follow',
});

@Component({
  selector: 'app-sign-up-page',
  imports: [
    FormsModule,
    RouterLink,
    CouponleoEonIconComponent,
    CouponleoAuthbridgeGoogleButtonComponent,
  ],
  template: `
    <section class="couponleo-signup">
      <div class="couponleo-signup__utility">
        <p>
          {{ i18n.t('signUp.utilityText') }}
          <a routerLink="/sign-in" queryParamsHandling="preserve">{{ i18n.t('signUp.utilityLink') }}</a>
        </p>
      </div>

      <div class="couponleo-signup__grid">
        <div class="couponleo-signup__hero">
          <div class="couponleo-signup__copy">
            <h1>{{ i18n.t('signUp.heroTitle') }} Coupon<span>Leo</span></h1>
            <p class="couponleo-signup__accent">{{ i18n.t('signUp.heroAccent') }}</p>
            <span class="couponleo-signup__underline" aria-hidden="true"></span>
          </div>

          <div class="couponleo-signup__highlights">
            @for (item of highlights(); track item.title) {
              <article class="couponleo-signup__highlight">
                <span [class]="'couponleo-signup__highlight-icon couponleo-signup__highlight-icon--' + item.tone" aria-hidden="true">
                  <app-couponleo-eon-icon [svg]="item.icon"></app-couponleo-eon-icon>
                </span>
                <div>
                  <strong>{{ item.title }}</strong>
                  <p>{{ item.copy }}</p>
                </div>
              </article>
            }
          </div>

          <div class="couponleo-signup__visual couponleo-hero__visual">
            <span class="couponleo-signup__spark couponleo-signup__spark--top" aria-hidden="true"></span>
            <span class="couponleo-signup__spark couponleo-signup__spark--left" aria-hidden="true"></span>
            <span class="couponleo-signup__spark couponleo-signup__spark--right" aria-hidden="true"></span>
            <span class="couponleo-signup__spark couponleo-signup__spark--bottom" aria-hidden="true"></span>
            <span class="couponleo-signup__dots" aria-hidden="true"></span>

            <img
              class="couponleo-signup__hero-image"
              src="/images/couponleo-hero-product-cutout-v2.png"
              alt="Shopping bag, discount tag, gift box, and cart"
            >
          </div>
        </div>

        <div class="couponleo-signup__card-shell">
          <div class="couponleo-signup__card">
            <div class="couponleo-signup__card-head">
              <h2>{{ i18n.t('signUp.cardTitle') }}</h2>
              <p>{{ i18n.t('signUp.cardCopy') }}</p>
            </div>

            @if (newsletterIntent) {
              <p class="couponleo-signup__notice">
                {{ i18n.t('signUp.notice') }}
              </p>
            }

            <form class="couponleo-signup__form" (ngSubmit)="handleSubmit()">
              <label class="couponleo-signup__field">
                <span>{{ i18n.t('signUp.fullNameLabel') }}</span>
                <span class="couponleo-signup__input-shell">
                  <span class="couponleo-signup__input-icon" aria-hidden="true">
                    <app-couponleo-eon-icon [svg]="userIconSvg"></app-couponleo-eon-icon>
                  </span>
                  <input
                    type="text"
                    name="fullName"
                    [(ngModel)]="form.fullName"
                    (ngModelChange)="handleFieldChange()"
                    [placeholder]="i18n.t('signUp.fullNamePlaceholder')"
                    autocomplete="name"
                    required
                  >
                </span>
              </label>

              <label class="couponleo-signup__field">
                <span>{{ i18n.t('signUp.emailLabel') }}</span>
                <span class="couponleo-signup__input-shell">
                  <span class="couponleo-signup__input-icon" aria-hidden="true">
                    <app-couponleo-eon-icon [svg]="envelopeIconSvg"></app-couponleo-eon-icon>
                  </span>
                  <input
                    type="email"
                    name="email"
                    [(ngModel)]="form.email"
                    (ngModelChange)="handleFieldChange()"
                    [placeholder]="i18n.t('signUp.emailPlaceholder')"
                    autocomplete="email"
                    required
                  >
                </span>
              </label>

              <label class="couponleo-signup__field">
                <span>{{ i18n.t('signUp.passwordLabel') }}</span>
                <span class="couponleo-signup__input-shell">
                  <span class="couponleo-signup__input-icon" aria-hidden="true">
                    <app-couponleo-eon-icon [svg]="lockIconSvg"></app-couponleo-eon-icon>
                  </span>
                  <input
                    [type]="showPassword() ? 'text' : 'password'"
                    name="password"
                    [(ngModel)]="form.password"
                    (ngModelChange)="handleFieldChange()"
                    [placeholder]="i18n.t('signUp.passwordPlaceholder')"
                    autocomplete="new-password"
                    required
                  >
                  <button
                    type="button"
                    class="couponleo-signup__visibility"
                    [attr.aria-label]="i18n.t('signUp.togglePassword')"
                    (click)="togglePassword()"
                  >
                    <app-couponleo-eon-icon [svg]="showPassword() ? eyeOffIconSvg : eyeIconSvg"></app-couponleo-eon-icon>
                  </button>
                </span>
              </label>

              <label class="couponleo-signup__field">
                <span>Confirm password</span>
                <span class="couponleo-signup__input-shell">
                  <span class="couponleo-signup__input-icon" aria-hidden="true">
                    <app-couponleo-eon-icon [svg]="lockIconSvg"></app-couponleo-eon-icon>
                  </span>
                  <input
                    [type]="showPassword() ? 'text' : 'password'"
                    name="confirmPassword"
                    [(ngModel)]="form.confirmPassword"
                    (ngModelChange)="handleFieldChange()"
                    placeholder="Re-enter your password"
                    autocomplete="new-password"
                    required
                  >
                </span>
              </label>

              @if (showPasswordMismatch()) {
                <p class="couponleo-signup__feedback couponleo-signup__feedback--error">
                  Password and confirm password must match.
                </p>
              }

              @if (formError()) {
                <p class="couponleo-signup__feedback couponleo-signup__feedback--error">
                  {{ formError() }}
                </p>
              }

              <button
                type="submit"
                class="couponleo-signup__submit"
                [disabled]="submitBusy() || !form.fullName.trim() || !form.email.trim() || !form.password.trim() || !form.confirmPassword.trim() || !passwordsMatch()"
              >
                {{ submitBusy() ? 'Creating account...' : i18n.t('signUp.createAccount') }}
              </button>
            </form>

            <div class="couponleo-signup__divider" aria-hidden="true">
              <span></span>
              <strong>{{ i18n.t('signUp.or') }}</strong>
              <span></span>
            </div>

            <app-couponleo-authbridge-google-button
              [buttonLabel]="i18n.t('signUp.googleButton')"
              [loadingLabel]="i18n.t('signUp.googleBusy')"
              [busy]="googleBusy()"
              (googleSelected)="handleGoogleSignIn()"
            />

            <p class="couponleo-signup__privacy">
              <span aria-hidden="true">
                <app-couponleo-eon-icon [svg]="lockIconSvg"></app-couponleo-eon-icon>
              </span>
              {{ i18n.t('signUp.privacy') }}
            </p>
          </div>
        </div>
      </div>

      <p class="couponleo-signup__legal">
        {{ i18n.t('signUp.legalPrefix') }}
        <a routerLink="/terms-of-use">{{ i18n.t('signUp.terms') }}</a>
        {{ i18n.t('signUp.legalAnd') }}
        <a routerLink="/privacy-policy">{{ i18n.t('signUp.privacyLink') }}</a>.
      </p>

      @if (activationState(); as activation) {
        <div class="couponleo-signup__activation-layer">
          <article class="couponleo-signup__activation-card">
            <p class="couponleo-signup__activation-eyebrow">Activation required</p>
            <h3>Activate your account before login</h3>
            <p>
              We prepared an activation email for <strong>{{ activation.account.email }}</strong>.
              Finish activation, then sign in to continue.
            </p>
            <p class="couponleo-signup__activation-status">
              {{ activation.activation.deliveryMode === 'smtp' ? 'Activation email sent.' : 'Local activation link ready for preview.' }}
            </p>
            <p class="couponleo-signup__activation-hint">
              {{ activation.activation.deliveryMessage }}
            </p>
            <div class="couponleo-signup__activation-actions">
              <a
                class="couponleo-signup__activation-button couponleo-signup__activation-button--solid"
                [href]="activation.activation.activationUrl"
              >
                Activate account
              </a>
              <a
                class="couponleo-signup__activation-button couponleo-signup__activation-button--ghost"
                [routerLink]="['/sign-in']"
                [queryParams]="buildSignInQueryParams(activation)"
              >
                Open sign in
              </a>
            </div>
          </article>
        </div>
      }
    </section>
  `,
  styles: [`
    :host {
      display: block;
    }

    .couponleo-signup {
      width: min(1440px, calc(100% - 24px));
      margin: 0 auto;
      padding: 26px 0 18px;
    }

    .couponleo-signup__utility {
      display: flex;
      justify-content: flex-end;
      padding: 0 10px 14px;
      color: var(--couponleo-muted);
      font-size: 1.02rem;
    }

    .couponleo-signup__utility p,
    .couponleo-signup__legal {
      margin: 0;
    }

    .couponleo-signup__utility a,
    .couponleo-signup__legal a {
      color: var(--couponleo-blue);
      font-weight: 700;
    }

    .couponleo-signup__grid {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(440px, 0.96fr);
      gap: clamp(28px, 4vw, 54px);
      align-items: center;
      padding: 28px 12px 22px;
      border-radius: 34px;
      background:
        radial-gradient(circle at top center, rgba(255, 195, 128, 0.18), transparent 34%),
        radial-gradient(circle at 92% 12%, rgba(75, 130, 255, 0.08), transparent 20%),
        linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(255, 250, 244, 0.98));
      box-shadow: 0 22px 60px rgba(18, 35, 77, 0.08);
    }

    .couponleo-signup__hero {
      display: grid;
      gap: 24px;
      min-width: 0;
      padding-left: clamp(10px, 2vw, 26px);
    }

    .couponleo-signup__copy h1,
    .couponleo-signup__card h2 {
      margin: 0;
      color: var(--couponleo-navy);
      letter-spacing: -0.06em;
    }

    .couponleo-signup__copy h1 {
      font-size: clamp(3.2rem, 5.2vw, 5rem);
      line-height: 0.98;
    }

    .couponleo-signup__copy h1 span {
      color: var(--couponleo-blue);
    }

    .couponleo-signup__accent {
      margin: 8px 0 0;
      color: var(--couponleo-orange);
      font-size: clamp(2rem, 3vw, 2.8rem);
      line-height: 1.04;
      letter-spacing: -0.04em;
    }

    .couponleo-signup__underline {
      display: block;
      width: 200px;
      height: 10px;
      margin-top: 10px;
      border-bottom: 4px solid var(--couponleo-orange);
      border-radius: 999px;
      transform: rotate(-4deg);
    }

    .couponleo-signup__highlights {
      display: grid;
      gap: 18px;
      max-width: 35rem;
    }

    .couponleo-signup__highlight {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 18px;
      align-items: start;
    }

    .couponleo-signup__highlight-icon,
    .couponleo-signup__privacy span {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 999px;
      flex: 0 0 auto;
    }

    .couponleo-signup__highlight-icon {
      width: 4rem;
      height: 4rem;
      background: rgba(255, 255, 255, 0.92);
      box-shadow: 0 14px 30px rgba(18, 35, 77, 0.06);
    }

    .couponleo-signup__highlight-icon--blue {
      color: var(--couponleo-blue);
    }

    .couponleo-signup__highlight-icon--orange {
      color: var(--couponleo-orange);
    }

    .couponleo-signup__highlight-icon app-couponleo-eon-icon {
      width: 1.5rem;
      height: 1.5rem;
    }

    .couponleo-signup__highlight strong {
      display: block;
      color: var(--couponleo-navy);
      font-size: 1.15rem;
    }

    .couponleo-signup__highlight p,
    .couponleo-signup__card-head p,
    .couponleo-signup__privacy,
    .couponleo-signup__legal {
      color: var(--couponleo-muted);
    }

    .couponleo-signup__highlight p {
      margin: 4px 0 0;
      line-height: 1.55;
    }

    .couponleo-signup__visual {
      min-height: clamp(24rem, 32vw, 30rem);
      margin-top: 10px;
      overflow: visible;
    }

    .couponleo-signup__visual::before {
      inset: 0 18% 6% 10%;
      background:
        radial-gradient(circle at 52% 40%, rgba(255, 255, 255, 0.96) 0 24%, rgba(255, 249, 243, 0.84) 25%, rgba(255, 241, 226, 0.36) 56%, transparent 78%);
    }

    .couponleo-signup__hero-image {
      position: absolute;
      left: 8%;
      bottom: 0;
      z-index: 2;
      width: min(84%, 38rem);
      max-width: 38rem;
      filter:
        saturate(1.08)
        contrast(1.03)
        brightness(1.02)
        drop-shadow(0 28px 50px rgba(18, 35, 77, 0.14));
    }

    .couponleo-signup__spark {
      position: absolute;
      z-index: 1;
    }

    .couponleo-signup__spark--top {
      left: 77%;
      top: 4%;
      width: 20px;
      height: 20px;
      border-radius: 999px 999px 999px 0;
      background: rgba(255, 171, 74, 0.9);
      transform: rotate(24deg);
    }

    .couponleo-signup__spark--left {
      left: 8%;
      bottom: 14%;
      width: 18px;
      height: 18px;
      background: #ff962a;
      clip-path: polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%);
    }

    .couponleo-signup__spark--right {
      right: 2%;
      top: 42%;
      width: 14px;
      height: 14px;
      border-radius: 999px;
      background: #ff8d2a;
    }

    .couponleo-signup__spark--bottom {
      right: 22%;
      bottom: 8%;
      width: 14px;
      height: 14px;
      border-radius: 999px;
      background: #4a82ff;
    }

    .couponleo-signup__dots {
      position: absolute;
      right: 13%;
      top: 28%;
      width: 82px;
      height: 82px;
      background: radial-gradient(circle, rgba(247, 177, 84, 0.7) 1.2px, transparent 1.5px);
      background-size: 12px 12px;
      opacity: 0.56;
    }

    .couponleo-signup__card {
      display: grid;
      gap: 22px;
      padding: clamp(28px, 3vw, 42px);
      border: 1px solid rgba(255, 255, 255, 0.96);
      border-radius: 34px;
      background: rgba(255, 255, 255, 0.96);
      box-shadow: 0 28px 60px rgba(18, 35, 77, 0.1);
    }

    .couponleo-signup__card-head {
      display: grid;
      gap: 10px;
    }

    .couponleo-signup__card h2 {
      font-size: clamp(3rem, 4.8vw, 4.6rem);
      line-height: 0.95;
    }

    .couponleo-signup__card-head p {
      margin: 0;
      font-size: 1.12rem;
      line-height: 1.55;
    }

    .couponleo-signup__form {
      display: grid;
      gap: 18px;
    }

    .couponleo-signup__notice {
      margin: -4px 0 0;
      padding: 12px 14px;
      border-radius: 16px;
      background: rgba(52, 120, 255, 0.08);
      color: var(--couponleo-navy);
      line-height: 1.5;
    }

    .couponleo-signup__field {
      display: grid;
      gap: 10px;
      color: var(--couponleo-navy);
      font-size: 1rem;
      font-weight: 700;
    }

    .couponleo-signup__input-shell {
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

    .couponleo-signup__input-icon,
    .couponleo-signup__visibility {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      color: #6f7d9d;
    }

    .couponleo-signup__input-icon app-couponleo-eon-icon,
    .couponleo-signup__visibility app-couponleo-eon-icon,
    .couponleo-signup__privacy span app-couponleo-eon-icon {
      width: 1.35rem;
      height: 1.35rem;
    }

    .couponleo-signup__input-shell input {
      width: 100%;
      min-width: 0;
      border: 0;
      background: transparent;
      color: var(--couponleo-text);
      font-size: 1rem;
    }

    .couponleo-signup__input-shell input:focus {
      outline: none;
    }

    .couponleo-signup__visibility {
      border: 0;
      background: transparent;
      padding: 0;
    }

    .couponleo-signup__submit {
      min-height: 64px;
      border: 0;
      border-radius: 16px;
      background: linear-gradient(135deg, #3480ff 0%, #2355f6 100%);
      color: #fff;
      font-size: 1.25rem;
      font-weight: 800;
      box-shadow: 0 18px 34px rgba(52, 120, 255, 0.24);
    }

    .couponleo-signup__submit:disabled {
      opacity: 0.6;
      cursor: not-allowed;
      box-shadow: none;
    }

    .couponleo-signup__feedback {
      margin: -4px 0 0;
      padding: 12px 14px;
      border-radius: 16px;
      line-height: 1.5;
    }

    .couponleo-signup__feedback--error {
      background: rgba(206, 47, 74, 0.1);
      color: #9e1730;
    }

    .couponleo-signup__divider {
      display: grid;
      grid-template-columns: 1fr auto 1fr;
      align-items: center;
      gap: 16px;
      color: var(--couponleo-muted);
    }

    .couponleo-signup__divider span {
      height: 1px;
      background: rgba(22, 36, 74, 0.12);
    }

    .couponleo-signup__privacy {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      margin: 4px 0 0;
      font-size: 0.98rem;
      text-align: center;
    }

    .couponleo-signup__privacy span {
      width: 1.2rem;
      height: 1.2rem;
      color: #7c8baa;
    }

    .couponleo-signup__legal {
      padding: 18px 6px 0;
      text-align: center;
      font-size: 1rem;
      line-height: 1.6;
    }

    .couponleo-signup__activation-layer {
      position: fixed;
      inset: 0;
      z-index: 20;
      display: grid;
      place-items: center;
      padding: 20px;
      background: rgba(10, 20, 43, 0.54);
      backdrop-filter: blur(10px);
    }

    .couponleo-signup__activation-card {
      width: min(560px, 100%);
      display: grid;
      gap: 14px;
      padding: 28px;
      border-radius: 28px;
      background: #fff;
      color: var(--couponleo-text);
      box-shadow: 0 24px 60px rgba(14, 29, 63, 0.32);
    }

    .couponleo-signup__activation-card h3 {
      margin: 0;
      font-size: clamp(1.9rem, 4vw, 2.6rem);
      color: var(--couponleo-navy);
    }

    .couponleo-signup__activation-card p {
      margin: 0;
      font-size: 1.02rem;
      line-height: 1.6;
      color: var(--couponleo-muted);
    }

    .couponleo-signup__activation-eyebrow {
      color: var(--couponleo-blue);
      font-size: 0.86rem;
      font-weight: 800;
      letter-spacing: 0.14em;
      text-transform: uppercase;
    }

    .couponleo-signup__activation-status {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 46px;
      width: fit-content;
      padding: 0 18px;
      border-radius: 999px;
      background: rgba(44, 166, 96, 0.12);
      color: #157947;
      font-weight: 700;
    }

    .couponleo-signup__activation-hint {
      color: var(--couponleo-text);
    }

    .couponleo-signup__activation-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
    }

    .couponleo-signup__activation-button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 54px;
      padding: 0 22px;
      border-radius: 999px;
      font-weight: 800;
      text-decoration: none;
    }

    .couponleo-signup__activation-button--solid {
      background: linear-gradient(135deg, #3480ff 0%, #2355f6 100%);
      color: #fff;
    }

    .couponleo-signup__activation-button--ghost {
      border: 1px solid rgba(34, 72, 159, 0.18);
      color: var(--couponleo-blue);
      background: rgba(52, 128, 255, 0.06);
    }

    @media (max-width: 1180px) {
      .couponleo-signup__grid {
        grid-template-columns: 1fr;
      }

      .couponleo-signup__hero {
        padding-left: 0;
      }

      .couponleo-signup__visual {
        min-height: 26rem;
      }
    }

    @media (max-width: 780px) {
      .couponleo-signup {
        width: min(100%, calc(100% - 16px));
        padding-top: 18px;
      }

      .couponleo-signup__utility {
        justify-content: flex-start;
        padding-left: 4px;
      }

      .couponleo-signup__grid {
        padding: 20px 14px;
      }

      .couponleo-signup__card h2 {
        font-size: clamp(2.2rem, 10vw, 3rem);
      }

      .couponleo-signup__hero-image {
        width: min(94%, 31rem);
        left: 2%;
        bottom: 1%;
      }

      .couponleo-signup__activation-card {
        padding: 24px 18px;
      }
    }
  `],
})
export default class SignUpPage {
  private readonly authService = inject(CouponleoAuthService);
  protected readonly i18n = inject(CouponleoI18nService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly newsletter = inject(CouponleoNewsletterService);

  protected readonly userIconSvg = userIconSvg;
  protected readonly envelopeIconSvg = envelopeIconSvg;
  protected readonly lockIconSvg = lockIconSvg;
  protected readonly eyeIconSvg = eyeIconSvg;
  protected readonly eyeOffIconSvg = eyeOffIconSvg;
  protected readonly highlights = computed(() => [
    {
      title: this.i18n.t('signUp.highlightExclusiveTitle'),
      copy: this.i18n.t('signUp.highlightExclusiveCopy'),
      icon: tagIconSvg,
      tone: 'blue',
    },
    {
      title: this.i18n.t('signUp.highlightVerifiedTitle'),
      copy: this.i18n.t('signUp.highlightVerifiedCopy'),
      icon: shieldCheckIconSvg,
      tone: 'orange',
    },
    {
      title: this.i18n.t('signUp.highlightNeverMissTitle'),
      copy: this.i18n.t('signUp.highlightNeverMissCopy'),
      icon: bellIconSvg,
      tone: 'blue',
    },
    {
      title: this.i18n.t('signUp.highlightSavingsTitle'),
      copy: this.i18n.t('signUp.highlightSavingsCopy'),
      icon: giftIconSvg,
      tone: 'orange',
    },
  ]);
  protected readonly showPassword = signal(false);
  protected readonly submitBusy = signal(false);
  protected readonly googleBusy = signal(false);
  protected readonly formError = signal('');
  protected readonly activationState = signal<CouponleoSignupResult | null>(null);
  protected readonly newsletterIntent = this.route.snapshot.queryParamMap.get('intent') === 'newsletter';

  protected readonly form = {
    fullName: '',
    email: '',
    password: '',
    confirmPassword: '',
  };

  constructor() {
    const email = (this.route.snapshot.queryParamMap.get('email') ?? '').trim();
    if (email) {
      this.form.email = email;
    }
  }

  protected togglePassword(): void {
    this.showPassword.update((value) => !value);
  }

  protected handleFieldChange(): void {
    if (this.formError()) {
      this.formError.set('');
    }
  }

  protected passwordsMatch(): boolean {
    return this.form.password === this.form.confirmPassword;
  }

  protected showPasswordMismatch(): boolean {
    return this.form.confirmPassword.trim().length > 0 && !this.passwordsMatch();
  }

  protected async handleSubmit(): Promise<void> {
    this.formError.set('');

    if (
      !this.form.fullName.trim()
      || !this.form.email.trim()
      || !this.form.password.trim()
      || !this.form.confirmPassword.trim()
    ) {
      return;
    }

    if (!this.passwordsMatch()) {
      this.formError.set('Password and confirm password must match.');
      return;
    }

    this.submitBusy.set(true);

    try {
      const result = await this.authService.signUp({
        ...this.form,
        activationContext: this.activationContext(),
      });
      this.activationState.set(result);
    } catch (error) {
      this.formError.set(this.authService.errorMessage(error, 'We could not create your account right now.'));
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

    if (!this.newsletterIntent) {
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

  protected buildSignInQueryParams(result: CouponleoSignupResult): Record<string, string> {
    return {
      email: result.account.email,
      ...this.activationContext(),
    };
  }

  private activationContext(): Record<string, string> {
    const context: Record<string, string> = {};
    for (const key of ['intent', 'returnUrl', 'mode', 'next', 'close'] as const) {
      const value = (this.route.snapshot.queryParamMap.get(key) ?? '').trim();
      if (!value) {
        continue;
      }
      if ((key === 'next' || key === 'returnUrl') && !value.startsWith('/')) {
        continue;
      }
      context[key] = value;
    }
    return context;
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
