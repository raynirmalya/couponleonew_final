import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { isPlatformBrowser } from '@angular/common';
import { inject, Injectable, PLATFORM_ID } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, catchError, tap, throwError } from 'rxjs';
import { COUPONLEO_API_BASE_URL, type CouponleoDataResponse } from './couponleo-api.service';
import { CouponleoAuthService } from './couponleo-auth.service';
import { CouponleoLocaleService } from './couponleo-locale.service';
import { type CouponleoSavedItem, CouponleoSavedService } from './couponleo-saved.service';
import { CouponleoTelemetryService } from './couponleo-telemetry.service';

const PENDING_NEWSLETTER_INTENT_KEY = 'couponleo.newsletter.pending';
const PENDING_NEWSLETTER_INTENT_TTL_MS = 15 * 60 * 1000;

export interface CouponleoPendingNewsletterIntent {
  createdAt: number;
  email: string;
  returnUrl: string;
}

export interface CouponleoNewsletterPreviewItem {
  title: string;
  storeName: string;
  discountText: string;
  location: string;
  language: string;
  route: string;
  ctaUrl: string;
  reasons: string[];
  score: number;
}

export interface CouponleoNewsletterPreview {
  generatedAt: string;
  deliveryMode: 'preview_only';
  audience: {
    country: string;
    locale: string;
    wishlistCount: number;
  };
  summary: string;
  items: CouponleoNewsletterPreviewItem[];
}

export interface CouponleoNewsletterSubscription {
  id: string;
  email: string;
  fullName: string;
  provider: 'email' | 'google';
  locale: string;
  country: string;
  sourcePath: string;
  alertsEnabled: boolean;
  status: 'active';
  createdAt: string;
  updatedAt: string;
  wishlist: CouponleoSavedItem[];
  lastPreview: CouponleoNewsletterPreview;
}

export interface CouponleoNewsletterSubscriptionResult {
  subscription: CouponleoNewsletterSubscription;
  preview: CouponleoNewsletterPreview;
}

