import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { type CouponleoDataResponse, COUPONLEO_API_BASE_URL } from './couponleo-api.service';
import { COUPONLEO_SESSION_STORAGE_KEY } from './couponleo-client-state';
import { CouponleoTelemetryService } from './couponleo-telemetry.service';

export interface CouponleoSession {
  fullName: string;
  email: string;
  provider: 'email' | 'google';
  signedInAt: string;
}

export interface CouponleoCredentials {
  email: string;
  password: string;
}

export interface CouponleoActivationContext {
  close?: string;
  intent?: string;
  mode?: string;
  next?: string;
  returnUrl?: string;
}

export interface CouponleoSignupPayload extends CouponleoCredentials {
  fullName: string;
  activationContext?: CouponleoActivationContext;
}

export interface CouponleoActivationPayload {
  email: string;
  token: string;
}

export interface CouponleoPasswordResetRequestPayload {
  email: string;
  resetContext?: CouponleoActivationContext;
}

export interface CouponleoPasswordResetPayload {
  email: string;
  token: string;
  password: string;
}

export interface CouponleoAuthAccount {
  id: string;
  fullName: string;
  email: string;
  provider: 'email';
  status: 'pending_activation' | 'active';
  createdAt: string;
  updatedAt: string;
  activatedAt: string | null;
  lastSignInAt: string | null;
}

export interface CouponleoSignupResult {
  account: CouponleoAuthAccount;
  activation: {
    email: string;
    activationToken: string;
    activationUrl: string;
    deliveryMode: 'preview' | 'smtp';
    deliveryMessage: string;
    expiresAt: string;
  };
}

export interface CouponleoActivationResult {
  account: CouponleoAuthAccount;
  message: string;
}

export interface CouponleoPasswordResetRequestResult {
  email: string;
  message: string;
  deliveryMode: 'masked' | 'preview' | 'smtp';
  deliveryMessage: string;
  expiresAt: string | null;
  resetUrl: string | null;
  resetReady: boolean;
}

export interface CouponleoPasswordResetResult {
  email: string;
  accountStatus: 'pending_activation' | 'active';
  requiresActivation: boolean;
  message: string;
}

interface CouponleoAuthSignInResult {
  session: CouponleoSession;
  account: CouponleoAuthAccount;
}

@Injectable({ providedIn: 'root' })
export class CouponleoAuthService {
  private readonly http = inject(HttpClient);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly browser = isPlatformBrowser(this.platformId);
  private readonly telemetry = inject(CouponleoTelemetryService);
  private readonly baseUrl = inject(COUPONLEO_API_BASE_URL, { optional: true }) ?? '/couponleo/api';
  private readonly sessionState = signal<CouponleoSession | null>(null);

  readonly session = this.sessionState.asReadonly();
  readonly isAuthenticated = computed(() => this.sessionState() !== null);

  constructor() {
    this.restoreSession();
  }

  async signIn(payload: CouponleoCredentials): Promise<CouponleoSession> {
    const body = {
      email: payload.email.trim(),
      password: payload.password,
    };

    try {
      const response = await firstValueFrom(
        this.http.post<CouponleoDataResponse<CouponleoAuthSignInResult>>(`${this.baseUrl}/auth/sign-in`, body),
      );
      const session = response.data.session;
      this.persistSession(session);
      this.telemetry.trackStructured({
        eventType: 'auth',
        eventName: 'sign_in',
        actionLabel: 'email sign in',
        userEmail: session.email,
        authState: 'authenticated',
        metadata: {
          provider: session.provider,
          accountStatus: response.data.account.status,
        },
      });
      return session;
    } catch (error) {
      this.telemetry.trackStructured({
        eventType: 'auth',
        eventName: 'sign_in_failed',
        actionLabel: 'email sign in',
        userEmail: body.email,
        authState: 'anonymous',
        metadata: {
          message: this.errorMessage(error, 'We could not sign you in right now.'),
        },
      });
      throw error;
    }
  }