@Injectable({ providedIn: 'root' })
export class CouponleoNewsletterService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(CouponleoAuthService);
  private readonly locale = inject(CouponleoLocaleService);
  private readonly router = inject(Router);
  private readonly saved = inject(CouponleoSavedService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly browser = isPlatformBrowser(this.platformId);
  private readonly telemetry = inject(CouponleoTelemetryService);
  private readonly baseUrl = inject(COUPONLEO_API_BASE_URL, { optional: true }) ?? 'http://127.0.0.1:5000/couponleo/api';

  subscribeCurrentUser(
    options: {
      country?: string;
      sourcePath?: string;
    } = {},
  ): Observable<CouponleoDataResponse<CouponleoNewsletterSubscriptionResult>> {
    const session = this.auth.session();

    if (!session) {
      this.telemetry.trackStructured({
        eventType: 'newsletter',
        eventName: 'subscription_blocked',
        actionLabel: 'sign in required',
        authState: 'anonymous',
        metadata: {
          sourcePath: this.sanitizeInternalUrl(options.sourcePath ?? this.router.url),
        },
      });
      return throwError(() => new Error('Sign in is required before subscribing to alerts.'));
    }

    const sourcePath = this.sanitizeInternalUrl(options.sourcePath ?? this.router.url);
    const payload = {
      email: session.email,
      fullName: session.fullName,
      provider: session.provider,
      locale: this.locale.locale(),
      country: this.normalizeCountry(options.country ?? this.countryFromUrl(sourcePath)),
      sourcePath,
      wishlist: this.saved.items().map((item) => this.normalizeWishlistItem(item)),
    };

    return this.http.post<CouponleoDataResponse<CouponleoNewsletterSubscriptionResult>>(
      `${this.baseUrl}/newsletter/subscriptions`,
      payload,
    ).pipe(
      tap(() => {
        this.telemetry.trackStructured({
          eventType: 'newsletter',
          eventName: 'subscription_saved',
          actionLabel: 'save curated alerts',
          userEmail: session.email,
          authState: 'authenticated',
          metadata: {
            country: payload.country,
            locale: payload.locale,
            wishlistCount: payload.wishlist.length,
            sourcePath,
          },
        });
      }),
      catchError((error) => {
        this.telemetry.trackStructured({
          eventType: 'newsletter',
          eventName: 'subscription_failed',
          actionLabel: 'save curated alerts',
          userEmail: session.email,
          authState: 'authenticated',
          metadata: {
            message: this.errorMessage(error),
            sourcePath,
          },
        });
        return throwError(() => error);
      }),
    );
  }

  buildSignInQueryParams(email: string, returnUrl: string): Record<string, string> {
    const safeReturnUrl = this.sanitizeInternalUrl(returnUrl);
    const trimmedEmail = email.trim();
    const queryParams: Record<string, string> = {
      intent: 'newsletter',
      returnUrl: safeReturnUrl,
    };

    if (trimmedEmail) {
      queryParams['email'] = trimmedEmail;
    }

    return queryParams;
  }

  queuePendingIntent(email: string, returnUrl: string): void {
    if (!this.browser) {
      return;
    }

    const pendingIntent: CouponleoPendingNewsletterIntent = {
      createdAt: Date.now(),
      email: email.trim(),
      returnUrl: this.sanitizeInternalUrl(returnUrl),
    };

    window.sessionStorage.setItem(PENDING_NEWSLETTER_INTENT_KEY, JSON.stringify(pendingIntent));
  }

  consumePendingIntent(currentUrl: string): CouponleoPendingNewsletterIntent | null {
    if (!this.browser) {
      return null;
    }

    const pendingIntent = this.readPendingIntent();
    if (!pendingIntent) {
      return null;
    }

    const safeCurrentUrl = this.sanitizeInternalUrl(currentUrl);
    if (pendingIntent.returnUrl !== safeCurrentUrl) {
      return null;
    }

    window.sessionStorage.removeItem(PENDING_NEWSLETTER_INTENT_KEY);
    return pendingIntent;
  }

  sanitizeInternalUrl(value: string | null | undefined): string {
    const normalizedValue = String(value ?? '').trim();

    if (!normalizedValue || !normalizedValue.startsWith('/') || normalizedValue.startsWith('//')) {
      return '/dashboard';
    }

    return normalizedValue;
  }

  errorMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      const apiMessage = typeof error.error?.message === 'string' ? error.error.message.trim() : '';
      if (apiMessage) {
        return apiMessage;
      }
    }

    if (error instanceof Error && error.message.trim()) {
      return error.message.trim();
    }

    return 'We could not save your curated alerts right now.';
  }

  private countryFromUrl(url: string): string {
    try {
      const urlTree = this.router.parseUrl(this.sanitizeInternalUrl(url));
      const countryParam = urlTree.queryParams['country'];
      return typeof countryParam === 'string' && countryParam.trim() ? countryParam.trim() : 'all';
    } catch {
      return 'all';
    }
  }

  private normalizeCountry(value: string): string {
    const normalizedValue = String(value || '').trim();
    return normalizedValue || 'all';
  }

  private normalizeWishlistItem(item: CouponleoSavedItem): CouponleoSavedItem {
    return {
      id: item.id.trim(),
      kind: item.kind,
      title: item.title.trim(),
      subtitle: item.subtitle.trim(),
      description: item.description.trim(),
      route: this.sanitizeInternalUrl(item.route),
      code: item.code?.trim() || undefined,
      savedAt: item.savedAt?.trim() || undefined,
    };
  }

  private readPendingIntent(): CouponleoPendingNewsletterIntent | null {
    const rawValue = window.sessionStorage.getItem(PENDING_NEWSLETTER_INTENT_KEY);
    if (!rawValue) {
      return null;
    }

    try {
      const pendingIntent = JSON.parse(rawValue) as CouponleoPendingNewsletterIntent;
      const isFresh = Number.isFinite(pendingIntent?.createdAt)
        && pendingIntent.createdAt > 0
        && Date.now() - pendingIntent.createdAt <= PENDING_NEWSLETTER_INTENT_TTL_MS;
      const hasReturnUrl = typeof pendingIntent?.returnUrl === 'string' && pendingIntent.returnUrl.startsWith('/');

      if (isFresh && hasReturnUrl) {
        return {
          createdAt: pendingIntent.createdAt,
          email: typeof pendingIntent.email === 'string' ? pendingIntent.email.trim() : '',
          returnUrl: this.sanitizeInternalUrl(pendingIntent.returnUrl),
        };
      }
    } catch {
      // Ignore and clear the stale session value below.
    }

    window.sessionStorage.removeItem(PENDING_NEWSLETTER_INTENT_KEY);
    return null;
  }
}