  async signUp(payload: CouponleoSignupPayload): Promise<CouponleoSignupResult> {
    const body = {
      fullName: payload.fullName.trim(),
      email: payload.email.trim(),
      password: payload.password,
      activationContext: this.sanitizeActivationContext(payload.activationContext),
    };

    try {
      const response = await firstValueFrom(
        this.http.post<CouponleoDataResponse<CouponleoSignupResult>>(`${this.baseUrl}/auth/sign-up`, body),
      );
      this.telemetry.trackStructured({
        eventType: 'auth',
        eventName: 'sign_up_pending_activation',
        actionLabel: 'email sign up',
        userEmail: response.data.account.email,
        authState: 'pending_activation',
        metadata: {
          deliveryMode: response.data.activation.deliveryMode,
        },
      });
      return response.data;
    } catch (error) {
      this.telemetry.trackStructured({
        eventType: 'auth',
        eventName: 'sign_up_failed',
        actionLabel: 'email sign up',
        userEmail: body.email,
        authState: 'anonymous',
        metadata: {
          message: this.errorMessage(error, 'We could not create your account right now.'),
        },
      });
      throw error;
    }
  }

  async activateAccount(payload: CouponleoActivationPayload): Promise<CouponleoActivationResult> {
    const body = {
      email: payload.email.trim(),
      token: payload.token.trim(),
    };

    try {
      const response = await firstValueFrom(
        this.http.post<CouponleoDataResponse<CouponleoActivationResult>>(`${this.baseUrl}/auth/activate`, body),
      );
      this.telemetry.trackStructured({
        eventType: 'auth',
        eventName: 'activation_complete',
        actionLabel: 'activate account',
        userEmail: response.data.account.email,
        authState: 'activation_complete',
        metadata: {
          status: response.data.account.status,
        },
      });
      return response.data;
    } catch (error) {
      this.telemetry.trackStructured({
        eventType: 'auth',
        eventName: 'activation_failed',
        actionLabel: 'activate account',
        userEmail: body.email,
        authState: 'pending_activation',
        metadata: {
          message: this.errorMessage(error, 'We could not activate this account right now.'),
        },
      });
      throw error;
    }
  }

  async requestPasswordReset(
    payload: CouponleoPasswordResetRequestPayload,
  ): Promise<CouponleoPasswordResetRequestResult> {
    const body = {
      email: payload.email.trim(),
      resetContext: this.sanitizeActivationContext(payload.resetContext),
    };

    try {
      const response = await firstValueFrom(
        this.http.post<CouponleoDataResponse<CouponleoPasswordResetRequestResult>>(
          `${this.baseUrl}/auth/forgot-password`,
          body,
        ),
      );
      this.telemetry.trackStructured({
        eventType: 'auth',
        eventName: 'password_reset_requested',
        actionLabel: 'forgot password',
        userEmail: response.data.email,
        authState: 'recovery',
        metadata: {
          deliveryMode: response.data.deliveryMode,
          resetReady: response.data.resetReady,
        },
      });
      return response.data;
    } catch (error) {
      this.telemetry.trackStructured({
        eventType: 'auth',
        eventName: 'password_reset_request_failed',
        actionLabel: 'forgot password',
        userEmail: body.email,
        authState: 'recovery',
        metadata: {
          message: this.errorMessage(error, 'We could not prepare a reset link right now.'),
        },
      });
      throw error;
    }
  }

  async resetPassword(payload: CouponleoPasswordResetPayload): Promise<CouponleoPasswordResetResult> {
    const body = {
      email: payload.email.trim(),
      token: payload.token.trim(),
      password: payload.password,
    };

    try {
      const response = await firstValueFrom(
        this.http.post<CouponleoDataResponse<CouponleoPasswordResetResult>>(
          `${this.baseUrl}/auth/reset-password`,
          body,
        ),
      );
      this.telemetry.trackStructured({
        eventType: 'auth',
        eventName: 'password_reset_complete',
        actionLabel: 'reset password',
        userEmail: response.data.email,
        authState: response.data.requiresActivation ? 'pending_activation' : 'reset_complete',
        metadata: {
          accountStatus: response.data.accountStatus,
        },
      });
      return response.data;
    } catch (error) {
      this.telemetry.trackStructured({
        eventType: 'auth',
        eventName: 'password_reset_complete_failed',
        actionLabel: 'reset password',
        userEmail: body.email,
        authState: 'recovery',
        metadata: {
          message: this.errorMessage(error, 'We could not reset your password right now.'),
        },
      });
      throw error;
    }
  }

  signInWithGoogle(): CouponleoSession {
    const session: CouponleoSession = {
      fullName: 'CouponLeo Shopper',
      email: 'shopper@couponleo.com',
      provider: 'google',
      signedInAt: new Date().toISOString(),
    };

    this.persistSession(session);
    this.telemetry.trackStructured({
      eventType: 'auth',
      eventName: 'sign_in_google',
      actionLabel: 'google sign in',
      userEmail: session.email,
      authState: 'authenticated',
      metadata: {
        provider: session.provider,
      },
    });
    return session;
  }

  signOut(): void {
    const previousSession = this.sessionState();
    this.sessionState.set(null);
    this.telemetry.trackStructured({
      eventType: 'auth',
      eventName: 'sign_out',
      actionLabel: 'sign out',
      userEmail: previousSession?.email,
      authState: previousSession ? 'authenticated' : 'anonymous',
      metadata: {
        provider: previousSession?.provider ?? '',
      },
    });

    if (!this.browser) {
      return;
    }

    window.localStorage.removeItem(COUPONLEO_SESSION_STORAGE_KEY);
  }

  errorMessage(error: unknown, fallback: string): string {
    if (error instanceof HttpErrorResponse) {
      const apiMessage = typeof error.error?.message === 'string' ? error.error.message.trim() : '';
      if (apiMessage) {
        return apiMessage;
      }
    }

    if (error instanceof Error && error.message.trim()) {
      return error.message.trim();
    }

    return fallback;
  }

  private sanitizeActivationContext(context?: CouponleoActivationContext): CouponleoActivationContext {
    const safeContext: CouponleoActivationContext = {};
    if (!context) {
      return safeContext;
    }

    for (const [key, rawValue] of Object.entries(context)) {
      const value = String(rawValue ?? '').trim();
      if (!value) {
        continue;
      }
      if ((key === 'next' || key === 'returnUrl') && (!value.startsWith('/') || value.startsWith('//'))) {
        continue;
      }
      if (key === 'close') {
        safeContext.close = value;
      } else if (key === 'intent') {
        safeContext.intent = value;
      } else if (key === 'mode') {
        safeContext.mode = value;
      } else if (key === 'next') {
        safeContext.next = value;
      } else if (key === 'returnUrl') {
        safeContext.returnUrl = value;
      }
    }

    return safeContext;
  }

  private restoreSession(): void {
    if (!this.browser) {
      return;
    }

    const rawValue = window.localStorage.getItem(COUPONLEO_SESSION_STORAGE_KEY);
    if (!rawValue) {
      return;
    }

    try {
      const session = JSON.parse(rawValue) as CouponleoSession;
      if (session?.email && session?.fullName) {
        this.sessionState.set(session);
      }
    } catch {
      window.localStorage.removeItem(COUPONLEO_SESSION_STORAGE_KEY);
    }
  }

  private persistSession(session: CouponleoSession): void {
    this.sessionState.set(session);

    if (!this.browser) {
      return;
    }

    window.localStorage.setItem(COUPONLEO_SESSION_STORAGE_KEY, JSON.stringify(session));
  }
}
